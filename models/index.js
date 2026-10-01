'use strict';

const sequelize = require('../database/sequelize');
const Usuario = require('./Usuario');
const Vaga = require('./Vaga');
const Candidatura = require('./Candidatura');
const EstoqueTI = require('./EstoqueTI');
const EstoqueItem = require('./EstoqueItem');
const PedidoCompraTI = require('./PedidoCompraTI');
const MercadoSul = require('./MercadoSul');
const SlaConfig = require('./SlaConfig');

Candidatura.belongsTo(Vaga, { foreignKey: 'ID_VAGA', as: 'vaga' });
Vaga.hasMany(Candidatura, { foreignKey: 'ID_VAGA', as: 'candidaturas' });

PedidoCompraTI.belongsTo(Vaga, { foreignKey: 'ID_VAGA', as: 'vaga' });
Vaga.hasMany(PedidoCompraTI, { foreignKey: 'ID_VAGA', as: 'pedidos' });

EstoqueItem.belongsTo(Vaga, { foreignKey: 'ID_VAGA', as: 'vaga' });
Vaga.hasMany(EstoqueItem, { foreignKey: 'ID_VAGA', as: 'itensEstoque' });

EstoqueItem.belongsTo(EstoqueTI, { foreignKey: 'ID_ESTOQUE', as: 'estoqueTI' });
EstoqueTI.hasMany(EstoqueItem, { foreignKey: 'ID_ESTOQUE', as: 'itens' });

const ORDEM = ['Usuario', 'Vaga', 'Candidatura', 'EstoqueTI', 'EstoqueItem', 'PedidoCompraTI', 'MercadoSul', 'SlaConfig'];

module.exports = {
  sequelize, Usuario, Vaga, Candidatura, EstoqueTI, EstoqueItem, PedidoCompraTI, MercadoSul, SlaConfig, ORDEM,
};
