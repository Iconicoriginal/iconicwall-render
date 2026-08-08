// IconicWall/Iconic render engine v2 — stesso motore iw-post + logo multi-brand con scelta auto bianco/nero.
const { chromium } = require('playwright');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const os = require('os');

const HERE = __dirname;
const ASSETS = path.join(HERE, 'assets');
const FONT = path.join(ASSETS, 'Italiana-Regular.ttf').replace(/\\/g, '/');

// Loghi: nomi file identici a quelli in Drive (nessun rename).
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

const W = 1080, Hh = 1350;
const INK = '#11110F', PAPER = '#F5F2EC', GOLD = '#C9A578', ACC = '#D8B486', LIGHT = '#EDE7DB';
const SANS = "Arial, 'Helvetica Neue', sans-serif";

const vBottom = `linear-gradient(180deg, rgba(17,17,15,.42) 0%, rgba(17,17,15,.02) 24%, rgba(17,17,15,0) 42%, rgba(17,17,15,.5) 66%, rgba(9,9,8,.96) 100%)`;
const vTop = `linear-gradient(0deg, rgba(17,17,15,.42) 0%, rgba(17,17,15,.02) 24%, rgba(17,17,15,0) 42%, rgba(17,17,15,.5) 66%, rgba(9,9,8,.96) 100%)`;
const vLeft = `linear-gradient(90deg, rgba(17,17,15,.5) 0%, rgba(17,17,15,0) 56%)`;
const vRight = `linear-gradient(270deg, rgba(17,17,15,.5) 0%, rgba(17,17,15,0) 56%)`;
const vCtr = `radial-gradient(130% 100% at 50% 50%, rgba(17,17,15,.05) 24%, rgba(9,9,8,.9) 100%)`;

function posConf(pos) {
  const P = {
    BL: { veil: `${vBottom},${vLeft}`, align: 'left', tb: 'left:80px;bottom:88px;text-align:left;', logo: 'top:74px;left:80px;', site: 'bottom:74px;right:80px;', logoTop: true },
    BR: { veil: `${vBottom},${vRight}`, align: 'right', tb: 'right:80px;bottom:88px;text-align:right;', logo: 'top:74px;left:80px;', site: 'bottom:74px;left:80px;', logoTop: true },
    TL: { veil: `${vTop},${vLeft}`, align: 'left', tb: 'left:80px;top:96px;text-align:left;', logo: 'bottom:74px;left:80px;', site: 'bottom:74px;right:80px;', logoTop: false },
    TR: { veil: `${vTop},${vRight}`, align: 'right', tb: 'right:80px;top:96px;text-align:right;', logo: 'top:74px;left:80px;', site: 'bottom:74px;left:80px;', logoTop: true },
    CENTER: { veil: vCtr, align: 'center', tb: 'left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;', logo: 'top:74px;left:50%;transform:translateX(-50%);', site: 'bottom:74px;left:50%;transform:translateX(-50%);', logoTop: true },
  }[pos];
  return P || null;
}

// Sceglie bianco/nero misurando la luminosità dell'angolo dove va il logo.
async function autoLogoColor(imagePath, logoTop) {
  try {
    const top = logoTop ? 40 : (Hh - 240);
    const region = { left: 60, top, width: 460, height: 200 };
    const st = await sharp(imagePath).resize(W, Hh, { fit: 'cover' }).extract(region).stats();
    const [r, g, b] = st.channels.map(c => c.mean);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b; // 0..255
    // La cornice scurisce l'angolo: passo al nero solo se l'angolo è davvero chiaro.
    return lum > 172 ? 'black' : 'white';
  } catch (e) {
    return 'white';
  }
}

