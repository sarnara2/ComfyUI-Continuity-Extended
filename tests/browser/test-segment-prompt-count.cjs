// Actual generated/clip render methods and preview geometry, offline Chrome.
// Only metadata/actions/media URL are fixtures. No ComfyUI, queue, AI or GPU.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = process.env.CONTINUITY_SOURCE_ROOT
  ? path.resolve(process.env.CONTINUITY_SOURCE_ROOT, 'web/creator')
  : path.resolve(__dirname, '../../web/creator');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const method = (text, name) => {
  const found = text.match(new RegExp(`^  (?:async )?${name}\\([^]*?^  \\}`, 'm'));
  assert.ok(found, `Production ${name}`); return found[0];
};
const fn = (text, name) => {
  const found = text.match(new RegExp(`(?:export )?function ${name}\\([^]*?^\\}`, 'm'));
  assert.ok(found, `Production ${name}`); return found[0].replace(/^export /, '');
};
const source = read('timeline.js');
const baseline = process.env.CONTINUITY_BASELINE_DIR
  ? path.resolve(process.env.CONTINUITY_BASELINE_DIR, 'web/creator') : null;
const withoutOldCaption = text => method(text, 'renderCard').split('    return el("div", {')[0]
  .replace(/^    const typed =[^\r\n]*\r?\n/m, '')
  .replace(/^    \/\/ The typed sentence[^]*?^    const prompt =[^\r\n]*\r?\n/m, '')
  // EXT62 deliberately replaces only the old inherited Face chip owner with
  // the separately tested canonical full per-card popover. Keep the rest of
  // this pre-markup calculation/callback receipt byte exact. Facts and footer
  // presentation are below the return boundary and covered by the inherited
  // callback/calculation AST receipt plus their dedicated real-DOM fixtures.
  .replace(/^    \/\/ (?:The card's half of the face pass|Complete settings belong to this canonical generated card)[^]*?(?=^    \/\/ The card's motion fix:)/m,
    '    // Authorized per-card Face owner.\n')
  .replace(/\r\n/g, '\n').replace(/\n\s*\n+/g, '\n');
if (baseline && fs.existsSync(path.join(baseline, 'timeline.js'))) {
  const previous = fs.readFileSync(path.join(baseline, 'timeline.js'), 'utf8');
  assert.equal(withoutOldCaption(source), withoutOldCaption(previous),
    'Generated-card state and callbacks unchanged outside removed prompt-caption calculation and authorized Face owner');
  for (const name of ['takeChip', 'takeTools', 'removeButton', 'cardNameControl']) {
    assert.equal(method(source, name), method(previous, name), `${name} unchanged`);
  }
}

// Reuse the maintained original render fixture and all its callback/calculation
// AST guards. An older adapter's prefix equality predates removing the caption;
// replace only that superseded assertion with the narrow comparison above.
const fixturePath = path.join(__dirname, 'test-segment-card-pills.cjs');
const fixtureSource = fs.readFileSync(fixturePath, 'utf8');
let prefix = fixtureSource.slice(0, fixtureSource.indexOf('new vm.Script(code);'));
const oldCaptionGuard = / assert\.equal\(method\(source,'renderCard'\)\.split\('    return el\("div", \{'\)\[0\],[^]*?'generated-card state, calculations and face\/motion callbacks before markup unchanged'\);\r?\n/;
if (oldCaptionGuard.test(prefix)) prefix = prefix.replace(oldCaptionGuard, '');
const base = vm.runInNewContext(prefix + ';({code,css});', { require, __dirname, process });
const dom = read('dom.js');
const dictionaries = Object.fromEntries(['ja', 'zh'].map(language => [language,
  vm.runInNewContext(read(`locales/${language}.js`).replace(/^export const /m, 'const ') + `;${language};`, {})]));
