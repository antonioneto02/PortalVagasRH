'use strict';

const fs = require('fs');
const path = require('path');

const DIALETO = (process.env.TESTE_DIALETO || '').toLowerCase();
const RAIZ = path.join(__dirname, '..', '..');
const ROLLBACK = Symbol('rollback');

function configurarAmbiente() {
  if (DIALETO === 'postgres') {
    require('dotenv').config = () => ({ parsed: {} });
    process.env.DB_DIALECT = 'postgres';
    process.env.DB_SERVER = process.env.TESTE_PG_SERVER || 'localhost';
    process.env.DB_PORT = process.env.TESTE_PG_PORT || '5432';
    process.env.DB_USER = process.env.TESTE_PG_USER || 'postgres';
    process.env.DB_PASSWORD = process.env.TESTE_PG_PASSWORD || '';
    process.env.DB_DATABASE = process.env.TESTE_PG_DATABASE;
  } else if (DIALETO === 'mssql') {
    delete process.env.DB_DIALECT;
  }
  const cls = require('cls-hooked');
  require('sequelize').Sequelize.useCLS(cls.createNamespace(`teste-${process.pid}`));
}

const ativo = DIALETO === 'mssql' || (DIALETO === 'postgres' && !!process.env.TESTE_PG_DATABASE);
if (ativo) configurarAmbiente();

async function prepararBanco(sequelize) {
  if (DIALETO !== 'postgres') return;
  const ddl = fs.readFileSync(path.join(RAIZ, 'database', 'sql', 'postgres', 'create_tables.sql'), 'utf8');
  await sequelize.query(ddl);
}

async function emTransacaoDesfeita(sequelize, fn) {
  try {
    await sequelize.transaction(async () => {
      await fn();
      throw ROLLBACK;
    });
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  }
}

async function restaurarIdentidades(sequelize) {
  if (DIALETO !== 'mssql') return;
  const modelos = require(path.join(RAIZ, 'models'));
  for (const nome of modelos.ORDEM) {
    const model = modelos[nome];
    if (!model.rawAttributes.ID || !model.rawAttributes.ID.autoIncrement) continue;
    await sequelize.transaction(async (transaction) => {
      const [linha] = await sequelize.query(
        `SELECT MAX(ID) AS maior, IDENT_CURRENT('${model.tableName}') AS atual FROM [${model.tableName}] WITH (TABLOCKX, HOLDLOCK)`,
        { type: 'SELECT', transaction }
      );
      if (linha.maior !== null && Number(linha.atual) > Number(linha.maior)) {
        await sequelize.query(`DBCC CHECKIDENT ('${model.tableName}', RESEED, ${Number(linha.maior)}) WITH NO_INFOMSGS`, { transaction });
      }
    });
  }
}

async function semPermissaoDeGravar(sequelize) {
  if (DIALETO !== 'mssql') return null;
  const modelos = require(path.join(RAIZ, 'models'));
  const faltando = [];
  for (const nome of modelos.ORDEM) {
    const tabela = modelos[nome].tableName;
    const [p] = await sequelize.query(
      `SELECT HAS_PERMS_BY_NAME('${tabela}', 'OBJECT', 'INSERT') AS i, HAS_PERMS_BY_NAME('${tabela}', 'OBJECT', 'UPDATE') AS u, HAS_PERMS_BY_NAME('${tabela}', 'OBJECT', 'DELETE') AS d, HAS_PERMS_BY_NAME('${tabela}', 'OBJECT', 'ALTER') AS a`,
      { type: 'SELECT' }
    );
    if (!p.i || !p.u || !p.d || !p.a) faltando.push(tabela);
  }
  return faltando.length ? `usuário do .env sem INSERT/UPDATE/DELETE/ALTER (ALTER é necessário para devolver o IDENTITY) em ${faltando.join(', ')}` : null;
}

function respostaFalsa() {
  const res = { statusCode: 200, corpo: undefined };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.corpo = b; return res; };
  res.send = (b) => { res.corpo = b; return res; };
  res.render = (visao, dados) => { res.visao = visao; res.corpo = dados; return res; };
  return res;
}

module.exports = { DIALETO, ativo, prepararBanco, emTransacaoDesfeita, restaurarIdentidades, semPermissaoDeGravar, respostaFalsa };
