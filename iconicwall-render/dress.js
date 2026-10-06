// dress.js — i layout IconicDress aggiunti il 06/10/2026.
//
// Specifica: «IconicDress — Template grafica v1» e «Brief per Claude Code —
// layout e caroselli IconicDress nel render service (06/10/2026)», Notion,
// sotto Vera. Qui stanno i quattro layout del post singolo che mancavano
// (cursore, orizzonte, lente, finiture) e i cinque branding dei caroselli.
//
// «diagonale» resta in layouts.js e non si tocca: era gia in produzione e deve
// dare lo stesso PNG di prima, byte per byte.

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const http = require('http');
const sharp = require('sharp');
const { RichiestaNonValida } = require('./verifiche');
const L = require('./layouts');

const { W, H, INK, PAPER, ORO_STRUTTURA, ORO_SCURO, ORO_ACCENTO, ORO, ORO_ACCENTO_SCURO,
  CHIARO, SANS, SITI, LOGO_ICONICDRESS, LOGO_3M, esc, fileUrl, cssBase, htmlTesto,
  SCRIPT_ADATTA, elenco, focus, FILTRO_FOTO, VELO_FOTO } = L;

const SITO = SITI.iconicdress;

// Il logo IconicDress ha due file ufficiali nell'app: il positivo per i fondi
// chiari e il negativo per quelli scuri. Prima qui si schiariva il positivo
// con un invert, e l'oro #A8823C diventava azzurro: il marchio sbagliato.
const LOGO_ICONICDRESS_NEGATIVO = path.join(L.ASSETS, 'iconicdress-negativo.svg');

// Le etichette sulle foto le fissa il template v1. «diagonale» continua a dire
// Prima/Dopo perche era gia online e non si tocca; qui si usano queste.
const ETICHETTA_PRIMA = "Com'è oggi";
const ETICHETTA_DOPO = 'Con IconicDress';
const ETICHETTA_COM_ERA = "Com'era";

// ---------------------------------------------------------------- temporanei
// Ogni layout che crea file di appoggio li elenca in ctx.temporanei: li
// cancella renderLayout alla fine, come fa il server con i file caricati.
function fileTemporaneo(estensione) {
  return path.join(os.tmpdir(), 'dress_' + process.pid + '_' + Math.floor(Math.random() * 1e9) + estensione);
}

// ------------------------------------------------------- foto alla stessa misura
// Il rendering dell'app e la foto di partenza hanno la stessa inquadratura ma
// risoluzioni diverse (2000x1500 contro 1448x1086 nel cantiere di Marcianise).
// Finche le due stanno in due riquadri separati non importa; dal momento che
// una taglia l'altra — cursore, orizzonte, lente — devono stare sulla stessa
// griglia di pixel, se no la superficie si sposta di qualche pixel sul taglio.
async function allineaCoppia(prima, dopo) {
  const [a, b] = await Promise.all([sharp(prima).metadata(), sharp(dopo).metadata()]);
  // Quello che conta non e la risoluzione, e il RAPPORTO. Due foto con lo
  // stesso rapporto, messe nello stesso riquadro con object-fit:cover e lo
  // stesso punto focale, cadono sugli stessi pixel anche se una e il doppio
  // dell'altra: a Marcianise sono 2000x1500 e 1448x1086, e combaciano. Si
  // tocca niente, e non si butta via la definizione che serve al panorama.
  const rapporto = (m) => m.width / m.height;
  if (Math.abs(rapporto(a) - rapporto(b)) / rapporto(a) < 0.005) {
    return { prima, dopo, temporanei: [], larghezza: Math.min(a.width, b.width) };
  }
  // Rapporti diversi: cover ritaglierebbe le due in modo diverso e la
  // superficie salterebbe sul taglio. Si portano al rapporto della foto di
  // partenza, che e l'originale, senza ingrandire nessuna delle due.
  const larghezza = Math.min(a.width, b.width);
  const altezza = Math.round(larghezza * a.height / a.width);
  const temporanei = [];
  const porta = async (src) => {
    const out = fileTemporaneo('.jpg');
    await sharp(src).resize(larghezza, altezza, { fit: 'cover', position: 'centre', kernel: 'lanczos3' })
      .jpeg({ quality: 95 }).toFile(out);
    temporanei.push(out);
    return out;
  };
  return { prima: await porta(prima), dopo: await porta(dopo), temporanei, larghezza };
}

// ------------------------------------------------------------- campioni 3M
// Il campione della finitura si prende dal catalogo dell'app, lo stesso che
// vede il cliente: nessuna tessera ridisegnata a mano.
const BASE_CAMPIONI = (process.env.CAMPIONI_BASE || 'https://' + SITO).replace(/\/+$/, '');
const CODICE_3M = /^[A-Z]{2,3}-[0-9]{2,4}[A-Z0-9]*$/;

function scarica(url, destinazione) {
  const mod = url.startsWith('http://') ? http : https;
  return new Promise((ok, ko) => {
    const req = mod.get(url, { timeout: 15000 }, (r) => {
      if (r.statusCode !== 200) { r.resume(); return ko(new Error('HTTP ' + r.statusCode)); }
      const f = fs.createWriteStream(destinazione);
      r.pipe(f);
      f.on('finish', () => f.close(() => ok(destinazione)));
      f.on('error', ko);
    });
    req.on('timeout', () => { req.destroy(new Error('tempo scaduto')); });
    req.on('error', ko);
  });
}

// cfg.finiture: [{codice, posizione}] oppure "PS-3904MT fronte, PS-3100MT piano".
function leggiFiniture(valore) {
  if (valore == null || valore === '') return [];
  const voci = Array.isArray(valore) ? valore : elenco(valore);
  return voci.map((v, i) => {
    let codice, posizione;
    if (v && typeof v === 'object') { codice = v.codice || v.code; posizione = v.posizione || v.position; }
    else {
      const parti = String(v).trim().split(/\s+/);
      codice = parti.shift(); posizione = parti.join(' ');
    }
    codice = String(codice || '').trim().toUpperCase();
    if (!CODICE_3M.test(codice)) {
      throw new RichiestaNonValida('finiture[' + i + ']: "' + codice + '" non e un codice 3M (es. PS-3904MT).');
    }
    return { codice, posizione: String(posizione || '').trim() };
  });
}

