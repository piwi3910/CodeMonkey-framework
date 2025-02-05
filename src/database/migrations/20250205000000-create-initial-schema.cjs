'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Create projects table
    await queryInterface.createTable('projects', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'active',
      },
      repository: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    // Create project_contexts table
    await queryInterface.createTable('project_contexts', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: {
          model: 'projects',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      architecture: {
        type: Sequelize.TEXT,
        allowNull: false,
        defaultValue: '{}',
      },
      technical: {
        type: Sequelize.TEXT,
        allowNull: false,
        defaultValue: '{}',
      },
      requirements: {
        type: Sequelize.TEXT,
        allowNull: false,
        defaultValue: '{}',
      },
      dependencies: {
        type: Sequelize.TEXT,
        allowNull: false,
        defaultValue: '{}',
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    // Create agents table
    await queryInterface.createTable('agents', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      role: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      provider: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      model: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      system_prompt: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'projects',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      total_tasks: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      successful_tasks: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      failed_tasks: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    // Create tasks table
    await queryInterface.createTable('tasks', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      title: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      status: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      priority: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      dependencies: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: '[]',
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'projects',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      agent_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'agents',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    // Create agent_states table
    await queryInterface.createTable('agent_states', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      agent_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: {
          model: 'agents',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      context: {
        type: Sequelize.TEXT,
        allowNull: false,
        defaultValue: '{}',
      },
      short_term: {
        type: Sequelize.TEXT,
        allowNull: false,
        defaultValue: '[]',
      },
      long_term: {
        type: Sequelize.TEXT,
        allowNull: false,
        defaultValue: '[]',
      },
      current_task: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    // Create indexes
    await queryInterface.addIndex('project_contexts', ['project_id']);
    await queryInterface.addIndex('agents', ['project_id']);
    await queryInterface.addIndex('agents', ['role']);
    await queryInterface.addIndex('tasks', ['project_id']);
    await queryInterface.addIndex('tasks', ['agent_id']);
    await queryInterface.addIndex('tasks', ['status']);
    await queryInterface.addIndex('agent_states', ['agent_id']);
  },

  async down(queryInterface, Sequelize) {
    // Drop tables in reverse order
    await queryInterface.dropTable('agent_states');
    await queryInterface.dropTable('tasks');
    await queryInterface.dropTable('agents');
    await queryInterface.dropTable('project_contexts');
    await queryInterface.dropTable('projects');
  }
};