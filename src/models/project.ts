import { Model, DataTypes, InferAttributes, InferCreationAttributes, CreationOptional, NonAttribute } from 'sequelize';
import { sequelize } from '../config/database';

export class Project extends Model<InferAttributes<Project>, InferCreationAttributes<Project>> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare description: string;
  declare status: CreationOptional<string>;
  declare repository: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Associations
  declare agents?: NonAttribute<Project[]>;
  declare tasks?: NonAttribute<Project[]>;
  declare context?: NonAttribute<Project | null>;

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
        description: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        status: {
          type: DataTypes.STRING,
          allowNull: false,
          defaultValue: 'active',
        },
        repository: {
          type: DataTypes.STRING,
          allowNull: true,
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
        modelName: 'Project',
        tableName: 'projects',
        underscored: true,
        timestamps: true,
      }
    );
  }

  static associate() {
    const { Agent, Task, ProjectContext } = sequelize.models;
    
    // Define associations
    this.hasMany(Agent, {
      foreignKey: 'projectId',
      as: 'agents',
    });

    this.hasMany(Task, {
      foreignKey: 'projectId',
      as: 'tasks',
    });

    this.hasOne(ProjectContext, {
      foreignKey: 'projectId',
      as: 'context',
    });
  }
}