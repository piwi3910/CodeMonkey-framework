import { Model, DataTypes, InferAttributes, InferCreationAttributes, CreationOptional, NonAttribute } from 'sequelize';
import { sequelize } from '../config/database';
import { Project } from './project';
import { Task } from './task';
import { AgentState } from './agent-state';

export class Agent extends Model<InferAttributes<Agent>, InferCreationAttributes<Agent>> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare role: string;
  declare provider: string;
  declare model: string;
  declare systemPrompt: string;
  declare projectId: string;
  declare totalTasks: CreationOptional<number>;
  declare successfulTasks: CreationOptional<number>;
  declare failedTasks: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Associations
  declare project?: NonAttribute<Project>;
  declare tasks?: NonAttribute<Task[]>;
  declare state?: NonAttribute<AgentState>;

  static initModel() {
    return this.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        name: {
          type: DataTypes.STRING,
          allowNull: false,
        },
        role: {
          type: DataTypes.STRING,
          allowNull: false,
        },
        provider: {
          type: DataTypes.STRING,
          allowNull: false,
        },
        model: {
          type: DataTypes.STRING,
          allowNull: false,
        },
        systemPrompt: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        projectId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: 'projects',
            key: 'id',
          },
        },
        totalTasks: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        successfulTasks: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        failedTasks: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        updatedAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
      },
      {
        sequelize,
        modelName: 'Agent',
        tableName: 'agents',
        underscored: true,
        timestamps: true,
        indexes: [
          {
            fields: ['project_id'],
          },
          {
            fields: ['role'],
          },
        ],
      }
    );
  }

  static associate() {
    const { Project, Task, AgentState } = sequelize.models;
    
    // Define associations
    this.belongsTo(Project, {
      foreignKey: 'projectId',
      as: 'project',
    });

    this.hasMany(Task, {
      foreignKey: 'agentId',
      as: 'tasks',
    });

    this.hasOne(AgentState, {
      foreignKey: 'agentId',
      as: 'state',
    });
  }
}