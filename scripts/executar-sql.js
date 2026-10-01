'use strict';

const fs = require('fs');
const path = require('path');
const arquivo = process.argv[2];
const envPath = process.argv[3] || path.join(__dirname, '..', '.env');
if (!arquivo) {
  console.error('Uso: node scripts/executar-sql.js <arquivo.sql> [.env]');
  process.exit(1);
}
require('dotenv').config({ path: envPath });
const dialeto = (process.env.DB_DIALECT || 'mssql').toLowerCase();

async function executarMssql(texto) {
  const sql = require('mssql');
  const lotes = texto.split(/^\s*GO\s*$/gim).map(s => s.trim()).filter(Boolean);
  const pool = await sql.connect({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
    database: process.env.DB_DATABASE,
    options: { encrypt: true, trustServerCertificate: true },
    requestTimeout: 120000,
  });
  for (const [i, lote] of lotes.entries()) {
    const r = await pool.request().batch(lote);
    console.log(`Lote ${i + 1}/${lotes.length} ok (linhas afetadas: ${(r.rowsAffected || []).reduce((a, b) => a + b, 0)})`);
  }
  await pool.close();
}

async function executarPostgres(texto) {
  const { Client } = require('pg');
  const client = new Client({
    host: process.env.DB_SERVER,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    ssl: process.env.DB_SSL === '1' ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(texto);
    await client.query('COMMIT');
    console.log('Script executado em uma transação.');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await client.end();
  }
}

(async () => {
  const texto = fs.readFileSync(path.resolve(arquivo), 'utf8');
  if (dialeto === 'postgres') await executarPostgres(texto);
  else await executarMssql(texto);
  console.log(`Concluído: ${arquivo} em ${process.env.DB_SERVER}/${process.env.DB_DATABASE} (${dialeto})`);
})().catch((e) => {
  console.error('FALHA:', e.message);
  process.exit(1);
});
