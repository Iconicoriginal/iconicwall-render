// layouts.js — layout a due foto (prima/dopo) per Iconic e IconicDress.
//
// Il layout storico di IconicWall resta in render.js e non passa di qui: le
// richieste di "Vera — Branding" devono dare lo stesso JPEG di prima.
//
// Specifica: «Brief per Claude Code — layout Iconic nel render service
// (30/09/2026)» e «Pipeline post Iconic e IconicDress — Stato & Decisioni»,
// Notion, sotto Vera. Esce un PNG 1080×1350.

const { chromium } = require('playwright');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { RichiestaNonValida } = require('./verifiche');

const ASSETS = path.join(__dirname, 'assets');
const FONT = path.join(ASSETS, 'Italiana-Regular.ttf').replace(/\\/g, '/');
const LOGO_ICONIC_NERO = path.join(ASSETS, 'iconic-logo-black.svg');
const LOGO_ICONICDRESS = path.join(ASSETS, 'iconicdress-positivo.svg');
const LOGO_3M = path.join(ASSETS, '3m-dinoc-logo.png');

const W = 1080, H = 1350;
const INK = '#11110F', PAPER = '#F5F2EC';
const ORO_STRUTTURA = '#A67C3C';   // eyebrow, filetto, cucitura su foto chiare
const ORO_SCURO = '#C9A578';       // cucitura su foto scure
const ORO_ACCENTO = '#B4884D';     // parola-perno su fondo chiaro
const SANS = "Arial, 'Helvetica Neue', sans-serif";

// Trattamento foto del sito: contrasto +10%, saturazione 0,85, luminosità 0,94,
// velo ink caldo #14120F al 13%. Mai nero puro.
const FILTRO_FOTO = 'contrast(1.1) saturate(.85) brightness(.94)';
const VELO_FOTO = 'rgba(20,18,15,.13)';

const SITI = { iconic: 'iconicoriginal.it', iconicdress: 'riqualificazione.iconicoriginal.it' };

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fileUrl(p) {
  return 'file://' + String(p).replace(/\\/g, '/');
}

// --- Punto focale --------------------------------------------------------
// Accetta "40,60", "40% 60%", [40,60] o {x:40,y:60}. Default 50/50.
function focus(valore, campo) {
  if (valore == null || valore === '') return { x: 50, y: 50 };
  let x, y;
  if (Array.isArray(valore)) { x = valore[0]; y = valore[1]; }
  else if (typeof valore === 'object') { x = valore.x; y = valore.y; }
  else {
    const parti = String(valore).replace(/%/g, ' ').split(/[\s,;]+/).filter(Boolean);
    x = parti[0]; y = parti.length > 1 ? parti[1] : 50;
  }
  x = Number(x); y = Number(y);
  if (!isFinite(x) || !isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) {
    throw new RichiestaNonValida(campo + ' non valido: servono due percentuali x,y fra 0 e 100 (es. "50,40").');
  }
  return { x, y };
}

// --- Titolo --------------------------------------------------------------
// Stessa convenzione di oggi: <br> fra le righe e <span class="accent"> sulla
// parola-perno, oppure le virgolette basse «» (le converte qui se Vera non l'ha
// già fatto). Il campo accent, se c'è, colora quella parola dentro il titolo;
// se nel titolo non c'è, va a capo come nel layout storico.
function componiTitolo(cfg) {
  let t = String(cfg.title1 || '').trim();
  if (!t) throw new RichiestaNonValida('manca il titolo (title1).');
  t = t.replace(/\r?\n/g, '<br>');
  t = t.replace(/«\s*(.+?)\s*»/g, '<span class="accent">$1</span>');
  const accent = String(cfg.accent || '').trim();
  if (accent && !/class="accent"/.test(t)) {
    const i = t.indexOf(accent);
    t = i > -1
      ? t.slice(0, i) + '<span class="accent">' + accent + '</span>' + t.slice(i + accent.length)
      : t + '<br><span class="accent">' + accent + '</span>';
  }
  const accenti = (t.match(/class="accent"/g) || []).length;
  if (accenti > 1) {
    throw new RichiestaNonValida('il titolo ha ' + accenti + ' parole in oro: ne è ammessa una sola.');
  }
  const righe = t.split(/<br\s*\/?>/i).map(r => r.trim()).filter(r => r.replace(/<[^>]+>/g, '').trim() !== '');
  if (righe.length > 2) {
    throw new RichiestaNonValida('il titolo ha ' + righe.length + ' righe: al massimo due.');
  }
  // Niente punto finale: si toglie l'ultimo, anche se sta dentro lo span.
  const ultima = righe.length - 1;
  righe[ultima] = righe[ultima].replace(/\.(\s*(?:<\/span>)?\s*)$/, '$1');
  return righe;
}

