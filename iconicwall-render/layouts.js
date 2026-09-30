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
// Per la statistica e le parole del confronto: una riga sola, larga al massimo maxW.
window.adattaRiga = function (id, maxW, minimo) {
  var e = document.getElementById(id);
  if (!e) return null;
  var size = parseFloat(e.style.fontSize);
  while (size > minimo && e.scrollWidth > maxW) { size -= 2; e.style.fontSize = size + 'px'; }
  return size;
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

// --- Controlli di testo condivisi dai quattro layout del 30/09 -----------
const LOGO_ICONIC_BIANCO = path.join(ASSETS, 'iconic-logo-white.svg');
const ORO = '#C9A578', ORO_ACCENTO_SCURO = '#D8B486', CHIARO = '#EDE7DB';

function testoObbligatorio(cfg, campo, spiegazione) {
  const v = String(cfg[campo] == null ? '' : cfg[campo]).trim();
  if (!v) throw new RichiestaNonValida('manca ' + campo + ': ' + spiegazione);
  return v;
}

// Elenco di voci: array oppure stringa separata da · , | o a capo.
function elenco(valore) {
  if (valore == null || valore === '') return [];
  const voci = Array.isArray(valore) ? valore : String(valore).split(/[·,|\n]/);
  return voci.map(v => String(v).trim()).filter(Boolean);
}

// Linea Editoriale Iconic: nei testi a nome di Yuri nessuna parola di denaro.
// Nel confronto il chip storico «meno costi» è vietato: lo si ferma qui.
const PAROLE_DENARO = /\b(cost[oiae]?|costare|costerebbe|euro|prezz[oi]|soldi|risparmi\w*|economic\w*|spes[ae]|budget)\b|€/i;
function senzaDenaro(testi) {
  testi.forEach(t => {
    const pulito = String(t || '').replace(/<[^>]+>/g, ' ');
    const m = pulito.match(PAROLE_DENARO);
    if (m) throw new RichiestaNonValida('parola di denaro non ammessa nei testi del confronto: «' + m[0] + '» (Linea Editoriale Iconic).');
  });
}

function cssScuro() {
  return `.canvas{background:${INK};}
h1{color:${PAPER};} h1 .accent{color:${ORO_ACCENTO_SCURO};}
.eyebrow{color:${ORO};} .rule{background:${ORO};}
.site{color:${CHIARO};opacity:.9;}`;
}

// --- stat (Downtime zero) ------------------------------------------------
// Scuro cinematografico, statistica gigante in oro, titolo sotto. La foto è
// facoltativa: se c'è, fa da fondo molto velato. Il numero deve essere vero:
// il render non lo può verificare, ma pretende che chi chiama dica da dove
// viene (statFonte), così un numero senza fonte non esce.
async function prepStat(cfg, files) {
  const stat = testoObbligatorio(cfg, 'stat', 'la statistica da mostrare in grande (es. "0").');
  if (stat.length > 8) throw new RichiestaNonValida('stat troppo lunga ("' + stat + '"): è un numero, al massimo 8 caratteri.');
  testoObbligatorio(cfg, 'statFonte', 'da dove viene il numero (cantiere, documento). Solo numeri veri e verificati (Linea Editoriale Iconic).');
  return { stat, foto: files.photo || null, focus: focus(cfg.focus, 'focus') };
}

function htmlStat(cfg, ctx, righe) {
  const site = cfg.site != null ? cfg.site : SITI.iconic;
  const fondo = ctx.foto
    ? `<div class="foto fondo"><img src="${fileUrl(ctx.foto)}" style="object-position:${ctx.focus.x}% ${ctx.focus.y}%"></div><div class="scuro"></div>`
    : `<div class="scuro vuoto"></div>`;
  const css = cssBase(cssScuro() + `
.fondo{inset:0;}
.fondo img{filter:${FILTRO_FOTO} brightness(.8);}
.scuro{position:absolute;inset:0;background:linear-gradient(180deg, rgba(17,17,15,.72) 0%, rgba(17,17,15,.6) 40%, rgba(12,11,10,.94) 78%, rgba(12,11,10,.98) 100%);}
.scuro.vuoto{background:radial-gradient(90% 60% at 30% 38%, rgba(201,165,120,.12) 0%, rgba(17,17,15,0) 70%);}
.logo{position:absolute;top:72px;left:72px;width:200px;}
.blocco-stat{position:absolute;left:72px;right:72px;top:210px;}
.stat{font-family:'Italiana',serif;font-weight:400;color:${ORO};line-height:.86;white-space:nowrap;letter-spacing:-.01em;}
.stat-label{font-family:${SANS};font-size:28px;font-weight:700;letter-spacing:.26em;text-transform:uppercase;color:${CHIARO};margin-top:22px;}
.testo{bottom:150px;}
.site{position:absolute;right:72px;bottom:72px;}`);
  const label = cfg.statLabel ? `<div class="stat-label">${esc(cfg.statLabel)}</div>` : '';
  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><style>${css}</style>${SCRIPT_ADATTA}</head><body>
<div class="canvas">${fondo}
<img class="logo" src="${fileUrl(LOGO_ICONIC_BIANCO)}">
<div class="blocco-stat"><div class="stat" id="stat" style="font-size:${Number(cfg.statSize) || 560}px">${esc(ctx.stat)}</div>${label}</div>
<div class="testo">${htmlTesto(cfg, righe, Number(cfg.size) || 80)}</div>
${site ? `<div class="site">${esc(site)}</div>` : ''}
</div></body></html>`;
}

// --- campionario (Campionario 3M DI-NOC) --------------------------------
// Mosaico di finiture con fughe d'oro, card titolo su Paper sovrapposta al
// mosaico. Le finiture arrivano come file (campo "finiture", 4, 6 o 9): la
// griglia è sempre piena, niente caselle vuote. I colori delle finiture non
// si trattano: devono restare quelli del campione.
const GRIGLIE = { 4: { col: 2, rig: 2 }, 6: { col: 3, rig: 2 }, 9: { col: 3, rig: 3 } };

async function prepCampionario(cfg, files) {
  const finiture = files.finiture || [];
  const g = GRIGLIE[finiture.length];
  if (!g) throw new RichiestaNonValida('il campionario vuole 4, 6 o 9 finiture (campo file "finiture"): ne sono arrivate ' + finiture.length + '.');
  const codici = elenco(cfg.codici);
  if (codici.length && codici.length !== finiture.length) {
    throw new RichiestaNonValida('codici: ne servono ' + finiture.length + ', uno per finitura nello stesso ordine; ne sono arrivati ' + codici.length + '.');
  }
  return { finiture, codici, griglia: g };
}

function htmlCampionario(cfg, ctx, righe) {
  const site = cfg.site != null ? cfg.site : SITI.iconic;
  const mosaicoH = 990, gap = 3;
  const tessere = ctx.finiture.map((f, i) => `<div class="tessera"><img src="${fileUrl(f)}">${ctx.codici[i] ? `<span class="codice">${esc(ctx.codici[i])}</span>` : ''}</div>`).join('');
  const css = cssBase(`
.mosaico{position:absolute;left:0;top:0;width:${W}px;height:${mosaicoH}px;display:grid;grid-template-columns:repeat(${ctx.griglia.col},1fr);grid-template-rows:repeat(${ctx.griglia.rig},1fr);gap:${gap}px;background:${ORO_STRUTTURA};border-bottom:${gap}px solid ${ORO_STRUTTURA};}
.tessera{position:relative;overflow:hidden;}
.tessera img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}
.codice{position:absolute;left:18px;top:18px;font-family:${SANS};font-size:15px;font-weight:700;letter-spacing:.18em;color:${PAPER};background:rgba(17,17,15,.8);padding:7px 11px;border-radius:2px;}
.card{position:absolute;left:72px;right:72px;top:${mosaicoH - 180}px;bottom:72px;background:${PAPER};box-shadow:0 18px 50px rgba(17,17,15,.28);border-top:3px solid ${ORO_STRUTTURA};}
.card .testo{left:56px;right:56px;top:46px;}
.card .firma{left:56px;right:56px;bottom:40px;}
.logo{height:58px;display:block;}
.dx{display:flex;flex-direction:column;align-items:flex-end;gap:12px;}
.logo-3m{height:22px;display:block;}
.site{font-size:16px;letter-spacing:.18em;}`);
  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><style>${css}</style>${SCRIPT_ADATTA}</head><body>
<div class="canvas"><div class="mosaico">${tessere}</div>
<div class="card"><div class="testo">${htmlTesto(cfg, righe, Number(cfg.size) || 72)}</div>
<div class="firma"><img class="logo" src="${fileUrl(LOGO_ICONIC_NERO)}"><div class="dx"><img class="logo-3m" src="${fileUrl(LOGO_3M)}">${site ? `<div class="site">${esc(site)}</div>` : ''}</div></div></div>
</div></body></html>`;
}

