// IconicWall render service — n8n chiama POST /render, riceve il PNG/JPEG brandizzato.
const express = require('express');
const multer = require('multer');
const os = require('os');
const fs = require('fs');
const { render } = require('./render');
const { montaReel, cartellaTemporanea, pulisci } = require('./reel');

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

// Campo file "clips" = N clip video in ordine di scena (le generazioni Higgsfield).
// Campo file "music" = traccia licenziata, opzionale. Campo testo "config" = JSON (vedi reel.js).
// Risponde con l'MP4 verticale.
//
// La tipografia si compone qui, come PNG con alfa, e si sovrappone alla clip in movimento:
// nel reel il video sotto deve restare vivo, quindi non si può stampare il titolo su un
// fotogramma fermo come si fa per le slide del carosello.
app.post('/reel', upload.fields([
  { name: 'clips', maxCount: 12 },
  { name: 'frames', maxCount: 12 },   // vecchio nome, tenuto per non rompere chiamate esistenti
  { name: 'music', maxCount: 1 },
]), async (req, res) => {
  const temporanei = [];
  let cartella = null;
  try {
    if (KEY && ((req.header('x-render-key') || req.header('x-api-key') || '').trim() !== KEY)) return res.status(401).send('unauthorized');

    const clips = (req.files && (req.files.clips || req.files.frames)) || [];
    clips.forEach(f => temporanei.push(f.path));
    const musica = (req.files && req.files.music && req.files.music[0]) || null;
    if (musica) temporanei.push(musica.path);
    if (!clips.length) return res.status(400).send('mancano le clip video (campo file "clips")');

    let cfg = {};
    if (req.body && req.body.config) cfg = JSON.parse(req.body.config);
    if (musica) cfg.audio = musica.path;

    cartella = cartellaTemporanea();
    const mp4 = await montaReel(clips.map(f => f.path), cfg, cartella);
    const buf = fs.readFileSync(mp4);
    res.set('Content-Type', 'video/mp4');
    res.set('Content-Disposition', 'attachment; filename="reel.mp4"');
    res.send(buf);
  } catch (e) {
    res.status(500).send('reel error: ' + (e && e.message ? e.message : String(e)));
  } finally {
    if (cartella) pulisci(cartella);
    temporanei.forEach(p => fs.unlink(p, () => {}));
  }
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log('IconicWall render service su :' + PORT));
// Un reel da sei scene sta fra 60 e 150 secondi di ffmpeg: il timeout di default
// chiuderebbe la connessione a metà montaggio.
server.setTimeout(300000);
server.headersTimeout = 310000;
server.requestTimeout = 310000;
