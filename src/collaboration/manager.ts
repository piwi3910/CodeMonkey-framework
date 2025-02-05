import { v4 as uuidv4 } from 'uuid';
import {
  CollaborationType,
  CollaborationStatus,
  CollaborationRole,
  CollaborationSession,
  CollaborationMessage,
  CollaborationProtocol,
  CollaborationContext,
  CollaborationParticipant,
  CollaborationQuery,
  CollaborationStats,
  CollaborationMetrics,
  CollaborationStep,
  ValidationResult,
  DatabaseCollaborationSession,
  DatabaseCollaborationMessage,
  StepValidation,
} from './types';
import { ChromaProvider } from '../providers/chroma';
import { OpenAIProvider } from '../providers/openai';
import { PrismaClient, Prisma } from '@prisma/client';
import { MemoryManager } from '../memory/manager';
import { LearningManager } from '../learning/manager';
import { MemoryType } from '../memory/types';
import { LearningEventType } from '../learning/types';

const DEFAULT_VALIDATION_THRESHOLD = 0.7;

export class CollaborationManager {
  constructor(
    private prisma: PrismaClient,
    private chroma: ChromaProvider,
    private openai: OpenAIProvider,
    private memory: MemoryManager,
    private learning: LearningManager
  ) {}

  // ... (previous methods remain unchanged until updateSessionStatus)

  private async updateSessionStatus(
    session: CollaborationSession,
    message: CollaborationMessage
  ): Promise<void> {
    if (message.type === 'consensus') {
      const consensusReached = await this.checkConsensus(session);
      if (consensusReached) {
        session.status = CollaborationStatus.Completed;
      }
    } else if (message.type === 'validation') {
      const currentStep = session.workflow.steps[session.workflow.currentStep];
      if (currentStep.validation) {
        const result = JSON.parse(message.content) as ValidationResult;
        currentStep.validation.results = currentStep.validation.results || [];
        currentStep.validation.results.push(result);
      }
    }

    session.updatedAt = new Date();
    await this.storeSession(session);
  }

  private async checkConsensus(session: CollaborationSession): Promise<boolean> {
    const messages = await this.prisma.$queryRaw<DatabaseCollaborationMessage[]>`
      SELECT * FROM "CollaborationMessage"
      WHERE "sessionId" = ${session.id}
      AND "type" = 'consensus'
    `;

    const consensusCount = messages.length;
    const requiredCount = Math.ceil(
      session.participants.length * (session.protocol.rules.consensusThreshold || 0.7)
    );

    return consensusCount >= requiredCount;
  }

  private async storeSession(session: CollaborationSession): Promise<void> {
    const data = this.mapSessionToDatabase(session);
    await this.prisma.$executeRaw`
      INSERT INTO "CollaborationSession" (
        "id", "type", "status", "context", "workflow", "protocol", "metrics",
        "createdAt", "updatedAt"
      ) VALUES (
        ${data.id}, ${data.type}, ${data.status}, ${data.context},
        ${data.workflow}, ${data.protocol}, ${data.metrics},
        ${data.createdAt}, ${data.updatedAt}
      )
      ON CONFLICT ("id") DO UPDATE SET
        "type" = EXCLUDED."type",
        "status" = EXCLUDED."status",
        "context" = EXCLUDED."context",
        "workflow" = EXCLUDED."workflow",
        "protocol" = EXCLUDED."protocol",
        "metrics" = EXCLUDED."metrics",
        "updatedAt" = EXCLUDED."updatedAt"
    `;

    // Update participants
    await this.prisma.$executeRaw`
      DELETE FROM "CollaborationParticipant"
      WHERE "sessionId" = ${session.id}
    `;

    for (const participant of session.participants) {
      await this.prisma.$executeRaw`
        INSERT INTO "CollaborationParticipant" (
          "id", "sessionId", "agentId", "role", "status",
          "contribution", "feedback", "timestamp"
        ) VALUES (
          ${uuidv4()}, ${session.id}, ${participant.agentId},
          ${participant.role}, ${participant.status},
          ${participant.contribution}, ${participant.feedback},
          ${participant.timestamp}
        )
      `;
    }
  }

  private async storeMessage(message: CollaborationMessage): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO "CollaborationMessage" (
        "id", "sessionId", "senderId", "recipientId", "type",
        "content", "metadata", "createdAt"
      ) VALUES (
        ${message.id}, ${message.sessionId}, ${message.senderId},
        ${message.recipientId}, ${message.type}, ${message.content},
        ${JSON.stringify(message.metadata)}, ${new Date()}
      )
    `;
  }

  private async getSession(id: string): Promise<CollaborationSession | null> {
    const [session] = await this.prisma.$queryRaw<DatabaseCollaborationSession[]>`
      SELECT s.*, 
        COALESCE(json_agg(p.*) FILTER (WHERE p.id IS NOT NULL), '[]') as participants,
        COALESCE(json_agg(m.*) FILTER (WHERE m.id IS NOT NULL), '[]') as messages
      FROM "CollaborationSession" s
      LEFT JOIN "CollaborationParticipant" p ON p."sessionId" = s.id
      LEFT JOIN "CollaborationMessage" m ON m."sessionId" = s.id
      WHERE s.id = ${id}
      GROUP BY s.id
    `;

    return session ? this.mapDatabaseSession(session) : null;
  }

  private mapSessionToDatabase(session: CollaborationSession): any {
    return {
      id: session.id,
      type: session.type,
      status: session.status,
      context: JSON.stringify(session.context),
      workflow: JSON.stringify(session.workflow),
      protocol: JSON.stringify(session.protocol),
      metrics: session.metrics ? JSON.stringify(session.metrics) : null,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  private mapDatabaseSession(data: DatabaseCollaborationSession): CollaborationSession {
    return {
      id: data.id,
      type: data.type as CollaborationType,
      status: data.status as CollaborationStatus,
      participants: data.participants.map(p => ({
        agentId: p.agentId,
        role: p.role as CollaborationRole,
        status: p.status as CollaborationStatus,
        contribution: p.contribution || undefined,
        feedback: p.feedback || undefined,
        timestamp: p.timestamp,
      })),
      context: JSON.parse(data.context),
      workflow: JSON.parse(data.workflow),
      protocol: JSON.parse(data.protocol),
      metrics: data.metrics ? JSON.parse(data.metrics) : undefined,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  }

  // ... (rest of the methods remain unchanged)
}