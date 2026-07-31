'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../database/sequelize');

const PedidoCompraTI = sequelize.define('PedidoCompraTI', {
  ID: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  ID_VAGA: DataTypes.INTEGER,
  ITENS_JSON: DataTypes.TEXT,
  STATUS: {
    type: DataTypes.STRING(20),
    defaultValue: 'PENDENTE',
  },
  OBSERVACOES: DataTypes.TEXT,
  USUARIO_PEDIDO: DataTypes.STRING(50),
  DTPEDIDO: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  DTATUALIZACAO: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'RH_PEDIDOS_COMPRA_TI',
  timestamps: false,
  freezeTableName: true,
});

module.exports = PedidoCompraTI;
