import { Project } from './project';
import { Agent } from './agent';
import { Task } from './task';
import { AgentState } from './agent-state';
import { ProjectContext } from './project-context';
import { sequelize } from '../config/database';

// Initialize models
const initializeModels = async () => {
  // Initialize all models in dependency order
  Project.initModel();
  ProjectContext.initModel();
  Agent.initModel();
  Task.initModel();
  AgentState.initModel();

  // Create associations after all models are initialized
  Project.associate();
  ProjectContext.associate();
  Agent.associate();
  Task.associate();
  AgentState.associate();

  // Sync database in development (this will be handled by migrations in production)
  if (process.env.NODE_ENV === 'development') {
    await sequelize.sync({ alter: true });
  }
};

// Export models and initialization function
export {
  Project,
  Agent,
  Task,
  AgentState,
  ProjectContext,
  initializeModels,
};

// Export default object with all models
export default {
  Project,
  Agent,
  Task,
  AgentState,
  ProjectContext,
  initializeModels,
};