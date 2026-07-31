'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../database/sequelize');

const Candidatura = sequelize.define('Candidatura', {
  ID: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  ID_VAGA: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  NOME: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  CELULAR: DataTypes.STRING(20),
  EMAIL: DataTypes.STRING(200),
  LINKEDIN: DataTypes.STRING(300),
  APRESENTACAO: DataTypes.TEXT,
  LINK_ADICIONAL: DataTypes.STRING(300),
  CURRICULO_PATH: DataTypes.STRING(500),
  DTINCLUSAO: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'RH_CANDIDATURAS',
  timestamps: false,
  freezeTableName: true,
});

module.exports = Candidatura;
