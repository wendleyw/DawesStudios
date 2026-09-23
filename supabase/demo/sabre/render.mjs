/** Render editable campaign layouts around the original generated photography. */
import { chromium } from '../../../apps/web/node_modules/playwright/index.mjs';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const output = path.join(root, 'supabase/.local/sabre-demo/rendered');
const jobs = JSON.parse(await readFile(process.argv[2], 'utf8'));
const recipe = await readFile(fileURLToPath(import.meta.url));
const escape = (s = '') => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const photos = new Map();
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
const results = {};
try {
  for (const job of jobs) {
    if (!/^[a-z0-9-]+$/.test(job.key)) throw new Error('Invalid demo artwork key.');
    if (!photos.has(job.image)) photos.set(job.image, await readFile(path.join(here, 'assets', `${job.image}.png`)));
    const photo = photos.get(job.image);
    const digest = createHash('sha256').update(recipe).update(photo).update(JSON.stringify(job)).digest('hex').slice(0, 14);
    const stem = path.join(output, `${job.key}-${digest}`);
    const png = `${stem}.png`;
    const pdf = job.document ? `${stem}.pdf` : null;
    const video = job.motion ? `${stem}.mp4` : null;
    let ready = true;
    for (const file of [png, pdf, video].filter(Boolean)) {
      try { await access(file); } catch { ready = false; }
    }
    if (!ready) {
      const { width: w, height: h } = job;
      const ratio = w / h;
      const narrow = ratio < 0.7;
      const wide = ratio > 1.5;
      const layout = job.layout || (wide ? 'split' : (job.variant % 3 === 1 ? 'photo' : 'editorial'));
      const base = Math.min(w, h);
      const pad = Math.round(base * 0.055);
      const ink = job.variant % 4 === 2 ? '#422f2a' : '#143b30';
      const accent = job.variant % 4 === 2 ? '#dfbca6' : '#b9ccb1';
      const titleSize = Math.round(base * (wide ? 0.09 : 0.088));
      const photoUrl = `data:image/png;base64,${photo.toString('base64')}`;
      const header = `<header><strong>SABRE<span>EVERYDAY CONFIDENCE</span></strong><small>${escape(job.campaign.toUpperCase())}</small></header>`;
      const copy = `<section class="copy"><span class="eyebrow">${escape(job.eyebrow || job.campaign)}</span><h1>${escape(job.headline).replaceAll('\n','<br>')}</h1><p>${escape(job.body)}</p><span class="cta">${escape(job.cta || 'Explore the collection')} <b>↗</b></span></section>`;
      const footer = `<footer><span>Thoughtfully part of your day.</span><span>DEMO CONCEPT · ${String(job.number).padStart(2,'0')}</span></footer>`;
      const detail = `<div class="detail"><span>01 / CONSIDERED DESIGN</span><strong>Made for everyday moments.</strong><p>A familiar routine. A thoughtful detail. Explore a calm, considered point of view.</p></div>`;
      let markup;
      if (layout === 'web') markup = `${header}<nav>Everyday essentials <span>Our story</span><span>Discover more ↗</span></nav><div class="web-hero"><img src="${photoUrl}">${copy}</div><div class="web-bottom">${detail}<img src="${photoUrl}" class="detail-photo"></div>${footer}`;
      else if (layout === 'email') markup = `${header}<img class="email-photo" src="${photoUrl}">${copy}<div class="email-body">${detail}<div class="email-signoff">A little inspiration for what comes next.<br>Your SABRE team</div></div>${footer}`;
      else if (layout === 'guide') markup = `${header}<div class="guide-title"><span class="eyebrow">${escape(job.eyebrow || 'Creative direction')}</span><h1>${escape(job.headline).replaceAll('\n','<br>')}</h1><p>${escape(job.body)}</p></div><img class="guide-photo" src="${photoUrl}"><div class="guide-notes"><div><small>01 / VISUAL LANGUAGE</small><p>Natural light. Honest texture. Room to breathe.</p></div><div class="swatches"><i></i><i></i><i></i><i></i></div></div>${footer}`;
      else markup = `${header}<img class="hero-photo" src="${photoUrl}">${copy}${footer}`;
      await page.setViewportSize({ width: w, height: h });
      await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
        *{box-sizing:border-box}html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden}body{font-family:Arial,Helvetica,sans-serif;background:#f4f0e7;color:${ink};position:relative}header{position:absolute;z-index:2;left:${pad}px;right:${pad}px;top:${pad}px;display:flex;justify-content:space-between;align-items:flex-start}header strong{font-size:${base*.04}px;letter-spacing:-.04em}header strong span{display:block;font-size:${base*.008}px;letter-spacing:.15em;margin-top:${base*.004}px}header small{font-size:${base*.013}px;letter-spacing:.1em;max-width:35%;text-align:right;line-height:1.5}img{object-fit:cover}h1{font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:${titleSize}px;line-height:1.03;letter-spacing:-.047em;margin:${base*.025}px 0}p{font-size:${base*.024}px;line-height:1.5;max-width:88%;margin:${base*.025}px 0}.eyebrow{font-size:${base*.015}px;letter-spacing:.15em;text-transform:uppercase}.cta{display:inline-flex;align-items:center;gap:${base*.04}px;background:${ink};color:#f7f4ec;font-size:${base*.019}px;padding:${base*.016}px ${base*.022}px;border-radius:2px}.cta b{font-size:1.3em;font-weight:400}footer{position:absolute;bottom:${pad*.65}px;left:${pad}px;right:${pad}px;display:flex;justify-content:space-between;gap:10px;font-size:${base*.012}px;z-index:2}footer span:last-child{font-size:${base*.009}px;letter-spacing:.1em}.hero-photo{position:absolute}.copy{position:absolute;z-index:1}
        body.editorial .hero-photo{top:12%;left:${pad}px;width:calc(100% - ${pad*2}px);height:48%;border-radius:${base*.006}px}body.editorial .copy{left:${pad}px;right:${pad}px;top:64%}body.editorial h1{font-size:${titleSize*(narrow?1.0:.85)}px;margin-top:${base*.015}px}body.editorial .copy p{font-size:${base*.022}px;margin:${base*.018}px 0}body.editorial .cta{padding:${base*.012}px ${base*.02}px}
        body.photo{background:${ink};color:#fff}body.photo .hero-photo{inset:0;width:100%;height:100%;filter:brightness(.83)}body.photo:after{content:'';position:absolute;inset:0;background:linear-gradient(0deg,rgba(5,30,22,.9),transparent 80%)}body.photo header,body.photo footer,body.photo .copy{z-index:2}body.photo .copy{left:${pad}px;right:${pad}px;bottom:10%}body.photo .cta{background:#f4f0e7;color:${ink}}
        body.split .hero-photo{right:0;top:0;width:50%;height:100%}body.split .copy{left:${pad}px;top:25%;width:43%}body.split header{right:54%}body.split header small{display:none}body.split footer{right:54%;font-size:${base*.014}px}body.split footer span:last-child{display:none}body.split h1{font-size:${titleSize}px}body.split p{font-size:${base*.025}px}
        body.web nav{position:absolute;top:10%;left:${pad}px;right:${pad}px;display:flex;gap:${pad}px;justify-content:flex-end;font-size:${base*.016}px;border-top:1px solid #b8c1b5;padding-top:${pad*.3}px}body.web .web-hero{position:absolute;top:17%;height:48%;left:${pad}px;right:${pad}px;display:grid;grid-template-columns:1fr 1fr;gap:${pad}px}body.web .web-hero>img{width:100%;height:100%;border-radius:4px;order:1}body.web .copy{position:static;align-self:center}body.web h1{font-size:${base*.07}px}body.web .web-bottom{position:absolute;left:${pad}px;right:${pad}px;top:70%;height:22%;display:grid;grid-template-columns:1fr 1fr;gap:${pad}px}body.web .detail-photo{width:100%;height:100%;object-position:center 68%;border-radius:4px}.detail>span,.guide-notes small{font-size:${base*.014}px;letter-spacing:.1em}.detail>strong{display:block;font-family:Georgia,serif;font-size:${base*.038}px;margin:${base*.016}px 0}.detail p{font-size:${base*.02}px}
        body.email .email-photo{position:absolute;top:10%;width:100%;height:37%;object-position:center 62%}body.email .copy{top:50%;left:${pad}px;right:${pad}px}body.email h1{font-size:${base*.095}px}body.email .email-body{position:absolute;top:76%;left:${pad}px;right:${pad}px;border-top:1px solid #b8c1b5;padding-top:${pad}px}.email-signoff{font-size:${base*.022}px;line-height:1.6;margin-top:${base*.035}px}body.email .email-body p{font-size:${base*.024}px}body.email footer{font-size:${base*.013}px}
        body.guide .guide-title{position:absolute;top:16%;left:${pad}px;right:${pad}px}.guide-title h1{font-size:${base*.09}px}.guide-photo{position:absolute;top:45%;left:${pad}px;width:calc(100% - ${pad*2}px);height:30%;object-position:center 65%}.guide-notes{position:absolute;top:79%;left:${pad}px;right:${pad}px;display:grid;grid-template-columns:1.4fr 1fr;gap:${pad}px}.guide-notes p{font-size:${base*.024}px}.swatches{display:flex;gap:6px;align-items:center}.swatches i{height:${base*.09}px;flex:1;background:${ink}}.swatches i:nth-child(2){background:${accent}}.swatches i:nth-child(3){background:#e2cabb}.swatches i:nth-child(4){background:#dbdacd}
        ${narrow && layout==='web' ? `body.web .web-hero{display:flex;flex-direction:column;height:58%;top:13%}body.web .web-hero>img{order:0;height:52%}body.web .copy{align-self:stretch}body.web h1{font-size:${base*.10}px}body.web .web-bottom{top:76%;height:17%;display:block}body.web .detail-photo{display:none}body.web p{font-size:${base*.033}px}body.web .cta{font-size:${base*.025}px}body.web nav{top:7%;font-size:${base*.024}px;gap:10px}body.web header small{display:none}body.web .eyebrow{font-size:${base*.021}px}`:''}
        @page{size:${w}px ${h}px;margin:0}
      </style></head><body class="${layout}">${markup}</body></html>`);
      await page.evaluate(async()=>{await Promise.all([...document.images].map(i=>i.decode()));await document.fonts.ready;});
      await page.evaluate(() => {
        const copy = document.querySelector('.copy');
        const footer = document.querySelector('footer');
        if (!copy || !footer || !document.body.classList.contains('editorial')) return;
        const available = footer.getBoundingClientRect().top - copy.getBoundingClientRect().top - 30;
        const height = copy.getBoundingClientRect().height;
        if (height > available) {
          copy.style.transformOrigin = 'top left';
          copy.style.transform = `scale(${available / height})`;
        }
      });
      await page.screenshot({ path: png, animations: 'disabled' });
      if(pdf) await page.pdf({ path:pdf, width:`${w}px`, height:`${h}px`, printBackground:true, preferCSSPageSize:true });
      if(video) execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-loop','1','-i',png,'-vf',`scale=1080:-2,zoompan=z='min(zoom+0.00015,1.05)':d=360:s=${w}x${h}:fps=24,format=yuv420p`,'-t','15','-c:v','libx264','-preset','ultrafast','-crf','25','-movflags','+faststart',video],{stdio:'pipe',timeout:120000});
    }
    results[job.key] = { png, pdf, video, width:job.width, height:job.height };
    if(Object.keys(results).length % 20===0) console.log(`Rendered ${Object.keys(results).length}/${jobs.length} campaign layouts.`);
  }
  await writeFile(path.join(output,'index.json'),JSON.stringify(results,null,2)+'\n');
  console.log(`Ready: ${Object.keys(results).length} campaign layouts.`);
} finally { await browser.close(); }
