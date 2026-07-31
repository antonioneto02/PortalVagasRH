'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../database/sequelize');

const EstoqueItem = sequelize.define('EstoqueItem', {
  ID: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  ID_ESTOQUE: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  ID_VAGA: DataTypes.INTEGER,
  MATRICULA: DataTypes.STRING(50),
  AREA: DataTypes.STRING(200),
  USUARIO: DataTypes.STRING(50),
  STATUS: {
    type: DataTypes.STRING(20),
    defaultValue: 'EM_USO',
  },
  DTALOCACAO: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'RH_ESTOQUE_ITENS',
  timestamps: false,
  freezeTableName: true,
});

module.exports = EstoqueItem;
