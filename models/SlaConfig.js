'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../database/sequelize');

const SlaConfig = sequelize.define('SlaConfig', {
  ID: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  FUNCAO: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  SLA_DIAS: DataTypes.INTEGER,
  CLASSIFICACAO: DataTypes.STRING(20),
}, {
  tableName: 'RH_SLA_CONFIG',
  timestamps: false,
  freezeTableName: true,
});

module.exports = SlaConfig;
