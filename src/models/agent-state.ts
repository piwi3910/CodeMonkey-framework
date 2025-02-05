import { Model, DataTypes, InferAttributes, InferCreationAttributes, CreationOptional, NonAttribute } from 'sequelize';
import { sequelize } from '../config/database';

export class AgentState extends Model<InferAttributes<AgentState>, InferCreationAttributes<AgentState>> {
  declare id: CreationOptional<string>;
  declare agentId: string;
  declare context: string;
  declare shortTerm: string;
  declare longTerm: string;
  declare currentTask: CreationOptional<string | null>;
  declare updatedAt: CreationOptional<Date>;

  // Associations
  declare agent?: NonAttribute<AgentState>;

  static initModel() {
    return this.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        agentId: {
          type: DataTypes.UUID,
          allowNull: false,
          unique: true,
          references: {
            model: 'agents',
            key: 'id',
          },
        },
        context: {
          type: DataTypes.TEXT,
          allowNull: false,
          defaultValue: '{}',
        },
        shortTerm: {
          type: DataTypes.TEXT,
          allowNull: false,
          defaultValue: '[]',
        },
        longTerm: {
          type: DataTypes.TEXT,
          allowNull: false,
          defaultValue: '[]',
        },
        currentTask: {
          type: DataTypes.STRING,
          allowNull: true,
        },
        updatedAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
      },
      {
        sequelize,
        modelName: 'AgentState',
        tableName: 'agent_states',
        underscored: true,
        timestamps: true,
        updatedAt: true,
        createdAt: false,
        indexes: [
          {
            fields: ['agent_id'],
          },
        ],
      }
    );
  }

  static associate() {
    const { Agent } = sequelize.models;
    
    // Define associations
    this.belongsTo(Agent, {
      foreignKey: 'agentId',
      as: 'agent',
    });
  }

  // Helper methods
  getContext(): Record<string, any> {
    return JSON.parse(this.context);
  }

  setContext(ctx: Record<string, any>): void {
    this.context = JSON.stringify(ctx);
  }

  getShortTerm(): any[] {
    return JSON.parse(this.shortTerm);
  }

  setShortTerm(items: any[]): void {
    this.shortTerm = JSON.stringify(items);
  }

  getLongTerm(): any[] {
    return JSON.parse(this.longTerm);
  }

  setLongTerm(items: any[]): void {
    this.longTerm = JSON.stringify(items);
  }
}