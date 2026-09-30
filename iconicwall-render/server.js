// IconicWall render service — n8n chiama POST /render, riceve il PNG/JPEG brandizzato.
const express = require('express');
const multer = require('multer');
const os = require('os');
const fs = require('fs');
const { render } = require('./render');
const { renderLayout } = require('./layouts');
const { RichiestaNonValida, marchioDi, layoutDi, verificaFoto } = require('./verifiche');
const { montaReel, cartellaTemporanea, pulisci } = require('./reel');
const { LOGOS: LOGHI_REEL } = require('./overlay');

const upload = multer({ dest: os.tmpdir() });
const app = express();
app.use(express.json({ limit: '20mb' }));

const KEY = (process.env.RENDER_KEY || '').trim();

app.get('/health', (req, res) => res.send('ok'));

// Due modi di chiamare /render.
//
// Layout storico (cfg.layout assente, IconicWall e Iconic): campo file "photo"
// (la foto reale, inviata da n8n come binario) + campi testo del post. In
// alternativa "config" può essere un JSON string con tutti i campi (image = URL
// http). Risponde con il JPEG, come sempre.
//
// Layout del template Iconic v3 e di IconicDress (cfg.layout presente):
// "config" + i file che il layout chiede. prima_dopo e diagonale: "imageBefore"
// e "imageAfter"; stat: "photo" facoltativa; contract: "photo"; campionario:
// "finiture" (4, 6 o 9); confronto: nessuna foto. Risponde con il PNG 1080×1350.
//
// Brand sconosciuto, layout sconosciuto, foto mancante o non decodificabile
// (un HEIC, per esempio): 400 con il motivo, mai un ripiego.
const campiFoto = upload.fields([
  { name: 'photo', maxCount: 1 },
  { name: 'imageBefore', maxCount: 1 },
  { name: 'imageAfter', maxCount: 1 },
  { name: 'finiture', maxCount: 9 },
]);

app.post('/render', campiFoto, async (req, res) => {
  const caricati = [];
  Object.values(req.files || {}).forEach(l => l.forEach(f => caricati.push(f.path)));
  const primo = (campo) => (req.files && req.files[campo] && req.files[campo][0]) || null;
  try {
    if (KEY && ((req.header('x-render-key') || req.header('x-api-key') || '').trim() !== KEY)) return res.status(401).send('unauthorized');
    let cfg = {};
    if (req.body && req.body.config) {
      try { cfg = JSON.parse(req.body.config); } catch (e) { throw new RichiestaNonValida('config non è un JSON valido: ' + e.message); }
    } else cfg = Object.assign({}, req.body);

    const brand = marchioDi(cfg);
    const layout = layoutDi(cfg, brand);

    if (layout === 'classico') {
      const photo = primo('photo');
      if (photo) cfg.image = photo.path;               // foto caricata da n8n
      if (!cfg.image) return res.status(400).send('manca la foto (campo file "photo") o cfg.image (URL)');
      if (photo) await verificaFoto(photo.path, 'photo');
      const buf = await render(cfg);
      res.set('Content-Type', 'image/jpeg');
      res.set('Content-Disposition', 'inline; filename="post.jpg"');
      return res.send(buf);
    }

    // Ogni layout dice quali foto gli servono (layouts.js); qui si controlla
    // che quelle arrivate siano disegnabili, prima di aprire Chromium.
    const files = {
      before: primo('imageBefore'), after: primo('imageAfter'), photo: primo('photo'),
      finiture: (req.files && req.files.finiture) || [],
    };
    for (const campo of ['before', 'after', 'photo']) {
      if (files[campo]) await verificaFoto(files[campo].path, files[campo].fieldname);
    }
    for (let i = 0; i < files.finiture.length; i++) await verificaFoto(files.finiture[i].path, 'finiture[' + i + ']');
    const png = await renderLayout(cfg, layout, {
      before: files.before && files.before.path, after: files.after && files.after.path,
      photo: files.photo && files.photo.path, finiture: files.finiture.map(f => f.path),
    });
    res.set('Content-Type', 'image/png');
    res.set('Content-Disposition', 'inline; filename="grafica.png"');
    res.send(png);
  } catch (e) {
    const status = e && e.status === 400 ? 400 : 500;
    res.status(status).send('render error: ' + (e && e.message ? e.message : String(e)));
  } finally {
    caricati.forEach(p => fs.unlink(p, () => {}));
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
    if (req.body && req.body.config) {
      try { cfg = JSON.parse(req.body.config); } catch (e) { throw new RichiestaNonValida('config non è un JSON valido: ' + e.message); }
    }
    // Il marchio si controlla prima di montare: un brand sconosciuto è un errore
    // di chi chiama (400), e scoprirlo dopo un minuto di ffmpeg non serve a nessuno.
    const brandReel = String(cfg.brand || 'iconicwall').trim().toLowerCase();
    if (!LOGHI_REEL[brandReel]) {
      throw new RichiestaNonValida('brand sconosciuto: "' + brandReel + '". Ammessi per il reel: ' + Object.keys(LOGHI_REEL).join(', '));
    }
    if (musica) cfg.audio = musica.path;

    cartella = cartellaTemporanea();
    const mp4 = await montaReel(clips.map(f => f.path), cfg, cartella);
    const buf = fs.readFileSync(mp4);
    res.set('Content-Type', 'video/mp4');
    res.set('Content-Disposition', 'attachment; filename="reel.mp4"');
    res.send(buf);
  } catch (e) {
    res.status(e && e.status === 400 ? 400 : 500).send('reel error: ' + (e && e.message ? e.message : String(e)));
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
