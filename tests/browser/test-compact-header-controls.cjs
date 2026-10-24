// Real modules and all production CSS in an offline browser. Synthetic state
// only: no ComfyUI server, user data, image generation or model execution.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sourceRoot = process.env.CONTINUITY_SOURCE_ROOT ? path.resolve(process.env.CONTINUITY_SOURCE_ROOT) : path.resolve(__dirname, '../..');
const web = path.join(sourceRoot, 'web', 'creator');
const read = file => fs.readFileSync(path.join(web, file), 'utf8');
const catalogRun = spawnSync(process.env.PYTHON_EXECUTABLE_PATH || 'python', ['-c',
  "import sys;sys.path.insert(0,'tests');import layout;print(layout.catalog_json())"],
{ cwd: sourceRoot, encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1' } });
assert.equal(catalogRun.status, 0, catalogRun.stderr);
const catalog = JSON.parse(catalogRun.stdout.split(/\r?\n/).find(line => line.startsWith('{')));
const css = [...read('styles.js').matchAll(/import \{ css as \w+ \} from "\.\/styles\/(\w+)\.js";/g)]
  .map(match => read(`styles/${match[1]}.js`).match(/export const css = `([^]*)`;\s*$/)[1]).join('\n');
const report = { sourceRoot, results: [], measurements: [], errors: [], remote: [], failures: [] };
let browser;
(async () => {
  browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined,
    ignoreDefaultArgs: ['--hide-scrollbars'] });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.on('pageerror', error => report.errors.push(error.message));
  await page.addInitScript(({ catalog }) => {
    window.__MMC_FAMILIES = catalog;
    window.app = { extensionManager: { setting: { get: key => key === 'Comfy.Locale' ? (window.language || 'en') : undefined } } };
  }, { catalog });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'continuity.test') { report.remote.push(url.href); return route.abort(); }
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="dark-theme"><head><style>${css}
      :root{--comfy-menu-bg:#181819;--fg-color:#ddd;--input-text:#ddd;--descrip-text:#999;--bg-color:#202020;--primary-background:#0b8ce9;--destructive-background:#b33a3a;--error-text:#f44}
      body{margin:0;padding:20px;box-sizing:border-box;background:#171718}#host{width:1120px;max-width:100%;margin:auto}.fixture-root{padding:12px;box-sizing:border-box}
      </style></head><body><button id="outside">Outside</button><div id="host"></div></body></html>` });
    if (url.pathname === '/scripts/app.js') return route.fulfill({ contentType: 'text/javascript', body: 'export const app=globalThis.app;' });
    if (url.pathname === '/scripts/widgets.js') return route.fulfill({ contentType: 'text/javascript', body: 'export const ComfyWidgets={};' });
    if (url.pathname === '/scripts/api.js') return route.fulfill({ contentType: 'text/javascript', body: `export const api={apiURL:u=>u,
      addEventListener(){},removeEventListener(){},getUserData:async()=>({status:404,json:async()=>null}),storeUserData:async()=>({status:200}),deleteUserData:async()=>({status:204}),
      fetchApi:async u=>({ok:true,status:200,json:async()=>String(u).includes('root=refmods')?{assets:[{path:'refmod:fixture',source:'picture',mode:'encode',source_present:true,source_file:'fixture.png',grid:[1,16,16],tokens:4096}]}:{}})};` });
    if (url.pathname.startsWith('/web/creator/')) {
      const target = path.resolve(web, '.' + url.pathname.slice('/web/creator'.length));
      assert.ok(target.startsWith(web + path.sep));
      return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(target, 'utf8') });
    }
    if (url.pathname.includes('/view') || url.pathname.includes('/continuity/refmod')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#444"/></svg>' });
    return route.fulfill({ status: 404, body: '' });
  });
  await page.goto('http://continuity.test/');
  await page.evaluate(async () => {
    const { el } = await import('/web/creator/dom.js');
    const { clearButton } = await import('/web/creator/clear.js');
    const { CastShelf } = await import('/web/creator/cast.js');
    const { modRows } = await import('/web/creator/refmod.js');
    window.S = await import('/web/creator/state.js');
    window.make = (mode = '', scale = 1, language = 'en') => {
      window.shelf?.destroy?.();
      window.language = language;
      const host = document.getElementById('host');
      host.className = mode;
      host.replaceChildren();
      const root = el('div', { class: 'mmc-root fixture-root' });
      root.style.setProperty('--mmc-type', scale);
      host.append(root);
      window.cast = S.parseTimeline(JSON.stringify({ version: 2, subjects: [{ handle: 'subject', type: 'person', description: 'Synthetic performer.' }], segments: [{}] })).subjects;
      window.assets = [];
      window.cleared = 0;
      window.shelf = new CastShelf({ getCast: () => cast, setCast: value => { cast = value; }, getAssets: () => assets,
        addAsset() {}, whereCited: () => [], cite() {}, commit() { cleared++; }, dropAssets() {}, disclosure: true,
        initialOpen: false, library: async () => {}, vae: () => 'fixture-vae' });
      shelf.render(); root.append(shelf.root);
      // Pool/local-file callers use this same compact API; their complete
      // Timeline/Editor hosts are covered by the integration test.
      for (const id of ['pool', 'local']) {
        const header = el('div', { class: 'mmc-section-head' });
        const compact = clearButton({ compact: true, written: true, run() { cleared++; }, getOwner: () => cast, getValue: () => assets });
        compact.id = id; header.append(compact); root.append(header);
      }
      const rail = clearButton({ written: true, run() {} }); rail.id = 'rail'; root.append(rail);
    };
    window.refmodBranch = async () => {
      await modRows();
      assets.push({ handle: 'ref-1', filename: 'refmod:fixture', kind: 'video', role: 'reference' });
      cast[0].from = ['ref-1'];
      shelf.pickRole(document.getElementById('pool'), cast[0], 'ref-1', 'from');
    };
    make();
  });
  const check = async (name, run) => {
    try { await run(); report.results.push(name); console.log('PASS ' + name); }
    catch (error) { report.failures.push({ name, error: error.stack }); console.error('FAIL ' + name + '\n' + error.stack); }
  };
  await check('Cast, pool and local header Clears remain compact in normal/fullscreen/simple at 100% and 125%', async () => {
    for (const mode of ['', 'mmc-fs', 'mmc-fs simple']) for (const scale of [1, 1.25]) for (const language of ['en', 'ko']) {
      await page.evaluate(({ mode, scale, language }) => make(mode, scale, language), { mode, scale, language });
      const measured = await page.locator('.mmc-clear-compact').evaluateAll(nodes => nodes.map(node => {
        const box = node.getBoundingClientRect(), icon = node.querySelector('.mmc-clear-icon'), svg = icon.querySelector('svg'), label = node.lastElementChild;
        return { classes: node.className, width: box.width, height: box.height, iconWidth: icon.getBoundingClientRect().width,
          iconHeight: icon.getBoundingClientRect().height, svgWidth: svg.getBoundingClientRect().width, svgHeight: svg.getBoundingClientRect().height,
          labelDisplay: getComputedStyle(label).display, text: label.textContent, labelHeight: label.getBoundingClientRect().height,
          parentWidth: node.parentElement.getBoundingClientRect().width };
      }));
      assert.equal(measured.length, 3);
      for (const item of measured) {
        assert.equal(item.classes.split(' ').includes('mmc-tool'), false);
        // Simple mode intentionally scales every pill's 34px touch target.
        assert.ok(item.height >= 24 && item.height <= 36 * scale, JSON.stringify(item));
        assert.ok(item.width < 180, JSON.stringify(item));
        assert.ok(item.iconWidth <= 16 && item.iconHeight <= 16, JSON.stringify(item));
        assert.ok(item.svgWidth <= 16 && item.svgHeight <= 16, JSON.stringify(item));
        assert.notEqual(item.labelDisplay, 'none'); assert.ok(item.labelHeight > 0);
      }
      report.measurements.push({ mode: mode || 'normal', scale, language, controls: measured });
    }
  });
  await check('Rail Clear keeps its original tile class and dimensions', async () => {
    await page.evaluate(() => make());
    const rail = await page.locator('#rail').evaluate(node => ({ classes: node.className, icon: node.querySelector('.mmc-tool-icon').getBoundingClientRect().height }));
    assert.ok(rail.classes.includes('mmc-tool-danger')); assert.ok(rail.icon >= 56);
  });
  await check('Compact Cast Clear keeps two-click, changed-value and focus cancellation guards', async () => {
    await page.locator('.mmc-cast-clear').click();
    assert.equal(await page.evaluate(() => cast.length), 1);
    await page.evaluate(() => assets.push({ handle: 'new', filename: 'synthetic.png', kind: 'image' }));
    await page.locator('.mmc-cast-clear').click();
    assert.equal(await page.evaluate(() => cast.length), 1);
    await page.locator('.mmc-cast-clear').click(); await page.locator('#outside').focus();
    assert.equal(await page.locator('.mmc-cast-clear').evaluate(node => node.classList.contains('armed')), false);
    await page.locator('.mmc-cast-clear').click(); await page.locator('.mmc-cast-clear').click();
    assert.equal(await page.evaluate(() => cast.length), 0);
  });
  await check('Real RefMod tile menu opens its Encoded as branch without a ReferenceError', async () => {
    await page.evaluate(() => make());
    await page.evaluate(() => refmodBranch());
    const menu = page.locator('.mmc-cast-menu');
    await menu.waitFor(); assert.ok((await menu.textContent()).includes('Encoded as'));
    assert.ok((await menu.textContent()).toLowerCase().includes('compressed'));
    await page.keyboard.press('Escape');
  });
  await check('Segment LoRA strip is a compact wrapping row, not a second panel', async () => {
    const style = await page.evaluate(() => {
      const section = document.createElement('section'); section.className = 'mmc-segment-loras';
      section.innerHTML = '<div class="mmc-segment-lora-scope"><span class="mmc-pill">Global · 2</span><span class="mmc-segment-lora-divider"></span><span class="mmc-pill">Segment · 1</span></div>';
      document.querySelector('.fixture-root').append(section);
      const s = getComputedStyle(section), row = section.firstElementChild, r = getComputedStyle(row), divider = getComputedStyle(row.children[1]);
      return { padding: s.padding, border: s.borderWidth, background: s.backgroundColor, display: r.display, wrap: r.flexWrap,
        gap: r.gap, height: row.getBoundingClientRect().height, divider: [divider.width, divider.height, divider.pointerEvents] };
    });
    assert.equal(style.padding, '0px'); assert.equal(style.border, '0px'); assert.equal(style.background, 'rgba(0, 0, 0, 0)');
    assert.equal(style.display, 'flex'); assert.equal(style.wrap, 'wrap'); assert.equal(style.gap, '8px');
    assert.ok(style.height < 50); assert.deepEqual(style.divider, ['1px', '16px', 'none']);
  });
  assert.deepEqual(report.errors, []); assert.deepEqual(report.remote, []);
  if (process.env.COMPACT_HEADER_REPORT) fs.writeFileSync(process.env.COMPACT_HEADER_REPORT, JSON.stringify(report, null, 2));
  if (process.env.COMPACT_HEADER_SCREENSHOT) await page.screenshot({ path: process.env.COMPACT_HEADER_SCREENSHOT, fullPage: true });
  assert.deepEqual(report.failures, []);
  console.log(`PASS ${report.results.length} checks; ${report.measurements.length} context measurements; 0 page errors; 0 remote requests`);
})().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(async () => { await browser?.close(); });
