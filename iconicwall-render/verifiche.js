// verifiche.js — controlli sulla richiesta che valgono per tutti i layout.
//
// Regola: una richiesta sbagliata si ferma con un 400 che dice cosa manca.
// Non si ripiega mai in silenzio: un marchio sconosciuto ha prodotto per tre
// settimane card Iconic col logo IconicWall, e un HEIC produceva una card nera
// con HTTP 200.

const sharp = require('sharp');

// Errore del chiamante: il server lo trasforma in un 400, non in un 500.
class RichiestaNonValida extends Error {
  constructor(messaggio) {
    super(messaggio);
    this.name = 'RichiestaNonValida';
    this.status = 400;
  }
}

// Marchi riconosciuti e layout ammessi per ciascuno. "classico" è il layout
// storico di render.js (una foto, titolo sulla foto): vale quando cfg.layout manca.
const MARCHI = {
  iconicwall: ['classico'],
  iconic: ['classico', 'prima_dopo', 'stat', 'campionario', 'contract', 'confronto'],
  // IconicDress: i cinque layout del post singolo e i cinque branding dei
  // caroselli (template grafica v1, 06/10/2026).
  iconicdress: [
    'diagonale', 'cursore', 'orizzonte', 'lente', 'finiture',
    'car_catalogo', 'car_notte', 'car_scheda', 'car_app', 'car_panorama',
  ],
};

function marchioDi(cfg) {
  const brand = String((cfg && cfg.brand) || 'iconicwall').trim().toLowerCase();
  if (!MARCHI[brand]) {
    throw new RichiestaNonValida('brand sconosciuto: "' + brand + '". Ammessi: ' + Object.keys(MARCHI).join(', '));
  }
  return brand;
}

function layoutDi(cfg, brand) {
  const grezzo = cfg && cfg.layout != null && String(cfg.layout).trim() !== '' ? String(cfg.layout).trim().toLowerCase() : null;
  const ammessi = MARCHI[brand];
  if (grezzo === null) {
    if (ammessi.indexOf('classico') === -1) {
      throw new RichiestaNonValida('il marchio "' + brand + '" richiede il campo layout. Ammessi: ' + ammessi.join(', '));
    }
    return 'classico';
  }
  if (ammessi.indexOf(grezzo) > -1) return grezzo;
  throw new RichiestaNonValida('layout sconosciuto per "' + brand + '": "' + grezzo + '". Ammessi: ' + ammessi.join(', '));
}

// Formati che Chromium disegna davvero. HEIC resta fuori: sharp lo legge come
// "heif" ma il browser no, ed è proprio il caso della card nera.
const FORMATI_FOTO = ['jpeg', 'png', 'webp'];

async function verificaFoto(percorso, campo) {
  let meta;
  try {
    meta = await sharp(percorso).metadata();
  } catch (e) {
    throw new RichiestaNonValida('foto "' + campo + '" non decodificabile. Serve un JPEG, PNG o WebP.');
  }
  if (FORMATI_FOTO.indexOf(meta.format) === -1) {
    const nome = meta.format === 'heif' ? 'HEIC/HEIF' : String(meta.format || 'sconosciuto').toUpperCase();
    throw new RichiestaNonValida('foto "' + campo + '" in formato ' + nome + ': il render non la sa disegnare. Serve un JPEG, PNG o WebP.');
  }
  if (!meta.width || !meta.height) {
    throw new RichiestaNonValida('foto "' + campo + '" senza dimensioni leggibili.');
  }
  return meta;
}

module.exports = { RichiestaNonValida, MARCHI, marchioDi, layoutDi, verificaFoto };
