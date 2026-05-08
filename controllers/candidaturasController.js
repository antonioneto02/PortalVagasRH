const sql = require('mssql');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const dbConfig = require('../database/dbConfig');
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
  else cb(new Error('Tipo de arquivo não permitido. Use PDF, DOC, DOCX ou imagem.'));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, 
});

const uploadMiddleware = upload.single('curriculo');

async function enviarEmailCandidatura({
  idVaga,
  vaga,
  nome,
  celular,
  email,
  linkedin,
  apresentacao,
  linkAdicional,
  curriculoFile,
}) {
  const assunto = `Nova candidatura - Vaga ${idVaga}${vaga?.FUNCAO ? ` - ${vaga.FUNCAO}` : ''}`;
  const text = [
    'Nova candidatura recebida no Portal Vagas RH',
    `ID da vaga: ${idVaga}`,
    `Função: ${vaga?.FUNCAO || '-'}`,
    `Tipo da vaga: ${vaga?.TIPO_VAGA || '-'}`,
    `Nome: ${nome}`,
    `Celular: ${celular}`,
    `E-mail: ${email}`,
    `LinkedIn: ${linkedin || '-'}`,
    `Link adicional: ${linkAdicional || '-'}`,
    '',
    'Apresentação:',
    apresentacao,
    '',
    curriculoFile ? 'Currículo anexado.' : 'Sem currículo anexado.',
  ].join('\n');
  const corpoHtml = [
    '<html><body>',
    '<p><strong>Nova candidatura recebida no Portal Vagas RH</strong></p>',
    '<ul>',
    `<li><strong>ID da vaga:</strong> ${idVaga}</li>`,
    `<li><strong>Função:</strong> ${vaga?.FUNCAO || '-'}</li>`,
    `<li><strong>Tipo da vaga:</strong> ${vaga?.TIPO_VAGA || '-'}</li>`,
    `<li><strong>Nome:</strong> ${nome}</li>`,
    `<li><strong>Celular:</strong> ${celular}</li>`,
    `<li><strong>E-mail:</strong> ${email}</li>`,
    `<li><strong>LinkedIn:</strong> ${linkedin || '-'}</li>`,
    `<li><strong>Link adicional:</strong> ${linkAdicional || '-'}</li>`,
    '</ul>',
    '<p><strong>Apresentação:</strong></p>',
    `<p>${String(apresentacao || '').replace(/\n/g, '<br>')}</p>`,
    `<p><strong>${curriculoFile ? 'Currículo anexado.' : 'Sem currículo anexado.'}</strong></p>`,
    '</body></html>',
  ].join('');
  const attachmentB64 = curriculoFile ? fs.readFileSync(curriculoFile.path).toString('base64') : null;

  await notificacaoModel.enqueue({
    tipo: 'EMAIL',
    destinatario: CANDIDATURA_NOTIFY_EMAIL,
    mensagem: text,
    metadados: JSON.stringify({
      assunto,
      corpo: corpoHtml,
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
      return res.status(400).json({ error: 'Campos obrigatórios: Nome, Celular, Email e Apresentação.' });
    }

    if (!email.includes('@') || !email.includes('.')) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'E-mail inválido.' });
    }

    const curriculoPath = req.file ? '/curriculos/' + req.file.filename : null;

    let pool = null;
    try {
      pool = await new sql.ConnectionPool(dbConfig).connect();
      const idVagaNum = parseInt(id_vaga);
      await pool.request()
        .input('ID_VAGA', sql.Int, idVagaNum)
        .input('NOME', sql.VarChar(200), nome)
        .input('CELULAR', sql.VarChar(20), celular)
        .input('EMAIL', sql.VarChar(200), email)
        .input('LINKEDIN', sql.VarChar(300), linkedin || null)
        .input('APRESENTACAO', sql.VarChar(sql.MAX), apresentacao)
        .input('LINK_ADICIONAL', sql.VarChar(300), link_adicional || null)
        .input('CURRICULO_PATH', sql.VarChar(500), curriculoPath)
        .query(`INSERT INTO RH_CANDIDATURAS (ID_VAGA, NOME, CELULAR, EMAIL, LINKEDIN, APRESENTACAO, LINK_ADICIONAL, CURRICULO_PATH, DTINCLUSAO)
                VALUES (@ID_VAGA, @NOME, @CELULAR, @EMAIL, @LINKEDIN, @APRESENTACAO, @LINK_ADICIONAL, @CURRICULO_PATH, GETDATE())`);

      await pool.request()
        .input('ID_VAGA', sql.Int, idVagaNum)
        .query(`UPDATE RH_VAGAS SET CANDIDATOS = (
          SELECT COUNT(*) FROM RH_CANDIDATURAS WHERE ID_VAGA = @ID_VAGA
        ) WHERE ID = @ID_VAGA`);

      const vagaResult = await pool.request()
        .input('ID_VAGA', sql.Int, idVagaNum)
        .query(`SELECT TOP 1 ID, FUNCAO, TIPO_VAGA FROM RH_VAGAS WHERE ID = @ID_VAGA`);

      try {
        await enviarEmailCandidatura({
          idVaga: idVagaNum,
          vaga: vagaResult.recordset?.[0] || null,
          nome,
          celular,
          email,
          linkedin,
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
    } catch (err) {
      console.error('Erro ao salvar candidatura:', err);
      if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
      res.status(500).json({ error: 'Erro interno ao salvar candidatura.' });
    } finally {
      if (pool) try { await pool.close(); } catch {}
    }
  });
}

async function renderCandidaturasAdmin(req, res) {
  let pool = null;
  try {
    pool = await new sql.ConnectionPool(dbConfig).connect();
    const result = await pool.request().query(`
      SELECT
        c.ID,
        c.ID_VAGA,
        c.NOME,
        c.CELULAR,
        c.EMAIL,
        c.LINKEDIN,
        c.APRESENTACAO,
        c.LINK_ADICIONAL,
        c.CURRICULO_PATH,
        CONVERT(VARCHAR, c.DTINCLUSAO, 103) + ' ' + CONVERT(VARCHAR(5), c.DTINCLUSAO, 108) AS DTINCLUSAO,
        ISNULL(v.FUNCAO, '-') AS NOME_VAGA
      FROM RH_CANDIDATURAS c
      LEFT JOIN RH_VAGAS v ON v.ID = c.ID_VAGA
      ORDER BY c.ID DESC
    `);

    res.render('Vagas/candidaturas', {
      candidaturas: result.recordset,
      username: req.session.username,
      isProtheus: req.session.isProtheus,
      isAdmin: req.session.isAdmin === true,
      protheusId: req.session.protheusId || null,
      currentPath: '/candidaturas',
    });
  } catch (err) {
    console.error('Erro ao carregar candidaturas:', err);
    res.status(500).send('Erro ao carregar candidaturas.');
  } finally {
    if (pool) try { await pool.close(); } catch {}
  }
}

async function listarCandidaturasPorVagaApi(req, res) {
  const idVaga = parseInt(req.params.id, 10);
  if (!Number.isInteger(idVaga) || idVaga <= 0) {
    return res.status(400).json({ error: 'ID da vaga inválido.' });
  }

  let pool = null;
  try {
    pool = await new sql.ConnectionPool(dbConfig).connect();
    const result = await pool.request()
      .input('ID_VAGA', sql.Int, idVaga)
      .query(`
        SELECT
          c.ID,
          c.ID_VAGA,
          c.NOME,
          c.CELULAR,
          c.EMAIL,
          c.LINKEDIN,
          c.APRESENTACAO,
          c.LINK_ADICIONAL,
          c.CURRICULO_PATH,
          CONVERT(VARCHAR, c.DTINCLUSAO, 103) + ' ' + CONVERT(VARCHAR(5), c.DTINCLUSAO, 108) AS DTINCLUSAO,
          ISNULL(v.FUNCAO, '-') AS NOME_VAGA
        FROM RH_CANDIDATURAS c
        LEFT JOIN RH_VAGAS v ON v.ID = c.ID_VAGA
        WHERE c.ID_VAGA = @ID_VAGA
        ORDER BY c.ID DESC
      `);

    return res.json(result.recordset || []);
  } catch (err) {
    console.error('Erro ao listar candidaturas por vaga:', err);
    return res.status(500).json({ error: 'Erro ao buscar candidatos da vaga.' });
  } finally {
    if (pool) try { await pool.close(); } catch {}
  }
}

module.exports = { salvarCandidatura, renderCandidaturasAdmin, listarCandidaturasPorVagaApi };
