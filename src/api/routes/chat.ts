import { Router, Express } from 'express';
import { WhereOptions, Op } from 'sequelize';
import { Agent, Task } from '../../models';
import { AgentFactory } from '../../agents/factory';
import { ChromaProvider } from '../../providers/chroma';
import { OpenAIProvider } from '../../providers/openai';
import { config } from '../../config/env';

// Initialize providers
const chroma = new ChromaProvider();

const llm = new OpenAIProvider({
  apiKey: config.llm.openai.apiKey || '',
  modelName: config.llm.defaultModel,
});

// Initialize factory
const factory = new AgentFactory(chroma, llm);

export function setupRoutes(app: Express) {
  const router = Router();

  // Chat with an agent
  router.post('/chat/:agentId', async (req, res, next) => {
    try {
      const { agentId } = req.params;
      const { messages } = req.body;

      const agent = await Agent.findByPk(agentId);
      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      // Get agent instance using factory
      const agentInstance = await factory.getAgent(agentId);
      const response = await agentInstance.chat(messages);

      res.json({ response });
    } catch (error) {
      next(error);
    }
  });

  // Create a task for an agent
  router.post('/task/:agentId', async (req, res, next) => {
    try {
      const { agentId } = req.params;
      const { title, description, priority } = req.body;

      const agent = await Agent.findByPk(agentId);
      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      const task = await Task.create({
        title,
        description,
        priority,
        agentId,
        projectId: agent.get('projectId'),
        status: 'pending',
      });

      res.json({ task });
    } catch (error) {
      next(error);
    }
  });

  // Get agent tasks
  router.get('/tasks/:agentId', async (req, res, next) => {
    try {
      const { agentId } = req.params;
      const { status } = req.query;

      const where: WhereOptions<Task> = {
        agentId,
      };

      if (status && typeof status === 'string') {
        where.status = status;
      }

      const tasks = await Task.findAll({
        where,
        order: [['createdAt', 'DESC']],
      });

      res.json({ tasks });
    } catch (error) {
      next(error);
    }
  });

  app.use('/api', router);
}