// --- contract (Contract / scala) ----------------------------------------
// Foto architettonica a tutto campo, rail d'oro verticale a sinistra con
// l'eyebrow ruotato lungo il rail, indice «N° 0X» in alto a destra.
async function prepContract(cfg, files) {
  if (!files.photo) throw new RichiestaNonValida('il layout "contract" vuole una foto: campo file "photo".');
  const n = Number(String(cfg.indice == null ? '' : cfg.indice).trim());
  if (!Number.isInteger(n) || n < 1 || n > 99) {
    throw new RichiestaNonValida('indice non valido: serve un intero fra 1 e 99 (diventa «N° 0X»).');
  }
  return { foto: files.photo, focus: focus(cfg.focus, 'focus'), indice: String(n).padStart(2, '0') };
}

function htmlContract(cfg, ctx, righe) {
  const site = cfg.site != null ? cfg.site : SITI.iconic;
  const css = cssBase(cssScuro() + `
.fondo{inset:0;}
.velo{position:absolute;inset:0;background:linear-gradient(180deg, rgba(17,17,15,.45) 0%, rgba(17,17,15,0) 26%, rgba(17,17,15,0) 46%, rgba(17,17,15,.62) 70%, rgba(12,11,10,.94) 100%), linear-gradient(90deg, rgba(17,17,15,.62) 0%, rgba(17,17,15,.2) 14%, rgba(17,17,15,0) 32%);}
.rail{position:absolute;left:96px;top:96px;bottom:96px;width:4px;background:${ORO};}
.eyebrow-rail{position:absolute;left:44px;top:96px;writing-mode:vertical-rl;transform:rotate(180deg);font-family:${SANS};font-size:20px;font-weight:700;letter-spacing:.34em;text-transform:uppercase;color:${ORO};white-space:nowrap;height:${H - 192}px;text-align:right;}
.logo{position:absolute;top:92px;left:140px;width:200px;filter:drop-shadow(0 2px 12px rgba(0,0,0,.5));}
.indice{position:absolute;top:78px;right:72px;font-family:'Italiana',serif;color:${ORO};font-size:96px;line-height:1;text-shadow:0 2px 18px rgba(0,0,0,.45);}
.indice small{font-size:44px;margin-right:10px;vertical-align:18px;}
.testo{left:140px;bottom:150px;}
h1{text-shadow:0 2px 24px rgba(0,0,0,.55);}
.site{position:absolute;left:140px;bottom:96px;line-height:1;}`);
  const eyebrow = cfg.eyebrow ? `<div class="eyebrow-rail">${esc(cfg.eyebrow)}</div>` : '';
  const righeTesto = `<div class="rule"></div><h1 id="titolo" style="font-size:${Number(cfg.size) || 80}px">${righe.map(r => `<span class="riga">${r}</span>`).join('')}</h1>`;
  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><style>${css}</style>${SCRIPT_ADATTA}</head><body>
<div class="canvas">
<div class="foto fondo"><img src="${fileUrl(ctx.foto)}" style="object-position:${ctx.focus.x}% ${ctx.focus.y}%"></div><div class="velo"></div>
<div class="rail"></div>${eyebrow}
<img class="logo" src="${fileUrl(LOGO_ICONIC_BIANCO)}">
<div class="indice"><small>N°</small>${ctx.indice}</div>
<div class="testo">${righeTesto}</div>
${site ? `<div class="site">${esc(site)}</div>` : ''}
</div></body></html>`;
}

// --- confronto (Perché conviene) ----------------------------------------
// Solo tipografia: SOSTITUIRE barrato d'oro, RIVESTIRE vivo, chip dei vantaggi.
// Niente paragoni con altri operatori e nessuna parola di denaro: «meno costi»
// non si scrive (nota ⚠️ del template v3), il render lo rifiuta.
async function prepConfronto(cfg) {
  const barrato = String(cfg.barrato || 'Sostituire').trim();
  const vivo = String(cfg.vivo || 'Rivestire').trim();
  const chips = elenco(cfg.chips);
  if (chips.length > 4) throw new RichiestaNonValida('chips: al massimo 4, ne sono arrivati ' + chips.length + '.');
  senzaDenaro([cfg.title1, cfg.accent, cfg.eyebrow, barrato, vivo].concat(chips));
  return { barrato, vivo, chips };
}

function htmlConfronto(cfg, ctx, righe) {
  const site = cfg.site != null ? cfg.site : SITI.iconic;
  const css = cssBase(`
.logo{position:absolute;top:72px;left:72px;height:62px;}
.site{position:absolute;right:72px;top:96px;}
.testo{top:50%;transform:translateY(-44%);}
.parola{font-family:'Italiana',serif;font-weight:400;text-transform:uppercase;letter-spacing:.04em;line-height:1.05;white-space:nowrap;}
.barrato{color:rgba(17,17,15,.34);text-decoration:line-through;text-decoration-color:${ORO_STRUTTURA};text-decoration-thickness:6px;}
.vivo{color:${INK};margin-top:6px;}
.titolo-confronto{margin-top:64px;}
.chips{display:flex;flex-wrap:wrap;gap:14px;margin-top:56px;}
.chip-v{font-family:${SANS};font-size:19px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:${INK};border:1.5px solid ${ORO_STRUTTURA};padding:14px 20px 13px 23px;border-radius:2px;line-height:1;}`);
  const eyebrow = cfg.eyebrow ? `<div class="eyebrow">${esc(cfg.eyebrow)}</div>` : '';
  const titolo = righe.length
    ? `<h1 id="titolo" class="titolo-confronto" style="font-size:${Number(cfg.size) || 64}px">${righe.map(r => `<span class="riga">${r}</span>`).join('')}</h1>`
    : '';
  const chips = ctx.chips.length ? `<div class="chips">${ctx.chips.map(c => `<span class="chip-v">${esc(c)}</span>`).join('')}</div>` : '';
  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><style>${css}</style>${SCRIPT_ADATTA}</head><body>
<div class="canvas">
<img class="logo" src="${fileUrl(LOGO_ICONIC_NERO)}">${site ? `<div class="site">${esc(site)}</div>` : ''}
<div class="testo">${eyebrow}<div class="rule"></div>
<div class="parola barrato" id="barrato" style="font-size:170px">${esc(ctx.barrato)}</div>
<div class="parola vivo" id="vivo" style="font-size:170px">${esc(ctx.vivo)}</div>
${titolo}${chips}</div>
</div></body></html>`;
}

