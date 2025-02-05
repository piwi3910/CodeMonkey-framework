import { LearningMetrics } from './types';
import { ChromaProvider } from '../providers/chroma';

type NumericMetrics = Omit<LearningMetrics, 'timestamp'>;

interface MetricThresholds {
  taskSuccess: number;
  responseQuality: number;
  resourceUsage: number;
  executionTime: number;
  collaborationScore: number;
}

interface PerformanceStats {
  average: LearningMetrics;
  variance: Partial<NumericMetrics>;
  trend: 'improving' | 'stable' | 'declining';
  sampleSize: number;
}

export class MetricsCollector {
  private readonly thresholds: MetricThresholds = {
    taskSuccess: 0.8,
    responseQuality: 0.7,
    resourceUsage: 0.6,
    executionTime: 5000, // 5 seconds
    collaborationScore: 0.7,
  };

  constructor(
    private chroma: ChromaProvider,
    thresholds?: Partial<MetricThresholds>
  ) {
    if (thresholds) {
      this.thresholds = { ...this.thresholds, ...thresholds };
    }
  }

  async collectMetrics(
    agentId: string,
    taskId: string,
    metrics: Partial<LearningMetrics>
  ): Promise<LearningMetrics> {
    const timestamp = new Date();
    
    // Normalize and validate metrics
    const normalizedMetrics = this.normalizeMetrics(metrics);
    
    // Store metrics in ChromaDB
    await this.storeMetrics(agentId, taskId, normalizedMetrics);

    return normalizedMetrics;
  }

  async analyzePerformance(
    agentId: string,
    timeWindow: number = 7 * 24 * 60 * 60 * 1000 // 1 week in milliseconds
  ): Promise<PerformanceStats> {
    const cutoffDate = new Date(Date.now() - timeWindow);
    
    // Fetch recent metrics from ChromaDB
    const metrics = await this.fetchRecentMetrics(agentId, cutoffDate);
    
    if (metrics.length === 0) {
      throw new Error('No metrics available for analysis');
    }

    // Calculate statistics
    const average = this.calculateAverageMetrics(metrics);
    const variance = this.calculateMetricsVariance(metrics, average);
    const trend = this.analyzeTrend(metrics);

    return {
      average,
      variance,
      trend,
      sampleSize: metrics.length,
    };
  }

  async detectAnomalies(
    agentId: string,
    metrics: LearningMetrics
  ): Promise<string[]> {
    const recentStats = await this.analyzePerformance(agentId);
    const anomalies: string[] = [];

    // Check each metric against historical averages
    Object.entries(metrics).forEach(([key, value]) => {
      if (key === 'timestamp' || typeof value !== 'number') return;

      const avg = recentStats.average[key as keyof NumericMetrics];
      const variance = recentStats.variance[key as keyof NumericMetrics] || 0;

      if (typeof avg === 'number') {
        // Use 2 standard deviations as anomaly threshold
        const threshold = Math.sqrt(variance) * 2;
        if (Math.abs(value - avg) > threshold) {
          anomalies.push(
            `Anomaly detected in ${key}: value ${value} deviates significantly from average ${avg}`
          );
        }
      }
    });

    return anomalies;
  }

  private normalizeMetrics(metrics: Partial<LearningMetrics>): LearningMetrics {
    return {
      taskSuccess: this.normalizeValue(metrics.taskSuccess, 0, 1, 0),
      responseQuality: this.normalizeValue(metrics.responseQuality, 0, 1, 0),
      executionTime: metrics.executionTime || 0,
      resourceUsage: this.normalizeValue(metrics.resourceUsage, 0, 1, 0),
      userFeedback: this.normalizeValue(metrics.userFeedback, -1, 1, 0),
      collaborationScore: this.normalizeValue(metrics.collaborationScore, 0, 1, 0),
      timestamp: metrics.timestamp || new Date(),
    };
  }

  private normalizeValue(
    value: number | undefined,
    min: number,
    max: number,
    defaultValue: number
  ): number {
    if (value === undefined) return defaultValue;
    return Math.max(min, Math.min(max, value));
  }

  private async storeMetrics(
    agentId: string,
    taskId: string,
    metrics: LearningMetrics
  ): Promise<void> {
    await this.chroma.addDocumentation(
      JSON.stringify(metrics),
      {
        projectId: agentId,
        type: 'metric',
        title: `Task Metrics: ${taskId}`,
        timestamp: metrics.timestamp.toISOString(),
        tags: ['metrics', 'performance', `task:${taskId}`],
      }
    );
  }

