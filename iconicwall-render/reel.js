// reel.js — montatore reel per il render service IconicWall.
//
// COSA MONTA: clip video vere (generate da Higgsfield: carrelli, orbite,
// rivelazioni con keyframe iniziale e finale), non fotografie animate.
// Un reel fatto di immagini ferme con lo zoom addosso è un montaggio
// tradizionale, ed è esattamente ciò che non vogliamo produrre.
//
// COSA FA QUI IL SERVIZIO:
//   1. normalizza ogni clip a 9:16 con la stessa gradazione colore, così
//      sei generazioni diverse sembrano lo stesso film e non sei spezzoni;
//   2. ci sovrappone la tipografia di brand (overlay.js) con dissolvenza
//      propria, che entra e esce mentre l'immagine continua a muoversi;
//   3. unisce le scene con figure di transizione diverse scelte per scena,
//      perché due reel non devono mai avere lo stesso ritmo;
//   4. chiude sulla card di brand e stende sotto la musica licenziata.
//
// La musica NON si sintetizza mai: arriva come file dal ramo n8n.
//
// Dipendenze di sistema: ffmpeg e ffprobe (vedi Dockerfile).

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { componiTipografia } = require('./overlay');

// Figure di stacco ammesse. Sono quelle di xfade che reggono su materiale
// architettonico: niente effetti da presentazione aziendale.
const STACCHI = {
  'taglio': null, // stacco netto, nessuna sovrapposizione
  'dissolvenza': 'fade',
  'nero': 'fadeblack',
  'bianco': 'fadewhite',
  'fusione': 'dissolve',
  'tendina-sx': 'wipeleft',
  'tendina-dx': 'wiperight',
  'tendina-su': 'wipeup',
  'tendina-giu': 'wipedown',
  'scorri-sx': 'slideleft',
  'scorri-dx': 'slideright',
  'scorri-su': 'slideup',
  'scorri-giu': 'slidedown',
  'morbido-sx': 'smoothleft',
  'morbido-dx': 'smoothright',
  'apertura': 'circleopen',
  'chiusura': 'circleclose',
  'radiale': 'radial',
  'sfocatura': 'hblur',
  'diagonale': 'diagtl',
};

const GRADING = 'eq=contrast=1.06:saturation=1.06:gamma=0.98,vignette';

function eseguiFfmpeg(args, etichetta) {
  return new Promise((risolvi, rifiuta) => {
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d.toString(); if (err.length > 12000) err = err.slice(-12000); });
    p.on('error', (e) => rifiuta(new Error(`ffmpeg non avviabile (${etichetta}): ${e.message}`)));
    p.on('close', (code) => {
      if (code === 0) return risolvi();
      rifiuta(new Error(`ffmpeg fallito su ${etichetta} (codice ${code}):\n${err.slice(-2500)}`));
    });
  });
}

function durataSorgente(percorso) {
  return new Promise((risolvi) => {
    const p = spawn('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', percorso,
    ], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    p.stdout.on('data', d => { out += d.toString(); });
    p.on('error', () => risolvi(null));
    p.on('close', () => {
      const v = parseFloat(String(out).trim());
      risolvi(isFinite(v) && v > 0 ? v : null);
    });
  });
}

// Una scena = una clip normalizzata, gradata, tagliata e titolata.
// Il titolo è un PNG con alfa che entra e esce da solo: l'immagine sotto
// non si ferma mai.
async function costruisciScena(clip, titoloPng, opzioni, uscita) {
  const { durata, fps, larghezza, altezza, velocita, entrataTitolo, uscitaTitolo, grading } = opzioni;

  const catenaBase = [
    `scale=${larghezza}:${altezza}:force_original_aspect_ratio=increase`,
    `crop=${larghezza}:${altezza}`,
    velocita && velocita !== 1 ? `setpts=PTS/${velocita}` : null,
    `fps=${fps}`,
    grading === false ? null : GRADING,
    `trim=0:${durata.toFixed(3)}`,
    `setpts=PTS-STARTPTS`,
  ].filter(Boolean).join(',');

  const args = ['-y', '-i', clip];

  if (titoloPng) {
    const inizio = Math.max(0, Number(entrataTitolo) || 0.5);
    const fine = Math.min(durata, Number(uscitaTitolo) || Math.max(inizio + 1.2, durata - 0.4));
    const dInizio = Math.min(0.7, Math.max(0.25, (fine - inizio) / 4));
    const dFine = dInizio;
    args.push('-loop', '1', '-i', titoloPng);
    const filtro =
      `[0:v]${catenaBase}[base];` +
      `[1:v]format=rgba,fps=${fps},` +
      `fade=t=in:st=${inizio.toFixed(3)}:d=${dInizio.toFixed(3)}:alpha=1,` +
      `fade=t=out:st=${Math.max(0, fine - dFine).toFixed(3)}:d=${dFine.toFixed(3)}:alpha=1,` +
      `trim=0:${durata.toFixed(3)},setpts=PTS-STARTPTS[ov];` +
      `[base][ov]overlay=0:0:format=auto:shortest=1,format=yuv420p[v]`;
    args.push('-filter_complex', filtro, '-map', '[v]');
  } else {
    args.push('-vf', catenaBase + ',format=yuv420p', '-map', '0:v');
  }

  args.push(
    '-an', '-t', durata.toFixed(3), '-r', String(fps),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
    uscita
  );
  await eseguiFfmpeg(args, `scena ${path.basename(uscita)}`);
  return uscita;
}

