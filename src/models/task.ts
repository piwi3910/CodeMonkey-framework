import { Model, DataTypes, InferAttributes, InferCreationAttributes, CreationOptional, NonAttribute } from 'sequelize';
import { sequelize } from '../config/database';

export class Task extends Model<InferAttributes<Task>, InferCreationAttributes<Task>> {
  declare id: CreationOptional<string>;
  declare title: string;
  declare description: string;
  declare status: string;
  declare priority: string;
  declare dependencies: CreationOptional<string>;
  declare projectId: string;
  declare agentId: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Associations
  declare project?: NonAttribute<Task>;
  declare agent?: NonAttribute<Task | null>;

  static initModel() {
    return this.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        title: {
          type: DataTypes.STRING,
          allowNull: false,
        },
        description: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        status: {
          type: DataTypes.STRING,
          allowNull: false,
        },
        priority: {
          type: DataTypes.STRING,
          allowNull: false,
        },
        dependencies: {
          type: DataTypes.STRING,
          allowNull: false,
          defaultValue: '[]',
        },
        projectId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: 'projects',
            key: 'id',
          },
        },
        agentId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: 'agents',
            key: 'id',
          },
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
        modelName: 'Task',
        tableName: 'tasks',
        underscored: true,
        timestamps: true,
        indexes: [
          {
            fields: ['project_id'],
          },
          {
            fields: ['agent_id'],
          },
          {
            fields: ['status'],
          },
        ],
      }
    );
  }

  static associate() {
    const { Project, Agent } = sequelize.models;
    
    // Define associations
    this.belongsTo(Project, {
      foreignKey: 'projectId',
      as: 'project',
    });

    this.belongsTo(Agent, {
      foreignKey: 'agentId',
      as: 'agent',
    });
  }

  // Helper methods
  getDependencies(): string[] {
    return JSON.parse(this.dependencies);
  }

  setDependencies(deps: string[]): void {
    this.dependencies = JSON.stringify(deps);
  }
}