function buildHtml(cfg, logoPath) {
  const pos = (cfg.position || 'BL').toUpperCase();
  const P = posConf(pos);
  if (!P) throw new Error('bad position');
  const ruleMargin = P.align === 'right' ? 'margin:0 0 26px auto;' : (P.align === 'center' ? 'margin:0 auto 26px;' : 'margin-bottom:26px;');
  const el = (v, s) => v ? s : '';
  const eyebrow = el(cfg.eyebrow, `<div class="eyebrow">${cfg.eyebrow || ''}</div>`);
  const number = el(cfg.number, `<div class="num">${cfg.number || ''}</div>`);
  const title = `<h1>${cfg.title1 || ''}${cfg.accent ? `<br><span class="accent">${cfg.accent}</span>` : ''}</h1>`;
  const sub = el(cfg.sub, `<div class="sub">${cfg.sub || ''}</div>`);
  const cta = el(cfg.cta, `<div class="cta">${cfg.cta || ''}</div>`);
  const chip = el(cfg.chip, `<div class="chip">${cfg.chip || ''}</div>`);
  const site = el(cfg.site, `<div class="site">${cfg.site || ''}</div>`);
  const bgpos = cfg.bgpos || '50% 45%';
  const titleSize = cfg.size || 92;
  const logoFile = logoPath.replace(/\\/g, '/');
  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><style>
@font-face{font-family:'Italiana';src:url('file://${FONT}') format('truetype');}
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:${W}px;height:${Hh}px;}
.canvas{position:relative;width:${W}px;height:${Hh}px;overflow:hidden;background:${INK};}
.bg{position:absolute;inset:0;background:url('${cfg.image}') center/cover no-repeat;background-position:${bgpos};transform:scale(1.03);}
.veil{position:absolute;inset:0;background:${P.veil};}
.logo{position:absolute;width:236px;${P.logo}filter:drop-shadow(0 2px 12px rgba(0,0,0,.5));}
.tb{position:absolute;max-width:900px;${P.tb}}
.eyebrow{font-family:${SANS};font-size:24px;letter-spacing:.34em;text-transform:uppercase;color:${GOLD};font-weight:700;margin-bottom:16px;}
.rule{height:2px;width:70px;background:${GOLD};border-radius:2px;box-shadow:0 1px 10px rgba(0,0,0,.45);${ruleMargin}}
h1{font-family:'Italiana',serif;font-weight:400;color:${PAPER};font-size:${titleSize}px;line-height:1.1;letter-spacing:.4px;text-shadow:0 2px 24px rgba(0,0,0,.6);}
h1 .accent{color:${ACC};font-style:italic;}
.sub{font-family:${SANS};font-size:29px;line-height:1.45;color:#E4DED2;margin-top:24px;font-weight:400;text-shadow:0 1px 10px rgba(0,0,0,.6);${P.align === 'center' ? 'max-width:760px;margin-left:auto;margin-right:auto;' : (P.align === 'right' ? 'margin-left:auto;max-width:680px;' : 'max-width:720px;')}}
.cta{font-family:${SANS};font-size:28px;letter-spacing:.05em;color:${ACC};margin-top:26px;font-weight:600;text-shadow:0 1px 10px rgba(0,0,0,.6);}
.chip{display:inline-block;border:1px solid rgba(201,165,120,.7);color:#EADFCF;padding:10px 20px;font-family:${SANS};font-size:23px;letter-spacing:.1em;border-radius:3px;margin-top:26px;font-weight:600;}
.site{position:absolute;font-family:${SANS};font-size:25px;letter-spacing:.24em;color:${LIGHT};opacity:.92;${P.site}text-shadow:0 1px 10px rgba(0,0,0,.6);}
.num{position:absolute;top:80px;right:80px;font-family:${SANS};font-size:25px;letter-spacing:.2em;color:${GOLD};font-weight:700;}
</style></head><body>
<div class="canvas"><div class="bg"></div><div class="veil"></div>
<img class="logo" src="file://${logoFile}">${number}
<div class="tb">${eyebrow}<div class="rule"></div>${title}${chip}${sub}${cta}</div>${site}
</div></body></html>`;
}

async function render(cfg) {
  const pos = (cfg.position || 'BL').toUpperCase();
  const P = posConf(pos) || posConf('BL');
  const brand = (cfg.brand || 'iconicwall').toLowerCase();
  const set = LOGOS[brand] || LOGOS.iconicwall;
  let color = (cfg.logo || 'auto').toLowerCase();
  const localImage = !/^https?:/i.test(String(cfg.image || ''));
  if (color !== 'white' && color !== 'black') {
    color = localImage ? await autoLogoColor(cfg.image, P.logoTop) : 'white';
  }
  const logoPath = set[color] || set.white;

  const html = buildHtml(cfg, logoPath);
  const hp = path.join(os.tmpdir(), 'post_' + process.pid + '_' + Math.floor(Math.random() * 1e9) + '.html');
  fs.writeFileSync(hp, html);
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const p = await b.newPage({ viewport: { width: W, height: Hh }, deviceScaleFactor: 2 });
    await p.goto('file://' + hp, { waitUntil: 'load' });
    await p.waitForTimeout(localImage ? 700 : 3500);
    const png = await p.screenshot({ clip: { x: 0, y: 0, width: W, height: Hh } });
    const jpg = await sharp(png).resize(1080, 1350, { kernel: 'lanczos3' }).sharpen({ sigma: 1.2, m1: 0, m2: 1.0 }).jpeg({ quality: 92 }).toBuffer();
    return jpg;
  } finally {
    await b.close();
    fs.unlink(hp, () => {});
  }
}

module.exports = { render, buildHtml };
