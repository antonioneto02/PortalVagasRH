'use strict';

const fs = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');
require('dotenv').config({ path: process.env.ENV_FILE || path.join(__dirname, '..', '.env'), override: true });

const LOTE = 1000;

function exigir(nome) {
  if (!process.env[nome]) throw new Error(`Defina ${nome} (banco PostgreSQL de destino).`);
  return process.env[nome];
}

async function main() {
  const origem = require('../models');
  if (origem.sequelize.getDialect() !== 'mssql') throw new Error('A origem (DB_* do .env) deve ser o SQL Server atual.');
  const destino = new Sequelize(exigir('DESTINO_DB_DATABASE'), exigir('DESTINO_DB_USER'), exigir('DESTINO_DB_PASSWORD'), {
    host: exigir('DESTINO_DB_SERVER'),
    port: process.env.DESTINO_DB_PORT ? Number(process.env.DESTINO_DB_PORT) : undefined,
    dialect: 'postgres',
    dialectOptions: process.env.DESTINO_DB_SSL === '1' ? { ssl: { rejectUnauthorized: false } } : {},
    timezone: 'America/Sao_Paulo',
    logging: false,
  });
  const fila = destino.getQueryInterface();
  await destino.query(fs.readFileSync(path.join(__dirname, '..', 'database', 'sql', 'postgres', 'create_tables.sql'), 'utf8'));
  console.log('Tabelas criadas/conferidas no PostgreSQL.');

  await destino.transaction(async (transaction) => {
    for (const nome of [...origem.ORDEM].reverse()) await fila.bulkDelete(origem[nome].tableName, {}, { transaction });
    for (const nome of origem.ORDEM) {
      const model = origem[nome];
      const ordem = model.primaryKeyAttributes.map(c => [c, 'ASC']);
      let total = 0;
      let maior = 0;
      for (let offset = 0; ; offset += LOTE) {
        const linhas = await model.findAll({ order: ordem, limit: LOTE, offset, raw: true });
        if (!linhas.length) break;
        await fila.bulkInsert(model.tableName, linhas, { transaction });
        total += linhas.length;
        if (model.rawAttributes.ID && model.rawAttributes.ID.autoIncrement) maior = linhas.reduce((m, r) => Math.max(m, Number(r.ID)), maior);
        if (linhas.length < LOTE) break;
      }
      if (model.rawAttributes.ID && model.rawAttributes.ID.autoIncrement) {
        await destino.query(
          `SELECT setval(pg_get_serial_sequence('"${model.tableName}"', 'ID'), ${Math.max(maior, 1)}, ${maior > 0})`, { transaction });
      }
      console.log(`  ${model.tableName}: ${total}`);
    }
  });
  console.log('Migração concluída. Agora troque no .env: DB_DIALECT=postgres, DB_* do PostgreSQL e PORTAL_DB_* do SQL Server.');
  await origem.sequelize.close();
  await destino.close();
}

main().catch((e) => {
  console.error('FALHA:', e.message);
  process.exit(1);
});
