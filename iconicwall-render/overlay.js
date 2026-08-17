// overlay.js — tipografia di brand per i reel, come PNG con canale alfa.
//
// Perché un file a parte e non un fotogramma di /render: nel reel il video sotto
// deve restare visibile e in movimento. Quindi il titolo non si "stampa" su una
// foto, si compone su fondo trasparente e si sovrappone alla clip con dissolvenza
// propria, che entra ed esce mentre la scena continua a muoversi.
//
// Gli asset sono quelli veri: font Italiana da assets/, logo PNG da assets/.
// Nessun testo scritto a mano al posto del logo, nessun font di ripiego:
// sono esattamente i due errori registrati in "reel-branding-lezioni".

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const ASSETS = path.join(HERE, 'assets');
const FONT = path.join(ASSETS, 'Italiana-Regular.ttf').replace(/\\/g, '/');

const LOGOS = {
  iconicwall: {
    white: path.join(ASSETS, 'iconicwall-logo-white.png'),
    black: path.join(ASSETS, 'iconicwall-logo-black.png'),
  },
  iconic: {
    white: path.join(ASSETS, 'iconic-logo-white.png'),
    black: path.join(ASSETS, 'iconic-logo-black.png'),
  },
};

const INK = '#11110F', PAPER = '#F5F2EC', GOLD = '#C9A578', ACC = '#D8B486', LIGHT = '#EDE7DB';
const SANS = "Arial, 'Helvetica Neue', sans-serif";

// Posizioni del blocco di testo nel 9:16. Il reel si guarda col pollice sullo
// schermo: la fascia bassa entro 320px dal bordo è coperta dalla UI di Instagram,
// quindi il testo non ci finisce mai.
const POSIZIONI = {
  BL: { css: 'left:80px;bottom:360px;text-align:left;', align: 'left', scrim: 'bottom' },
  BR: { css: 'right:80px;bottom:360px;text-align:right;', align: 'right', scrim: 'bottom' },
  TL: { css: 'left:80px;top:220px;text-align:left;', align: 'left', scrim: 'top' },
  TR: { css: 'right:80px;top:220px;text-align:right;', align: 'right', scrim: 'top' },
  CL: { css: 'left:80px;top:50%;transform:translateY(-50%);text-align:left;', align: 'left', scrim: 'centro' },
  CENTER: { css: 'left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;', align: 'center', scrim: 'centro' },
};

const SCRIM = {
  bottom: 'linear-gradient(0deg, rgba(9,9,8,.88) 0%, rgba(17,17,15,.45) 22%, rgba(17,17,15,0) 48%)',
  top: 'linear-gradient(180deg, rgba(9,9,8,.88) 0%, rgba(17,17,15,.45) 22%, rgba(17,17,15,0) 48%)',
  centro: 'radial-gradient(120% 62% at 50% 50%, rgba(9,9,8,.72) 0%, rgba(17,17,15,0) 72%)',
};

// Il corpo del titolo si adatta alla riga più lunga: sotto i 76px un titolo lungo
// andava a tre righe e il blocco sfondava. Stessa regola dei caroselli.
function corpoTitolo(titolo, base) {
  const righe = String(titolo || '').split(/<br\s*\/?>/i).map(r => r.replace(/<[^>]+>/g, '').trim());
  let max = 0;
  righe.forEach(r => { if (r.length > max) max = r.length; });
  const b = base || 104;
  if (max > 34) return Math.round(b * 0.62);
  if (max > 26) return Math.round(b * 0.74);
  if (max > 18) return Math.round(b * 0.86);
  return b;
}

function esc(s) {
  return String(s == null ? '' : s);
}

