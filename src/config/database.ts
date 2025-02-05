import { Sequelize, Options } from 'sequelize';
import { config } from './env';

const sequelizeConfig: Options = {
  dialect: 'postgres',
  logging: config.logging.level === 'debug' ? console.log : false,
  define: {
    underscored: true,
    timestamps: true,
    paranoid: false,
  },
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
};

const sequelize = new Sequelize(config.database.url, sequelizeConfig);

export async function initDatabase() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established successfully.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    throw error;
  }
}

export { sequelize };
export default sequelize;