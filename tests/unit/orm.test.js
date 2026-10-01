'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const RAIZ = path.join(__dirname, '..', '..');

function rodar(codigo, env = {}) {
  const r = spawnSync(process.execPath, ['-e', codigo], { cwd: RAIZ, env: { ...process.env, DB_DIALECT: '', ...env }, encoding: 'utf8' });
  return { status: r.status, saida: r.stdout.trim(), erro: r.stderr };
}

describe('ORM: dialeto do banco', () => {
  test('usa SQL Server por padrão', () => {
    const r = rodar("console.log(require('./database/sequelize').getDialect())");
    assert.equal(r.saida, 'mssql', r.erro);
  });

  test('DB_DIALECT=postgres troca as tabelas próprias para PostgreSQL', () => {
    const r = rodar("console.log(require('./database/sequelize').getDialect())", { DB_DIALECT: 'postgres' });
    assert.equal(r.saida, 'postgres', r.erro);
  });

  test('DW e Protheus (mssql) usam PORTAL_DB_* quando DB_* vira PostgreSQL', () => {
    const codigo = "const d = require('./database/dbConfigDw'), p = require('./database/dbConfigProtheus'); console.log([d.server, d.user, p.server, p.user].join('|'))";
    const r = rodar(codigo, { DB_DIALECT: 'postgres', DB_SERVER: 'pg', DB_USER: 'pguser', PORTAL_DB_SERVER: 'sqlserver', PORTAL_DB_USER: 'portal' });
    assert.equal(r.saida.split('\n').pop(), 'sqlserver|portal|sqlserver|portal', r.erro);
  });

  test('dialeto desconhecido falha logo ao subir', () => {
    const r = rodar("require('./database/sequelize')", { DB_DIALECT: 'oracle' });
    assert.notEqual(r.status, 0);
    assert.match(r.erro, /DB_DIALECT não suportado/);
  });
});

describe('ORM: DDL do PostgreSQL acompanha os models', () => {
  const ddl = fs.readFileSync(path.join(RAIZ, 'database', 'sql', 'postgres', 'create_tables.sql'), 'utf8');
  const tabelas = {};
  for (const m of ddl.matchAll(/CREATE TABLE IF NOT EXISTS "(\w+)" \(([\s\S]*?)\n\);/g)) {
    tabelas[m[1]] = new Set([...m[2].matchAll(/^\s*"(\w+)"/gm)].map(c => c[1]));
  }
  const modelos = require('../../models');

  for (const nome of modelos.ORDEM) {
    test(`${nome} tem tabela e todas as colunas no create_tables.sql`, () => {
      const model = modelos[nome];
      const colunas = tabelas[model.tableName];
      assert.ok(colunas, `tabela ${model.tableName} ausente no DDL`);
      for (const atributo of Object.values(model.rawAttributes)) {
        assert.ok(colunas.has(atributo.field), `${model.tableName}.${atributo.field} ausente no DDL`);
      }
    });
  }
});
