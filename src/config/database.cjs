require('dotenv').config();
const path = require('path');

const config = {
  development: {
    dialect: 'sqlite',
    storage: path.join(__dirname, '../../database.sqlite'),
    logging: false,
    define: {
      underscored: true,
      timestamps: true,
    },
  },
  test: {
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false,
    define: {
      underscored: true,
      timestamps: true,
    },
  },
  production: {
    dialect: 'sqlite',
    storage: path.join(__dirname, '../../database.sqlite'),
    logging: false,
    define: {
      underscored: true,
      timestamps: true,
    },
  },
};

module.exports = config;