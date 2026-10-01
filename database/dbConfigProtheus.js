const dotenv = require('dotenv');
dotenv.config();

const config = {
  user: process.env.PORTAL_DB_USER || process.env.DB_USER,
  password: process.env.PORTAL_DB_PASSWORD || process.env.DB_PASSWORD,
  server: process.env.PORTAL_DB_SERVER || process.env.DB_SERVER,
  port: process.env.PORTAL_DB_PORT ? Number(process.env.PORTAL_DB_PORT) : undefined,
  database: process.env.DB_DATABASE_PROTHEUS || 'p11_prod',
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
  requestTimeout: 60000,
};

module.exports = config;
