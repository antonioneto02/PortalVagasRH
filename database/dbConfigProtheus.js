const dotenv = require('dotenv');
dotenv.config();

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE_PROTHEUS || 'p11_prod',
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
  requestTimeout: 60000,
};

module.exports = config;
