import { Model, DataTypes, ModelStatic, InferAttributes, InferCreationAttributes, CreationOptional, ModelAttributes } from 'sequelize';
import { sequelize } from '../config/database';

export interface BaseAttributes {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export abstract class BaseModel<M extends BaseModel<M>> extends Model<
  InferAttributes<M>,
  InferCreationAttributes<M>
> {
  declare id: CreationOptional<string>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel<M extends BaseModel<M>>(this: ModelStatic<M>) {
    const attributes = {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
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
    } as ModelAttributes<M>;

    return this.init(attributes, {
      sequelize,
      modelName: this.name,
      underscored: true,
      timestamps: true,
    });
  }

  static associate() {
    // This method will be implemented by child models to define associations
  }
}