const sql = require('mssql');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const dbConfig = require('../database/dbConfig');
const notificacaoModel = require('../models/notificacaoModel');

const CANDIDATURA_NOTIFY_EMAIL = process.env.CANDIDATURA_NOTIFY_EMAIL || 'ti02@cini';
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
  const text = [
    `Assunto: Nova candidatura - Vaga ${idVaga}${vaga?.FUNCAO ? ` - ${vaga.FUNCAO}` : ''}`,
    'Nova candidatura recebida no Portal Vagas RH',
    `ID da vaga: ${idVaga}`,
    `Função: ${vaga?.FUNCAO || '-'}`,
    `Tipo da vaga: ${vaga?.TIPO_VAGA || '-'}`,
    `Nome: ${nome}`,
    `Celular: ${celular}`,
    `E-mail: ${email}`,
    `LinkedIn: ${linkedin || '-'}`,
    `Link adicional: ${linkAdicional || '-'}`,
    '---',
    'Apresentação:',
    apresentacao,
    '---',
    curriculoFile ? 'Currículo anexado.' : 'Sem currículo anexado.',
  ].join('\n');

  await notificacaoModel.enqueue({
    tipo: 'EMAIL',
    destinatario: CANDIDATURA_NOTIFY_EMAIL,
    mensagem: text,
    template_name: 'CANDIDATURA_PORTAL_RH',
    template_params: JSON.stringify({
      id_vaga: idVaga,
      funcao: vaga?.FUNCAO || null,
      tipo_vaga: vaga?.TIPO_VAGA || null,
      nome,
      celular,
      email,
      linkedin: linkedin || null,
      apresentacao,
      link_adicional: linkAdicional || null,
      curriculo_nome: curriculoFile?.originalname || null,
      curriculo_path: curriculoFile?.path || null,
      curriculo_public_path: curriculoFile ? '/curriculos/' + curriculoFile.filename : null,
      curriculo_mimetype: curriculoFile?.mimetype || null,
    }),
    metadados: JSON.stringify({
      sistema: 'portal-vagas-rh',
      fluxo: 'candidatura',
      destinatario: CANDIDATURA_NOTIFY_EMAIL,
      anexos: curriculoFile
        ? [{
            filename: curriculoFile.originalname,
            path: curriculoFile.path,
            mimetype: curriculoFile.mimetype,
          }]
        : [],
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

module.exports = { salvarCandidatura };
