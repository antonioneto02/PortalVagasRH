const sql = require('mssql');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const dbConfig = require('../database/dbConfig');

// Configuração do multer para salvar currículos
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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

const uploadMiddleware = upload.single('curriculo');

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

    // Validação básica de e-mail
    if (!email.includes('@') || !email.includes('.')) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'E-mail inválido.' });
    }

    const curriculoPath = req.file ? '/curriculos/' + req.file.filename : null;

    let pool = null;
    try {
      pool = await new sql.ConnectionPool(dbConfig).connect();

      // Inserir candidatura
      await pool.request()
        .input('ID_VAGA', sql.Int, parseInt(id_vaga))
        .input('NOME', sql.VarChar(200), nome)
        .input('CELULAR', sql.VarChar(20), celular)
        .input('EMAIL', sql.VarChar(200), email)
        .input('LINKEDIN', sql.VarChar(300), linkedin || null)
        .input('APRESENTACAO', sql.VarChar(sql.MAX), apresentacao)
        .input('LINK_ADICIONAL', sql.VarChar(300), link_adicional || null)
        .input('CURRICULO_PATH', sql.VarChar(500), curriculoPath)
        .query(`INSERT INTO RH_CANDIDATURAS (ID_VAGA, NOME, CELULAR, EMAIL, LINKEDIN, APRESENTACAO, LINK_ADICIONAL, CURRICULO_PATH, DTINCLUSAO)
                VALUES (@ID_VAGA, @NOME, @CELULAR, @EMAIL, @LINKEDIN, @APRESENTACAO, @LINK_ADICIONAL, @CURRICULO_PATH, GETDATE())`);

      // Atualizar campo CANDIDATOS na vaga
      await pool.request()
        .input('ID_VAGA', sql.Int, parseInt(id_vaga))
        .query(`UPDATE RH_VAGAS SET CANDIDATOS = (
          SELECT COUNT(*) FROM RH_CANDIDATURAS WHERE ID_VAGA = @ID_VAGA
        ) WHERE ID = @ID_VAGA`);

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
