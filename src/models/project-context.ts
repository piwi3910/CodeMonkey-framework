import { Model, DataTypes, InferAttributes, InferCreationAttributes, CreationOptional, NonAttribute } from 'sequelize';
import { sequelize } from '../config/database';
import { Project } from './project';

export class ProjectContext extends Model<InferAttributes<ProjectContext>, InferCreationAttributes<ProjectContext>> {
  declare id: CreationOptional<string>;
  declare projectId: string;
  declare architecture: string;
  declare technical: string;
  declare requirements: string;
  declare dependencies: string;
  declare updatedAt: CreationOptional<Date>;

  // Associations
  declare project?: NonAttribute<Project>;

  static initModel() {
    return this.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        projectId: {
          type: DataTypes.UUID,
          allowNull: false,
          unique: true,
          references: {
            model: 'projects',
            key: 'id',
          },
        },
        architecture: {
          type: DataTypes.TEXT,
          allowNull: false,
          defaultValue: '{}',
        },
        technical: {
          type: DataTypes.TEXT,
          allowNull: false,
          defaultValue: '{}',
        },
        requirements: {
          type: DataTypes.TEXT,
          allowNull: false,
          defaultValue: '{}',
        },
        dependencies: {
          type: DataTypes.TEXT,
          allowNull: false,
          defaultValue: '{}',
        },
        updatedAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
      },
      {
        sequelize,
        modelName: 'ProjectContext',
        tableName: 'project_contexts',
        underscored: true,
        timestamps: true,
        updatedAt: true,
        createdAt: false,
        indexes: [
          {
            fields: ['project_id'],
          },
        ],
      }
    );
  }

  static associate() {
    const { Project } = sequelize.models;
    
    // Define associations
    this.belongsTo(Project, {
      foreignKey: 'projectId',
      as: 'project',
    });
  }

  // Helper methods
  getArchitecture(): Record<string, any> {
    return JSON.parse(this.architecture);
  }

  getTechnical(): Record<string, any> {
    return JSON.parse(this.technical);
  }

  getRequirements(): Record<string, any> {
    return JSON.parse(this.requirements);
  }

  getDependencies(): Record<string, any> {
    return JSON.parse(this.dependencies);
  }
}