import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { ProjectManagerAgent } from '../agents/project-manager';
import { LLMProvider } from '../providers/base';
import { Message, Task } from '../types';

// Mock external dependencies
jest.mock('@prisma/client');
jest.mock('ioredis');
jest.mock('../providers/base');

describe('ProjectManagerAgent', () => {
  let prisma: jest.Mocked<PrismaClient>;
  let redis: jest.Mocked<Redis>;
  let llm: jest.Mocked<LLMProvider>;
  let agent: ProjectManagerAgent;

  const mockAgentId = 'pm-123';
  const mockAgentName = 'Test PM';
  const mockProjectId = 'project-123';

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Initialize mocked dependencies
    prisma = new PrismaClient() as jest.Mocked<PrismaClient>;
    redis = new Redis() as jest.Mocked<Redis>;
    llm = {
      chat: jest.fn(),
      stream: jest.fn(),
    } as unknown as jest.Mocked<LLMProvider>;

    // Create agent instance
    agent = new ProjectManagerAgent(
      mockAgentId,
      mockAgentName,
      mockProjectId,
      prisma,
      redis,
      llm
    );
  });

  describe('processMessage', () => {
    const mockMessage: Message = {
      role: 'user',
      content: 'Create a new task for implementing authentication',
    };

    const mockResponse: Message = {
      role: 'assistant',
      content: 'I will create a task for implementing authentication.',
    };

    beforeEach(() => {
      (llm.chat as jest.Mock).mockResolvedValue({
        content: mockResponse.content,
      });
    });

    it('should process messages and store in memory', async () => {
      const response = await agent.processMessage(mockMessage);

      expect(response.content).toBe(mockResponse.content);
      expect(llm.chat).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ role: 'system' }),
          mockMessage,
        ])
      );
    });

    it('should create tasks when message contains task creation intent', async () => {
      await agent.processMessage(mockMessage);

      expect(prisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            projectId: mockProjectId,
            status: 'pending',
          }),
        })
      );
    });
  });

  describe('handleTask', () => {
    const mockTask: Task = {
      id: 'task-123',
      title: 'Implement Authentication',
      description: 'Create a secure authentication system',
      status: 'pending',
      priority: 'high',
      projectId: mockProjectId,
      dependencies: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    beforeEach(() => {
      (llm.chat as jest.Mock).mockResolvedValue({
        content: 'Task analysis complete.',
      });
    });

    it('should assign and process tasks', async () => {
      await agent.handleTask(mockTask);

      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: mockTask.id },
        data: expect.objectContaining({
          agentId: mockAgentId,
          status: 'in_progress',
        }),
      });
    });

    it('should update task status to completed after processing', async () => {
      await agent.handleTask(mockTask);

      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: mockTask.id },
        data: expect.objectContaining({
          status: 'completed',
        }),
      });
    });
  });

  describe('planNextAction', () => {
    const mockPendingTasks = [
      {
        id: 'task-1',
        title: 'Setup Database',
        description: 'Configure PostgreSQL database',
        status: 'pending',
        priority: 'high',
        projectId: mockProjectId,
      },
      {
        id: 'task-2',
        title: 'Create API Endpoints',
        description: 'Implement REST API endpoints',
        status: 'pending',
        priority: 'medium',
        projectId: mockProjectId,
      },
    ];

    const mockAgents = [
      {
        id: 'agent-1',
        name: 'Backend Dev',
        role: 'backend_developer',
        projectId: mockProjectId,
      },
      {
        id: 'agent-2',
        name: 'Frontend Dev',
        role: 'frontend_developer',
        projectId: mockProjectId,
      },
    ];

    beforeEach(() => {
      (prisma.task.findMany as jest.Mock).mockResolvedValue(mockPendingTasks);
      (prisma.agent.findMany as jest.Mock).mockResolvedValue(mockAgents);
      (llm.chat as jest.Mock).mockResolvedValue({
        content: 'Assign database task to backend developer',
      });
    });

    it('should analyze and assign pending tasks', async () => {
      await agent.planNextAction();

      expect(prisma.task.findMany).toHaveBeenCalledWith({
        where: {
          projectId: mockProjectId,
          status: 'pending',
        },
        orderBy: {
          priority: 'desc',
        },
      });

      expect(prisma.task.update).toHaveBeenCalled();
      expect(llm.chat).toHaveBeenCalled();
    });

    it('should update project context with the plan', async () => {
      await agent.planNextAction();

      expect(prisma.projectContext.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { projectId: mockProjectId },
        })
      );
    });
  });
});