  private async fetchRecentMetrics(
    agentId: string,
    since: Date
  ): Promise<LearningMetrics[]> {
    const docs = await this.chroma.findRelevantDocumentation(
      'metrics performance',
      {
        projectId: agentId,
        type: 'metric',
      }
    );

    return docs
      .map(doc => {
        try {
          const metrics = JSON.parse(doc.content) as LearningMetrics;
          metrics.timestamp = new Date(metrics.timestamp);
          return metrics;
        } catch {
          return null;
        }
      })
      .filter((metrics): metrics is LearningMetrics => 
        metrics !== null && metrics.timestamp >= since
      );
  }

  private calculateAverageMetrics(metrics: LearningMetrics[]): LearningMetrics {
    const numericSums = metrics.reduce(
      (acc, curr) => ({
        taskSuccess: acc.taskSuccess + curr.taskSuccess,
        responseQuality: acc.responseQuality + curr.responseQuality,
        executionTime: acc.executionTime + curr.executionTime,
        resourceUsage: acc.resourceUsage + curr.resourceUsage,
        userFeedback: acc.userFeedback + curr.userFeedback,
        collaborationScore: (acc.collaborationScore || 0) + (curr.collaborationScore || 0),
      }),
      {
        taskSuccess: 0,
        responseQuality: 0,
        executionTime: 0,
        resourceUsage: 0,
        userFeedback: 0,
        collaborationScore: 0,
      } as NumericMetrics
    );

    const n = metrics.length;
    return {
      taskSuccess: numericSums.taskSuccess / n,
      responseQuality: numericSums.responseQuality / n,
      executionTime: numericSums.executionTime / n,
      resourceUsage: numericSums.resourceUsage / n,
      userFeedback: numericSums.userFeedback / n,
      collaborationScore: (numericSums.collaborationScore || 0) / n,
      timestamp: new Date(),
    };
  }

  private calculateMetricsVariance(
    metrics: LearningMetrics[],
    average: LearningMetrics
  ): Partial<NumericMetrics> {
    const squaredDiffs = metrics.reduce((acc, curr) => {
      const diffs: Partial<NumericMetrics> = {};
      Object.entries(curr).forEach(([key, value]) => {
        if (key === 'timestamp' || typeof value !== 'number') return;
        const avgValue = average[key as keyof NumericMetrics];
        if (typeof avgValue === 'number') {
          const prevValue = acc[key as keyof NumericMetrics] as number || 0;
          diffs[key as keyof NumericMetrics] = prevValue + Math.pow(value - avgValue, 2);
        }
      });
      return diffs;
    }, {} as Partial<NumericMetrics>);

    const n = metrics.length;
    const variance: Partial<NumericMetrics> = {};
    Object.entries(squaredDiffs).forEach(([key, value]) => {
      if (typeof value === 'number') {
        variance[key as keyof NumericMetrics] = value / n;
      }
    });

    return variance;
  }

  private analyzeTrend(metrics: LearningMetrics[]): 'improving' | 'stable' | 'declining' {
    if (metrics.length < 2) return 'stable';

    // Sort metrics by timestamp
    const sorted = [...metrics].sort((a, b) => 
      a.timestamp.getTime() - b.timestamp.getTime()
    );

    // Split into two halves
    const mid = Math.floor(sorted.length / 2);
    const firstHalf = sorted.slice(0, mid);
    const secondHalf = sorted.slice(mid);

    // Compare averages
    const firstAvg = this.calculateAverageMetrics(firstHalf);
    const secondAvg = this.calculateAverageMetrics(secondHalf);

    // Calculate overall score for each half
    const getScore = (metrics: LearningMetrics) => 
      metrics.taskSuccess * 0.3 +
      metrics.responseQuality * 0.2 +
      (metrics.collaborationScore || 0) * 0.2 +
      (1 - metrics.resourceUsage) * 0.15 +
      (metrics.userFeedback + 1) / 2 * 0.15;

    const firstScore = getScore(firstAvg);
    const secondScore = getScore(secondAvg);

    const difference = secondScore - firstScore;
    if (difference > 0.1) return 'improving';
    if (difference < -0.1) return 'declining';
    return 'stable';
  }
}