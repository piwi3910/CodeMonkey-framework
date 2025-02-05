import express, { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import cors from 'cors';
import { AgentFactory } from './agents/factory';
import { Message, ApiRequest, ApiResponse, FrameworkError } from './types';
import { config } from './config/env';

export class Application {
  private app: express.Application;
  private prisma: PrismaClient;
  private redis: Redis;
  private agentFactory: AgentFactory;

  constructor() {
    this.app = express();
    this.prisma = new PrismaClient();
    this.redis = new Redis(config.redis.url);
    this.agentFactory = new AgentFactory(this.prisma, this.redis);

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(cors({
      origin: config.server.corsOrigins,
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }));
    this.app.use(this.authenticate.bind(this));
  }

  private setupRoutes(): void {
    // OpenAI-compatible chat completion endpoint
    this.app.post('/v1/chat/completions', this.handleChatCompletion.bind(this));

    // Project management endpoints
    this.app.post('/api/projects', this.createProject.bind(this));
    this.app.get('/api/projects/:projectId', this.getProject.bind(this));
    this.app.post('/api/projects/:projectId/tasks', this.createTask.bind(this));

    // Agent management endpoints
    this.app.post('/api/projects/:projectId/agents', this.createAgent.bind(this));
    this.app.get('/api/agents/:agentId', this.getAgent.bind(this));
    this.app.post('/api/agents/:agentId/messages', this.sendMessageToAgent.bind(this));
  }

  private setupErrorHandling(): void {
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      console.error('Error:', err);

      if (err instanceof FrameworkError) {
        return res.status(err.status).json({
          error: {
            type: err.name,
            message: err.message,
            code: err.code,
            details: err.details,
          },
        });
      }

      return res.status(500).json({
        error: {
          type: 'InternalServerError',
          message: 'An unexpected error occurred',
        },
      });
    });
  }

  private authenticate(req: Request, res: Response, next: NextFunction): void {
    const apiKey = req.headers.authorization?.replace('Bearer ', '');

    if (!apiKey) {
      throw new FrameworkError('Missing API key', 'MISSING_API_KEY', 401);
    }

    // In a real implementation, we would validate the API key against the database
    // For now, we'll just check if it's not empty
    next();
  }

  private async handleChatCompletion(req: Request, res: Response): Promise<void> {
    const request = req.body as ApiRequest;
    
    // Extract project and agent information from the request
    const projectId = req.headers['x-project-id'] as string;
    const agentRole = req.headers['x-agent-role'] as string;

    if (!projectId || !agentRole) {
      throw new FrameworkError(
        'Missing project ID or agent role',
        'MISSING_PARAMETERS',
        400
      );
    }

    // Get or create an agent for this conversation
    const agent = await this.getOrCreateAgent(projectId, agentRole);

    // Process the messages
    const response = await agent.processMessage(request.messages[request.messages.length - 1]);

    // Format response in OpenAI-compatible format
    const apiResponse: ApiResponse = {
      id: `chat-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: config.llm.defaultModel,
      choices: [
        {
          index: 0,
          message: response,
          finishReason: 'stop',
        },
      ],
    };

    res.json(apiResponse);
  }

  private async createProject(req: Request, res: Response): Promise<void> {
    const { name, description } = req.body;

    const project = await this.prisma.project.create({
      data: {
        name,
        description,
        status: 'planning',
        context: {
          create: {
            files: '[]',
            dependencies: '{}',
            architecture: '{"decisions": []}',
            technical: '[]',
            requirements: '[]',
            design: '[]',
          },
        },
      },
    });

    // Create a project manager agent for the new project
    await this.agentFactory.createAgent('project_manager', 'Project Manager', project.id);

    res.status(201).json(project);
  }

  private async getProject(req: Request, res: Response): Promise<void> {
    const { projectId } = req.params;

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        agents: true,
        tasks: true,
        context: true,
      },
    });

    if (!project) {
      throw new FrameworkError('Project not found', 'PROJECT_NOT_FOUND', 404);
    }

    res.json(project);
  }

  private async createTask(req: Request, res: Response): Promise<void> {
    const { projectId } = req.params;
    const { title, description, priority } = req.body;

    const task = await this.prisma.task.create({
      data: {
        projectId,
        title,
        description,
        priority,
        status: 'pending',
        dependencies: '[]',
      },
    });

    // Notify project manager about the new task
    const projectManager = await this.getProjectManager(projectId);
    await projectManager.handleTask(task as any);

    res.status(201).json(task);
  }

  private async createAgent(req: Request, res: Response): Promise<void> {
    const { projectId } = req.params;
    const { role, name } = req.body;

    const agent = await this.agentFactory.createAgent(role, name, projectId);
    res.status(201).json(agent);
  }

  private async getAgent(req: Request, res: Response): Promise<void> {
    const { agentId } = req.params;
    const agent = await this.agentFactory.getAgent(agentId);
    res.json(agent);
  }

  private async sendMessageToAgent(req: Request, res: Response): Promise<void> {
    const { agentId } = req.params;
    const message: Message = req.body;

    const agent = await this.agentFactory.getAgent(agentId);
    const response = await agent.processMessage(message);

    res.json(response);
  }

  private async getOrCreateAgent(projectId: string, role: string): Promise<any> {
    // Try to find an existing agent with the specified role
    const existingAgent = await this.prisma.agent.findFirst({
      where: {
        projectId,
        role,
      },
    });

    if (existingAgent) {
      return this.agentFactory.getAgent(existingAgent.id);
    }

    // Create a new agent if none exists
    return this.agentFactory.createAgent(role as any, `${role} Agent`, projectId);
  }

  private async getProjectManager(projectId: string): Promise<any> {
    const manager = await this.prisma.agent.findFirst({
      where: {
        projectId,
        role: 'project_manager',
      },
    });

    if (!manager) {
      throw new FrameworkError(
        'Project manager not found',
        'MANAGER_NOT_FOUND',
        404
      );
    }

    return this.agentFactory.getAgent(manager.id);
  }

  async start(): Promise<void> {
    const port = config.server.port;
    this.app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  }

  async stop(): Promise<void> {
    await this.prisma.$disconnect();
    await this.redis.quit();
  }
}