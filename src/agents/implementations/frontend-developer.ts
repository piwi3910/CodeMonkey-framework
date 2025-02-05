import { PrismaClient } from '@prisma/client';
import { ChromaProvider } from '../../providers/chroma';
import { OpenAIProvider } from '../../providers/openai';
import { AgentData } from '../base';
import { BaseAgentImplementation } from './base-implementation';

export class FrontendDeveloperAgent extends BaseAgentImplementation {
  constructor(
    data: AgentData,
    prisma: PrismaClient,
    chroma: ChromaProvider,
    llm: OpenAIProvider
  ) {
    super(data, prisma, chroma, llm);
  }

  protected customizeSystemPrompt(context: Record<string, any>): string {
    let customization = '';

    // Add frontend-specific context
    if (context.task === 'code_review') {
      customization += `
As a frontend developer, focus on:
- UI/UX best practices
- Component structure and reusability
- State management
- Performance optimization
- Accessibility compliance
- Cross-browser compatibility
- Responsive design
- CSS organization and maintainability`;
    } else if (context.task === 'suggest_improvements') {
      customization += `
Consider suggesting improvements for:
- User experience and interface design
- Frontend architecture
- Component composition
- State management patterns
- Performance optimizations
- Build and bundling configuration
- Development workflow
- Testing coverage`;
    } else if (context.task === 'execution_plan') {
      customization += `
Break down the frontend development task into:
1. Component design and structure
2. State management implementation
3. UI implementation
4. Styling and responsiveness
5. Integration with backend
6. Testing and validation
7. Documentation
8. Performance optimization`;
    }

    // Add technical context
    if (context.technical) {
      const tech = JSON.parse(context.technical);
      if (tech.frontend) {
        customization += `\n\nTechnical Stack:\n${JSON.stringify(tech.frontend, null, 2)}`;
      }
    }

    // Add architecture context
    if (context.architecture) {
      const arch = JSON.parse(context.architecture);
      if (arch.frontend) {
        customization += `\n\nArchitecture:\n${JSON.stringify(arch.frontend, null, 2)}`;
      }
    }

    return customization;
  }

  // Additional frontend-specific methods
  public async validateComponent(componentPath: string): Promise<{
    valid: boolean;
    issues: string[];
    suggestions: string[];
  }> {
    const response = await this.llm.chat([
      {
        role: 'system',
        content: this.formatSystemPrompt({
          task: 'validate_component',
          componentPath,
        }),
      },
      {
        role: 'user',
        content: `Validate the component at ${componentPath}`,
      },
    ]);

    return JSON.parse(response.content);
  }

  public async optimizePerformance(componentPath: string): Promise<{
    optimizations: string[];
    metrics: {
      beforeScore: number;
      afterScore: number;
      improvements: Record<string, number>;
    };
  }> {
    const response = await this.llm.chat([
      {
        role: 'system',
        content: this.formatSystemPrompt({
          task: 'optimize_performance',
          componentPath,
        }),
      },
      {
        role: 'user',
        content: `Optimize the component at ${componentPath}`,
      },
    ]);

    return JSON.parse(response.content);
  }

  public async generateStorybook(componentPath: string): Promise<{
    stories: string[];
    documentation: string;
    examples: string[];
  }> {
    const response = await this.llm.chat([
      {
        role: 'system',
        content: this.formatSystemPrompt({
          task: 'generate_storybook',
          componentPath,
        }),
      },
      {
        role: 'user',
        content: `Generate Storybook documentation for ${componentPath}`,
      },
    ]);

    return JSON.parse(response.content);
  }
}