'use strict';

const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DB_DATABASE,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_SERVER,
    dialect: 'mssql',
    dialectOptions: {
      options: {
        encrypt: true,
        trustServerCertificate: true,
        requestTimeout: 60000,
      },
    },
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

// Associations — loaded after module.exports to avoid circular dependency issues
const Vaga          = require('../models/Vaga');
const Candidatura   = require('../models/Candidatura');
const EstoqueTI     = require('../models/EstoqueTI');
const EstoqueItem   = require('../models/EstoqueItem');
const PedidoCompraTI = require('../models/PedidoCompraTI');

Candidatura.belongsTo(Vaga,   { foreignKey: 'ID_VAGA',    as: 'vaga' });
Vaga.hasMany(Candidatura,     { foreignKey: 'ID_VAGA',    as: 'candidaturas' });

PedidoCompraTI.belongsTo(Vaga, { foreignKey: 'ID_VAGA',   as: 'vaga' });
Vaga.hasMany(PedidoCompraTI,   { foreignKey: 'ID_VAGA',   as: 'pedidos' });

EstoqueItem.belongsTo(Vaga,    { foreignKey: 'ID_VAGA',    as: 'vaga' });
Vaga.hasMany(EstoqueItem,      { foreignKey: 'ID_VAGA',    as: 'itensEstoque' });

EstoqueItem.belongsTo(EstoqueTI, { foreignKey: 'ID_ESTOQUE', as: 'estoqueTI' });
EstoqueTI.hasMany(EstoqueItem,   { foreignKey: 'ID_ESTOQUE', as: 'itens' });
