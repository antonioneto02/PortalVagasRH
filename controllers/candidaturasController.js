'use strict';

require('../database/sequelize'); // carrega associações entre models
const multer = require('multer');

function formatDate(dt) {
  if (!dt) return null;
  const d = new Date(dt);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

function formatDateTime(dt) {
  if (!dt) return null;
  const d = new Date(dt);
  return `${formatDate(dt)} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
const path = require('path');
const fs = require('fs');
const Candidatura = require('../models/Candidatura');
const Vaga = require('../models/Vaga');
const notificacaoModel = require('../models/notificacaoModel');

const CANDIDATURA_NOTIFY_EMAIL = process.env.CANDIDATURA_NOTIFY_EMAIL || 'ti02@cini.com.br';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'public', 'curriculos');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, Date.now() + '_' + safe);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) cb(null, true);
  else cb(new Error('Tipo de arquivo nao permitido. Use PDF, DOC, DOCX ou imagem.'));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });
const uploadMiddleware = upload.single('curriculo');

function resolveCurriculoPath(curriculoPath) {
  const raw = String(curriculoPath || '').trim();
  if (!raw) return null;
  if (path.isAbsolute(raw) && fs.existsSync(raw)) return raw;
  const normalized = raw.replace(/\\/g, '/').replace(/^\/+/, '');
  const inPublicFromPath = path.join(__dirname, '..', 'public', normalized);
  if (fs.existsSync(inPublicFromPath)) return inPublicFromPath;
  const fileName = path.basename(normalized);
  const inCurriculosByName = path.join(__dirname, '..', 'public', 'curriculos', fileName);
  if (fs.existsSync(inCurriculosByName)) return inCurriculosByName;
  return null;
}

async function enviarEmailCandidatura({ idVaga, vaga, nome, celular, email, linkedin, apresentacao, linkAdicional, curriculoFile }) {
  const assunto = `Nova candidatura - Vaga ${idVaga}${vaga?.FUNCAO ? ` - ${vaga.FUNCAO}` : ''}`;
  const text = [
    'Nova candidatura recebida no Portal Vagas RH',
    `ID da vaga: ${idVaga}`,
    `Funcao: ${vaga?.FUNCAO || '-'}`,
    `Tipo da vaga: ${vaga?.TIPO_VAGA || '-'}`,
    `Nome: ${nome}`,
    `Celular: ${celular}`,
    `E-mail: ${email}`,
    `LinkedIn: ${linkedin || '-'}`,
    `Link adicional: ${linkAdicional || '-'}`,
    '',
    'Apresentacao:',
    apresentacao,
    '',
    curriculoFile ? 'Curriculo anexado.' : 'Sem curriculo anexado.',
  ].join('\n');
  const corpoHtml = [
    '<html><body>',
    '<p><strong>Nova candidatura recebida no Portal Vagas RH</strong></p>',
    '<ul>',
    `<li><strong>ID da vaga:</strong> ${idVaga}</li>`,
    `<li><strong>Funcao:</strong> ${vaga?.FUNCAO || '-'}</li>`,
    `<li><strong>Tipo da vaga:</strong> ${vaga?.TIPO_VAGA || '-'}</li>`,
    `<li><strong>Nome:</strong> ${nome}</li>`,
    `<li><strong>Celular:</strong> ${celular}</li>`,
    `<li><strong>E-mail:</strong> ${email}</li>`,
    `<li><strong>LinkedIn:</strong> ${linkedin || '-'}</li>`,
    `<li><strong>Link adicional:</strong> ${linkAdicional || '-'}</li>`,
    '</ul>',
    '<p><strong>Apresentacao:</strong></p>',
    `<p>${String(apresentacao || '').replace(/\n/g, '<br>')}</p>`,
    `<p><strong>${curriculoFile ? 'Curriculo anexado.' : 'Sem curriculo anexado.'}</strong></p>`,
    '</body></html>',
  ].join('');
  const attachmentB64 = curriculoFile ? fs.readFileSync(curriculoFile.path).toString('base64') : null;

  await notificacaoModel.enqueue({
    tipo: 'EMAIL',
    destinatario: CANDIDATURA_NOTIFY_EMAIL,
    mensagem: text,
    metadados: JSON.stringify({
      assunto, corpo: corpoHtml,
      sistema: 'portal-vagas-rh',
      fluxo: 'candidatura',
      destinatario: CANDIDATURA_NOTIFY_EMAIL,
      attachment_path: curriculoFile?.path || null,
      attachment_name: curriculoFile?.originalname || null,
      attachment_b64: attachmentB64,
      attachment_mimetype: curriculoFile?.mimetype || null,
    }),
  });
}

async function salvarCandidatura(req, res) {
  uploadMiddleware(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Erro no upload.' });
    }

    const { id_vaga, nome, celular, email, linkedin, apresentacao, link_adicional } = req.body;

    if (!id_vaga || !nome || !celular || !email || !apresentacao) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Campos obrigatorios: Nome, Celular, Email e Apresentacao.' });
    }

    if (!email.includes('@') || !email.includes('.')) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'E-mail invalido.' });
    }

    const curriculoPath = req.file ? '/curriculos/' + req.file.filename : null;
    const idVagaNum = parseInt(id_vaga);

    try {
      await Candidatura.create({
        ID_VAGA: idVagaNum,
        NOME: nome,
        CELULAR: celular,
        EMAIL: email,
        LINKEDIN: linkedin || null,
        APRESENTACAO: apresentacao,
        LINK_ADICIONAL: link_adicional || null,
        CURRICULO_PATH: curriculoPath,
      });

      const count = await Candidatura.count({ where: { ID_VAGA: idVagaNum } });
      await Vaga.update({ CANDIDATOS: count }, { where: { ID: idVagaNum } });

      const vagaRow = await Vaga.findOne({
        where: { ID: idVagaNum },
        attributes: ['ID', 'FUNCAO', 'TIPO_VAGA'],
      });

      try {
        await enviarEmailCandidatura({
          idVaga: idVagaNum,
          vaga: vagaRow ? vagaRow.toJSON() : null,
          nome, celular, email, linkedin,
          apresentacao,
          linkAdicional: link_adicional,
          curriculoFile: req.file || null,
        });
      } catch (mailErr) {
        console.error('Erro ao enviar e-mail da candidatura:', mailErr);
      }

      if (req.session) {
        if (!Array.isArray(req.session.candidaturasFeitas)) req.session.candidaturasFeitas = [];
        if (!req.session.candidaturasFeitas.includes(idVagaNum)) {
          req.session.candidaturasFeitas.push(idVagaNum);
        }
      }

      res.json({ success: true });
    } catch (dbErr) {
      console.error('Erro ao salvar candidatura:', dbErr);
      if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
      res.status(500).json({ error: 'Erro interno ao salvar candidatura.' });
    }
  });
}

async function renderCandidaturasAdmin(req, res) {
  try {
    const rows = await Candidatura.findAll({
      include: [{ model: Vaga, as: 'vaga', foreignKey: 'ID_VAGA', attributes: ['FUNCAO'], required: false }],
      order: [['ID', 'DESC']],
    });
    const candidaturas = rows.map(c => {
      const { vaga, DTINCLUSAO, ...rest } = c.toJSON();
      return { ...rest, DTINCLUSAO: formatDateTime(DTINCLUSAO), NOME_VAGA: vaga?.FUNCAO || '-' };
    });

    res.render('Vagas/candidaturas', {
      candidaturas,
      username: req.session.username,
      isProtheus: req.session.isProtheus,
      isAdmin: req.session.isAdmin === true,
      protheusId: req.session.protheusId || null,
      currentPath: '/candidaturas',
    });
  } catch (err) {
    console.error('Erro ao carregar candidaturas:', err);
    res.status(500).send('Erro ao carregar candidaturas.');
  }
}

async function listarCandidaturasPorVagaApi(req, res) {
  const idVaga = parseInt(req.params.id, 10);
  if (!Number.isInteger(idVaga) || idVaga <= 0) {
    return res.status(400).json({ error: 'ID da vaga invalido.' });
  }
  try {
    const rows = await Candidatura.findAll({
      where: { ID_VAGA: idVaga },
      include: [{ model: Vaga, as: 'vaga', foreignKey: 'ID_VAGA', attributes: ['FUNCAO'], required: false }],
      order: [['ID', 'DESC']],
    });
    return res.json(rows.map(c => {
      const { vaga, DTINCLUSAO, ...rest } = c.toJSON();
      return { ...rest, DTINCLUSAO: formatDateTime(DTINCLUSAO), NOME_VAGA: vaga?.FUNCAO || '-' };
    }));
  } catch (err) {
    console.error('Erro ao listar candidaturas por vaga:', err);
    return res.status(500).json({ error: 'Erro ao buscar candidatos da vaga.' });
  }
}

async function abrirCurriculoCandidatura(req, res) {
  const candidaturaId = parseInt(req.params.id, 10);
  if (!Number.isInteger(candidaturaId) || candidaturaId <= 0) {
    return res.status(400).send('ID da candidatura invalido.');
  }
  try {
    const candidatura = await Candidatura.findOne({
      where: { ID: candidaturaId },
      attributes: ['CURRICULO_PATH'],
    });

    if (!candidatura) {
      return res.status(404).send('Candidatura nao encontrada.');
    }

    const absoluteFilePath = resolveCurriculoPath(candidatura.CURRICULO_PATH);
    if (!absoluteFilePath) {
      return res.status(404).send('Curriculo nao encontrado no servidor.');
    }

    const fileName = path.basename(absoluteFilePath);
    const ext = path.extname(fileName).toLowerCase();
    const inlineExtensions = new Set(['.pdf', '.png', '.jpg', '.jpeg']);
    const forceDownload = String(req.query.download || '') === '1';

    if (forceDownload || !inlineExtensions.has(ext)) {
      return res.download(absoluteFilePath, fileName);
    }
    return res.sendFile(absoluteFilePath);
  } catch (err) {
    console.error('Erro ao abrir curriculo da candidatura:', err);
    return res.status(500).send('Erro ao abrir curriculo.');
  }
}

async function listarCandidaturasPorFuncaoApi(req, res) {
  const funcao = String(req.query.funcao || '').trim();
  if (!funcao) return res.json([]);
  try {
    const rows = await Candidatura.findAll({
      include: [{
        model: Vaga,
        as: 'vaga',
        foreignKey: 'ID_VAGA',
        attributes: ['FUNCAO'],
        required: true,
        where: { FUNCAO: funcao.trim() },
      }],
      order: [['ID', 'DESC']],
    });
    return res.json(rows.map(c => {
      const { vaga, DTINCLUSAO, ...rest } = c.toJSON();
      return { ...rest, DTINCLUSAO: formatDateTime(DTINCLUSAO), NOME_VAGA: vaga?.FUNCAO || '-' };
    }));
  } catch (err) {
    console.error('Erro ao listar candidaturas por funcao:', err);
    return res.status(500).json({ error: 'Erro ao buscar candidatos.' });
  }
}

module.exports = {
  salvarCandidatura,
  renderCandidaturasAdmin,
  listarCandidaturasPorVagaApi,
  listarCandidaturasPorFuncaoApi,
  abrirCurriculoCandidatura,
};
