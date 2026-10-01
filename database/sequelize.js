'use strict';

const { Sequelize } = require('sequelize');
require('dotenv').config({ override: true });

const DIALETO = (process.env.DB_DIALECT || 'mssql').toLowerCase();
const MSSQL_GRAVA_UTC = true;

const OPCOES_DIALETO = {
  mssql: () => {
    if (MSSQL_GRAVA_UTC) {
      Sequelize.DataTypes.mssql.DATEONLY.parse = v => (v instanceof Date ? v.toISOString().slice(0, 10) : v);
      return {
        timezone: '+00:00',
        dialectOptions: { options: { encrypt: true, trustServerCertificate: true, requestTimeout: 60000 } },
      };
    }
    Sequelize.DataTypes.mssql.DATE.prototype._stringify = function (date, options) {
      if (!date || !date._isAMomentObject) date = this._applyTimezone(date, options);
      return date.format('YYYY-MM-DD HH:mm:ss.SSS');
    };
    return {
      timezone: 'America/Sao_Paulo',
      dialectOptions: {
        options: {
          encrypt: true,
          trustServerCertificate: true,
          requestTimeout: 60000,
          useUTC: false,
        },
      },
    };
  },
  postgres: () => {
    const pg = Sequelize.DataTypes.postgres;
    pg.DECIMAL.parse = v => Number(v);
    pg.BIGINT.parse = v => Number(v);
    pg.DATEONLY.parse = v => v;
    return {
      timezone: 'America/Sao_Paulo',
      dialectOptions: process.env.DB_SSL === '1' ? { ssl: { rejectUnauthorized: false } } : {},
    };
  },
};

if (!OPCOES_DIALETO[DIALETO]) throw new Error(`DB_DIALECT não suportado: ${DIALETO} (use mssql ou postgres).`);

const sequelize = new Sequelize(
  process.env.DB_DATABASE || process.env.DB_DATABASE,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_SERVER,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
    dialect: DIALETO,
    ...OPCOES_DIALETO[DIALETO](),
    logging: false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  }
);

module.exports = sequelize;

require('../models');