// La card finale è l'unico fotogramma fermo ammesso: chiude il racconto.
// Ha una spinta lentissima (1.00 -> 1.04) perché un fermo immagine secco
// dopo sei scene in movimento si legge come un errore di riproduzione.
async function costruisciCard(png, opzioni, uscita) {
  const { durata, fps, larghezza, altezza } = opzioni;
  const n = Math.max(1, Math.round(durata * fps));
  const filtro = [
    `scale=${larghezza * 2}:${altezza * 2}`,
    `zoompan=z='1+0.04*on/${n}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=${n}:s=${larghezza}x${altezza}:fps=${fps}`,
    `format=yuv420p`,
  ].join(',');
  await eseguiFfmpeg([
    '-y', '-loop', '1', '-i', png, '-vf', filtro,
    '-t', durata.toFixed(3), '-r', String(fps),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
    uscita,
  ], 'card finale');
  return uscita;
}

// Catena xfade con offset progressivi. Ogni stacco "consuma" la propria durata,
// quindi l'offset della scena i tiene conto di tutte le sovrapposizioni già fatte.
function catenaStacchi(durate, stacchi) {
  if (durate.length === 1) return { filtro: null, etichetta: '0:v', totale: durate[0] };
  const passi = [];
  let corrente = '[0:v]';
  let cumulata = durate[0];
  for (let i = 1; i < durate.length; i++) {
    const s = stacchi[i - 1] || { tipo: 'fade', durata: 0.5 };
    const d = Math.max(0.05, Number(s.durata) || 0.5);
    const offset = Math.max(0, cumulata - d);
    const etichetta = (i === durate.length - 1) ? '[vout]' : `[v${i}]`;
    passi.push(`${corrente}[${i}:v]xfade=transition=${s.tipo}:duration=${d.toFixed(3)}:offset=${offset.toFixed(3)}${etichetta}`);
    corrente = etichetta;
    cumulata = offset + durate[i];
  }
  return { filtro: passi.join(';'), etichetta: 'vout', totale: cumulata };
}

/**
 * Monta il reel.
 *
 * @param {string[]} clipVideo  percorsi delle clip, in ordine di scena
 * @param {object}   config
 *   scene[]      { durata, velocita, titolo, occhiello, accento, sotto, posizione,
 *                  entrataTitolo, uscitaTitolo, stacco, durataStacco }
 *   card         { titolo, accento, sotto, sito, durata }  card di chiusura
 *   fps          default 30
 *   larghezza    default 1080
 *   altezza      default 1920
 *   grading      false per disattivare la gradazione comune
 *   brand        'iconicwall' | 'iconic'
 *   audio        percorso della traccia licenziata
 *   volumeAudio  default 0.85
 * @param {string}   cartellaLavoro
 * @returns {Promise<string>} percorso dell'MP4
 */