// --- Colore della cucitura ----------------------------------------------
// Oro struttura se le foto lungo il taglio sono chiare, oro chiaro se scure.
async function luminanza(percorso) {
  const st = await sharp(percorso).resize(64, 64, { fit: 'cover' }).stats();
  const [r, g, b] = st.channels.map(c => c.mean);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

async function coloreCucitura(prima, dopo, forzato) {
  if (forzato === 'chiaro' || forzato === 'light') return ORO_STRUTTURA;
  if (forzato === 'scuro' || forzato === 'dark') return ORO_SCURO;
  const media = ((await luminanza(prima)) + (await luminanza(dopo))) / 2;
  return media > 128 ? ORO_STRUTTURA : ORO_SCURO;
}

// --- Parti comuni dell'HTML ---------------------------------------------
function cssBase(extra) {
  return `@font-face{font-family:'Italiana';src:url('${fileUrl(FONT)}') format('truetype');}
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:${W}px;height:${H}px;}
.canvas{position:relative;width:${W}px;height:${H}px;overflow:hidden;background:${PAPER};}
.foto{position:absolute;overflow:hidden;background:#2A2723;}
.foto img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:${FILTRO_FOTO};}
.foto::after{content:'';position:absolute;inset:0;background:${VELO_FOTO};}
.chip{position:absolute;z-index:3;font-family:${SANS};font-size:19px;font-weight:700;letter-spacing:.24em;text-transform:uppercase;color:${PAPER};background:rgba(17,17,15,.8);padding:10px 16px 10px 19px;border-radius:2px;line-height:1;}
.banda{position:absolute;left:0;right:0;bottom:0;background:${PAPER};}
.testo{position:absolute;left:72px;right:72px;}
.eyebrow{font-family:${SANS};font-size:20px;font-weight:700;letter-spacing:.32em;text-transform:uppercase;color:${ORO_STRUTTURA};margin-bottom:16px;}
.rule{height:2px;width:64px;background:${ORO_STRUTTURA};margin-bottom:22px;}
h1{font-family:'Italiana',serif;font-weight:400;font-style:normal;color:${INK};line-height:1.08;letter-spacing:.3px;}
h1 .riga{display:block;white-space:nowrap;}
h1 .accent{color:${ORO_ACCENTO};font-style:normal;}
.firma{position:absolute;left:72px;right:72px;display:flex;align-items:center;justify-content:space-between;}
.site{font-family:${SANS};font-size:18px;letter-spacing:.2em;color:#5E594F;}
${extra || ''}`;
}

function htmlTesto(cfg, righe, size) {
  const eyebrow = cfg.eyebrow ? `<div class="eyebrow">${esc(cfg.eyebrow)}</div>` : '';
  return `${eyebrow}<div class="rule"></div><h1 id="titolo" style="font-size:${size}px">${righe.map(r => `<span class="riga">${r}</span>`).join('')}</h1>`;
}

// Il titolo sta su due righe al massimo e non va mai a capo da solo: se una riga
// è più larga del blocco, o il blocco più alto dello spazio, il corpo scende.
const SCRIPT_ADATTA = `<script>
window.adatta = function (maxAltezza, minimo) {
  var h = document.getElementById('titolo');
  var box = h.parentElement.getBoundingClientRect().width;
  var size = parseFloat(h.style.fontSize);
  function larga() {
    var m = 0; var r = h.querySelectorAll('.riga');
    for (var i = 0; i < r.length; i++) m = Math.max(m, r[i].scrollWidth);
    return m;
  }
  while (size > minimo && (larga() > box || h.getBoundingClientRect().height > maxAltezza)) {
    size -= 1; h.style.fontSize = size + 'px';
  }
  return { size: size, larghezza: larga(), box: box, altezza: h.getBoundingClientRect().height };
};
</script>`;

// --- prima_dopo (Iconic) -------------------------------------------------
// Split verticale: prima a sinistra, dopo a destra, cucitura oro in mezzo.
// Banda Paper in basso al 30% con eyebrow, filetto, titolo, logo e sito.
function htmlPrimaDopo(cfg, foto, cucitura, righe) {
  const bandaH = Math.round(H * 0.30);           // 405
  const fotoH = H - bandaH;                      // 945
  const seam = 3;
  const metaW = (W - seam) / 2;                  // 538,5
  const fp = foto.focusBefore, fd = foto.focusAfter;
  const site = cfg.site != null ? cfg.site : SITI.iconic;
  const css = cssBase(`
.prima{left:0;top:0;width:${metaW}px;height:${fotoH}px;}
.dopo{right:0;top:0;width:${metaW}px;height:${fotoH}px;}
.cucitura{position:absolute;z-index:2;left:${metaW}px;top:0;width:${seam}px;height:${fotoH}px;background:${cucitura};}
.chip.p{left:40px;top:40px;} .chip.d{left:${metaW + seam + 40}px;top:40px;}
.banda{height:${bandaH}px;}
.testo{top:50px;}
.firma{bottom:42px;}
.logo{height:58px;display:block;}`);
  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><style>${css}</style>${SCRIPT_ADATTA}</head><body>
<div class="canvas">
<div class="foto prima"><img src="${fileUrl(foto.before)}" style="object-position:${fp.x}% ${fp.y}%"></div>
<div class="foto dopo"><img src="${fileUrl(foto.after)}" style="object-position:${fd.x}% ${fd.y}%"></div>
<div class="cucitura"></div>
<div class="chip p">Prima</div><div class="chip d">Dopo</div>
<div class="banda"><div class="testo">${htmlTesto(cfg, righe, Number(cfg.size) || 76)}</div>
<div class="firma"><img class="logo" src="${fileUrl(LOGO_ICONIC_NERO)}">${site ? `<div class="site">${esc(site)}</div>` : ''}</div></div>
</div></body></html>`;
}

// --- diagonale (IconicDress) --------------------------------------------
// Una sola cornice: la foto prima nel triangolo in alto a sinistra, la dopo in
// basso a destra, separate da una linea oro. La linea va da (alto% della
// larghezza, bordo superiore) a (basso% della larghezza, bordo inferiore della
// foto); default da angolo ad angolo. Firma: IconicDress grande + 3M DI-NOC.
function taglio(valore) {
  if (valore == null || valore === '') return { alto: 100, basso: 0 };
  const f = focus(valore, 'diagonal');
  return { alto: f.x, basso: f.y };
}

function htmlDiagonale(cfg, foto, cucitura, righe) {
  const bandaH = Math.round(H * 0.32);           // 432
  const fotoH = H - bandaH;                      // 918
  const t = foto.diagonal;
  const xa = W * t.alto / 100, xb = W * t.basso / 100;
  const fp = foto.focusBefore, fd = foto.focusAfter;
  const site = cfg.site != null ? cfg.site : SITI.iconicdress;
  const css = cssBase(`
.prima,.dopo{left:0;top:0;width:${W}px;height:${fotoH}px;}
.prima{clip-path:polygon(0 0, ${xa}px 0, ${xb}px ${fotoH}px, 0 ${fotoH}px);}
.dopo{clip-path:polygon(${xa}px 0, ${W}px 0, ${W}px ${fotoH}px, ${xb}px ${fotoH}px);}
.linea{position:absolute;z-index:2;left:0;top:0;}
.chip.p{left:40px;top:40px;} .chip.d{right:40px;bottom:${bandaH + 40}px;}
.banda{height:${bandaH}px;}
.testo{top:48px;}
.firma{bottom:44px;align-items:flex-end;}
.logo-dress{height:50px;display:block;}
.dx{display:flex;flex-direction:column;align-items:flex-end;gap:14px;}
.logo-3m{height:25px;display:block;}
.site{font-size:16px;letter-spacing:.14em;}`);
  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><style>${css}</style>${SCRIPT_ADATTA}</head><body>
<div class="canvas">
<div class="foto prima"><img src="${fileUrl(foto.before)}" style="object-position:${fp.x}% ${fp.y}%"></div>
<div class="foto dopo"><img src="${fileUrl(foto.after)}" style="object-position:${fd.x}% ${fd.y}%"></div>
<svg class="linea" width="${W}" height="${fotoH}" viewBox="0 0 ${W} ${fotoH}"><line x1="${xa}" y1="0" x2="${xb}" y2="${fotoH}" stroke="${cucitura}" stroke-width="3"/></svg>
<div class="chip p">Prima</div><div class="chip d">Dopo</div>
<div class="banda"><div class="testo">${htmlTesto(cfg, righe, Number(cfg.size) || 76)}</div>
<div class="firma"><img class="logo-dress" src="${fileUrl(LOGO_ICONICDRESS)}">
<div class="dx"><img class="logo-3m" src="${fileUrl(LOGO_3M)}">${site ? `<div class="site">${esc(site)}</div>` : ''}</div></div></div>
</div></body></html>`;
}

const LAYOUT = {
  prima_dopo: { html: htmlPrimaDopo, maxTitolo: 176 },
  diagonale: { html: htmlDiagonale, maxTitolo: 184 },
};

/**
 * @param {object} cfg    configurazione (brand e layout già verificati)
 * @param {object} files  { before, after } percorsi locali delle due foto
 * @returns {Promise<Buffer>} PNG 1080×1350
 */
async function renderLayout(cfg, layout, files) {
  const def = LAYOUT[layout];
  if (!def) throw new RichiestaNonValida('layout sconosciuto: "' + layout + '"');
  if (!files.before || !files.after) {
    throw new RichiestaNonValida('il layout "' + layout + '" vuole due foto: campi file "imageBefore" e "imageAfter".');
  }
  const righe = componiTitolo(cfg);
  const foto = {
    before: files.before,
    after: files.after,
    focusBefore: focus(cfg.focusBefore, 'focusBefore'),
    focusAfter: focus(cfg.focusAfter, 'focusAfter'),
    diagonal: taglio(cfg.diagonal),
  };
  const cucitura = await coloreCucitura(files.before, files.after, String(cfg.seam || '').toLowerCase());
  const html = def.html(cfg, foto, cucitura, righe);

  const hp = path.join(os.tmpdir(), 'layout_' + process.pid + '_' + Math.floor(Math.random() * 1e9) + '.html');
  fs.writeFileSync(hp, html);
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
    await p.goto(fileUrl(hp), { waitUntil: 'load' });
    await p.evaluate(() => document.fonts.ready);
    // Le due foto sono <img>: naturalWidth a zero vuol dire che il browser non le
    // ha decodificate. verificaFoto le ha già controllate, questo è il paracadute.
    const rotte = await p.evaluate(() => Array.from(document.querySelectorAll('.foto img'))
      .filter(i => !i.complete || i.naturalWidth === 0).length);
    if (rotte) throw new RichiestaNonValida('foto non decodificabile dal browser. Serve un JPEG, PNG o WebP.');
    await p.evaluate(({ max }) => window.adatta(max, 40), { max: def.maxTitolo });
    const png = await p.screenshot({ clip: { x: 0, y: 0, width: W, height: H } });
    return await sharp(png).resize(W, H, { kernel: 'lanczos3' }).sharpen({ sigma: 1.2, m1: 0, m2: 1.0 }).png({ compressionLevel: 9 }).toBuffer();
  } finally {
    await b.close();
    fs.unlink(hp, () => {});
  }
}

module.exports = { renderLayout, componiTitolo, focus, LAYOUT };
