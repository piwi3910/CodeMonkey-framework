import { sequelize } from '../config/database';
import { initializeModels } from '../models';

export async function initializeDatabase() {
  try {
    // Initialize models
    await initializeModels();

    // Test connection
    await sequelize.authenticate();
    console.log('Database connection established successfully.');

    // Sync database in development (this will be handled by migrations in production)
    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: true });
      console.log('Database synced successfully.');
    }
  } catch (error) {
    console.error('Unable to initialize database:', error);
    throw error;
  }
}

export async function closeDatabase() {
  try {
    await sequelize.close();
    console.log('Database connection closed.');
  } catch (error) {
    console.error('Error closing database connection:', error);
    throw error;
  }
}

export { sequelize };