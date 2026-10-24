// Offline browser regression: real prompt widgets/modules and CSS, synthetic
// workflow/catalog host. No ComfyUI server, media files, model execution or GPU.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sourceRoot = process.env.CONTINUITY_SOURCE_ROOT ? path.resolve(process.env.CONTINUITY_SOURCE_ROOT) : path.resolve(__dirname, '../..');
const web = path.join(sourceRoot, 'web', 'creator');
const read = name => fs.readFileSync(path.join(web, name), 'utf8');
const catalogRun = spawnSync(process.env.PYTHON_EXECUTABLE_PATH || 'python', ['-c',
  "import sys;sys.path.insert(0,'tests');import layout;print(layout.catalog_json())"],
{ cwd: sourceRoot, encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
assert.equal(catalogRun.status, 0, catalogRun.stderr);
const catalog = JSON.parse(catalogRun.stdout.split(/\r?\n/).find(line => line.startsWith('{')));
const css = [...read('styles.js').matchAll(/import \{ css as \w+ \} from "\.\/styles\/(\w+)\.js";/g)]
  .map(match => read(`styles/${match[1]}.js`).match(/export const css = `([^]*)`;\s*$/)[1]).join('\n');
const results = [];
let browser;
const fixture = async page => {
  await page.evaluate(async () => {
    window.S = await import('/web/creator/state.js');
    const { el } = await import('/web/creator/dom.js');
    const { PromptBox } = await import('/web/creator/prompt.js');
    const { RefinePanel } = await import('/web/creator/refine.js');
    const { SegmentPromptSections, openCompiledPrompt } = await import('/web/creator/prompt-sections.js');
    const { passDraft } = await import('/web/creator/prompt-overrides.js');
    window.openReferenceHelp = (await import('/web/creator/reference-fields.js')).openReferenceFieldHelp;
    window.fieldHelp = (await import('/web/creator/cast-preset-data.js')).CAST_REFERENCE_FIELD_HELP;
    window.reset = () => {
      window.preview?.close();
      window.sections?.destroy();
      document.querySelector('.fixture-editor')?.remove();
      document.querySelectorAll('.mmc-task-overlay').forEach(node => node.remove());
      window.piece = S.parseTimeline(JSON.stringify({ version: 2, assets: [], subjects: [],
        segments: [{ card_id: 'one', prompt: '@missing walks forward.',
          prompt_sections: { summary: '[reference generation] A person walks.', retention_analysis: 'Keep the face.' },
          refined: { enabled: true, body: 'draft body', sections: { summary: 'draft summary', retention_analysis: 'draft rules' }, fields: ['prompt', 'summary', 'retention_analysis'] } },
        { card_id: 'two', prompt: 'Second segment stays untouched.' }] }));
      window.ed = {
        state: piece.segments[0], castPiece: piece, piece, refineEpoch: 0, refineTarget: () => ({ kind: 'segment', index: 0 }),
        root: el('div', { class: 'mmc-root mmc-structured-editor fixture-editor' }), refinedWrites: 0,
        commitPrompt() { this.refineEpoch++; S.syncTimeline(piece); },
        renderNotices() {}, renderAssetsRow() {}, dropCited() {},
        refine: async (options, field) => { window.refinedFields.push(field); },
      };
      ed.prompt = new PromptBox({ getState: () => ed.state, getCast: () => piece.subjects, getPool: () => piece.assets,
        onInput: text => { ed.state.prompt = text; }, onUncited() {} });
      ed.prompt.setValue(ed.state.prompt);
      ed.refinePanel = new RefinePanel({ getState: () => ed.state, audioFields: false, promptOnly: true,
        createPromptBox: options => new PromptBox({ ...ed.prompt.hooks, ...options }) });
      window.refinedFields = [];
      window.sections = new SegmentPromptSections(ed);
      ed.root.append(sections.root);
      document.body.append(ed.root);
    };
    window.sources = () => JSON.stringify({ prompt: ed.state.prompt, sections: ed.state.prompt_sections,
      other: piece.segments[1], assets: piece.assets, subjects: piece.subjects });
    window.openPreview = () => {
      const compile = async () => {
        const base = `subject_definitions:\n<Subject 1> is a performer.\n\nsummary:\n${ed.state.prompt_sections.summary}\n\nretention_analysis:\n${ed.state.prompt_sections.retention_analysis}\n\ndetailed_description:\n${ed.state.prompt}`;
        const draft = passDraft(piece, JSON.parse(S.serializeTimeline(piece)), [1], base);
        return { text: draft.enabled ? draft.text : base, scope: 'Segment 1 generation pass', override: draft,
          loras: [{name:'private-test-lora.safetensors',strength:0.5}],
          tags: [{ label: '<Subject 1>', handles: ['subject'], assets: [] }] };
      };
      window.preview = openCompiledPrompt(compile);
    };
    reset();
  });
};

(async () => {
  browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined,
    ignoreDefaultArgs: ['--hide-scrollbars'] });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [], remote = [], failures = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ catalog }) => {
    window.__MMC_FAMILIES = catalog;
    window.app = { extensionManager: { setting: { get: key => key === 'Comfy.Locale' ? (window.language || 'en') : undefined } } };
    Object.defineProperty(navigator, 'clipboard', { value: { async writeText(text) { window.copiedPrompt = text; } }, configurable: true });
  }, { catalog });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'continuity.test') { remote.push(url.href); return route.abort(); }
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="dark-theme"><head><style>${css}
      :root{--comfy-menu-bg:#181819;--fg-color:#ddd;--input-text:#ddd;--descrip-text:#999;--bg-color:#202020;--primary-background:#0b8ce9;--destructive-background:#b33a3a;--error-text:#f44}
      body{margin:0;padding:20px;box-sizing:border-box;background:#171718}.fixture-editor{width:100%;max-width:1120px;margin:auto;padding:16px;box-sizing:border-box}
      </style></head><body><button id="outside">Outside</button></body></html>` });
    if (url.pathname === '/scripts/app.js') return route.fulfill({ contentType: 'text/javascript', body: 'export const app = globalThis.app;' });
    if (url.pathname === '/scripts/widgets.js') return route.fulfill({ contentType: 'text/javascript', body: 'export const ComfyWidgets = {};' });
    if (url.pathname === '/scripts/api.js') return route.fulfill({ contentType: 'text/javascript', body: `export const api={apiURL:u=>u,
      addEventListener(){},removeEventListener(){},getUserData:async()=>({status:404,json:async()=>null}),storeUserData:async()=>({status:200}),deleteUserData:async()=>({status:204}),
      fetchApi:async()=>({ok:true,status:200,json:async()=>({})})};` });
    if (url.pathname.startsWith('/web/creator/')) {
      const target = path.resolve(web, '.' + url.pathname.slice('/web/creator'.length));
      assert.ok(target.startsWith(web + path.sep));
      return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(target, 'utf8') });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  await page.goto('http://continuity.test/');
  await fixture(page);
  const check = async (name, run) => {
    try { await run(); results.push(name); console.log('PASS ' + name); }
    catch (error) { failures.push({ name, error: error.stack }); console.error('FAIL ' + name + '\n' + error.stack); await page.keyboard.press('Escape'); }
  };
  const clear = field => page.locator(`[data-mmc-clear-section="${field}"]`);
  await check('Segment header actions are compact, leading and separate from folding at nine viewport/text combinations', async () => {
    for (const width of [1440, 768, 480]) for (const scale of [1, 1.25, 1.6]) {
      await page.setViewportSize({width, height:900});
      await page.evaluate(scale => { document.documentElement.style.setProperty('--mmc-type', String(scale)); reset(); }, scale);
      const rows = await page.locator('.mmc-prompt-section').evaluateAll(nodes => nodes.map(node => {
        const head=node.querySelector('.mmc-tl-section-head'), toggle=head.querySelector('.mmc-tl-section-toggle');
        const host=head.querySelector('.mmc-tl-section-actions'), first=host.firstElementChild;
        const main=host.querySelector('.mmc-section-refine'), more=host.querySelector('.mmc-refine-more');
        const anchor=head.querySelector('.mmc-summary-task-help') || toggle;
        const a=anchor.getBoundingClientRect(), f=first.getBoundingClientRect(), h=head.getBoundingClientRect();
        return {title:node.querySelector('.mmc-tl-section-title').textContent, left:h.left, right:h.right,
          firstLeft:f.left, gap:f.left-a.right, sameRow:Math.abs(f.y-a.y)<15,
          heights:[...host.querySelectorAll(':scope > button'),main,more].map(x=>x.getBoundingClientRect().height),
          fonts:[...host.querySelectorAll(':scope > button'),main].map(x=>parseFloat(getComputedStyle(x).fontSize)),
          content:getComputedStyle(host,'::before').content, rule:getComputedStyle(host,'::before').width,
          overflow:head.scrollWidth>head.clientWidth+1};
      }));
      for (const row of rows) {
        assert.equal(row.overflow,false,`${width}/${scale}: ${JSON.stringify(row)}`);
        assert.equal(row.rule,'1px'); assert.equal(row.content,'""');
        if (row.sameRow) assert.ok(row.gap>=16 && row.gap<=30,JSON.stringify(row));
        else assert.ok(row.firstLeft<row.left+40,`${width}/${scale}: wrapped controls remain leading ${JSON.stringify(row)}`);
        for (const height of row.heights) assert.equal(height,26,JSON.stringify(row));
        for (const font of row.fonts) assert.ok(Math.abs(font-11*scale)<.02,JSON.stringify(row));
      }
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await clear('summary').click();
      assert.equal(await page.locator('.mmc-summary-section').getAttribute('data-open'),'true');
      const fits=await clear('summary').evaluate(node=>node.scrollWidth<=node.clientWidth+1);
      assert.ok(fits,'armed confirmation remains readable');
      await page.locator('#outside').focus();
    }
    await page.setViewportSize({width:1366,height:768});
    await page.evaluate(()=>{document.documentElement.style.setProperty('--mmc-type','1');reset();});
  });
  await check('Leading field Refine keeps its scope and does not fold; title click still folds independently', async () => {
    for (const field of ['summary','retention_analysis','prompt']) {
      const button=page.locator(`[data-mmc-refine-section="${field}"] .mmc-section-refine`);
      await button.click(); await button.click();
      assert.equal(await page.locator('.mmc-prompt-section[data-open="true"]').count(),3);
    }
    assert.deepEqual(await page.evaluate(()=>refinedFields),['summary','retention_analysis','prompt']);
    const toggle=page.locator('.mmc-summary-section .mmc-tl-section-toggle');
    await toggle.click();
    assert.equal(await page.locator('.mmc-summary-section').getAttribute('data-open'),'false');
    await toggle.click();
    assert.equal(await page.locator('.mmc-summary-section').getAttribute('data-open'),'true');
  });
  await check('Actual summary Clear label remains visible when armed and clears only on the second click', async () => {
    const before = await page.evaluate(() => sources());
    assert.equal((await clear('summary').textContent()).trim(), 'Clear');
    await clear('summary').click();
    assert.equal((await clear('summary').textContent()).trim(), 'Really clear?');
    assert.equal(await clear('summary').isVisible(), true);
    assert.equal(await page.evaluate(() => sources()), before);
    await clear('summary').click();
    assert.equal(await page.evaluate(() => ed.state.prompt_sections.summary), '');
    assert.equal(await page.evaluate(() => ed.state.refined.sections.summary), undefined);
    assert.equal(await page.evaluate(() => ed.state.prompt_sections.retention_analysis), 'Keep the face.');
    assert.equal(await page.evaluate(() => piece.segments[1].prompt), 'Second segment stays untouched.');
  });
  await check('Field Clear rejects changed data and cancels when keyboard focus leaves', async () => {
    await page.evaluate(() => reset());
    await clear('summary').click();
    await page.evaluate(() => { ed.state.prompt_sections.summary = 'Changed during pending confirmation.'; });
    await clear('summary').click();
    assert.equal(await page.evaluate(() => ed.state.prompt_sections.summary), 'Changed during pending confirmation.');
    assert.equal((await clear('summary').textContent()).trim(), 'Clear');
    await clear('summary').click();
    await page.locator('#outside').focus();
    assert.equal((await clear('summary').textContent()).trim(), 'Clear');
  });
  await check('Retention and detailed-description clears operate on their own field and draft only', async () => {
    for (const field of ['retention_analysis', 'prompt']) {
      await page.evaluate(() => reset());
      await clear(field).click(); await clear(field).click();
      assert.equal(await page.evaluate(field => field === 'prompt' ? ed.state.prompt : ed.state.prompt_sections[field], field), '');
      assert.equal(await page.evaluate(field => field === 'prompt' ? ed.state.refined.body : ed.state.refined.sections[field], field), undefined);
      assert.equal(await page.evaluate(() => ed.state.prompt_sections.summary), '[reference generation] A person walks.');
    }
  });
  await check('Holding Enter or Space cannot confirm Clear through key repeats', async () => {
    for (const key of ['Enter', ' ']) {
      await page.evaluate(() => reset());
      await clear('summary').focus();
      await page.keyboard.down(key); await page.keyboard.down(key); await page.keyboard.down(key); await page.keyboard.up(key);
      assert.equal(await page.evaluate(() => ed.state.prompt_sections.summary), '[reference generation] A person walks.');
      assert.equal((await clear('summary').textContent()).trim(), 'Really clear?');
      await page.keyboard.press(key);
      assert.equal(await page.evaluate(() => ed.state.prompt_sections.summary), '');
    }
  });
  await check('Removing and reinserting an armed Clear cancels the old confirmation', async () => {
    await page.evaluate(() => reset());
    await clear('summary').click();
    await page.evaluate(() => {
      const button = document.querySelector('[data-mmc-clear-section="summary"]'), parent = button.parentNode;
      button.remove(); parent.append(button);
    });
    await clear('summary').click();
    assert.equal(await page.evaluate(() => ed.state.prompt_sections.summary), '[reference generation] A person walks.');
  });
  await check('Missing reference remains an automatic chip in editable input', async () => {
    await page.evaluate(() => reset());
    const chip = page.locator('.mmc-prompt-section').last().locator('[data-handle="missing"]');
    assert.equal(await chip.count(), 1);
    assert.equal(await chip.evaluate(node => node.classList.contains('mmc-ref-missing')), true);
    assert.equal(await page.evaluate(() => ed.prompt.getValue()), '@missing walks forward.');
  });
  await check('Task prefix parsing preserves Shot and quoted tags while deduplicating known leading task groups', async () => {
    const got = await page.evaluate(async () => {
      const { splitTasks, taskSummary } = await import('/web/creator/summary-tasks.js');
      const source = '[REFERENCE GENERATION + video editing] [reference generation] [Shot 1] A person reads "[reference generation]" on a sign.';
      return { parsed: splitTasks(source), composed: taskSummary(source, ['reference generation', 'video editing']),
        ordinary: splitTasks('A sign reads "[reference generation]".') };
    });
    assert.deepEqual(got.parsed.tasks, ['reference generation', 'video editing']);
    assert.equal(got.parsed.body, '[Shot 1] A person reads "[reference generation]" on a sign.');
    assert.equal(got.composed, '[reference generation + video editing] [Shot 1] A person reads "[reference generation]" on a sign.');
    assert.deepEqual(got.ordinary, { tasks: [], body: 'A sign reads "[reference generation]".' });
  });
  await check('Summary task help has all six official roles and opens beside the title without folding its section', async () => {
    await page.evaluate(() => reset());
    const section = page.locator('.mmc-summary-section');
    assert.equal(await section.getByRole('button', {name:'Task type',exact:true}).count(), 1);
    assert.equal(await page.getByRole('button', {name:'Task presets',exact:true}).count(), 0);
    const titleGap=await section.evaluate(node => node.querySelector('.mmc-summary-task-help').getBoundingClientRect().left-node.querySelector('.mmc-tl-section-title').getBoundingClientRect().right);
    assert.ok(titleGap >= 0 && titleGap < 36, `title gap ${titleGap}`);
    await section.getByRole('button', {name:'Summary task type help',exact:true}).click();
    assert.equal(await section.getAttribute('data-open'), 'true');
    const help = page.locator('.mmc-task-dialog');
    assert.equal(await help.locator('tbody tr').count(), 6);
    assert.equal(await help.locator('tbody code').first().textContent(), 'keyframe completion');
    const fit = await help.evaluate(node => { const box=node.getBoundingClientRect(); return {top:box.top,bottom:box.bottom,h:node.clientHeight,scroll:node.scrollHeight}; });
    assert.ok(fit.top >= 0 && fit.bottom <= 768 && fit.scroll <= fit.h + 1, JSON.stringify(fit));
    await help.getByRole('button', {name:'Close',exact:true}).click();
    assert.equal(await section.getAttribute('data-open'), 'true');
    assert.equal(await page.locator('.mmc-summary-task-help').evaluate(node => node === document.activeElement), true);
  });
  await check('Task types fit at 1366×768 with eight saved combinations and apply one canonical task prefix', async () => {
    await page.evaluate(() => reset());
    await page.getByRole('button', { name: 'Task type', exact: true }).click();
    const popup = page.locator('.mmc-task-dialog');
    assert.equal(await popup.locator('.mmc-task-combination').count(), 5);
    assert.equal(await popup.locator('[data-task]').count(), 6);
    for (let index = 1; index <= 8; index++) {
      await popup.locator('input').fill(`Combination ${index}`);
      await popup.getByRole('button', { name: 'Save combination', exact: true }).click();
    }
    const geometry = await popup.evaluate(node => { const box = node.getBoundingClientRect(); return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, h: node.clientHeight, scroll: node.scrollHeight, overflow: getComputedStyle(node).overflowY }; });
    assert.ok(geometry.left >= 0 && geometry.right <= 1366 && geometry.top >= 0 && geometry.bottom <= 768, JSON.stringify(geometry));
    assert.ok(geometry.scroll <= geometry.h + 1, JSON.stringify(geometry));
    assert.notEqual(geometry.overflow, 'auto');
    assert.notEqual(geometry.overflow, 'scroll');
    await popup.getByRole('button', { name: 'video editing', exact: true }).click();
    assert.equal(await popup.locator('[data-task="video editing"]').evaluate(node => node === document.activeElement), true);
    await popup.getByRole('button', { name: 'Apply', exact: true }).click();
    const text = await page.evaluate(() => ed.state.prompt_sections.summary);
    assert.equal((text.match(/reference generation/g) || []).length, 1);
    assert.equal((text.match(/video editing/g) || []).length, 1);
    assert.ok(text.startsWith('[reference generation + video editing]'));
  });
  await check('Task selection cannot write to an editor that changed segments while the modal was open', async () => {
    await page.evaluate(() => reset());
    const before = await page.evaluate(() => sources());
    await page.getByRole('button', {name:'Task type',exact:true}).click();
    await page.locator('.mmc-task-dialog [data-task="audio reference"]').click();
    await page.evaluate(() => { ed.state=piece.segments[1]; });
    await page.locator('.mmc-task-dialog').getByRole('button', {name:'Apply',exact:true}).click();
    assert.equal(await page.evaluate(() => {ed.state=piece.segments[0];return sources();}),before);
  });
  await check('Preset plus independent toggle has one live prefix; reopening reads current summary, not a remembered selection', async () => {
    await page.evaluate(() => reset());
    const before = await page.evaluate(() => ({prompt:ed.state.prompt,other:JSON.stringify(piece.segments[1]),retention:ed.state.prompt_sections.retention_analysis}));
    await page.getByRole('button', {name:'Task type',exact:true}).click();
    const popup = page.locator('.mmc-task-dialog');
    await popup.locator('.mmc-task-combination').nth(3).click();
    await popup.locator('[data-task="audio reference"]').click();
    assert.equal(await popup.locator('.mmc-task-preview').textContent(), '[reference generation + video editing + audio reuse + audio reference]');
    await popup.getByRole('button', {name:'Apply',exact:true}).click();
    assert.equal(await page.evaluate(() => ed.state.prompt_sections.summary), '[reference generation + video editing + audio reuse + audio reference] A person walks.');
    assert.deepEqual(await page.evaluate(() => ({prompt:ed.state.prompt,other:JSON.stringify(piece.segments[1]),retention:ed.state.prompt_sections.retention_analysis})), before);
    await page.evaluate(() => {ed.state.prompt_sections.summary='[video continuation] Another summary.';});
    await page.getByRole('button', {name:'Task type',exact:true}).click();
    assert.equal(await popup.locator('[data-task][aria-pressed="true"]').count(),1);
    assert.equal(await popup.locator('[data-task="video continuation"]').getAttribute('aria-pressed'),'true');
    await popup.getByRole('button',{name:'Cancel',exact:true}).click();
    assert.equal(await page.evaluate(() => ed.state.prompt_sections.summary),'[video continuation] Another summary.');
  });
  await check('Force edit defaults off, edits the real final draft, restores original on off and leaves source fields intact', async () => {
    await page.evaluate(() => { reset(); openPreview(); });
    const toggle = page.locator('.mmc-final-prompt [role="switch"]');
    await page.waitForFunction(() => document.querySelector('.mmc-final-prompt [role="switch"]').disabled === false);
    const original = await page.locator('.mmc-final-prompt-doc').textContent();
    const source = await page.evaluate(() => sources());
    assert.equal(await toggle.getAttribute('aria-checked'), 'false');
    assert.equal(await page.locator('.mmc-final-prompt-guidance').count(), 0);
    assert.ok(!(await page.locator('.mmc-final-prompt').textContent()).includes('private-test-lora.safetensors'));
    assert.equal(await page.locator('.mmc-final-prompt-doc .mmc-ref-missing').count(), 1);
    await toggle.click();
    await page.waitForFunction(() => document.querySelector('.mmc-final-prompt [role="switch"]').getAttribute('aria-checked') === 'true');
    assert.equal(await page.locator('.mmc-final-prompt-guidance').count(), 0);
    const field = page.locator('.mmc-final-prompt-edit').last();
    assert.equal(await field.isEditable(), true);
    await field.fill('detailed_description:\nTemporary test motion with @missing.');
    assert.equal(await page.evaluate(() => sources()), source);
    const active = await page.evaluate(() => JSON.parse(S.serializeTimeline(piece)).prompt_overrides);
    assert.equal(active.length, 1);
    assert.ok(active[0].text.endsWith('Temporary test motion with @missing.'));
    await toggle.click();
    await page.waitForFunction(() => document.querySelector('.mmc-final-prompt [role="switch"]').getAttribute('aria-checked') === 'false');
    assert.equal(await page.locator('.mmc-final-prompt-doc').textContent(), original);
    assert.equal(await page.locator('.mmc-final-prompt-guidance').count(), 0);
    assert.equal(await page.evaluate(() => JSON.parse(S.serializeTimeline(piece)).prompt_overrides), undefined);
    assert.equal(await page.evaluate(() => sources()), source);
    assert.equal(await page.locator('.mmc-final-prompt-doc .mmc-ref-missing').count(), 1);
    const selected = await page.locator('.mmc-final-prompt-doc').evaluate(node => { const range = document.createRange(); range.selectNodeContents(node); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); return selection.toString(); });
    assert.equal(selected, original);
    await page.getByRole('button', { name: 'Copy prompt', exact: true }).click();
    assert.equal(await page.evaluate(() => copiedPrompt), original);
    await page.evaluate(() => preview.close());
  });
  await check('Reference help reflows without internal scrolling and keeps examples reachable', async () => {
    await page.evaluate(() => openReferenceHelp(fieldHelp.description, document.getElementById('outside')));
    await page.waitForTimeout(60);
    const fit = await page.locator('.mmc-cast-help-dialog').evaluate(node => { const box = node.getBoundingClientRect(); const content = node.querySelector('.mmc-cast-help-content'); return { top: box.top, bottom: box.bottom, overflow: getComputedStyle(content).overflowY, scroll: content.scrollHeight, h: content.clientHeight }; });
    assert.ok(fit.top >= 0 && fit.bottom <= 768, JSON.stringify(fit));
    assert.ok(fit.scroll <= fit.h + 1, JSON.stringify(fit));
    assert.notEqual(fit.overflow, 'auto');
    await page.locator('.mmc-cast-help-dialog .mmc-close').click();
  });
  await check('Korean, Japanese and Chinese controls and help fit at 125 percent text size', async () => {
    for (const language of ['ko', 'ja', 'zh']) {
      const tasksLabel = await page.evaluate(async language => {
        window.language = language;
        document.documentElement.style.setProperty('--mmc-type', '1.25');
        reset();
        return (await import('/web/creator/i18n.js')).t('Task type');
      }, language);
      await page.getByRole('button', { name: tasksLabel, exact: true }).click();
      const taskFit = await page.locator('.mmc-task-dialog').evaluate(node => {
        const box = node.getBoundingClientRect();
        return { top: box.top, bottom: box.bottom, scrollHeight: node.scrollHeight, height: node.clientHeight,
          scrollWidth: node.scrollWidth, width: node.clientWidth };
      });
      assert.ok(taskFit.top >= 0 && taskFit.bottom <= 768 && taskFit.scrollHeight <= taskFit.height + 1
        && taskFit.scrollWidth <= taskFit.width + 1, `${language}: ${JSON.stringify(taskFit)}`);
      await page.waitForTimeout(20);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(20);
      assert.equal(await page.locator('.mmc-task-dialog').count(), 0, `${language}: Escape dismisses task types`);
      await page.locator('.mmc-summary-task-help').click();
      const taskHelpFit = await page.locator('.mmc-task-dialog').evaluate(node => {
        const box=node.getBoundingClientRect();
        return {top:box.top,bottom:box.bottom,h:node.clientHeight,scroll:node.scrollHeight};
      });
      assert.ok(taskHelpFit.top>=0 && taskHelpFit.bottom<=768 && taskHelpFit.scroll<=taskHelpFit.h+1,
        `${language}: task help ${JSON.stringify(taskHelpFit)}`);
      await page.locator('.mmc-task-dialog .mmc-close').click();
      await page.evaluate(() => openReferenceHelp(fieldHelp.usage_rules, document.getElementById('outside')));
      await page.waitForTimeout(30);
      const helpFit = await page.locator('.mmc-cast-help-dialog').evaluate(node => {
        const box = node.getBoundingClientRect(), content = node.querySelector('.mmc-cast-help-content');
        return { top: box.top, bottom: box.bottom, scroll: content.scrollHeight, height: content.clientHeight };
      });
      assert.ok(helpFit.top >= 0 && helpFit.bottom <= 768 && helpFit.scroll <= helpFit.height + 1, `${language}: ${JSON.stringify(helpFit)}`);
      await page.locator('.mmc-cast-help-dialog .mmc-close').click();
    }
    await page.evaluate(() => { window.language = 'en'; document.documentElement.style.setProperty('--mmc-type', '1'); reset(); });
  });
  if (process.env.CONTINUITY_UX_SCREENSHOT_DIR) {
    fs.mkdirSync(process.env.CONTINUITY_UX_SCREENSHOT_DIR, { recursive: true });
    await page.evaluate(() => {window.language='ko';reset();});
    await page.screenshot({path:path.join(process.env.CONTINUITY_UX_SCREENSHOT_DIR,'segment-header-layout.png'),fullPage:true});
    await page.locator('.mmc-summary-task-help').click();
    await page.screenshot({ path:path.join(process.env.CONTINUITY_UX_SCREENSHOT_DIR,'summary-task-help.png'),fullPage:true });
    await page.keyboard.press('Escape');
    await page.getByRole('button', {name:'작업 유형',exact:true}).click();
    await page.screenshot({ path:path.join(process.env.CONTINUITY_UX_SCREENSHOT_DIR,'summary-task-types.png'),fullPage:true });
    await page.keyboard.press('Escape');
    await page.evaluate(() => { reset(); openPreview(); });
    await page.waitForTimeout(50);
    await page.screenshot({ path: path.join(process.env.CONTINUITY_UX_SCREENSHOT_DIR, 'prompt-workflow-final-read.png'), fullPage: true });
    await page.evaluate(() => {
      preview?.close(); reset();
      ed.state.prompt = '인물이 공원 길을 천천히 걸으며 주변을 살펴본다.';
      ed.state.prompt_sections = { summary: '공원을 산책하는 한 사람의 모습을 보여준다.', retention_analysis: '참조 인물의 얼굴과 머리카락을 유지한다.' };
      ed.state.refined = null; ed.state.retention_blocks = null;
      sections.reset(); ed.prompt.setValue(ed.state.prompt);
      ed.refinePanel.apply({ template: 'ref2va' }, { fields: ['summary'],
        sections: { summary: '[reference generation] A person takes a peaceful walk through a park.' },
        sources: { summary: ed.state.prompt_sections.summary } });
    });
    await page.screenshot({ path: path.join(process.env.CONTINUITY_UX_SCREENSHOT_DIR, 'summary-refined-field-placement.png'), fullPage: true });
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(remote, []);
  assert.deepEqual(failures, []);
  console.log(JSON.stringify({ passed: results.length, pageErrors: errors, remoteRequests: remote.length }));
})().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(async () => { await browser?.close(); });
