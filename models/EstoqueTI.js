'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../database/sequelize');

const EstoqueTI = sequelize.define('EstoqueTI', {
  ID: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  TIPO_PRODUTO: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  DESCRICAO: DataTypes.STRING(200),
  MODELO: DataTypes.STRING(200),
  QUANTIDADE: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
  },
  DTINCLUSAO: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  DTALTERACAO: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'RH_ESTOQUE_TI',
  timestamps: false,
  freezeTableName: true,
});

module.exports = EstoqueTI;
