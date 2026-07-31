'use strict';

const bcrypt = require('bcrypt');
const sql = require('mssql');
const dbConfigProtheus = require('../database/dbConfigProtheus');
const Usuario = require('../models/Usuario');

async function renderUsuarios(req, res) {
  try {
    const usuarios = await Usuario.findAll({ order: [['ID', 'DESC']] });
    res.render('System/usuarios', {
      usuarios: usuarios.map(u => u.toJSON()),
      username: req.session.username,
      isProtheus: req.session.isProtheus,
      isAdmin: req.session.isAdmin === true,
      currentPath: '/usuarios',
    });
  } catch (err) {
    console.error('Erro ao carregar usuarios:', err);
    res.status(500).send('Erro ao carregar usuarios.');
  }
}

async function atualizarAdmUsuario(req, res) {
  const id = parseInt(req.params.id, 10);
  const adm = Number(req.body.adm) === 1 ? 1 : 0;
  if (!id) return res.status(400).json({ error: 'ID invalido.' });
  try {
    await Usuario.update({ ADM: adm }, { where: { ID: id } });
    return res.json({ success: true });
  } catch (err) {
    console.error('Erro ao atualizar ADM:', err);
    return res.status(500).json({ error: 'Erro ao atualizar ADM.' });
  }
}

async function criarUsuario(req, res) {
  const { username, password, nome, email, telefone } = req.body;
  if (!username || !password || !nome) {
    return res.status(400).json({ error: 'Campos obrigatorios: usuario, senha e nome.' });
  }
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const existing = await Usuario.findOne({ where: { USERNAME: username } });
    if (existing) {
      return res.status(409).json({ error: 'Usuario ja existe.' });
    }
    await Usuario.create({
      USERNAME: username,
      PASSWORD_HASH: passwordHash,
      NOME: nome,
      EMAIL: email || null,
      TELEFONE: telefone || null,
      ADM: 0,
      ATIVO: true,
    });
    return res.json({ success: true });
  } catch (err) {
    console.error('Erro ao criar usuario:', err);
    return res.status(500).json({ error: 'Erro ao criar usuario.' });
  }
}

async function buscarUsuariosProtheus(req, res) {
  const q = (req.query.q || '').trim();
  let pool = null;
  try {
    pool = await new sql.ConnectionPool(dbConfigProtheus).connect();
    const result = await pool.request()
      .input('Q', sql.VarChar(200), `%${q.toUpperCase()}%`)
      .query(`
        SELECT TOP 50
          RTRIM(LTRIM(USR_ID))   AS USR_ID,
          RTRIM(LTRIM(USR_NOME)) AS USR_NOME
        FROM [dbo].[SYS_USR]
        WHERE D_E_L_E_T_ = ''
          AND USR_NOME IS NOT NULL
          AND USR_ID   IS NOT NULL
          AND UPPER(USR_NOME) LIKE @Q
        ORDER BY USR_NOME
      `);
    const itens = result.recordset.map(r => ({
      id: r.USR_ID,
      text: r.USR_ID + ' - ' + r.USR_NOME,
      nome: r.USR_NOME,
      id_protheus: r.USR_ID,
    }));
    return res.json(itens);
  } catch (err) {
    console.error('Erro ao buscar usuarios Protheus:', err);
    return res.json([]);
  } finally {
    if (pool) try { await pool.close(); } catch {}
  }
}

async function incluirUsuarioProtheus(req, res) {
  const idProtheus = String(req.body.id_protheus || '').trim();
  const nome = String(req.body.nome || '').trim();
  const adm = Number(req.body.adm) === 1 ? 1 : 0;
  if (!idProtheus || !nome) {
    return res.status(400).json({ error: 'ID Protheus e nome sao obrigatorios.' });
  }
  try {
    const existing = await Usuario.findOne({ where: { ID_PROTHEUS: idProtheus } });
    if (existing) {
      return res.status(409).json({ error: 'Usuario Protheus ja cadastrado.' });
    }
    const username = `PROTHEUS_${idProtheus}`;
    const senhaDummyHash = await bcrypt.hash(`PROTHEUS_${idProtheus}_${Date.now()}`, 10);
    await Usuario.create({
      USERNAME: username,
      PASSWORD_HASH: senhaDummyHash,
      NOME: nome,
      ADM: adm,
      ID_PROTHEUS: idProtheus,
      ATIVO: true,
    });
    return res.json({ success: true });
  } catch (err) {
    console.error('Erro ao incluir usuario Protheus:', err);
    return res.status(500).json({ error: 'Erro ao incluir usuario Protheus.' });
  }
}

module.exports = {
  renderUsuarios,
  atualizarAdmUsuario,
  criarUsuario,
  buscarUsuariosProtheus,
  incluirUsuarioProtheus,
};
