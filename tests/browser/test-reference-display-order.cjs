// Display-only ordering in actual state/PromptBox and shelf render methods.
// RAM fixtures; no existing workflow, external media, server, or model calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(process.env.CONTINUITY_SOURCE_ROOT || path.join(__dirname, '../..'));
const read = file => fs.readFileSync(path.join(root, 'web/creator', file), 'utf8');
const method = (name, file) => {
  const found = read(file).match(new RegExp(`^  ${name}\\([^]*?^  \\}`, 'm'));
  assert.ok(found, name); return found[0];
};
const renderAssets = method('renderAssets', 'editor.js');
const renderPool = method('renderPool', 'timeline.js');
assert.match(read('editor.js'), /this\.assetsSection = createDisclosure\(\{ title: t\("Cast and piece references"\)/);
assert.match(renderPool, /this\.poolSection\.setText\(t\("Piece references"\)\)/);
assert.doesNotMatch(renderPool, /setText\(t\("Cast and piece references"\)/);
const catalogRun = spawnSync(process.env.PYTHON_EXECUTABLE_PATH || 'python', ['-B', '-c',
  "import sys;sys.path.insert(0,'tests');import layout;print(layout.catalog_json())"],
  {cwd:root, encoding:'utf8', env:{...process.env, PYTHONUTF8:'1'}});
assert.equal(catalogRun.status, 0, catalogRun.stderr);
const catalog = JSON.parse(catalogRun.stdout.split(/\r?\n/).find(line => line.startsWith('{')));
const fixtureModule = `
import * as S from '/web/creator/state.js';
import {PromptBox} from '/web/creator/prompt.js';
import {el, svg, ICONS, closeOwnedPopovers} from '/web/creator/dom.js';
import {createDisclosure} from '/web/creator/disclosure.js';
import {mediaCountPills} from '/web/creator/media-counts.js';
import {clearButton} from '/web/creator/clear.js';
import {t} from '/web/creator/i18n.js';
import {ko} from '/web/creator/locales/ko.js';
const keepScroll = node => node;
const viewUrl = () => 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"/>';
const referenceSummary = () => '';
const isVisualReference = asset => asset.kind === 'image' || asset.kind === 'video';
const previewable = () => {}, swappable = () => {};
const pieceReferenceFields = () => Object.assign(el('div'), {refresh(){}});
class Renderer { ${renderAssets} }
class Pool {
  ${renderPool}
  watchPoolNamePress(){}
  updatePoolReferenceNotes(){}
  poolChip(asset){return el('span', {class:'mmc-asset-handle', text:'@'+asset.handle});}
}
Object.assign(window, {S, ko});
window.setup = () => {
  document.querySelector('#fixture')?.remove();
  window.box?.closeMenu();
  const asset = handle => ({handle, kind:'image', role:'reference', filename:handle+'.png'});
  window.piece = S.parseTimeline(JSON.stringify({version:2,segments:[{prompt:''}]}));
  piece.assets = ['img-10','ref-10','img-2','ref-2','img-1','ref-1'].map(asset);
  piece.subjects = [
    {handle:'subject10',takes:'person',from:['img-10']},
    {handle:'subject2',takes:'person',from:['img-2']},
    {handle:'subject',takes:'person',from:['img-1']},
    {handle:'subject1',takes:'person',from:[],description:'Unpictured subject'},
  ];
  window.state = piece.segments[0];
  state.assets = ['img-3','ref-3'].map(asset);
  state.prompt = '@subject10 @subject2 @subject @subject1 @img-3 @ref-3 @ref-1 @ref-2 @ref-10';
  state.pool = piece.assets; state.cast = piece.subjects;
  state.globalTexts = {prompt:'',soundscape:'',music:''};
  window.before = S.serializeTimeline(piece);
  window.inputCalls = 0;
  window.box = new PromptBox({getState:()=>state, getCast:()=>piece.subjects,
    getPool:()=>piece.assets, attachBlocked:()=>null, onInput:()=>inputCalls++});
  box.setValue(state.prompt);
  window.renderer = Object.assign(new Renderer(), {state, piece, castPiece:piece,
    replaceAsset(){}, editMark:()=>el('button',{class:'fixture-edit'}), muteButton:()=>el('button',{class:'fixture-mute'}),
    remove(){}, openReferenceSheet(){}, openCastMember(){}});
  window.pool = Object.assign(new Pool(), {timeline:piece});
  pool.poolSection = createDisclosure({title:t('Piece references'), initialOpen:true});
  pool.poolWarning = el('div');
  pool.poolHost = el('div',{},[pool.poolSection.root,pool.poolWarning]);
  const host = el('div',{id:'fixture',class:'mmc-root'},[box.root, renderer.renderAssets(),pool.poolHost]);
  document.body.append(host); pool.renderPool();
};
setup();
`;
const results = [], errors = [], external = [], calls = [];
let browser;
(async () => {
  browser = await chromium.launch({headless:true, executablePath:process.env.BROWSER_EXECUTABLE_PATH || undefined});
  const page = await browser.newPage({viewport:{width:1366,height:768}});
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(catalog => {
    window.__MMC_FAMILIES = catalog;
    window.app = {extensionManager:{setting:{get:key=>key==='Comfy.Locale'?'en':undefined}}};
  }, catalog);
  await page.route('**/*', async route => {
    const url = new URL(route.request().url()); calls.push(url.pathname);
    if (url.hostname !== 'continuity.test') {external.push(url.href);return route.abort();}
    if (url.pathname === '/') return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><script type="module" src="/fixture.js"></script></body></html>'});
    if (url.pathname === '/fixture.js') return route.fulfill({contentType:'text/javascript',body:fixtureModule});
    if (url.pathname === '/scripts/app.js') return route.fulfill({contentType:'text/javascript',body:'export const app=globalThis.app;'});
    if (url.pathname === '/scripts/api.js') return route.fulfill({contentType:'text/javascript',body:'export const api={apiURL:u=>u,addEventListener(){},removeEventListener(){},fetchApi(){throw Error("No API calls allowed");}};'});
    if (url.pathname.startsWith('/web/creator/')) return route.fulfill({contentType:'text/javascript',body:read(url.pathname.slice('/web/creator/'.length))});
    return route.fulfill({status:404,body:''});
  });
  await page.goto('http://continuity.test/');
  try { await page.waitForFunction(() => window.pool && document.querySelector('.mmc-piece-reference-row'),{},{timeout:5000}); }
  catch (error) { console.error('Fixture diagnostics',errors,await page.locator('body').innerText());throw error; }
  const check = async (name, run) => {await run();results.push(name);console.log('PASS '+name);};

  await check('Natural order handles more than nine and underscore/hyphen forms without mutating frozen input', async () => {
    const result = await page.evaluate(() => {
      const input=Object.freeze(['subject10','subject_2','subject','subject1'].map(handle=>Object.freeze({handle})));
      const images=Object.freeze(['img-10','img-2','img-1'].map(handle=>Object.freeze({handle})));
      return {cast:S.sortByHandle(input).map(row=>row.handle),images:S.sortByHandle(images).map(row=>row.handle),
        input:input.map(row=>row.handle),fresh:S.sortByHandle(input)!==input,empty:S.sortByHandle()};
    });
    assert.deepEqual(result,{cast:['subject','subject1','subject_2','subject10'],images:['img-1','img-2','img-10'],
      input:['subject10','subject_2','subject','subject1'],fresh:true,empty:[]});
  });
  await check('@ list keeps all registered cast first, then every owned file in natural order', async () => {
    const categories=await page.evaluate(()=>box.mentionCategories().map(category=>({id:category.id,handles:category.options.map(row=>row.handle)})));
    assert.deepEqual(categories,[{id:'cast',handles:['subject','subject1','subject2','subject10','img-1','img-2','img-10']},
      {id:'refs',handles:['img-3','ref-1','ref-2','ref-3','ref-10']}]);
    assert.equal(await page.evaluate(()=>S.serializeTimeline(piece)===before&&inputCalls===0),true);
  });
  await check('Combined shelf interleaves own and cited pooled files numerically without hiding cast ownership', async () => {
    const result=await page.evaluate(()=>[...document.querySelector('#fixture > .mmc-assets').children].map(row=>({
      handle:row.querySelector('.mmc-asset-handle').textContent,pooled:row.classList.contains('mmc-asset-pooled-chip'),
      cast:row.classList.contains('mmc-asset-cast'),owner:row.querySelector('.mmc-asset-owner')?.textContent??'',
      removable:!!row.querySelector('.mmc-asset-x')})));
    assert.deepEqual(result.map(row=>row.handle),['@img-1','@img-2','@img-3','@img-10','@ref-1','@ref-2','@ref-3','@ref-10']);
    for (const handle of ['@img-1','@img-2','@img-10']) {
      const row=result.find(row=>row.handle===handle);assert.equal(row.cast,true);assert.ok(row.owner);assert.equal(row.pooled,true);assert.equal(row.removable,false);
    }
    for (const handle of ['@img-3','@ref-3']) {
      const row=result.find(row=>row.handle===handle);assert.equal(row.pooled,false);assert.equal(row.removable,true);
    }
    assert.equal(await page.evaluate(()=>S.serializeTimeline(piece)===before),true);
  });
  await check('Timeline pool display is sorted but its stored order, card reference-pass order and saved workflow stay unchanged', async () => {
    assert.deepEqual(await page.locator('.mmc-piece-reference-row').evaluateAll(rows=>rows.map(row=>row.dataset.referenceHandle)),
      ['img-1','img-2','img-10','ref-1','ref-2','ref-10']);
    const result=await page.evaluate(()=>({stored:piece.assets.map(row=>row.handle),passed:S.citedPool(state).map(row=>row.handle),
      serialized:S.serializeTimeline(piece)===before}));
    assert.deepEqual(result,{stored:['img-10','ref-10','img-2','ref-2','img-1','ref-1'],
      passed:['img-10','ref-10','img-2','ref-2','img-1','ref-1'],serialized:true});
    await page.evaluate(()=>{pool.renderPool();renderer.renderAssets();box.mentionCategories();});
    assert.equal(await page.evaluate(()=>S.serializeTimeline(piece)===before&&inputCalls===0),true);
  });
  await check('Korean combined segment heading is exact and standalone Timeline heading remains piece references', async () => {
    const result=await page.evaluate(()=>({combined:ko['Cast and piece references'],pool:ko['Piece references'],
      heading:pool.poolSection.head.textContent}));
    assert.equal(result.combined,'출연진 및 작품 레퍼런스');assert.equal(result.pool,'작품 레퍼런스');
    assert.match(result.heading,/Piece references/);assert.doesNotMatch(result.heading,/Cast and piece/);
  });
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  assert.equal(calls.some(url=>/^\/continuity\//.test(url)),false);
  console.log(JSON.stringify({passed:results.length,pageErrors:errors,externalRequests:external.length,results},null,2));
})().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(async()=>{await browser?.close();});