async function montaReel(clipVideo, config, cartellaLavoro) {
  if (!Array.isArray(clipVideo) || clipVideo.length === 0) {
    throw new Error('Nessuna clip ricevuta: il reel ha bisogno di almeno una scena in movimento');
  }
  if (clipVideo.length > 12) {
    throw new Error(`Troppe scene (${clipVideo.length}): il limite è 12`);
  }

  const cfg = config || {};
  const fps = Number(cfg.fps) || 30;
  const larghezza = Number(cfg.larghezza) || 1080;
  const altezza = Number(cfg.altezza) || 1920;
  const volumeAudio = cfg.volumeAudio === undefined ? 0.85 : Number(cfg.volumeAudio);
  const scene = clipVideo.map((_, i) => (Array.isArray(cfg.scene) && cfg.scene[i]) ? cfg.scene[i] : {});

  // Durata di ogni scena: quella chiesta, ma mai più lunga della clip
  // disponibile (tenuto conto della velocità), altrimenti ffmpeg produce
  // un fermo immagine sull'ultimo fotogramma — l'esatto contrario del punto.
  const durate = [];
  const velocita = [];
  for (let i = 0; i < clipVideo.length; i++) {
    const v = Number(scene[i].velocita) > 0 ? Number(scene[i].velocita) : 1;
    const disponibile = await durataSorgente(clipVideo[i]);
    let d = Number(scene[i].durata) > 0 ? Number(scene[i].durata) : 4;
    if (disponibile) d = Math.min(d, (disponibile / v) - (1 / fps));
    if (!(d > 0.4)) d = Math.max(0.4, disponibile ? disponibile / v : 4);
    durate.push(d);
    velocita.push(v);
  }

  // Tipografia: un PNG per scena titolata + la card.
  const tip = await componiTipografia(scene, cfg.card || null, {
    larghezza, altezza, brand: cfg.brand, logo: cfg.logo, cartella: cartellaLavoro,
  });

  // 1. Scene.
  const segmenti = [];
  for (let i = 0; i < clipVideo.length; i++) {
    const uscita = path.join(cartellaLavoro, `scena_${String(i).padStart(2, '0')}.mp4`);
    await costruisciScena(clipVideo[i], tip.titoli[i], {
      durata: durate[i], fps, larghezza, altezza, velocita: velocita[i],
      entrataTitolo: scene[i].entrataTitolo, uscitaTitolo: scene[i].uscitaTitolo,
      grading: cfg.grading,
    }, uscita);
    segmenti.push(uscita);
  }

  // 2. Card di chiusura.
  const durateSeg = durate.slice();
  const stacchi = [];
  for (let i = 0; i < clipVideo.length - 1; i++) {
    const nome = String(scene[i].stacco || 'dissolvenza');
    const tipo = Object.prototype.hasOwnProperty.call(STACCHI, nome) ? STACCHI[nome] : 'fade';
    stacchi.push({ tipo: tipo || 'fade', durata: tipo === null ? 0.06 : (Number(scene[i].durataStacco) || 0.5) });
  }
  if (tip.card) {
    const dc = Number((cfg.card && cfg.card.durata) || 2.6);
    const uscita = path.join(cartellaLavoro, 'scena_card.mp4');
    await costruisciCard(tip.card, { durata: dc, fps, larghezza, altezza }, uscita);
    segmenti.push(uscita);
    durateSeg.push(dc);
    stacchi.push({ tipo: 'fade', durata: Number(cfg.staccoCard) || 0.6 });
  }

  // Uno stacco non può mangiarsi la scena che lo precede o quella che segue.
  for (let i = 0; i < stacchi.length; i++) {
    const limite = Math.min(durateSeg[i], durateSeg[i + 1]) / 2.5;
    if (stacchi[i].durata > limite) stacchi[i].durata = Math.max(0.05, limite);
  }

  // 3. Montaggio.
  const percorsoFinale = path.join(cartellaLavoro, 'reel.mp4');
  const haAudio = !!(cfg.audio && fs.existsSync(cfg.audio));
  const args = ['-y'];
  segmenti.forEach(s => { args.push('-i', s); });
  if (haAudio) args.push('-i', cfg.audio);

  const { filtro, etichetta, totale } = catenaStacchi(durateSeg, stacchi);
  let filtroCompleto = filtro;
  if (haAudio) {
    const codaAudio = Math.max(0.6, Math.min(1.6, totale / 8));
    const pezzo = `[${segmenti.length}:a]volume=${volumeAudio},` +
      `afade=t=in:st=0:d=0.8,` +
      `afade=t=out:st=${Math.max(0, totale - codaAudio).toFixed(3)}:d=${codaAudio.toFixed(3)},` +
      `atrim=0:${totale.toFixed(3)},asetpts=PTS-STARTPTS[aout]`;
    filtroCompleto = filtroCompleto ? `${filtroCompleto};${pezzo}` : pezzo;
  }

  if (filtroCompleto) args.push('-filter_complex', filtroCompleto);
  args.push('-map', filtro ? `[${etichetta}]` : '0:v');
  if (haAudio) args.push('-map', '[aout]');

  args.push(
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-r', String(fps), '-movflags', '+faststart'
  );
  if (haAudio) args.push('-c:a', 'aac', '-b:a', '192k');
  args.push('-t', totale.toFixed(3), percorsoFinale);

  await eseguiFfmpeg(args, 'montaggio finale');
  if (!fs.existsSync(percorsoFinale)) throw new Error('Il montaggio è terminato senza produrre il file');
  return percorsoFinale;
}

function cartellaTemporanea() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'iwreel-'));
}

function pulisci(cartella) {
  try { fs.rmSync(cartella, { recursive: true, force: true }); } catch (e) { /* si ignora */ }
}

module.exports = { montaReel, cartellaTemporanea, pulisci, STACCHI };