async function prendiCampioni(finiture, temporanei) {
  for (const f of finiture) {
    const url = BASE_CAMPIONI + '/assets/materials/' + f.codice.toLowerCase() + '.webp';
    const dest = fileTemporaneo('.webp');
    try {
      await scarica(url, dest);
      await sharp(dest).metadata();
    } catch (e) {
      fs.unlink(dest, () => {});
      throw new RichiestaNonValida('campione della finitura ' + f.codice + ' non disponibile (' + url + '): ' + e.message);
    }
    temporanei.push(dest);
    f.campione = dest;
  }
  return finiture;
}

// ------------------------------------------------------------ parti comuni
function chip(testo, classe) {
  return `<div class="chip ${classe || ''}">${esc(testo)}</div>`;
}

// Riga dei loghi: IconicDress a sinistra, 3M e sito a destra. Mai il logo Iconic.
function firma(site, scuro) {
  const sito = site != null ? site : SITO;
  const logo = scuro ? LOGO_ICONICDRESS_NEGATIVO : LOGO_ICONICDRESS;
  return `<div class="firma" data-sotto-il-titolo><img class="logo-dress" src="${fileUrl(logo)}">
<div class="dx"><img class="logo-3m" src="${fileUrl(LOGO_3M)}">${sito ? `<div class="site">${esc(sito)}</div>` : ''}</div></div>`;
}

const CSS_FIRMA = `
.firma{position:absolute;left:72px;right:72px;display:flex;align-items:flex-end;justify-content:space-between;}
.logo-dress{height:50px;display:block;}
.dx{display:flex;flex-direction:column;align-items:flex-end;gap:14px;}
.logo-3m{height:25px;display:block;}
.site{font-family:${SANS};font-size:16px;letter-spacing:.14em;color:#5E594F;}`;

// Sul fondo scuro il logo IconicDress e quello negativo (file a parte, vedi
// sopra); il 3M e nero e va schiarito, ma e un marchio di un'altra azienda:
// si schiarisce e basta, senza toccarne i colori propri.
const CSS_FIRMA_SCURA = `
.logo-3m{filter:brightness(0) invert(1);}
.site{color:${CHIARO};opacity:.9;}`;

const CSS_SCURO = `
.canvas{background:${INK};}
h1{color:${PAPER};} h1 .accent{color:${ORO_ACCENTO_SCURO};}
.eyebrow{color:${ORO};} .rule{background:${ORO};}`;

// ==========================================================================
// POST SINGOLO — i quattro layout che mancavano
// ==========================================================================
//
// Struttura comune del template v1: foto nei primi 1020 px, banda Paper in
// basso di 330 px con eyebrow, filetto, titolo e riga dei loghi. «diagonale»
// ha proporzioni sue (918/432) perche e nato prima della specifica ed era gia
// online: li non si tocca niente.
const FOTO_H = 1020, BANDA_H = H - FOTO_H;   // 1020 + 330

function cssPostSingolo(extra) {
  return cssBase(`
.foto-piena{left:0;top:0;width:${W}px;height:${FOTO_H}px;}
.banda{height:${BANDA_H}px;}
.testo{top:38px;}
.firma{bottom:36px;}
${CSS_FIRMA}
${extra || ''}`);
}

// Il titolo non deve mai finire sopra quello che gli sta sotto (i loghi, o le
// tessere delle finiture). Il massimo fissato a mano sbaglia appena si cambia
// un margine: qui lo misura il browser sulla pagina vera. Questa versione di
// «adatta» sostituisce quella di SCRIPT_ADATTA, che viene prima.
const SCRIPT_SPAZIO = `<script>
window.adatta = function (maxAltezza, minimo) {
  var h = document.getElementById('titolo');
  var sotto = document.querySelector('[data-sotto-il-titolo]');
  var box = h.parentElement.getBoundingClientRect().width;
  // L'aria sotto il titolo: 32 px. Con 14 il titolo non si sovrapponeva, ma
  // stava addosso al logo — il riquadro dell'Italiana e stretto sotto la linea
  // di base e quello che si misura non e quello che si vede.
  var limite = sotto ? sotto.getBoundingClientRect().top - 32 : Infinity;
  var size = parseFloat(h.style.fontSize);
  function larga() {
    var m = 0, r = h.querySelectorAll('.riga');
    for (var i = 0; i < r.length; i++) m = Math.max(m, r[i].scrollWidth);
    return m;
  }
  function sborda() {
    var b = h.getBoundingClientRect();
    return larga() > box || b.height > maxAltezza || b.bottom > limite;
  }
  while (size > minimo && sborda()) { size -= 1; h.style.fontSize = size + 'px'; }
  return { size: size, limite: limite, basso: h.getBoundingClientRect().bottom };
};
</script>`;