// --- HTML del titolo sovrapposto -------------------------------------------
function htmlTitolo(cfg, W, H) {
  const pos = POSIZIONI[String(cfg.posizione || 'BL').toUpperCase()] || POSIZIONI.BL;
  const size = cfg.corpo || corpoTitolo(cfg.titolo, cfg.corpoBase);
  const ruleMargin = pos.align === 'right'
    ? 'margin:0 0 28px auto;'
    : (pos.align === 'center' ? 'margin:0 auto 28px;' : 'margin-bottom:28px;');
  const scrim = cfg.scrim === false ? '' : `<div class="scrim"></div>`;
  const occhiello = cfg.occhiello ? `<div class="eyebrow">${esc(cfg.occhiello)}</div>` : '';
  const filetto = cfg.occhiello || cfg.titolo ? `<div class="rule"></div>` : '';
  const titolo = cfg.titolo
    ? `<h1>${esc(cfg.titolo)}${cfg.accento ? `<br><span class="accent">${esc(cfg.accento)}</span>` : ''}</h1>`
    : '';
  const sotto = cfg.sotto ? `<div class="sub">${esc(cfg.sotto)}</div>` : '';

  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><style>
@font-face{font-family:'Italiana';src:url('file://${FONT}') format('truetype');}
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:${W}px;height:${H}px;background:transparent;}
.canvas{position:relative;width:${W}px;height:${H}px;overflow:hidden;background:transparent;}
.scrim{position:absolute;inset:0;background:${SCRIM[pos.scrim]};}
.tb{position:absolute;max-width:${W - 160}px;${pos.css}}
.eyebrow{font-family:${SANS};font-size:26px;letter-spacing:.34em;text-transform:uppercase;color:${GOLD};font-weight:700;margin-bottom:18px;text-shadow:0 1px 12px rgba(0,0,0,.7);}
.rule{height:3px;width:84px;background:${GOLD};border-radius:2px;box-shadow:0 1px 10px rgba(0,0,0,.5);${ruleMargin}}
h1{font-family:'Italiana',serif;font-weight:400;color:${PAPER};font-size:${size}px;line-height:1.08;letter-spacing:.4px;text-shadow:0 2px 28px rgba(0,0,0,.72);}
h1 .accent{color:${ACC};font-style:italic;}
.sub{font-family:${SANS};font-size:31px;line-height:1.42;color:#E4DED2;margin-top:26px;font-weight:400;text-shadow:0 1px 12px rgba(0,0,0,.72);${pos.align === 'center' ? 'max-width:780px;margin-left:auto;margin-right:auto;' : (pos.align === 'right' ? 'margin-left:auto;max-width:700px;' : 'max-width:720px;')}}
</style></head><body><div class="canvas">${scrim}<div class="tb">${occhiello}${filetto}${titolo}${sotto}</div></div></body></html>`;
}

// --- HTML della card di chiusura -------------------------------------------
// Fondo pieno, logo vero al centro, promessa e sito. È l'unico fotogramma
// opaco del reel: chiude il racconto e porta al sito.
function htmlCard(cfg, logoPath, W, H) {
  const size = cfg.corpo || corpoTitolo(cfg.titolo, 96);
  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><style>
@font-face{font-family:'Italiana';src:url('file://${FONT}') format('truetype');}
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:${W}px;height:${H}px;}
.canvas{position:relative;width:${W}px;height:${H}px;overflow:hidden;background:${INK};}
.grana{position:absolute;inset:0;background:radial-gradient(120% 80% at 50% 42%, rgba(201,165,120,.10) 0%, rgba(17,17,15,0) 68%);}
.blocco{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;padding:0 90px;}
.logo{width:420px;margin:0 auto 66px;display:block;}
.rule{height:3px;width:84px;background:${GOLD};border-radius:2px;margin:0 auto 34px;}
h1{font-family:'Italiana',serif;font-weight:400;color:${PAPER};font-size:${size}px;line-height:1.1;letter-spacing:.4px;}
h1 .accent{color:${ACC};font-style:italic;}
.sub{font-family:${SANS};font-size:30px;line-height:1.45;color:#CFC7B8;margin-top:30px;font-weight:400;max-width:760px;margin-left:auto;margin-right:auto;}
.site{position:absolute;left:0;right:0;bottom:300px;text-align:center;font-family:${SANS};font-size:28px;letter-spacing:.26em;color:${LIGHT};opacity:.94;}
</style></head><body><div class="canvas"><div class="grana"></div>
<div class="blocco"><img class="logo" src="file://${logoPath.replace(/\\/g, '/')}"><div class="rule"></div>
<h1>${esc(cfg.titolo || '')}${cfg.accento ? `<br><span class="accent">${esc(cfg.accento)}</span>` : ''}</h1>
${cfg.sotto ? `<div class="sub">${esc(cfg.sotto)}</div>` : ''}</div>
${cfg.sito ? `<div class="site">${esc(cfg.sito)}</div>` : ''}
</div></body></html>`;
}

// Un solo browser per tutta la produzione: aprirne uno per titolo costava
// ~1,5 s a scena su Railway.
async function conBrowser(fn) {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    return await fn(b);
  } finally {
    await b.close();
  }
}

async function scatta(browser, html, W, H, trasparente, destinazione) {
  const hp = destinazione.replace(/\.png$/i, '') + '.html';
  fs.writeFileSync(hp, html);
  const p = await browser.newPage({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
  });
  try {
    await p.goto('file://' + hp, { waitUntil: 'load' });
    await p.waitForTimeout(450); // il font deve essere davvero montato
    await p.screenshot({
      path: destinazione,
      omitBackground: !!trasparente,
      clip: { x: 0, y: 0, width: W, height: H },
    });
  } finally {
    await p.close();
    fs.unlink(hp, () => {});
  }
  return destinazione;
}

/**
 * Produce i PNG di tipografia per un reel.
 *
 * @param {object[]} scene   una voce per scena; quelle senza titolo non producono PNG
 * @param {object}   card    card di chiusura (opzionale)
 * @param {object}   opzioni { larghezza, altezza, brand, cartella }
 * @returns {Promise<{titoli: (string|null)[], card: string|null}>}
 */
async function componiTipografia(scene, card, opzioni) {
  const W = opzioni.larghezza || 1080;
  const H = opzioni.altezza || 1920;
  const cartella = opzioni.cartella;
  const brand = String(opzioni.brand || 'iconicwall').toLowerCase();
  const set = LOGOS[brand] || LOGOS.iconicwall;
  const logoPath = set[String(opzioni.logo || 'white').toLowerCase()] || set.white;

  const serve = (scene || []).some(s => s && (s.titolo || s.occhiello || s.sotto)) || !!card;
  if (!serve) return { titoli: (scene || []).map(() => null), card: null };

  return conBrowser(async (b) => {
    const titoli = [];
    for (let i = 0; i < (scene || []).length; i++) {
      const s = scene[i] || {};
      if (!s.titolo && !s.occhiello && !s.sotto) { titoli.push(null); continue; }
      const out = path.join(cartella, `titolo_${String(i).padStart(2, '0')}.png`);
      await scatta(b, htmlTitolo(s, W, H), W, H, true, out);
      titoli.push(out);
    }
    let cardPath = null;
    if (card) {
      cardPath = path.join(cartella, 'card_finale.png');
      await scatta(b, htmlCard(card, logoPath, W, H), W, H, false, cardPath);
    }
    return { titoli: titoli, card: cardPath };
  });
}

module.exports = { componiTipografia, htmlTitolo, htmlCard, corpoTitolo, POSIZIONI };
