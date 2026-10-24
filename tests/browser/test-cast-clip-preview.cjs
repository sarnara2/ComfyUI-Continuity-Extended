// Actual Cast target-menu owner, shared DOM/state/reference viewer and ordered
// production CSS in isolated offline Chrome. Synthetic media/metadata stay in
// RAM; no live ComfyUI, user profile, workflow/media write, model or GPU work.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const repo = process.env.CONTINUITY_SOURCE_ROOT ? path.resolve(process.env.CONTINUITY_SOURCE_ROOT) : path.resolve(__dirname, '../..');
const root = path.join(repo, 'web/creator');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const method = (name, text) => {
  const found = text.match(new RegExp(`^  (?:async )?${name}\\([^]*?^  \\}`, 'm'));
  assert.ok(found, 'Actual owner ' + name); return found[0];
};
const fn = (name, text) => {
  const found = text.match(new RegExp(`^(?:export )?function ${name}\\([^]*?^\\}`, 'm'));
  assert.ok(found, 'Actual function ' + name); return found[0].replace(/^export /, '');
};
const cast = read('cast.js');
const baseline = process.env.CONTINUITY_CAST_CLIP_BASELINE_DIR
  ? path.resolve(process.env.CONTINUITY_CAST_CLIP_BASELINE_DIR) : path.resolve(repo, '../baseline');
const original = fs.readFileSync(path.join(baseline, 'web/creator/cast.js'), 'utf8');
for (const name of ['placeRow', 'viewRolePreview', 'rolePreview', 'addRole', 'clearRole']) {
  assert.equal(method(name, cast), method(name, original), 'Existing owner unchanged: ' + name);
}
const originalPick = method('pickPlace', original);
const currentPick = method('pickPlace', cast);
const previewLead = `          preview: (pop, pick) => previewable(assetThumb(asset, "mmc-cast-menu-thumb"), {\n            title: t("{path} — double-click to view", { path: asset.filename }),\n            click: pick,\n            open: (returnFocus) => this.viewRolePreview(asset, pop, returnFocus),\n          }),`;
const normalise = text => text.replace(/\r\n/g, '\n');
assert.equal(normalise(currentPick).replace(previewLead, '          lead: assetThumb(asset, "mmc-cast-menu-thumb"),'), normalise(originalPick),
  'Target choice/check/add/clear/inherit/save closure is byte-exact after only replacing its thumbnail adapter');