const previewModule = read('card-preview.js').replace(/^import [^;]+;\r?\n/gm, '').replace(/^export /gm, '');
// Face's maintained adapter already provides these production portal helpers.
for(const name of ['floatAbove','dismissable','placeNear'])assert.ok(base.code.includes(fn(dom,name)),'Maintained actual '+name);
const code = base.code + `
Object.assign(dictionaries, ${JSON.stringify(dictionaries)});
const {createCardPreview} = (() => {
  // Invalid RAM-only data media is intentional: geometry uses stored dimensions
  // before metadata, while decoding/playback is covered by the media fixture.
  const viewUrl = () => 'data:video/webm;base64,AA==';
  ${previewModule}
  return {createCardPreview};
})();
const originalCardPreview = Subject.prototype.cardPreview;
Subject.prototype.cardPreview = function(segment, index, pass) {
  if (!this.countPreview) return originalCardPreview.call(this, segment, index, pass);
  window.countPlayer?.destroy();
  window.countPlayer = createCardPreview({filename:'fixture-dimensions-only.webm',
    width:480, height:832, range:{start:0,end:4}, hasAudio:true}, {key:'count-preview', hover:true});
  return countPlayer.root;
};
window.setCountFixture = (options = {}) => {
  window.countPlayer?.destroy();
  setFixture(options);
  const segment = subject.timeline.segments[1];
  if (Object.hasOwn(options,'prompt')) segment.prompt = options.prompt;
  else delete segment.prompt;
  if (Object.hasOwn(options,'refined')) segment.refined = options.refined;
  else delete segment.refined;
  if (options.filename) segment.filename = options.filename;
  subject.countPreview = Boolean(options.preview);
  const before = JSON.stringify(subject.timeline);
  subject.mount();
  window.countBefore = before;
  return before;
};
window.editCountInput = value => {
  let input = document.querySelector('#count-input');
  if (!input) {
    input = el('textarea',{id:'count-input','aria-label':'Fixture prompt input'});
    input.addEventListener('input',() => {subject.timeline.segments[1].prompt=input.value;subject.mount();});
    document.body.append(input);
  }
  input.value=value; input.dispatchEvent(new Event('input',{bubbles:true}));
};
setCountFixture();
`;
new vm.Script(code, { filename: 'segment-prompt-count-real-source-fixture.js' });
const results = []; let browser, requests = 0;
const errors = [];
const check = async (name, run) => { await run(); results.push(name); console.log('PASS ' + name); };
(async () => {
  browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => { requests++; return route.abort(); });
  await page.setContent(`<style>${base.css}:root{--comfy-menu-bg:#171718;--fg-color:#fff;--input-text:#ddd;--descrip-text:#999;--bg-color:#202020;--primary-background:#0b8ce9;--destructive-background:#b33a3a;--error-text:#f44}body{margin:12px;background:#171718}.fixture-host{width:max-content;height:auto;padding:0}#count-input{display:block;margin-top:12px}</style>`);
  await page.evaluate(`(()=>{${code}})()`);
  const reset = options => page.evaluate(options => setCountFixture(options), options || {});
  const text = () => page.locator('.mmc-tl-card-count').textContent();
  const unchanged = async () => assert.equal(await page.evaluate(() => JSON.stringify(subject.timeline)), await page.evaluate(() => countBefore));

  await check('Missing, null and empty raw input each display exact zero without a prompt-caption fallback', async () => {
    for (const options of [{}, { prompt: null }, { prompt: '' }]) {
      await reset(options); assert.equal(await text(), '0 chars incl. spaces');
      assert.equal(await page.locator('.mmc-tl-card-prompt').count(), 0); await unchanged();
    }
  });
  await check('Spaces, tabs, leading/trailing whitespace and both newline characters are counted without trimming', async () => {
    for (const [prompt, expected] of [[' \t\n\r\n　 ', 7], ['  A\nB  ', 7], ['가나다 한글', 6]]) {
      await reset({ prompt }); assert.equal(await text(), `${expected} chars incl. spaces`); await unchanged();
    }
  });
  await check('Supplementary emoji and CJK use Unicode codepoints, not UTF-16 length or approximate tokens', async () => {
    for (const [prompt, expected] of [['A😀B𠀋', 4], ['e\u0301👩‍👩‍👧‍👦', 9]]) {
      await reset({ prompt }); assert.equal(await text(), `${expected} chars incl. spaces`); await unchanged();
    }
  });
  await check('Korean 33,459-character count is exact, grouped with commas, and shown on one line', async () => {
    await reset({ language: 'ko', prompt: '한'.repeat(33459) });
    assert.equal(await text(), '공백 포함 33,459자');
    const display = await page.locator('.mmc-tl-card-count').evaluate(node => ({
      whiteSpace: getComputedStyle(node).whiteSpace, scroll: node.scrollWidth, width: node.clientWidth,
      text: node.textContent, title: node.title,
    }));
    assert.equal(display.whiteSpace, 'nowrap'); assert.ok(display.scroll <= display.width + 1);
    assert.equal(display.title, ''); assert.doesNotMatch(display.text, /~|약|토큰/); await unchanged();
  });
  await check('Enabled and disabled refined output never replaces or contributes to the raw-input count', async () => {
    for (const enabled of [true, false]) for (const prompt of [' A😀 ', '']) {
      await reset({ prompt, refined: { body: 'DO_NOT_EXPOSE_REWRITE_987 '.repeat(500), enabled } });
      assert.equal(await text(), `${prompt ? 4 : 0} chars incl. spaces`);
      assert.equal(await page.locator('.mmc-tl-card-prompt').count(), 0); await unchanged();
    }
  });
  await check('Neither raw prompt nor rewrite is exposed in card text, title, aria attributes or markup', async () => {
    await reset({ prompt: 'DO_NOT_EXPOSE_PROMPT_111 😀 \n', refined: { body: 'DO_NOT_EXPOSE_REWRITE_987', enabled: true } });
    const markup = await page.locator('.mmc-tl-card').evaluate(node => node.outerHTML);
    assert.doesNotMatch(markup, /DO_NOT_EXPOSE_PROMPT_111|DO_NOT_EXPOSE_REWRITE_987|No prompt yet/);
    assert.equal(await page.locator('.mmc-tl-card-count').count(), 1); await unchanged();
  });
  await check('Input-state rerender refreshes the count immediately without truncating or normalizing the source', async () => {
    await reset({ prompt: 'Old', refined: { body: 'Longer generated output', enabled: true } });
    await page.evaluate(() => editCountInput('  새😀\n'));
    assert.equal(await text(), '5 chars incl. spaces');
    assert.equal(await page.evaluate(() => subject.timeline.segments[1].prompt), '  새😀\n');
    await page.evaluate(() => editCountInput(''));
    assert.equal(await text(), '0 chars incl. spaces');
    assert.deepEqual(await page.evaluate(() => subject.calls), []); assert.equal(await page.evaluate(() => subject.commits), 0);
  });
  await check('Clip cards retain the exact filename display and do not gain a prompt counter', async () => {
    const filename = 'source/원본😀_clip_01234567890123456789.mp4';
    await reset({ clip: true, filename, prompt: 'A clip note is not its filename' });
    assert.equal(await page.locator('.mmc-tl-card-count').count(), 0);
    assert.equal(await page.locator('.mmc-tl-card-prompt').textContent(), filename.split('/').pop());
    assert.equal(await page.locator('.mmc-tl-card-prompt').getAttribute('title'), filename); await unchanged();
  });
  await check('Count/card background does not open editing; the existing Edit action remains explicit', async () => {
    await reset({ prompt: 'Private input' });
    await page.locator('.mmc-tl-card-count').click(); await page.locator('.mmc-tl-card-count').dblclick();
    assert.deepEqual(await page.evaluate(() => subject.calls), []); await unchanged();
    await page.locator('.mmc-tl-card-edit-tools .mmc-tl-edit').filter({hasText:/^Edit$/}).click();
    assert.deepEqual(await page.evaluate(() => subject.calls), [['edit', 1]]);
  });
  await check('English, Korean, Japanese and Chinese count labels stay localized without prompt text', async () => {
    for (const [language, expected] of [['en', '4 chars incl. spaces'], ['ko', '공백 포함 4자'], ['ja', '空白を含む 4文字'], ['zh', '含空格 4字']]) {
      await reset({ language, prompt: 'A😀B ' }); assert.equal(await text(), expected); await unchanged();
    }
  });
  const alignment = [], clipAlignment = [];
  await check('Generated count glyphs reach the right content edge across counts, locales and held/Face/Ready states without realigning Clip filenames', async () => {
    const countBounds = () => page.locator('.mmc-tl-card-count').evaluate(node => {
      const style = getComputedStyle(node), box = node.getBoundingClientRect();
      const card = node.closest('.mmc-tl-card'), cardStyle = getComputedStyle(card), cardBox = card.getBoundingClientRect();
      const range = document.createRange(); range.selectNodeContents(node);
      const glyph = range.getBoundingClientRect();
      return { text: node.textContent, align: style.textAlign, lineRects: range.getClientRects().length,
        glyphLeft: glyph.left, glyphRight: glyph.right, left: box.left, right: box.right,
        contentRight: cardBox.right - parseFloat(cardStyle.borderRightWidth) - parseFloat(cardStyle.paddingRight),
        width: node.clientWidth, scroll: node.scrollWidth };
    });
    const variants = [
      { name: 'held', kept: true, face: false, preview: false },
      { name: 'unlocked-face-off', kept: false, face: true, faceOff: true, preview: false },
      { name: 'held-face-ready', kept: true, face: true, preview: true },
    ];
    for (const width of [320, 1000]) for (const language of ['en', 'ko', 'ja', 'zh']) for (const scale of [1, 1.6]) {
      await page.setViewportSize({ width, height: 1100 });
      for (const prompt of ['', 'A😀B ', '한'.repeat(33459)]) for (const variant of variants) {
        await reset({ language, scale, prompt, ...variant });
        const value = await countBounds();
        assert.equal(value.align, 'right'); assert.equal(value.lineRects, 1);
        assert.ok(Math.abs(value.glyphRight - value.right) < 1, JSON.stringify(value));
        assert.ok(Math.abs(value.right - value.contentRight) < 1, JSON.stringify(value));
        assert.ok(value.glyphLeft >= value.left - 1 && value.scroll <= value.width + 1, JSON.stringify(value));
        assert.equal(await page.locator('.mmc-tl-card-prompt').count(), 0);
        assert.deepEqual(await page.evaluate(() => subject.calls), []); assert.equal(await page.evaluate(() => subject.commits), 0);
        alignment.push({ width, language, scale, characters: Array.from(prompt).length, state: variant.name, ...value });
        await unchanged();
      }
      // Clip still uses its original left/start-aligned filename owner; the
      // generated-only selector must not inherit onto that independent field.
      const filename = 'source/원본😀_clip.mp4';
      await reset({ language, scale, clip: true, filename, prompt: 'Private clip note' });
      const clip = await page.locator('.mmc-tl-card-prompt').evaluate(node => {
        const style = getComputedStyle(node), box = node.getBoundingClientRect(), range = document.createRange();
        range.selectNodeContents(node); const glyph = range.getBoundingClientRect();
        return { text: node.textContent, title: node.title, align: style.textAlign,
          left: box.left, glyphLeft: glyph.left, padding: parseFloat(style.paddingLeft), border: parseFloat(style.borderLeftWidth) };
      });
      assert.ok(['start', 'left'].includes(clip.align), JSON.stringify(clip));
      assert.ok(Math.abs(clip.glyphLeft - clip.left - clip.padding - clip.border) < 1, JSON.stringify(clip));
      assert.equal(clip.text, filename.split('/').pop()); assert.equal(clip.title, filename);
      assert.equal(await page.locator('.mmc-tl-card-count').count(), 0);
      clipAlignment.push({ width, language, scale, ...clip }); await unchanged();
    }
    // A visual negative control proves Range is measuring the text itself,
    // not just the stretched full-width count element's rectangle.
    await reset({ language: 'ko', prompt: '', face: true });
    const right = await countBounds();
    await page.locator('.mmc-tl-card-count').evaluate(node => { node.style.textAlign = 'left'; });
    const left = await countBounds();
    assert.ok(right.glyphRight - left.glyphRight > 20); assert.ok(Math.abs(left.glyphLeft - left.left) < 1);
    await page.locator('.mmc-tl-card-count').evaluate(node => { node.style.removeProperty('text-align'); });
    assert.equal((await countBounds()).glyphRight, right.glyphRight); await unchanged();
  });
  const geometry = [];
  await check('Short and long input keep right-aligned tools and fixed portrait preview geometry at compact/enlarged type', async () => {
    for (const width of [320, 1000]) for (const scale of [1, 1.6]) for (const duration of [1, 14.38]) {
      await page.setViewportSize({ width, height: 1100 });
      for (const prompt of ['', 'A'.repeat(33459)]) {
        await reset({ language: 'ko', scale, duration, prompt, preview: true, face: true });
        const value = await page.locator('.mmc-tl-card').evaluate(card => {
          const box = card.getBoundingClientRect(), preview = card.querySelector('.mmc-card-preview').getBoundingClientRect();
          const stage = card.querySelector('.mmc-card-preview-stage').getBoundingClientRect();
          const count = card.querySelector('.mmc-tl-card-count'), groups = ['.mmc-tl-card-transport', '.mmc-tl-card-edit-tools'].map(selector => {
            const node = card.querySelector(selector), rect = node.getBoundingClientRect(); return { right: rect.right, left: rect.left, bottom: rect.bottom };
          });
          return { ratio: stage.width / stage.height, card: { left: box.left, right: box.right, bottom: box.bottom },
            preview: { top: preview.top, bottom: preview.bottom }, groups, count: { width: count.clientWidth, scroll: count.scrollWidth, whiteSpace: getComputedStyle(count).whiteSpace } };
        });
        assert.ok(Math.abs(value.ratio - 480 / 832) < .005, JSON.stringify(value));
        assert.ok(value.preview.bottom <= value.card.bottom + 1, JSON.stringify(value));
        assert.ok(value.groups.every(group => group.bottom <= value.preview.top + 1 && group.right <= value.card.right + 1 && group.left >= value.card.left - 1), JSON.stringify(value));
        assert.ok(Math.abs(value.groups[0].right - value.groups[1].right) < 1.1, JSON.stringify(value));
        assert.equal(value.count.whiteSpace, 'nowrap'); assert.ok(value.count.scroll <= value.count.width + 1, JSON.stringify(value));
        geometry.push({ width, scale, duration, characters: prompt.length, ...value }); await unchanged();
      }
    }
  });
  assert.deepEqual(errors, []); assert.equal(requests, 0);
  const out = process.env.CONTINUITY_UX_SCREENSHOT_DIR || process.env.CONTINUITY_ARTIFACT_DIR;
  if (out) {
    fs.mkdirSync(out, { recursive: true });
    await page.setViewportSize({ width: 1000, height: 900 });
    await reset({ language: 'ko', prompt: '한'.repeat(33459), preview: true });
    await page.screenshot({ path: path.join(out, 'segment-prompt-count-ko.png'), fullPage: false });
    fs.writeFileSync(path.join(out, 'segment-prompt-count-results.json'), JSON.stringify({ passed: results.length, results, geometry, alignment, clipAlignment, requests, errors }, null, 2));
  }
  console.log(JSON.stringify({ passed: results.length, geometry: geometry.length, alignment: alignment.length, clipAlignment: clipAlignment.length, requests, errors }));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); });
