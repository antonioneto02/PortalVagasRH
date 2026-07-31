'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../database/sequelize');

const Usuario = sequelize.define('Usuario', {
  ID: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  USERNAME: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
  },
  PASSWORD_HASH: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  NOME: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  EMAIL: DataTypes.STRING(200),
  TELEFONE: DataTypes.STRING(20),
  DTCADASTRO: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  ATIVO: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  ADM: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  ID_PROTHEUS: DataTypes.STRING(50),
}, {
  tableName: 'RH_USUARIOS',
  timestamps: false,
  freezeTableName: true,
});

module.exports = Usuario;