// --- Registro dei layout -------------------------------------------------
async function prepDueFoto(cfg, files, layout) {
  if (!files.before || !files.after) {
    throw new RichiestaNonValida('il layout "' + layout + '" vuole due foto: campi file "imageBefore" e "imageAfter".');
  }
  return {
    foto: {
      before: files.before,
      after: files.after,
      focusBefore: focus(cfg.focusBefore, 'focusBefore'),
      focusAfter: focus(cfg.focusAfter, 'focusAfter'),
      diagonal: taglio(cfg.diagonal),
    },
    cucitura: await coloreCucitura(files.before, files.after, String(cfg.seam || '').toLowerCase()),
  };
}

// adatta: [altezza massima del titolo, e per le righe singole [id, larghezza]].
const LAYOUT = {
  prima_dopo: { prepara: prepDueFoto, html: (cfg, c, r) => htmlPrimaDopo(cfg, c.foto, c.cucitura, r), maxTitolo: 176 },
  diagonale: { prepara: prepDueFoto, html: (cfg, c, r) => htmlDiagonale(cfg, c.foto, c.cucitura, r), maxTitolo: 184 },
  stat: { prepara: prepStat, html: htmlStat, maxTitolo: 190, righe: [['stat', W - 144]] },
  campionario: { prepara: prepCampionario, html: htmlCampionario, maxTitolo: 170 },
  contract: { prepara: prepContract, html: htmlContract, maxTitolo: 190 },
  confronto: { prepara: prepConfronto, html: htmlConfronto, maxTitolo: 150, titoloFacoltativo: true, righe: [['barrato', W - 144], ['vivo', W - 144]] },
};

