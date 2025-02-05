import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { AgentFactory } from '../agents/factory';
import { ProjectManagerAgent } from '../agents/project-manager';
import { ArchitectAgent } from '../agents/architect';
import { config } from '../config/env';
import { FrameworkError } from '../types';

// Mock external dependencies
jest.mock('@prisma/client');
jest.mock('ioredis');

describe('AgentFactory', () => {
  let prisma: jest.Mocked<PrismaClient>;
  let redis: jest.Mocked<Redis>;
  let factory: AgentFactory;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Initialize mocked dependencies
    prisma = new PrismaClient() as jest.Mocked<PrismaClient>;
    redis = new Redis() as jest.Mocked<Redis>;

    // Create factory instance
    factory = new AgentFactory(prisma, redis);
  });

  describe('createAgent', () => {
    const mockProjectId = 'project-123';
    const mockAgentId = 'agent-123';
    const mockAgentName = 'Test Agent';

    beforeEach(() => {
      // Mock Prisma create methods
      (prisma.agent.create as jest.Mock).mockResolvedValue({
        id: mockAgentId,
        name: mockAgentName,
        role: 'project_manager',
        projectId: mockProjectId,
      });

      (prisma.agentState.create as jest.Mock).mockResolvedValue({
        agentId: mockAgentId,
        context: '{}',
        shortTerm: '[]',
        longTerm: '[]',
      });
    });

    it('should create a project manager agent', async () => {
      const agent = await factory.createAgent(
        'project_manager',
        mockAgentName,
        mockProjectId
      );

      expect(agent).toBeInstanceOf(ProjectManagerAgent);
      expect(prisma.agent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: mockAgentName,
          role: 'project_manager',
          project: {
            connect: {
              id: mockProjectId,
            },
          },
        }),
      });
    });

    it('should create an architect agent', async () => {
      const agent = await factory.createAgent(
        'architect',
        mockAgentName,
        mockProjectId
      );

      expect(agent).toBeInstanceOf(ArchitectAgent);
      expect(prisma.agent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: mockAgentName,
          role: 'architect',
          project: {
            connect: {
              id: mockProjectId,
            },
          },
        }),
      });
    });

    it('should throw error for unimplemented agent roles', async () => {
      await expect(
        factory.createAgent('frontend_developer', mockAgentName, mockProjectId)
      ).rejects.toThrow(FrameworkError);
    });

    it('should initialize agent state', async () => {
      await factory.createAgent('project_manager', mockAgentName, mockProjectId);

      expect(prisma.agentState.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          agentId: mockAgentId,
          context: '{}',
          shortTerm: '[]',
          longTerm: '[]',
        }),
      });
    });
  });

  describe('getAgent', () => {
    const mockAgentId = 'agent-123';
    const mockProjectId = 'project-123';

    beforeEach(() => {
      (prisma.agent.findUnique as jest.Mock).mockResolvedValue({
        id: mockAgentId,
        name: 'Test Agent',
        role: 'project_manager',
        projectId: mockProjectId,
      });
    });

    it('should retrieve an existing agent', async () => {
      const agent = await factory.getAgent(mockAgentId);

      expect(agent).toBeInstanceOf(ProjectManagerAgent);
      expect(prisma.agent.findUnique).toHaveBeenCalledWith({
        where: { id: mockAgentId },
      });
    });

    it('should throw error when agent not found', async () => {
      (prisma.agent.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(factory.getAgent(mockAgentId)).rejects.toThrow(FrameworkError);
    });
  });
});