const styles = read('styles.js');
const imports = Object.fromEntries([...styles.matchAll(/import \{ css as (\w+) \} from "\.\/styles\/(\w+)\.js";/g)].map(match => [match[1], match[2]]));
const order = styles.match(/const CSS = \[([^]*?)\]\.join\(""\);/)[1].replace(/\/\/[^\n]*/g, '').split(',').map(name => name.trim()).filter(Boolean);
const css = order.map(name => read('styles/' + imports[name] + '.js').match(/export const css = `([^]*)`;\s*$/)[1]).join('\n');
assert.equal(order.length, 23, 'Complete production cascade, not a substitute stylesheet');
const catalogRun = spawnSync(process.env.CONTINUITY_PYTHON || 'python', ['-B', '-c',
  "import sys;sys.path.insert(0,sys.argv[1]+'/tests');import layout;print(layout.catalog_json())", repo],
  { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1' } });
assert.equal(catalogRun.status, 0, catalogRun.stderr || catalogRun.stdout);
const catalog = JSON.parse(catalogRun.stdout.split(/\r?\n/).find(line => line.startsWith('{')));
const sources = {};
const collect = name => {
  if (Object.hasOwn(sources, name)) return;
  if (name === 'api.js') {
    sources[name] = `export function viewUrl(filename, options) { window.urlCalls.push({filename, options}); return filename.includes('bad-media') ? window.badMediaUrl : /(?:\\.png|^refmod:)/.test(filename) ? window.imageUrl : window.videoUrl; }
export async function probe(filename) { window.probeCalls.push(filename); return {missing:false}; }
export function isFramed(crop) { return Boolean(crop && (crop.turn || crop.mirror || (crop.w ?? 1) < 1 || (crop.h ?? 1) < 1 || (crop.x ?? 0) > 0 || (crop.y ?? 0) > 0)); }`;
    return;
  }
  const text = read(name); sources[name] = text;
  for (const match of text.matchAll(/(?:from\s*|import\s*\()(["'])(\.\/[^"']+)\1/g)) {
    collect(path.posix.normalize(path.posix.join(path.posix.dirname(name), match[2])));
  }
};
for (const name of ['state.js', 'dom.js', 'i18n.js', 'reference-preview.js']) collect(name);
const inRole = cast.slice(cast.indexOf('const inRole ='), cast.indexOf(';', cast.indexOf('const inRole =')) + 1);
assert.ok(inRole.startsWith('const inRole ='));
const adapter = `
const {el, icon, placeNear, dismissable, closeOwnedPopovers}=D;
const {t}=I;const {previewable, openReferencePreview}=V;
const {viewUrl}=await import(moduleUrls['api.js']);
const LIST_ROLES=new Set(["from","motion","replaces"]);
${inRole}
${fn('assetThumb', cast)}
${fn('openMenu', cast)}
class CastOwner {
  ${['placeRow', 'pickPlace', 'viewRolePreview', 'rolePreview', 'addRole', 'clearRole'].map(name => method(name, cast)).join('\n')}
  constructor(){this.saves=0;this.touches=0;this.blurs=0;}
  getAssets(){return assets;}touch(){this.touches++;}renderSoon(){this.blurs++;}save(){this.saves++;}
}
window.closeFixture=()=>{
  if(window.fixtureHost)closeOwnedPopovers(fixtureHost);
  window.unmountFixture?.();window.unmountFixture=null;
  fixtureHost?.remove();window.fixtureHost=null;
};
window.mountCastClip=(options={})=>{
  closeFixture();window.language=options.language||'en';
  document.documentElement.style.setProperty('--mmc-type',String(options.scale||1));
  window.owner=new CastOwner();window.subject={handle:'subject',from:['portrait'],replaces:['ref-1'],replaces_what:'Person at the counter',notes:{'ref-1':'Keep these words'}};
  window.sibling={handle:'other',from:['other-portrait'],replaces:['ref-5'],replaces_what:'Sibling target'};
  window.assets=[
    {handle:'ref-1',kind:'video',takes:'edit',filename:'continuity/imports/source-original.mp4',trim:{start:3,end:5},crop:{x:.1,y:.1,w:.7,h:.7,turn:90,mirror:'h'}},
    {handle:'ref-4',kind:'video',takes:'continue',filename:'continuity/imports/another-source.mp4'},
    {handle:'ref-5',kind:'video',takes:'edit',filename:'continuity/imports/final-source.mp4'},
    {handle:'audio-only',kind:'video',takes:'edit',track:'sound',filename:'audio-source.mp4'},
    {handle:'action-only',kind:'video',takes:'motion',filename:'action-source.mp4'},
    {handle:'portrait',kind:'image',takes:'person',filename:'portrait.png'},
  ];
  if(options.bad)assets[1].filename='bad-media.mp4';
  if(options.refmod)assets[1].filename='refmod:stored-preview.png';
  if(options.many)assets.push(...Array.from({length:21},(_,index)=>({handle:'ref-'+(index+20),kind:'video',takes:index%2?'continue':'edit',filename:'continuity/imports/'+('long-folder-name/'.repeat(9))+'source-'+index+'.mp4'})));
  if(options.long)assets[0].filename='continuity/imports/'+('unbroken_filename_'.repeat(15))+'.mp4';
  window.prompt='Keep @subject in @ref-1. Sibling is @other.';window.savedWorkflow='RAM-only saved workflow';
  window.fixtureHost=el('div',{class:'mmc-root cast-preview-fixture'});
  const section=el('section',{class:'mmc-tl-section-body'},[el('div',{class:'mmc-cast-card open'},[el('div',{class:'mmc-cast-ident'},owner.placeRow(subject))])]);
  fixtureHost.append(section);
  if(options.mode==='timeline'){
    const modal=el('div',{class:'mmc-modal mmc-tl-modal'},[el('div',{class:'mmc-tl-body'},[fixtureHost])]);
    const overlay=el('div',{class:'mmc-overlay fixture-parent-overlay'},[modal]);window.unmountFixture=D.mountOverlay(overlay,()=>{window.parentCloses++;closeFixture();});
  }else document.body.append(fixtureHost);
  window.anchor=fixtureHost.querySelector('.mmc-cast-place-clip');
  Object.assign(anchor.style,{position:'fixed',left:(options.edge==='right'?innerWidth-105:24)+'px',top:'110px'});
  window.urlCalls=[];window.probeCalls=[];window.parentCloses=0;
  return snapshot();
};
window.snapshot=()=>JSON.stringify({subject,sibling,assets,prompt,savedWorkflow,saves:owner.saves,touches:owner.touches});
window.openTarget=()=>anchor.click();
window.rowFor=handle=>[...document.querySelectorAll('.mmc-cast-clip-option')].find(row=>row.querySelector('.mmc-cast-menu-text > span')?.textContent==='@'+handle);
window.thumbFor=handle=>rowFor(handle)?.querySelector('.mmc-cast-menu-thumb');
window.pickFor=handle=>rowFor(handle)?.querySelector('.mmc-opt');
window.openOrdinary=()=>openMenu(anchor,{title:'Ordinary role menu',sections:[{rows:[{lead:assetThumb(assets[0],'mmc-cast-menu-thumb'),label:'@ref-1',note:'ordinary source',checked:true,onPick:()=>{window.ordinaryPicks++;}},{label:'Disabled role',disabled:true,onPick:()=>{window.disabledPicks++;}}]}]});
window.ordinaryPicks=0;window.disabledPicks=0;
`;
let browser, requests = 0;
const errors = [], checks = [], layouts = [];
const check = async (name, run) => { await run(); checks.push(name); console.log('PASS ' + name); };
const output = path.resolve(process.env.CONTINUITY_ARTIFACT_DIR || process.env.CONTINUITY_UX_SCREENSHOT_DIR || path.join(os.tmpdir(), 'continuity-cast-clip-preview'));
(async () => {
  fs.mkdirSync(output, { recursive: true });
  browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => { requests++; return route.abort(); });
  await page.setContent(`<style>${css}:root{--comfy-menu-bg:#171717;--fg-color:#ddd;--input-text:#ddd;--bg-color:#202020;--descrip-text:#999}html,body{margin:0;overflow:hidden}body{background:#171717;color:#ddd}.cast-preview-fixture{max-width:900px;margin:30px;padding:12px}</style><button id="outside">Outside</button>`);
  await page.evaluate(async ({ sources, catalog }) => {
    window.app = { extensionManager: { setting: { get: key => key === 'Comfy.Locale' ? window.language : null } } };
    window.language = 'en'; window.__MMC_FAMILIES = catalog;
    window.urlCalls = []; window.probeCalls = [];
    const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 72;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#4479a8'; ctx.fillRect(0, 0, 128, 72);
    window.imageUrl = canvas.toDataURL();
    const parts = [], stream = canvas.captureStream(12), recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    recorder.ondataavailable = event => parts.push(event.data);
    const stopped = new Promise(resolve => recorder.onstop = resolve);
    recorder.start(); let frame = 0;
    const ticker = setInterval(() => { ctx.fillStyle = ++frame % 2 ? '#4479a8' : '#a84479'; ctx.fillRect(0, 0, 128, 72); }, 45);
    await new Promise(resolve => setTimeout(resolve, 650)); clearInterval(ticker); recorder.stop(); await stopped;
    stream.getTracks().forEach(track => track.stop());
    window.videoUrl = URL.createObjectURL(new Blob(parts, { type: 'video/webm' }));
    window.badMediaUrl = URL.createObjectURL(new Blob(['unsupported'], { type: 'video/webm' }));
    const urls = {};
    const build = name => {
      if (urls[name]) return urls[name];
      const code = sources[name].replace(/(from\s*|import\s*\()(["'])(\.\/[^"']+)\2/g, (whole, prefix, quote, relative) => {
        const parts = name.split('/'); parts.pop();
        for (const part of relative.split('/')) { if (part === '.' || !part) continue; if (part === '..') parts.pop(); else parts.push(part); }
        return prefix + quote + build(parts.join('/')) + quote;
      });
      return urls[name] = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    };
    window.moduleUrls = urls;
    window.S = await import(build('state.js')); window.D = await import(build('dom.js'));
    window.I = await import(build('i18n.js')); window.V = await import(build('reference-preview.js'));
    window.fixtureHost = null;
  }, { sources, catalog });
  await page.evaluate(`(async()=>{${adapter}})()`);
  const menu = () => page.locator('.mmc-cast-clip-menu');
  const thumb = handle => page.locator('.mmc-cast-clip-option').filter({ has: page.locator('.mmc-cast-menu-text > span:first-child', { hasText: new RegExp('^@' + handle + '$') }) }).locator('.mmc-cast-menu-thumb');
  const choice = handle => page.locator('.mmc-cast-clip-option').filter({ has: page.locator('.mmc-cast-menu-text > span:first-child', { hasText: new RegExp('^@' + handle + '$') }) }).locator('.mmc-opt');
  const reset = async (options = {}) => { const before = await page.evaluate(options => mountCastClip(options), options); await page.evaluate(() => openTarget()); await page.waitForTimeout(35); return before; };
  const snapshot = () => page.evaluate(() => snapshot());
  const waitSingle = () => page.waitForTimeout(320);
  const closeViewer = async () => { await page.keyboard.press('Escape'); await page.locator('.mmc-reference-preview').waitFor({ state: 'detached' }); };

  await check('Opt-in target menu has independent thumbnail and choice siblings, matching eligible source clips and original checks', async () => {
    const before = await reset({ language: 'ko' });
    const value = await page.evaluate(() => ({ handles: [...document.querySelectorAll('.mmc-cast-clip-option .mmc-cast-menu-text > span:first-child')].map(n => n.textContent),
      checked: [...document.querySelectorAll('.mmc-cast-clip-option .mmc-opt')].map(n => n.getAttribute('aria-checked')),
      children: [...document.querySelectorAll('.mmc-cast-clip-option')].map(n => [...n.children].map(c => [c.tagName, c.getAttribute('role')])) }));
    assert.deepEqual(value.handles, ['@ref-1', '@ref-4', '@ref-5']);
    assert.deepEqual(value.checked, ['true', 'false', 'false']);
    assert.deepEqual(value.children, Array(3).fill([['SPAN', 'button'], ['BUTTON', null]]));
    assert.equal(await page.locator('.mmc-cast-clip-menu button button,.mmc-cast-clip-menu button [role="button"]').count(), 0);
    assert.equal(await snapshot(), before);
    assert.equal(await page.locator('.mmc-reference-preview').count(), 0);
    await page.screenshot({ path: path.join(output, 'target-clip-picker-ko.png') });
  });
  await check('Single choice and radio clicks retain exact target-only add/remove/inherit/save behavior', async () => {
    await reset(); const siblingBefore = await page.evaluate(() => JSON.stringify(sibling));
    await choice('ref-4').click();
    assert.deepEqual(await page.evaluate(() => [subject.replaces, owner.saves, assets[1].takes, JSON.stringify(sibling)]), [['ref-1', 'ref-4'], 1, 'continue', siblingBefore]);
    assert.equal(await menu().count(), 0); assert.equal(await page.locator('.mmc-reference-preview').count(), 0);
    await page.evaluate(() => openTarget()); await choice('ref-1').locator('.mmc-radio').click();
    assert.deepEqual(await page.evaluate(() => [subject.replaces, owner.saves, subject.notes, subject.replaces_what]), [['ref-4'], 2, undefined, 'Person at the counter']);
    await page.evaluate(() => openTarget()); await choice('ref-4').click();
    assert.deepEqual(await page.evaluate(() => [subject.replaces ?? null, owner.saves, subject.replaces_what ?? null, JSON.stringify(sibling)]), [null, 3, null, siblingBefore]);
  });
  await check('Single thumbnail click selects exactly once only after the shared double-click window', async () => {
    const before = await reset(); await thumb('ref-4').click();
    assert.equal(await snapshot(), before); assert.equal(await menu().count(), 1);
    await waitSingle();
    assert.deepEqual(await page.evaluate(() => [subject.replaces, owner.saves]), [['ref-1', 'ref-4'], 1]);
    assert.equal(await menu().count(), 0); assert.equal(await page.locator('.mmc-reference-preview').count(), 0);
  });
  await check('Native thumbnail double-click previews the original video without selection, trim/crop/mirror/autoplay or commits', async () => {
    const before = await reset(); await thumb('ref-1').dblclick();
    await page.waitForFunction(() => document.querySelector('.mmc-reference-preview video')?.readyState >= 1);
    await waitSingle(); assert.equal(await snapshot(), before);
    const value = await page.evaluate(() => { const video = document.querySelector('.mmc-reference-preview video'); return { controls: video.controls, autoplay: video.autoplay, paused: video.paused,
      current: video.currentTime, call: { filename: urlCalls.at(-1).filename, options: urlCalls.at(-1).options ?? null }, note: document.querySelector('.mmc-reference-preview-note').textContent,
      visibility: getComputedStyle(document.querySelector('.mmc-cast-clip-menu')).visibility, pointer: getComputedStyle(document.querySelector('.mmc-cast-clip-menu')).pointerEvents,
      selected: [...document.querySelectorAll('.mmc-cast-clip-menu .mmc-opt')].map(n => n.getAttribute('aria-checked')) }; });
    assert.deepEqual([value.controls, value.autoplay, value.paused, value.current], [true, false, true, 0]);
    assert.deepEqual(value.call, { filename: 'continuity/imports/source-original.mp4', options: null });
    assert.match(value.note, /Source video preview/); assert.match(value.note, /Configured range: 3–5 s/);
    assert.equal(value.visibility, 'hidden'); assert.equal(value.pointer, 'none');
    assert.deepEqual(value.selected, ['true', 'false', 'false']);
    await page.screenshot({ path: path.join(output, 'target-clip-original-video-preview.png') });
    await closeViewer(); assert.equal(await snapshot(), before);
    assert.equal(await thumb('ref-1').evaluate(n => n === document.activeElement), true);
    assert.equal(await menu().evaluate(n => getComputedStyle(n).visibility), 'visible');
  });
  await check('Unchecked double-click keeps source choice, sibling, notes and prompt unchanged; then a new thumbnail single click selects only itself', async () => {
    const before = await reset(); await thumb('ref-4').dblclick(); await waitSingle(); assert.equal(await snapshot(), before);
    await closeViewer(); await thumb('ref-5').click(); await waitSingle();
    assert.deepEqual(await page.evaluate(() => [subject.replaces, owner.saves, prompt, sibling.replaces]), [['ref-1', 'ref-5'], 1, 'Keep @subject in @ref-1. Sibling is @other.', ['ref-5']]);
  });
  await check('Thumbnail Enter chooses; Space previews and returns focus; repeated Space cannot stack viewers or select', async () => {
    await reset(); await thumb('ref-4').focus(); await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate(() => [subject.replaces, owner.saves]), [['ref-1', 'ref-4'], 1]);
    const before = await reset(); await thumb('ref-5').focus(); await page.keyboard.press('Space');
    assert.equal(await page.locator('.mmc-reference-preview').count(), 1); assert.equal(await snapshot(), before);
    await page.evaluate(() => thumbFor('ref-5').dispatchEvent(new KeyboardEvent('keydown', { key: ' ', repeat: true, bubbles: true })));
    assert.equal(await page.locator('.mmc-reference-preview').count(), 1); await closeViewer();
    assert.equal(await thumb('ref-5').evaluate(n => n === document.activeElement), true); assert.equal(await snapshot(), before);
  });
  await check('Delayed single choice is inert after Escape/outside close/owner fold, and cannot change a fresh menu', async () => {
    for (const action of ['escape', 'outside', 'fold', 'fresh']) {
      const before = await reset(); await thumb('ref-4').click();
      if (action === 'escape') await page.keyboard.press('Escape');
      if (action === 'outside') await page.locator('#outside').click();
      if (action === 'fold') await page.evaluate(() => D.closeOwnedPopovers(fixtureHost.querySelector('.mmc-tl-section-body')));
      if (action === 'fresh') { await page.keyboard.press('Escape'); await page.evaluate(() => openTarget()); }
      await waitSingle(); assert.equal(await snapshot(), before, action);
      assert.equal(await menu().count(), action === 'fresh' ? 1 : 0, action);
    }
  });
  await check('Viewer close and backdrop dismiss only the viewer, stop/unload playing media, and preserve menu scroll/checks', async () => {
    for (const action of ['button', 'backdrop']) {
      const before = await reset({ many: true });
      await page.evaluate(() => thumbFor('ref-25').scrollIntoView({ block: 'center' }));
      const top = await menu().evaluate(n => n.scrollTop); assert.ok(top > 0);
      await thumb('ref-25').dblclick(); await page.waitForFunction(() => document.querySelector('.mmc-reference-preview video')?.readyState >= 1);
      const media = await page.locator('.mmc-reference-preview video').elementHandle();
      await media.evaluate(video => video.play()); assert.equal(await media.evaluate(video => video.paused), false);
      if (action === 'button') await page.locator('.mmc-reference-preview .mmc-close').click();
      else await page.locator('.mmc-reference-preview-overlay').click({ position: { x: 2, y: 2 } });
      assert.deepEqual(await media.evaluate(video => [video.paused, video.getAttribute('src'), video.isConnected]), [true, null, false]);
      assert.equal(await menu().count(), 1); assert.ok(Math.abs(await menu().evaluate(n => n.scrollTop) - top) <= 1);
      assert.equal(await snapshot(), before);
      if (action === 'button') assert.equal(await thumb('ref-25').evaluate(n => n === document.activeElement), true);
      // Existing viewer backdrop closes on pointerdown. The remaining native
      // mousedown may focus body; Escape/close-button restoration is tested.
      else assert.equal(await page.evaluate(() => document.activeElement === document.body), true);
    }
  });
  await check('Timeline nested Escape closes viewer first, target menu next, and the parent only on the third Escape', async () => {
    const before = await reset({ mode: 'timeline' }); await thumb('ref-4').dblclick();
    const topmost = await page.locator('.mmc-reference-preview .mmc-close').evaluate(node => { const r = node.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === node; });
    assert.equal(topmost, true, 'Native viewer close is not occluded by its suspended picker');
    await closeViewer(); assert.equal(await menu().count(), 1); assert.equal(await page.locator('.fixture-parent-overlay').count(), 1); assert.equal(await snapshot(), before);
    await page.keyboard.press('Escape'); assert.equal(await menu().count(), 0); assert.equal(await page.locator('.fixture-parent-overlay').count(), 1);
    await page.keyboard.press('Escape'); assert.equal(await page.locator('.fixture-parent-overlay').count(), 0); assert.equal(await page.evaluate(() => parentCloses), 1);
  });
  await check('Explicit section ownership cleanup closes both active viewer and picker and unloads its media idempotently', async () => {
    const before = await reset({ mode: 'timeline' }); await thumb('ref-4').dblclick();
    const media = await page.locator('.mmc-reference-preview video').elementHandle();
    await page.evaluate(() => { const section = fixtureHost.querySelector('.mmc-tl-section-body'); D.closeOwnedPopovers(section); D.closeOwnedPopovers(section); });
    assert.deepEqual(await media.evaluate(video => [video.paused, video.getAttribute('src'), video.isConnected]), [true, null, false]);
    assert.equal(await menu().count(), 0); assert.equal(await page.locator('.mmc-reference-preview').count(), 0); assert.equal(await snapshot(), before);
    assert.equal(await page.locator('.fixture-parent-overlay').count(), 1);
  });
  await check('Existing snapshot-based source identity and RefMod still rendering are reused, without introducing new source resolvers', async () => {
    await reset(); await page.evaluate(() => { assets[1].filename = 'replacement-source.mp4'; });
    const before = await snapshot(); await thumb('ref-4').dblclick();
    assert.equal(await page.evaluate(() => urlCalls.at(-1).filename), 'replacement-source.mp4'); assert.equal(await snapshot(), before); await closeViewer();
    const refmodBefore = await reset({ refmod: true }); await thumb('ref-4').dblclick();
    assert.equal(await page.locator('.mmc-reference-preview-stage img').count(), 1); assert.equal(await page.locator('.mmc-reference-preview-stage video').count(), 0);
    assert.match(await page.locator('.mmc-reference-preview-note').textContent(), /RefMod preview image/); assert.equal(await snapshot(), refmodBefore); await closeViewer();
  });
  await check('Unsupported clip uses the existing cancellable error viewer and never selects or saves', async () => {
    const before = await reset({ bad: true }); await thumb('ref-4').dblclick();
    await page.locator('.mmc-reference-preview-error').waitFor({ state: 'visible' });
    assert.match(await page.locator('.mmc-reference-preview-error').textContent(), /Preview unavailable/); assert.equal(await snapshot(), before);
    await closeViewer(); assert.equal(await menu().count(), 1); assert.equal(await snapshot(), before);
  });
  await check('Ordinary Cast menus retain their original 290–340px cap, 30px lead, immediate choice and disabled option behavior', async () => {
    await page.evaluate(() => mountCastClip()); await page.evaluate(() => openOrdinary()); await page.waitForTimeout(35);
    const pop = page.locator('.mmc-cast-menu');
    const geometry = await pop.evaluate(n => ({ width: n.getBoundingClientRect().width, min: getComputedStyle(n).minWidth, max: getComputedStyle(n).maxWidth, thumb: n.querySelector('.mmc-cast-menu-thumb').getBoundingClientRect().width }));
    assert.equal(await menu().count(), 0); assert.equal(geometry.min, '290px'); assert.equal(geometry.max, '340px'); assert.equal(geometry.thumb, 30); assert.ok(geometry.width <= 358);
    await pop.locator('.mmc-opt:disabled').dispatchEvent('click'); assert.equal(await page.evaluate(() => disabledPicks), 0); assert.equal(await pop.count(), 1);
    await pop.locator('.mmc-opt').first().click(); assert.equal(await page.evaluate(() => ordinaryPicks), 1); assert.equal(await pop.count(), 0);
  });
  await check('Target-only 420px menu, 480px scroll cap and 38px thumbnails fit node and Timeline hosts at all widths/locales/scales', async () => {
    for (const width of [320, 640, 1600]) for (const language of ['en', 'ko', 'ja', 'zh']) for (const scale of [.8, 1, 1.6]) for (const mode of ['node', 'timeline']) {
      await page.setViewportSize({ width, height: 700 });
      const before = await reset({ language, scale, mode, edge: 'right', many: true, long: true });
      const got = await menu().evaluate(n => { const r = n.getBoundingClientRect(), rect = node => { const b = node.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height }; };
        const rows = [...n.querySelectorAll('.mmc-cast-clip-option')].map(row => ({ row: rect(row), thumb: rect(row.firstElementChild), option: rect(row.lastElementChild), radio: rect(row.querySelector('.mmc-radio')), label: rect(row.querySelector('.mmc-opt-label')) }));
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height, overflowX: n.scrollWidth > n.clientWidth + 1, overflowY: n.scrollHeight > n.clientHeight, rows,
          docOverflow: document.documentElement.scrollWidth > innerWidth + 1 }; });
      const detail = JSON.stringify({ width, language, scale, mode, got });
      assert.ok(Math.abs(got.width - Math.min(420, width - 16)) < 1, detail); assert.ok(Math.abs(got.height - 480) < 1, detail);
      assert.ok(got.left >= 7.9 && got.right <= width - 7.9 && got.top >= 7.9 && got.bottom <= 692.1, detail);
      assert.equal(got.overflowX, false, detail); assert.equal(got.docOverflow, false, detail); assert.equal(got.overflowY, true, detail);
      assert.equal(got.rows.length, 24, detail);
      for (const row of got.rows) { assert.equal(row.thumb.width, 38, detail); assert.equal(row.thumb.height, 38, detail); assert.ok(row.thumb.right + 9.9 <= row.option.left, detail); assert.ok(row.radio.right <= got.right - 8 && row.label.right <= got.right - 8, detail); }
      assert.equal(await snapshot(), before, detail); layouts.push({ width, language, scale, mode });
      if (width === 640 && language === 'ko' && scale === 1.6 && mode === 'timeline') await page.screenshot({ path: path.join(output, 'target-clip-picker-ko-large-timeline.png') });
    }
  });
  await page.evaluate(() => closeFixture());
  assert.equal(await page.locator('.mmc-cast-menu,.mmc-reference-preview,.fixture-parent-overlay').count(), 0);
  assert.equal(requests, 0); assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ sourceRoot: repo, checks, layouts, requests, errors, cssChunks: order.length,
    proof: 'Offline actual-source Chrome with RAM media/metadata; not a live ComfyUI/model/render test' }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, layouts: layouts.length, requests, errors: errors.length }));
})().finally(async () => { await browser?.close(); }).catch(error => { console.error(error); process.exitCode = 1; });
