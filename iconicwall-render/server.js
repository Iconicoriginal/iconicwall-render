// IconicWall render service — n8n chiama POST /render, riceve il PNG/JPEG brandizzato.
const express = require('express');
const multer = require('multer');
const os = require('os');
const fs = require('fs');
const { render } = require('./render');

const upload = multer({ dest: os.tmpdir() });
const app = express();
app.use(express.json({ limit: '20mb' }));

const KEY = (process.env.RENDER_KEY || '').trim();

app.get('/health', (req, res) => res.send('ok'));

// Campo file "photo" (la foto reale, inviata da n8n come binario) + campi testo del post.
// In alternativa "config" può essere un JSON string con tutti i campi (image = URL http).
app.post('/render', upload.single('photo'), async (req, res) => {
  try {
    if (KEY && ((req.header('x-render-key') || req.header('x-api-key') || '').trim() !== KEY)) return res.status(401).send('unauthorized');
    let cfg = {};
    if (req.body && req.body.config) cfg = JSON.parse(req.body.config);
    else cfg = Object.assign({}, req.body);
    if (req.file) cfg.image = req.file.path;           // foto caricata da n8n
    if (!cfg.image) return res.status(400).send('manca la foto (campo file "photo") o cfg.image (URL)');
    const buf = await render(cfg);
    res.set('Content-Type', 'image/jpeg');
    res.set('Content-Disposition', 'inline; filename="post.jpg"');
    res.send(buf);
  } catch (e) {
    res.status(500).send('render error: ' + (e && e.message ? e.message : String(e)));
  } finally {
    if (req.file) fs.unlink(req.file.path, () => {});
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('IconicWall render service su :' + PORT));
