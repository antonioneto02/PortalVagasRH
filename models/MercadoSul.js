'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../database/sequelize');

const MercadoSul = sequelize.define('MercadoSul', {
  ID: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  FUNCAO_ORIGINAL: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  CARGO_MERCADO: DataTypes.STRING(200),
  NIVEL_HIERARQUICO: DataTypes.STRING(100),
  MEDIA_SALARIAL_PR: DataTypes.DECIMAL(10, 2),
  MEDIA_SALARIAL_SUL: DataTypes.DECIMAL(10, 2),
  FAIXA_MIN: DataTypes.DECIMAL(10, 2),
  FAIXA_MAX: DataTypes.DECIMAL(10, 2),
  DTINCLUSAO: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'RH_MERCADO_SUL',
  timestamps: false,
  freezeTableName: true,
});

module.exports = MercadoSul;
