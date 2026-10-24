// Actual modules and styles, synthetic API storage. Never touches user settings
// or invokes a refiner, video renderer, external network or GPU.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = process.env.CONTINUITY_SOURCE_ROOT ? path.resolve(process.env.CONTINUITY_SOURCE_ROOT) : path.resolve(__dirname, '../..');
const web = path.join(root, 'web/creator');
const read = file => fs.readFileSync(path.join(web, file), 'utf8');
const catalogRun = spawnSync(process.env.PYTHON_EXECUTABLE_PATH || 'python', ['-c',
  "import sys;sys.path.insert(0,'tests');import layout;print(layout.catalog_json())"],
  { cwd: root, encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
assert.equal(catalogRun.status, 0, catalogRun.stderr);
const catalog = JSON.parse(catalogRun.stdout.split(/\r?\n/).find(line => line.startsWith('{')));
const css = [...read('styles.js').matchAll(/import \{ css as \w+ \} from "\.\/styles\/(\w+)\.js";/g)]
  .map(match => read(`styles/${match[1]}.js`).match(/export const css = `([^]*)`;\s*$/)[1]).join('\n');
const beta = 'minimax-h3-faithful-beta';
let browser;
const tests = [];
(async () => {
  browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ catalog, beta }) => {
    window.__MMC_FAMILIES = catalog;
    window.app = { extensionManager: { setting: { get: key => key === 'Comfy.Locale' ? (window.locale || 'en') : undefined } } };
    window.stored = { refiner: { backend: 'local', model: 'sulphur.safetensors',
      skill: 'minimax-h3-prompt', skillModes: { 'minimax-h3-prompt': 'add' },
      maxTokens: 6144, temperature: .05, seed: -1, language: 'English', reference_images: false } };
    window.writes = [];
    window.skillNames = [{ name: 'minimax-h3-prompt', kind: 'skill', mode: 'replace' },
      { name: beta, kind: 'skill', mode: 'replace' }];
  }, { catalog, beta });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'continuity.test') { external.push(url.href); return route.abort(); }
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="dark-theme"><head><meta charset="utf-8"><style>${css}
      :root{--comfy-menu-bg:#181819;--fg-color:#ddd;--input-text:#ddd;--descrip-text:#999;--bg-color:#202020;--primary-background:#0b8ce9;--destructive-background:#b33a3a;--error-text:#f44}
      body{margin:0;padding:20px;background:#171718;box-sizing:border-box}.fixture{padding:12px}
      </style></head><body><div class="mmc-root fixture"><button id="anchor">Refiner</button></div></body></html>` });
    if (url.pathname === '/scripts/app.js') return route.fulfill({ contentType: 'text/javascript', body: 'export const app=globalThis.app;' });
    if (url.pathname === '/scripts/widgets.js') return route.fulfill({ contentType: 'text/javascript', body: 'export const ComfyWidgets={};' });
    if (url.pathname === '/scripts/api.js') return route.fulfill({ contentType: 'text/javascript', body: `export const api={
      apiURL:u=>u,addEventListener(){},removeEventListener(){},getUserData:async()=>({status:404,json:async()=>null}),
      storeUserData:async()=>({status:200}),deleteUserData:async()=>({status:204}),
      async fetchApi(url,options={}){
        let body={};
        if(url==='/continuity/settings'){
          if(options.method==='POST'){const patch=JSON.parse(options.body);window.writes.push(patch);Object.assign(window.stored,patch);}
          body={settings:window.stored};
        }else if(url==='/continuity/refine/models')body={models:['sulphur.safetensors','qwen.safetensors']};
        else if(url==='/continuity/refine/skills')body={entries:window.skillNames};
        return {ok:true,status:200,json:async()=>JSON.parse(JSON.stringify(body))};
      }};` });
    if (url.pathname.startsWith('/web/creator/')) {
      const target = path.resolve(web, '.' + url.pathname.slice('/web/creator'.length));
      assert.ok(target.startsWith(web + path.sep));
      return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(target, 'utf8') });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  await page.goto('http://continuity.test/');
  await page.evaluate(async () => {
    window.R = await import('/web/creator/refine.js');
    window.API = await import('/web/creator/api.js'); API.noteSettings(window.stored);
    window.open = () => { window.closeSettings?.(); window.closeSettings = R.openSettings(document.querySelector('#anchor'), () => {}); };
  });
  const check = async (name, run) => { await run(); tests.push(name); console.log('PASS ' + name); };
  const settle = () => page.waitForTimeout(130);
  const row = id => page.locator(`[data-refine-skill="${id}"]`);
  const showPrompting = async () => {
    await settle();
    if (await page.locator('.mmc-refine-pop').evaluate(node => node.classList.contains('paged')))
      await page.locator('.mmc-refine-settings-tabs [role=tab]').nth(1).click();
    await settle();
  };
  const fit = async () => {
    await settle();
    const report = await page.locator('.mmc-refine-pop').evaluate(pop => {
      const r = pop.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: innerHeight,
        clipped: [pop, ...pop.querySelectorAll('*')].filter(node => node.getClientRects().length
          && ['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(node).overflowY)
          && node.scrollHeight > node.clientHeight + 1 && !node.classList.contains('mmc-refine-choice-rows')).map(node => node.className),
        outside: [...pop.querySelectorAll('button,input')].filter(node => node.getClientRects().length && !node.closest('.mmc-refine-choice-rows'))
          .filter(node => { const b = node.getBoundingClientRect(); return b.left < r.left - 1 || b.right > r.right + 1 || b.bottom > r.bottom + 1; }).map(node => node.className) };
    });
    assert.deepEqual(report.clipped, [], JSON.stringify(report));
    assert.deepEqual(report.outside, [], JSON.stringify(report));
    assert.ok(report.top >= 0 && report.bottom <= report.height, JSON.stringify(report));
  };
  await check('Opening offers a separate labelled Beta skill without changing the original choice or any setting', async () => {
    const before = await page.evaluate(() => JSON.stringify(stored));
    await page.evaluate(() => open()); await settle(); await showPrompting();
    assert.equal(await row(beta).locator('.mmc-refine-name').textContent(), 'Faithful refine');
    assert.equal(await row(beta).locator('.mmc-refine-beta').textContent(), 'Beta');
    assert.equal(await row(beta).locator('.mmc-opt-kind').textContent(), 'skill');
    assert.equal(await row('minimax-h3-prompt').locator('.mmc-refine-name').textContent(), 'minimax-h3-prompt');
    assert.equal(await row('minimax-h3-prompt').getAttribute('aria-checked'), 'true');
    assert.equal(await row(beta).getAttribute('aria-checked'), 'false');
    assert.equal(await page.evaluate(() => JSON.stringify(stored)), before);
    assert.equal(await page.evaluate(() => writes.length), 0);
    await fit();
  });
  await check('Beta selection keeps model and other controls, defaults to its own instructions, and survives reopen', async () => {
    const before = await page.evaluate(() => ({ ...R.settings() }));
    await row(beta).click(); await settle();
    const after = await page.evaluate(() => ({ ...R.settings() }));
    assert.equal(after.skill, beta); assert.deepEqual({ ...after, skill: before.skill }, before);
    assert.equal(await page.evaluate(() => R.chosenSkillMode(R.settings().skill)), 'replace');
    assert.match(await page.locator('.mmc-refine-modes .mmc-refine-hint').textContent(), /^Beta: translate and clarify/);
    assert.equal(await page.locator('.mmc-refine-modes .mmc-chip[aria-checked=true]').textContent(), 'replace it');
    await page.keyboard.press('Escape'); await page.evaluate(() => open()); await settle(); await showPrompting();
    assert.equal(await row(beta).getAttribute('aria-checked'), 'true'); await fit();
  });
  await check('Original skill and per-skill overrides remain independently selectable with no forced mode changes', async () => {
    await row('minimax-h3-prompt').click(); await settle();
    assert.equal(await page.locator('.mmc-refine-modes .mmc-chip[aria-checked=true]').textContent(), 'add to the built-in');
    await row(beta).click(); await settle();
    await page.locator('.mmc-refine-modes .mmc-chip').first().click(); await settle();
    assert.equal(await page.evaluate(() => R.chosenSkillMode(R.settings().skill)), 'add');
    assert.match(await page.locator('.mmc-refine-modes .mmc-refine-hint').textContent(), /Combining it with creative built-in/);
    await row('minimax-h3-prompt').click(); await settle();
    assert.equal(await page.evaluate(() => R.chosenSkillMode(R.settings().skill)), 'add');
    await row(beta).click(); await settle();
    assert.equal(await page.evaluate(() => R.chosenSkillMode(R.settings().skill)), 'add');
  });
  for (const viewport of [{ width: 1366, height: 768 }, { width: 1024, height: 640 }, { width: 800, height: 600 }, { width: 640, height: 600 }]) {
    await check(`Extra Beta option and its selected-mode guidance fit ${viewport.width}x${viewport.height}`, async () => {
      await page.setViewportSize(viewport); await showPrompting(); await fit();
      for (const id of ['minimax-h3-prompt', beta]) {
        await row(id).click(); await settle(); await fit();
        await page.locator('.mmc-refine-modes .mmc-chip').last().click(); await settle(); await fit();
      }
    });
  }
  await check('Korean, Japanese and Chinese Beta names and badges are localized and fit enlarged text', async () => {
    for (const [locale, label, badge] of [['ko', '원문 보존형', '베타'], ['ja', '原文保持型', 'ベータ'], ['zh', '原文保真', '测试版']]) {
      await page.keyboard.press('Escape'); await page.setViewportSize({ width: 1024, height: 768 });
      await page.evaluate(locale => { window.locale = locale; document.documentElement.style.setProperty('--mmc-type', '1.25'); open(); }, locale);
      await settle(); await showPrompting();
      assert.equal(await row(beta).locator('.mmc-refine-name').textContent(), label);
      assert.equal(await row(beta).locator('.mmc-refine-beta').textContent(), badge);
      await fit();
    }
    if (process.env.CONTINUITY_TEST_SCREENSHOT) {
      await page.keyboard.press('Escape'); await page.setViewportSize({ width: 1366, height: 900 });
      await page.evaluate(() => { window.locale = 'ko'; document.documentElement.style.setProperty('--mmc-type', '1'); open(); });
      await settle(); await showPrompting(); await fit();
      await page.locator('.mmc-refine-pop').screenshot({ path: process.env.CONTINUITY_TEST_SCREENSHOT });
    }
  });
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  console.log(`PASS ${tests.length} Beta option checks; no runtime errors or external requests`);
})().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(async () => { await browser?.close(); });