function paginaPostSingolo(css, corpo, cfg, righe, size) {
  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><style>${css}</style>${SCRIPT_ADATTA}${SCRIPT_SPAZIO}</head><body>
<div class="canvas">${corpo}
<div class="banda"><div class="testo">${htmlTesto(cfg, righe, size)}</div>${firma(cfg.site)}</div>
</div></body></html>`;
}

// Le due foto stanno sulla stessa griglia di pixel e nello stesso riquadro:
// la superficie che cambia resta dov'e quando una taglia l'altra.
function coppiaSovrapposta(ctx, classePrima, classeDopo) {
  const f = ctx.punto;
  return `<div class="foto foto-piena ${classePrima}"><img src="${fileUrl(ctx.prima)}" style="object-position:${f.x}% ${f.y}%"></div>
<div class="foto foto-piena ${classeDopo}"><img src="${fileUrl(ctx.dopo)}" style="object-position:${f.x}% ${f.y}%"></div>`;
}

async function prepCoppiaAllineata(cfg, files, layout) {
  if (!files.before || !files.after) {
    throw new RichiestaNonValida('il layout "' + layout + '" vuole due foto: campi file "imageBefore" e "imageAfter".');
  }
  const a = await allineaCoppia(files.before, files.after);
  return {
    prima: a.prima, dopo: a.dopo, temporanei: a.temporanei,
    // Un punto focale solo: le due foto sono la stessa inquadratura, e due
    // ritagli diversi farebbero saltare la superficie sul taglio.
    punto: focus(cfg.focus, 'focus'),
  };
}

// --- cursore -------------------------------------------------------------
// La linea verticale Paper con la maniglia tonda dello slider dell'app:
// prima a sinistra, rendering a destra. Richiama il gesto che il cliente fa
// nell'app quando confronta.
function htmlCursore(cfg, ctx, righe) {
  const x = Math.round(W / 2);
  const r = 46;                       // raggio della maniglia
  const cy = Math.round(FOTO_H / 2);
  const css = cssPostSingolo(`
.sx{clip-path:inset(0 ${W - x}px 0 0);}
.dx-foto{clip-path:inset(0 0 0 ${x}px);}
.cursore{position:absolute;z-index:3;left:${x - 1.5}px;top:0;width:3px;height:${FOTO_H}px;background:${PAPER};box-shadow:0 0 18px rgba(17,17,15,.45);}
.maniglia{position:absolute;z-index:4;left:${x - r}px;top:${cy - r}px;width:${r * 2}px;height:${r * 2}px;border-radius:50%;background:${PAPER};border:3px solid ${ORO_STRUTTURA};box-shadow:0 6px 24px rgba(17,17,15,.4);display:flex;align-items:center;justify-content:center;gap:9px;}
.frec{width:0;height:0;border-top:9px solid transparent;border-bottom:9px solid transparent;}
.frec.s{border-right:12px solid ${ORO_STRUTTURA};}
.frec.d{border-left:12px solid ${ORO_STRUTTURA};}
.chip.p{left:40px;top:40px;} .chip.d{right:40px;top:40px;}`);
  const corpo = `${coppiaSovrapposta(ctx, 'sx', 'dx-foto')}
<div class="cursore"></div>
<div class="maniglia"><span class="frec s"></span><span class="frec d"></span></div>
${chip(ETICHETTA_PRIMA, 'p')}${chip(ETICHETTA_DOPO, 'd')}`;
  return paginaPostSingolo(css, corpo, cfg, righe, Number(cfg.size) || 76);
}

// --- orizzonte -----------------------------------------------------------
// Linea oro orizzontale: sopra com'e oggi, sotto il rendering. Serve quando la
// superficie cambiata sta in basso (piani, banchi bassi, pavimenti): e la
// rotazione a saltarlo quando la foto non lo regge, non il render.
function quotaOrizzonte(cfg) {
  const grezzo = cfg.orizzonte && cfg.orizzonte.split != null ? cfg.orizzonte.split
    : (cfg.split != null ? cfg.split : 56);
  const n = Number(grezzo);
  if (!isFinite(n) || n < 15 || n > 85) {
    throw new RichiestaNonValida('orizzonte.split non valido: serve una percentuale fra 15 e 85 (default 56).');
  }
  return n;
}

function htmlOrizzonte(cfg, ctx, righe) {
  const y = Math.round(FOTO_H * ctx.split / 100);
  const css = cssPostSingolo(`
.alto{clip-path:inset(0 0 ${FOTO_H - y}px 0);}
.basso{clip-path:inset(${y}px 0 0 0);}
.linea{position:absolute;z-index:3;left:0;top:${y - 1.5}px;width:${W}px;height:3px;background:${ctx.cucitura};}
.chip.p{left:40px;top:40px;} .chip.d{left:40px;top:${y + 34}px;}`);
  const corpo = `${coppiaSovrapposta(ctx, 'alto', 'basso')}
<div class="linea"></div>
${chip(ETICHETTA_PRIMA, 'p')}${chip(ETICHETTA_DOPO, 'd')}`;
  return paginaPostSingolo(css, corpo, cfg, righe, Number(cfg.size) || 76);
}

// --- lente ---------------------------------------------------------------
// La foto di partenza intera, e un cerchio con bordo oro che mostra il
// rendering su un dettaglio: un fianco, un bordo, un'anta. Centro e raggio in
// percentuale della foto (il raggio sulla larghezza).
function cerchioLente(cfg) {
  const l = cfg.lente || {};
  const leggi = (nome, valore, min, max, def) => {
    if (valore == null || valore === '') return def;
    const n = Number(valore);
    if (!isFinite(n) || n < min || n > max) {
      throw new RichiestaNonValida('lente.' + nome + ' non valido: serve una percentuale fra ' + min + ' e ' + max + '.');
    }
    return n;
  };
  return {
    x: leggi('x', l.x != null ? l.x : cfg['lente.x'], 0, 100, 50),
    y: leggi('y', l.y != null ? l.y : cfg['lente.y'], 0, 100, 50),
    r: leggi('r', l.r != null ? l.r : cfg['lente.r'], 5, 50, 26),
  };
}

function htmlLente(cfg, ctx, righe) {
  const cx = W * ctx.lente.x / 100;
  const cy = FOTO_H * ctx.lente.y / 100;
  const r = W * ctx.lente.r / 100;
  const css = cssPostSingolo(`
.lente{clip-path:circle(${r}px at ${cx}px ${cy}px);}
.anello{position:absolute;z-index:3;left:${cx - r}px;top:${cy - r}px;width:${r * 2}px;height:${r * 2}px;border-radius:50%;border:3px solid ${ORO_STRUTTURA};box-shadow:0 10px 40px rgba(17,17,15,.35);}
.chip.p{left:40px;top:40px;}
.chip.d{left:${Math.round(Math.max(40, Math.min(W - 420, cx - r)))}px;top:${Math.round(Math.min(FOTO_H - 70, cy + r + 20))}px;}`);
  const corpo = `${coppiaSovrapposta(ctx, 'intera', 'lente')}
<div class="anello"></div>
${chip(ETICHETTA_PRIMA, 'p')}${chip(ETICHETTA_DOPO, 'd')}`;
  return paginaPostSingolo(css, corpo, cfg, righe, Number(cfg.size) || 76);
}

// --- finiture ------------------------------------------------------------
// Il rendering a tutta immagine, la foto di partenza piccola in alto a
// sinistra con cornice Paper, e nella banda le tessere delle finiture usate:
// campione dal catalogo dell'app, codice 3M, posizione. Parla al progettista,
// che dal post deve poter ordinare.
const BANDA_FINITURE = 430;

function htmlFiniture(cfg, ctx, righe) {
  const fotoH = H - BANDA_FINITURE;
  const f = ctx.punto;
  const tessere = ctx.finiture.map(x => `<div class="tessera">
<img src="${fileUrl(x.campione)}">
<div class="t-testo"><b>${esc(x.codice)}</b>${x.posizione ? `<span>${esc(x.posizione)}</span>` : ''}</div>
</div>`).join('');
  const css = cssBase(`
.foto-piena{left:0;top:0;width:${W}px;height:${fotoH}px;}
.provino{position:absolute;z-index:3;left:44px;top:44px;width:268px;height:201px;background:${PAPER};padding:10px;box-shadow:0 12px 36px rgba(17,17,15,.4);}
.provino .dentro{position:relative;width:100%;height:100%;overflow:hidden;background:#2A2723;}
.provino img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}
.chip.era{left:54px;top:${44 + 201 + 20 - 2}px;font-size:16px;padding:8px 13px 8px 15px;}
.banda{height:${BANDA_FINITURE}px;}
.testo{top:30px;}
.tessere{position:absolute;left:72px;right:72px;top:224px;display:flex;gap:16px;}
.tessera{flex:1 1 0;min-width:0;display:flex;align-items:center;gap:12px;border-top:2px solid ${ORO_STRUTTURA};padding-top:12px;}
.tessera img{width:58px;height:58px;object-fit:cover;flex:0 0 auto;box-shadow:inset 0 0 0 1px rgba(17,17,15,.12);}
.t-testo{min-width:0;display:flex;flex-direction:column;gap:3px;}
.t-testo b{font-family:${SANS};font-size:17px;font-weight:700;letter-spacing:.1em;color:${INK};white-space:nowrap;}
.t-testo span{font-family:${SANS};font-size:14px;letter-spacing:.12em;text-transform:uppercase;color:#7A7367;white-space:nowrap;}
.firma{bottom:36px;}
${CSS_FIRMA}`);
  const corpo = `<div class="foto foto-piena"><img src="${fileUrl(ctx.dopo)}" style="object-position:${f.x}% ${f.y}%"></div>
<div class="provino"><div class="dentro"><img src="${fileUrl(ctx.prima)}" style="object-position:${f.x}% ${f.y}%"></div></div>
${chip(ETICHETTA_COM_ERA, 'era')}`;
  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><style>${css}</style>${SCRIPT_ADATTA}${SCRIPT_SPAZIO}</head><body>
<div class="canvas">${corpo}
<div class="banda"><div class="testo">${htmlTesto(cfg, righe, Number(cfg.size) || 68)}</div>
<div class="tessere" data-sotto-il-titolo>${tessere}</div>${firma(cfg.site)}</div>
</div></body></html>`;
}

async function prepFiniture(cfg, files, layout) {
  const ctx = await prepCoppiaAllineata(cfg, files, layout);
  const finiture = leggiFiniture(cfg.finiture);
  if (!finiture.length) {
    throw new RichiestaNonValida('il layout "finiture" vuole le finiture usate: finiture:[{codice,posizione}].');
  }
  if (finiture.length > 4) {
    throw new RichiestaNonValida('finiture: al massimo 4 per stare nella banda, ne sono arrivate ' + finiture.length + '.');
  }
  ctx.finiture = await prendiCampioni(finiture, ctx.temporanei);
  return ctx;
}

// ==========================================================================
// CAROSELLI — cinque branding, quattro ruoli per slide
// ==========================================================================
//
// Ogni chiamata rende UNA slide: il branding dice come si veste, il ruolo dice
// che cosa ci sta dentro, indice e totale dicono dove si trova nella serie.
// La chiusura e sempre di solo testo, con l'invito a provare l'app.

const RUOLI = ['copertina', 'foto', 'finiture', 'chiusura'];

function posizioneSlide(cfg) {
  const n = Number(String(cfg.indice == null ? '' : cfg.indice).trim());
  const t = Number(String(cfg.totale == null ? '' : cfg.totale).trim());
  if (!Number.isInteger(n) || n < 1 || n > 20) {
    throw new RichiestaNonValida('indice non valido: serve un intero fra 1 e 20 (la slide nel carosello).');
  }
  if (!Number.isInteger(t) || t < 2 || t > 20) {
    throw new RichiestaNonValida('totale non valido: serve un intero fra 2 e 20 (quante slide ha il carosello).');
  }
  if (n > t) throw new RichiestaNonValida('indice ' + n + ' su un carosello di ' + t + ' slide.');
  return { n, t, due: String(n).padStart(2, '0'), dueTot: String(t).padStart(2, '0') };
}

function ruoloDi(cfg) {
  const r = String(cfg.ruolo || '').trim().toLowerCase();
  if (!r) throw new RichiestaNonValida('manca ruolo: ' + RUOLI.join(', ') + '.');
  if (RUOLI.indexOf(r) === -1) {
    throw new RichiestaNonValida('ruolo sconosciuto: "' + r + '". Ammessi: ' + RUOLI.join(', ') + '.');
  }
  return r;
}

// L'invito della slide di chiusura. Si puo cambiare dal config, ma non puo
// promettere cose che l'app non fa: il testo lo scrive chi chiama.
function invito(cfg) {
  return String(cfg.invito || 'Carica la foto del tuo progetto e guarda il risultato prima di decidere.').trim();
}

function htmlChiusura(cfg, ctx, righe, scuro) {
  const css = cssBase((scuro ? CSS_SCURO : '') + `
.blocco{position:absolute;left:96px;right:96px;top:50%;transform:translateY(-54%);}
.invito{font-family:${SANS};font-size:26px;line-height:1.5;letter-spacing:.01em;color:${scuro ? CHIARO : '#4A463E'};margin-top:34px;max-width:780px;}
.firma{bottom:84px;}
${CSS_FIRMA}
${scuro ? CSS_FIRMA_SCURA : ''}`);
  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><style>${css}</style>${SCRIPT_ADATTA}</head><body>
<div class="canvas">
<div class="blocco">${htmlTesto(cfg, righe, Number(cfg.size) || 84)}<div class="invito">${esc(invito(cfg))}</div></div>
${firma(cfg.site, scuro)}
</div></body></html>`;
}

// --- A · Catalogo --------------------------------------------------------
// Fondo Paper, la foto con un margine come una tavola di campionario, l'indice
// «N° 0X» in oro in alto, la banda del titolo in basso. Lavori di pregio.
function htmlCarCatalogo(cfg, ctx, righe) {
  if (ctx.ruolo === 'chiusura') return htmlChiusura(cfg, ctx, righe, false);
  if (ctx.ruolo === 'finiture') return htmlCarFiniture(cfg, ctx, righe, false);
  const margine = 72, alto = 150, h = 760;
  const css = cssBase(`
.indice{position:absolute;top:66px;left:${margine}px;font-family:'Italiana',serif;color:${ORO_STRUTTURA};font-size:58px;line-height:1;}
.indice small{font-size:27px;margin-right:8px;vertical-align:11px;}
.conta{position:absolute;top:84px;right:${margine}px;font-family:${SANS};font-size:17px;letter-spacing:.3em;color:#8B8375;}
.tavola{position:absolute;left:${margine}px;top:${alto}px;width:${W - margine * 2}px;height:${h}px;background:${PAPER};padding:16px;box-shadow:0 20px 54px rgba(17,17,15,.22);}
.tavola .dentro{position:relative;width:100%;height:100%;overflow:hidden;background:#2A2723;}
.tavola img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:${FILTRO_FOTO};}
.chip.s{left:${margine + 32}px;top:${alto + 32}px;}
.testo{top:${alto + h + 56}px;}
.firma{bottom:64px;}
${CSS_FIRMA}`);
  const corpo = `<div class="indice"><small>N°</small>${ctx.pos.due}</div>
<div class="conta">${ctx.pos.due} / ${ctx.pos.dueTot}</div>
<div class="tavola"><div class="dentro"><img src="${fileUrl(ctx.foto)}" style="object-position:${ctx.punto.x}% ${ctx.punto.y}%"></div></div>
${chip(ctx.etichetta, 's')}`;
  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><style>${css}</style>${SCRIPT_ADATTA}${SCRIPT_SPAZIO}</head><body>
<div class="canvas">${corpo}
<div class="testo">${htmlTesto(cfg, righe, Number(cfg.size) || 66)}</div>${firma(cfg.site)}
</div></body></html>`;
}

// --- B · Notte -----------------------------------------------------------
// Fondo Ink, titolo in alto, foto a tutta larghezza al centro, filetto oro e
// numerazione in basso. Hospitality.
function htmlCarNotte(cfg, ctx, righe) {
  if (ctx.ruolo === 'chiusura') return htmlChiusura(cfg, ctx, righe, true);
  if (ctx.ruolo === 'finiture') return htmlCarFiniture(cfg, ctx, righe, true);
  const fotoTop = 486, fotoH = 620;
  const css = cssBase(CSS_SCURO + `
.testo{top:92px;}
.foto-larga{left:0;top:${fotoTop}px;width:${W}px;height:${fotoH}px;}
.chip.s{left:40px;top:${fotoTop + 32}px;}
.riga-basso{position:absolute;left:72px;right:72px;bottom:160px;display:flex;align-items:center;gap:26px;}
.riga-basso .filo{flex:1 1 auto;height:2px;background:${ORO};}
.conta{font-family:${SANS};font-size:19px;letter-spacing:.3em;color:${ORO};white-space:nowrap;}
.firma{bottom:64px;}
${CSS_FIRMA}
${CSS_FIRMA_SCURA}`);
  const corpo = `<div class="testo">${htmlTesto(cfg, righe, Number(cfg.size) || 72)}</div>
<div class="foto foto-larga" data-sotto-il-titolo><img src="${fileUrl(ctx.foto)}" style="object-position:${ctx.punto.x}% ${ctx.punto.y}%"></div>
${chip(ctx.etichetta, 's')}
<div class="riga-basso"><span class="filo"></span><span class="conta">${ctx.pos.due} / ${ctx.pos.dueTot}</span></div>`;
  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><style>${css}</style>${SCRIPT_ADATTA}${SCRIPT_SPAZIO}</head><body>
<div class="canvas">${corpo}${firma(cfg.site, true)}</div></body></html>`;
}

// --- C · Scheda ----------------------------------------------------------
// Fondo Paper, le due foto in alto con i chip «stato di fatto» e
// «simulazione», sotto la tabella delle finiture. Architetti e capitolati.
const CSS_TABELLA = `
.tabella{position:absolute;left:72px;right:72px;}
.riga-f{display:flex;align-items:center;gap:20px;padding:17px 0;border-bottom:1px solid rgba(17,17,15,.13);}
.riga-f:first-child{border-top:2px solid ${ORO_STRUTTURA};}
.riga-f img{width:62px;height:62px;object-fit:cover;flex:0 0 auto;box-shadow:inset 0 0 0 1px rgba(17,17,15,.12);}
.riga-f b{font-family:${SANS};font-size:20px;font-weight:700;letter-spacing:.1em;color:${INK};flex:0 0 auto;min-width:190px;}
.riga-f span{font-family:${SANS};font-size:16px;letter-spacing:.14em;text-transform:uppercase;color:#7A7367;}
.intest{font-family:${SANS};font-size:15px;font-weight:700;letter-spacing:.26em;text-transform:uppercase;color:#8B8375;margin-bottom:12px;}`;

function htmlCarFiniture(cfg, ctx, righe, scuro) {
  const css = cssBase((scuro ? CSS_SCURO : '') + CSS_TABELLA + `
.testo{top:110px;}
.tabella{top:360px;}
.conta{position:absolute;top:84px;right:72px;font-family:${SANS};font-size:17px;letter-spacing:.3em;color:${scuro ? ORO : '#8B8375'};}
.firma{bottom:64px;}
${scuro ? '.riga-f b{color:' + PAPER + ';}.riga-f span{color:' + CHIARO + ';opacity:.75;}.riga-f{border-bottom-color:rgba(245,242,236,.16);}' : ''}
${CSS_FIRMA}
${scuro ? CSS_FIRMA_SCURA : ''}`);
  const righeF = ctx.finiture.map(f => `<div class="riga-f"><img src="${fileUrl(f.campione)}"><b>${esc(f.codice)}</b><span>${esc(f.posizione || '')}</span></div>`).join('');
  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><style>${css}</style>${SCRIPT_ADATTA}${SCRIPT_SPAZIO}</head><body>
<div class="canvas">
<div class="conta">${ctx.pos.due} / ${ctx.pos.dueTot}</div>
<div class="testo">${htmlTesto(cfg, righe, Number(cfg.size) || 66)}</div>
<div class="tabella" data-sotto-il-titolo><div class="intest">Finiture 3M DI-NOC</div>${righeF}</div>
${firma(cfg.site, scuro)}</div></body></html>`;
}

function htmlCarScheda(cfg, ctx, righe) {
  if (ctx.ruolo === 'chiusura') return htmlChiusura(cfg, ctx, righe, false);
  if (ctx.ruolo === 'finiture') return htmlCarFiniture(cfg, ctx, righe, false);
  const top = 146, h = 420, gap = 14, metaW = (W - 144 - gap) / 2;
  const css = cssBase(CSS_TABELLA + `
.conta{position:absolute;top:84px;right:72px;font-family:${SANS};font-size:17px;letter-spacing:.3em;color:#8B8375;}
.etich{position:absolute;top:80px;left:72px;font-family:${SANS};font-size:15px;font-weight:700;letter-spacing:.26em;text-transform:uppercase;color:#8B8375;}
.coppia{position:absolute;left:72px;right:72px;top:${top}px;height:${h}px;display:flex;gap:${gap}px;}
.mezza{position:relative;width:${metaW}px;height:${h}px;overflow:hidden;background:#2A2723;}
.mezza img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:${FILTRO_FOTO};}
.mezza .chip{left:18px;top:18px;font-size:15px;padding:8px 12px 8px 14px;}
.testo{top:${top + h + 40}px;}
.tabella{top:${top + h + 224}px;}
.firma{bottom:64px;}
${CSS_FIRMA}`);
  const tabella = ctx.finiture.length
    ? `<div class="tabella" data-sotto-il-titolo>${ctx.finiture.map(f => `<div class="riga-f"><img src="${fileUrl(f.campione)}"><b>${esc(f.codice)}</b><span>${esc(f.posizione || '')}</span></div>`).join('')}</div>`
    : '';
  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><style>${css}</style>${SCRIPT_ADATTA}${SCRIPT_SPAZIO}</head><body>
<div class="canvas">
<div class="etich">Scheda intervento</div><div class="conta">${ctx.pos.due} / ${ctx.pos.dueTot}</div>
<div class="coppia">
<div class="mezza"><img src="${fileUrl(ctx.prima)}" style="object-position:${ctx.punto.x}% ${ctx.punto.y}%">${chip('Stato di fatto')}</div>
<div class="mezza"><img src="${fileUrl(ctx.dopo)}" style="object-position:${ctx.punto.x}% ${ctx.punto.y}%">${chip('Simulazione')}</div>
</div>
<div class="testo">${htmlTesto(cfg, righe, Number(cfg.size) || 60)}</div>
${tabella}${firma(cfg.site)}</div></body></html>`;
}

// --- D · App -------------------------------------------------------------
// Il racconto passo per passo dentro un telefono. La specifica e netta: SOLO
// con schermate vere dell'app, non disegnate. Qui il telaio del telefono e
// grafica, lo schermo e una schermata vera che deve arrivare come file: senza,
// 400. Un finto schermo disegnato sarebbe una promessa falsa.
function htmlCarApp(cfg, ctx, righe) {
  if (ctx.ruolo === 'chiusura') return htmlChiusura(cfg, ctx, righe, true);
  if (ctx.ruolo === 'finiture') return htmlCarFiniture(cfg, ctx, righe, true);
  const telW = 486, telH = 860, telX = (W - telW) / 2, telY = 330, raggio = 48;
  const css = cssBase(CSS_SCURO + `
.testo{top:92px;}
.conta{position:absolute;top:96px;right:72px;font-family:${SANS};font-size:19px;letter-spacing:.3em;color:${ORO};}
.telefono{position:absolute;left:${telX}px;top:${telY}px;width:${telW}px;height:${telH}px;border-radius:${raggio}px;background:#2B2823;padding:12px;box-shadow:0 30px 80px rgba(0,0,0,.6);}
.schermo{position:relative;width:100%;height:100%;border-radius:${raggio - 14}px;overflow:hidden;background:${PAPER};}
.schermo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:top center;}
.tacca{position:absolute;z-index:2;left:50%;transform:translateX(-50%);top:22px;width:132px;height:9px;border-radius:5px;background:rgba(17,17,15,.55);}
.passo{position:absolute;left:72px;top:${telY - 54}px;font-family:${SANS};font-size:17px;font-weight:700;letter-spacing:.26em;text-transform:uppercase;color:${ORO};}
.firma{bottom:64px;}
${CSS_FIRMA}
${CSS_FIRMA_SCURA}`);
  const passo = cfg.passo
    ? `<div class="passo" data-sotto-il-titolo>${esc(cfg.passo)}</div>`
    : `<div class="passo" data-sotto-il-titolo></div>`;
  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><style>${css}</style>${SCRIPT_ADATTA}${SCRIPT_SPAZIO}</head><body>
<div class="canvas">
<div class="testo">${htmlTesto(cfg, righe, Number(cfg.size) || 66)}</div>
<div class="conta">${ctx.pos.due} / ${ctx.pos.dueTot}</div>${passo}
<div class="telefono" data-telefono><div class="schermo"><img src="${fileUrl(ctx.schermata)}"><div class="tacca"></div></div></div>
${firma(cfg.site, true)}</div></body></html>`;
}

// --- E · Panorama --------------------------------------------------------
// Una sola foto larga che continua da una slide all'altra: la tela e larga
// quanto tutto il carosello, e ogni chiamata restituisce la sua fetta. La
// linea oro diagonale attraversa la slide centrale. Solo con foto larghe e
// ben definite, perche ingrandisce molto.
function htmlCarPanorama(cfg, ctx, righe) {
  if (ctx.ruolo === 'chiusura') return htmlChiusura(cfg, ctx, righe, true);
  if (ctx.ruolo === 'finiture') return htmlCarFiniture(cfg, ctx, righe, true);
  const tela = W * ctx.pos.t;                 // larghezza di tutto il carosello
  const scorri = (ctx.pos.n - 1) * W;         // la fetta di questa slide
  const fotoH = H;
  // La diagonale attraversa la slide centrale, da bordo a bordo della tela.
  const centro = tela / 2;
  const xa = centro + W * 0.5, xb = centro - W * 0.5;
  const css = cssBase(`
.tela{position:absolute;left:${-scorri}px;top:0;width:${tela}px;height:${fotoH}px;}
.strato{position:absolute;left:0;top:0;width:${tela}px;height:${fotoH}px;overflow:hidden;background:#2A2723;}
.strato img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:${FILTRO_FOTO};}
.strato::after{content:'';position:absolute;inset:0;background:${VELO_FOTO};}
.prima{clip-path:polygon(0 0, ${xa}px 0, ${xb}px ${fotoH}px, 0 ${fotoH}px);}
.dopo{clip-path:polygon(${xa}px 0, ${tela}px 0, ${tela}px ${fotoH}px, ${xb}px ${fotoH}px);}
.velo-basso{position:absolute;left:0;bottom:0;width:${W}px;height:540px;background:linear-gradient(180deg, rgba(17,17,15,0) 0%, rgba(17,17,15,.5) 36%, rgba(17,17,15,.84) 68%, rgba(12,11,10,.95) 100%);}
/* L'occhiello e il contatore stanno sopra la foto: senza un velo anche in alto
   l'oro su un muro chiaro non si legge. */
.velo-alto{position:absolute;left:0;top:0;width:${W}px;height:230px;background:linear-gradient(180deg, rgba(17,17,15,.62) 0%, rgba(17,17,15,.28) 52%, rgba(17,17,15,0) 100%);}
.testo{left:72px;right:72px;bottom:214px;top:auto;}
.eyebrow{text-shadow:0 2px 12px rgba(0,0,0,.6);}
h1{color:${PAPER};text-shadow:0 2px 24px rgba(0,0,0,.5);} h1 .accent{color:${ORO_ACCENTO_SCURO};}
.eyebrow{color:${ORO};} .rule{background:${ORO};}
.conta{position:absolute;top:72px;right:72px;font-family:${SANS};font-size:19px;letter-spacing:.3em;color:${ORO};text-shadow:0 2px 12px rgba(0,0,0,.5);}
.firma{bottom:72px;}
${CSS_FIRMA}
${CSS_FIRMA_SCURA}`);
  const testo = righe.length ? `<div class="testo">${htmlTesto(cfg, righe, Number(cfg.size) || 70)}</div>` : '';
  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><style>${css}</style>${SCRIPT_ADATTA}</head><body>
<div class="canvas">
<div class="tela">
<div class="strato prima"><img src="${fileUrl(ctx.prima)}" style="object-position:${ctx.punto.x}% ${ctx.punto.y}%"></div>
<div class="strato dopo"><img src="${fileUrl(ctx.dopo)}" style="object-position:${ctx.punto.x}% ${ctx.punto.y}%"></div>
<svg style="position:absolute;left:0;top:0" width="${tela}" height="${fotoH}"><line x1="${xa}" y1="0" x2="${xb}" y2="${fotoH}" stroke="${ORO}" stroke-width="3"/></svg>
</div>
<div class="velo-alto"></div><div class="velo-basso"></div><div class="conta">${ctx.pos.due} / ${ctx.pos.dueTot}</div>
${testo}${firma(cfg.site, true)}</div></body></html>`;
}

// Il panorama distende una foto sola su tutte le slide: la tela e larga
// W x totale, e la foto ci viene dentro «cover». Se la foto e piu stretta
// della tela viene ingrandita, e si vede: la specifica dice «solo con foto
// larghe e ben definite», e questa e la meta meccanica di quella regola.
// Oltre questo ingrandimento la slide esce molle e il carosello va cambiato.
//
// Il numero: ogni slide esce larga 1080 px, quindi a 1,5 porta circa 720 pixel
// veri della foto, che su una superficie piatta e il limite di quello che si
// puo guardare. Col rendering di Marcianise (1448 px) un panorama su due slide
// passa e uno su tre no. E una soglia di giudizio: se a Vera il risultato non
// basta si alza l'asticella qui, in un posto solo.
const INGRANDIMENTO_MAX = 1.5;

async function verificaPanorama(larghezzaFoto, totale) {
  const tela = W * totale;
  const scala = tela / larghezzaFoto;
  if (scala > INGRANDIMENTO_MAX) {
    const serve = Math.ceil(tela / INGRANDIMENTO_MAX);
    throw new RichiestaNonValida(
      'il panorama su ' + totale + ' slide stende la foto su una tela di ' + tela + ' px: la foto e larga ' +
      larghezzaFoto + ' px e andrebbe ingrandita ' + scala.toFixed(2) + ' volte. Serve una foto larga almeno ' + serve +
      ' px, oppure meno slide. La rotazione deve saltare il panorama quando la foto non lo regge.');
  }
}

// ------------------------------------------------------- preparazione slide
async function prepCarosello(cfg, files, layout) {
  const ctx = { ruolo: ruoloDi(cfg), pos: posizioneSlide(cfg), punto: focus(cfg.focus, 'focus'), temporanei: [], finiture: [] };

  if (ctx.ruolo === 'finiture' || (layout === 'car_scheda' && cfg.finiture)) {
    const f = leggiFiniture(cfg.finiture);
    if (ctx.ruolo === 'finiture' && !f.length) {
      throw new RichiestaNonValida('la slide "finiture" vuole le finiture usate: finiture:[{codice,posizione}].');
    }
    if (f.length > 6) throw new RichiestaNonValida('finiture: al massimo 6 per slide, ne sono arrivate ' + f.length + '.');
    ctx.finiture = await prendiCampioni(f, ctx.temporanei);
  }
  if (ctx.ruolo === 'chiusura' || ctx.ruolo === 'finiture') return ctx;

  if (layout === 'car_app') {
    if (!files.schermata) {
      throw new RichiestaNonValida('il carosello "App" vuole una schermata vera dell\'app (campo file "schermata"): una schermata disegnata non si fa.');
    }
    ctx.schermata = files.schermata;
    return ctx;
  }
  if (layout === 'car_panorama' || layout === 'car_scheda') {
    if (!files.before || !files.after) {
      throw new RichiestaNonValida('il carosello "' + layout + '" vuole due foto: campi file "imageBefore" e "imageAfter".');
    }
    const a = await allineaCoppia(files.before, files.after);
    ctx.prima = a.prima; ctx.dopo = a.dopo; ctx.temporanei.push(...a.temporanei);
    if (layout === 'car_panorama') await verificaPanorama(a.larghezza, ctx.pos.t);
    return ctx;
  }
  // Catalogo e Notte mostrano una foto sola: il rendering se c'e, se no la
  // foto di partenza, e il chip dice sempre quale delle due si sta guardando.
  const dopo = files.after || null, prima = files.before || null;
  const mostra = String(cfg.mostra || (dopo ? 'dopo' : 'prima')).trim().toLowerCase();
  if (mostra !== 'prima' && mostra !== 'dopo') {
    throw new RichiestaNonValida('mostra non valido: "prima" o "dopo".');
  }
  ctx.foto = mostra === 'dopo' ? dopo : prima;
  if (!ctx.foto) {
    throw new RichiestaNonValida('la slide "' + ctx.ruolo + '" vuole una foto: campo file "image' + (mostra === 'dopo' ? 'After' : 'Before') + '".');
  }
  ctx.etichetta = mostra === 'dopo' ? ETICHETTA_DOPO : ETICHETTA_PRIMA;
  return ctx;
}

const CAROSELLI = {
  car_catalogo: htmlCarCatalogo,
  car_notte: htmlCarNotte,
  car_scheda: htmlCarScheda,
  car_app: htmlCarApp,
  car_panorama: htmlCarPanorama,
};

// La linea dell'orizzonte segue la luminosita delle foto come la cucitura di
// diagonale: oro struttura sulle chiare, oro chiaro sulle scure.
async function prepOrizzonte(cfg, files, layout) {
  const ctx = await prepCoppiaAllineata(cfg, files, layout);
  ctx.split = quotaOrizzonte(cfg);
  ctx.cucitura = await L.coloreCucitura(ctx.prima, ctx.dopo, String(cfg.seam || '').toLowerCase());
  return ctx;
}

async function prepLente(cfg, files, layout) {
  const ctx = await prepCoppiaAllineata(cfg, files, layout);
  ctx.lente = cerchioLente(cfg);
  return ctx;
}

const LAYOUT_DRESS = {
  cursore: { prepara: prepCoppiaAllineata, html: htmlCursore, maxTitolo: 150 },
  orizzonte: { prepara: prepOrizzonte, html: htmlOrizzonte, maxTitolo: 150 },
  lente: { prepara: prepLente, html: htmlLente, maxTitolo: 150 },
  finiture: { prepara: prepFiniture, html: htmlFiniture, maxTitolo: 150 },
};

// I caroselli: stesso registro, una voce per branding. Sulle slide che non
// sono copertina o chiusura il titolo puo mancare.
Object.keys(CAROSELLI).forEach((nome) => {
  LAYOUT_DRESS[nome] = {
    prepara: (cfg, files, layout) => prepCarosello(cfg, files, layout || nome),
    html: CAROSELLI[nome],
    maxTitolo: 230,
    titoloFacoltativo: true,
  };
});

module.exports = {
  LAYOUT_DRESS,
  allineaCoppia, leggiFiniture, prendiCampioni, fileTemporaneo,
  ETICHETTA_PRIMA, ETICHETTA_DOPO, ETICHETTA_COM_ERA,
  chip, firma, CSS_FIRMA, CSS_FIRMA_SCURA, CSS_SCURO, SITO, BASE_CAMPIONI,
  FOTO_H, BANDA_H, cssPostSingolo, paginaPostSingolo, prepCoppiaAllineata,
};
