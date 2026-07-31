'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../database/sequelize');

const Vaga = sequelize.define('Vaga', {
  ID: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  FUNCAO: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  DATA_ABERTURA: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  TIPO_VAGA: {
    type: DataTypes.STRING(20),
    allowNull: false,
  },
  SOLICITANTE: DataTypes.STRING(200),
  SETOR: DataTypes.STRING(200),
  EMPRESA: DataTypes.STRING(200),
  NOTEBOOK: {
    type: DataTypes.CHAR(3),
    defaultValue: 'NAO',
  },
  CELULAR: {
    type: DataTypes.CHAR(3),
    defaultValue: 'NAO',
  },
  REQUISITOS_VAGA: DataTypes.TEXT,
  SLA_DIAS: DataTypes.INTEGER,
  CLASSIFICACAO: DataTypes.STRING(20),
  CANDIDATOS: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  ENTREVISTAS: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  PRAZO_CONTRATACAO: DataTypes.DATEONLY,
  DT_CONTRATACAO: DataTypes.DATEONLY,
  MATRICULA: DataTypes.STRING(50),
  STATUS: {
    type: DataTypes.STRING(20),
    defaultValue: 'ABERTA',
  },
  USUARIO_CADASTRO: DataTypes.STRING(50),
  DTINCLUSAO: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  DTALTERACAO: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'RH_VAGAS',
  timestamps: false,
  freezeTableName: true,
});

module.exports = Vaga;