/**
 * @param {object} cfg    configurazione (brand e layout già verificati)
 * @param {string} layout nome del layout
 * @param {object} files  percorsi locali: { before, after, photo, finiture: [] }
 * @returns {Promise<Buffer>} PNG 1080×1350
 */
async function renderLayout(cfg, layout, files) {
  const def = LAYOUT[layout];
  if (!def) throw new RichiestaNonValida('layout sconosciuto: "' + layout + '"');
  const ctx = await def.prepara(cfg, files || {}, layout);
  const righe = def.titoloFacoltativo && !String(cfg.title1 || '').trim() ? [] : componiTitolo(cfg);
  const html = def.html(cfg, ctx, righe);

  const hp = path.join(os.tmpdir(), 'layout_' + process.pid + '_' + Math.floor(Math.random() * 1e9) + '.html');
  fs.writeFileSync(hp, html);
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
    await p.goto(fileUrl(hp), { waitUntil: 'load' });
    await p.evaluate(() => document.fonts.ready);
    // Foto, finiture e loghi sono <img>: naturalWidth a zero vuol dire che il
    // browser non li ha decodificati. verificaFoto ha già controllato i file
    // arrivati, questo è il paracadute.
    const rotte = await p.evaluate(() => Array.from(document.images)
      .filter(i => !i.complete || i.naturalWidth === 0).length);
    if (rotte) throw new RichiestaNonValida('foto non decodificabile dal browser. Serve un JPEG, PNG o WebP.');
    for (const [id, maxW] of def.righe || []) {
      await p.evaluate(({ id, maxW }) => window.adattaRiga(id, maxW, 60), { id, maxW });
    }
    if (righe.length) await p.evaluate(({ max }) => window.adatta(max, 40), { max: def.maxTitolo });
    const png = await p.screenshot({ clip: { x: 0, y: 0, width: W, height: H } });
    return await sharp(png).resize(W, H, { kernel: 'lanczos3' }).sharpen({ sigma: 1.2, m1: 0, m2: 1.0 }).png({ compressionLevel: 9 }).toBuffer();
  } finally {
    await b.close();
    fs.unlink(hp, () => {});
  }
}

module.exports = { renderLayout, componiTitolo, focus, senzaDenaro, LAYOUT };
