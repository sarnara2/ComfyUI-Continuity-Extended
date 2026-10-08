// Actual picker and CSS in an isolated browser; local API seams are stubbed.
// No ComfyUI workflow, file upload or GPU render is performed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../../web/creator');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const css = ['base', 'picker', 'overlays'].map(name =>
  read(`styles/${name}.js`).match(/export const css = `([^]*)`;\s*$/)[1]).join('\n');
const picker = read('picker.js').replace(/^import [^]*?;\r?\n/gm, '').replace(/^export /gm, '');
const dom = read('dom.js').replace(/^export /gm, '');
let passed = 0;
let testBrowser;
async function test(name, fn) { await fn(); passed++; process.stdout.write(`ok ${passed} - ${name}\n`); }

(async () => {
  const state = read('state.js');
  const compile = fs.readFileSync(path.join(root, '../../creator/compile.py'), 'utf8');
  const tuple = name => JSON.parse(`[${compile.match(new RegExp(`^${name} = \\(([^\\n]*)\\)`, 'm'))[1]}]`);
  const IMAGE_TAKES = tuple('IMAGE_TAKES');
  const extra = compile.match(/^VIDEO_TAKES = IMAGE_TAKES \+ \(([^\n]*)\)/m)[1];
  const TAKES = {image:IMAGE_TAKES,video:[...IMAGE_TAKES,...JSON.parse(`[${extra}]`)],audio:tuple('AUDIO_TAKES')};
  const constant = name => state.match(new RegExp(`^export const ${name} = [^]*?;\\r?$`, 'm'))[0].replace(/^export /,'');
  const fn = name => state.match(new RegExp(`^(?:export )?function ${name}\\([^]*?^\\}\\r?$`, 'm'))[0].replace(/^export /,'');
  const S = new Function('TAKES', `${['scopeKind','takeOptions','TAKE_WORD','takeWord'].map(constant).join('\n')}
    ${fn('nextIn')}\n${fn('plateEntry')}\nreturn {TAKES,IMAGE_TAKES:TAKES.image,TAKE_WORD,takeOptions,scopeKind,takeWord,plateEntry};`)(TAKES);
  const browser = await chromium.launch({headless:true,
    executablePath:process.env.BROWSER_EXECUTABLE_PATH || undefined});
  testBrowser = browser;
  const page = await browser.newPage({viewport:{width:1100,height:760}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let requests = 0;
  await page.route('**/*', route => { requests++; route.abort(); });
  await page.setContent(`<style>:root {--comfy-menu-bg:#191919;--fg-color:#ddd;--input-text:#ddd;--descrip-text:#999;--bg-color:#111;--warning-background:#f0a930;--primary-background:#467cb8;}body {background:#111;} ${css}</style><body></body>`);
  await page.evaluate(({dom,picker,takes,takeWords,takeOptions,scopeKind,takeWord}) => {
    const code = `${dom}\n${picker}\nwindow.Picker=Picker;`;
    const preview = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><rect width="180" height="180" fill="%23445366"/></svg>';
    const fixture = {
      rows:[{kind:'video',path:'v1.mp4',name:'Video one',subfolder:''},
            {kind:'video',path:'v2.mp4',name:'Video two',subfolder:''},
            {kind:'video',path:'v3.mp4',name:'Video three',subfolder:''},
            {kind:'image',path:'image.png',name:'Image',subfolder:''},
            {kind:'image',path:'image2.png',name:'Second image',subfolder:''},
            {kind:'audio',path:'sound.wav',name:'Sound',subfolder:''},
            {kind:'audio',path:'sound2.wav',name:'Sound two',subfolder:''},
            {kind:'video',path:'refmod:vmod',name:'Saved video',mod:true,subfolder:''}],
    };
    Object.assign(window, {fixture});
    const seams = `
      const TAKES=${JSON.stringify(takes)}, TAKE_WORD=${JSON.stringify(takeWords)};
      const takeOptions=${takeOptions},scopeKind=${scopeKind},takeWord=${takeWord};
      const t=(text,params)=>text.replace(/\\{(\\w+)\\}/g,(all,key)=>params?.[key] ?? all);
      const listAssets=async ({root}={})=>root==='refmods' ? fixture.rows.filter(a=>a.mod)
        : root==='output' ? fixture.rows.filter(a=>a.kind==='image'||(a.kind==='video'&&!a.mod))
        : fixture.rows.filter(a=>!a.mod);
      const loadPickerPrefs=async()=>({favorites:[],lastShelf:{}});
      const listExternalFolders=async()=>({folders:[]});
      const listingTruncated=()=>false,listedFolders=()=>[],savePickerPrefs=()=>{};
      const viewUrl=()=>${JSON.stringify(preview)},stillUrl=asset=>asset.kind==='audio'?null:viewUrl();
      const greyField=()=> '#222', cropLabel=()=>'', trimLabel=()=>'',dropQueued=()=>{};
      const openTrim=async()=>window.trimAnswer;
    `;
    eval(seams + code);
    window.makePicker = options => {
      if (window.subject) window.subject.close(null);
      window.result = undefined;
      window.subject = new Picker({kinds:['video','image','audio','renders','refmods'],kind:'video',...options},
        result => {window.result=result;});
      window.subject.mount();
    };
  }, {dom,picker,takes:S.TAKES,takeWords:S.TAKE_WORD,
      takeOptions:S.takeOptions.toString(),scopeKind:S.scopeKind.toString(),takeWord:S.takeWord.toString()});
  const open = async (options={referenceOptions:{}}) => {
    await page.evaluate(options => makePicker(options),options);
    await page.waitForFunction(() => subject.loaded && subject.cells.size > 0);
  };
  const select = async (...paths) => page.evaluate(paths => {
    for (const path of paths) subject.toggle(fixture.rows.find(a=>a.path===path));
  },paths);
  const output = async () => page.evaluate(() => subject.selected.map(a=>subject.referencePick(a)));
  const batch = name => page.locator(`.mmc-picker-reference select[name="${name}"]`);

  await test('unrelated pickers retain their original payload and show no reference controls', async () => {
    await open({}); await select('v1.mp4');
    assert.equal(await page.locator('.mmc-reference-field').count(),0);
    assert.deepEqual(await output(),[await page.evaluate(()=>fixture.rows[0])]);
  });
  await test('view-only galleries cannot expose reference import controls', async () => {
    await open({referenceOptions:{},viewOnly:true});
    assert.equal(await page.locator('.mmc-reference-field').count(),0);
  });
  await test('bulk edit/MATCH applies to current selections and subsequent selections', async () => {
    await open(); await select('v1.mp4','v2.mp4');
    await batch('takes').selectOption('edit'); await batch('ref_size').selectOption('match');
    await select('v3.mp4');
    assert.deepEqual((await output()).map(a=>[a.takes,a.ref_size]),
      [['edit','match'],['edit','match'],['edit','match']]);
  });
  await test('each file can override the bulk role and size without toggling selection', async () => {
    const cell = page.locator('.mmc-cell').filter({has:page.locator('img[alt="Video two"]')});
    await cell.locator('select[name="takes"]').selectOption('camera');
    await cell.locator('select[name="ref_size"]').selectOption('max');
    await cell.locator('select[name="takes"]').press('Enter');
    assert.deepEqual((await output()).map(a=>[a.takes,a.ref_size]),
      [['edit','match'],['camera','max'],['edit','match']]);
    assert.equal(await page.evaluate(()=>subject.selected.length),3);
  });
  await test('single-file replacements inherit the current options and source rows are not mutated', async () => {
    await open({referenceOptions:{takes:'edit',ref_size:'match'},single:true,only:'video'});
    const before=await page.evaluate(()=>JSON.stringify(fixture.rows));
    await select('v1.mp4');
    assert.deepEqual((await output()).map(a=>[a.takes,a.ref_size]),[['edit','match']]);
    assert.equal(await page.evaluate(()=>JSON.stringify(fixture.rows)),before);
  });
  await test('trim, track and crop survive while changing import options', async () => {
    await page.evaluate(async()=>{
      const asset=subject.selected[0];
      subject.settings.set(asset.path,{takes:'camera',ref_size:'match',crop:{x:0.1,w:0.8}});
      window.trimAnswer={trim:{start:1,end:4},track:'picture+sound'};
      await subject.editSegment(asset);
    });
    const picked=(await output())[0];
    assert.deepEqual([picked.takes,picked.ref_size,picked.crop,picked.trim,picked.track],
      ['camera','match',{x:0.1,w:0.8},{start:1,end:4},'picture+sound']);
  });
  await test('switching a clip to sound-only uses audio takes and removes visual size', async () => {
    await page.evaluate(async()=>{trimAnswer={trim:null,track:'sound'};await subject.editSegment(subject.selected[0]);});
    const picked=(await output())[0];
    assert.equal(picked.track,'sound');assert.equal(picked.takes,'full');assert.equal(picked.ref_size,undefined);
    const controls=page.locator('.mmc-cell[aria-selected="true"] .mmc-cell-reference');
    assert.deepEqual(await controls.locator('[name="takes"] option:not(:disabled)').evaluateAll(opts=>opts.map(o=>o.value)),S.AUDIO_TAKES || S.TAKES.audio);
    assert.equal(await controls.locator('[name="ref_size"]').count(),0);
  });
  await test('image roles use the actual image vocabulary and reject video-only choices', async () => {
    await open({referenceOptions:{takes:'edit',ref_size:'match'},kind:'image'});await select('image.png');
    const keys=await batch('takes').locator('option:not(:disabled)').evaluateAll(options=>options.map(o=>o.value));
    assert.deepEqual(keys,S.IMAGE_TAKES);
    assert.equal(keys.includes('motion'),true);assert.equal(keys.includes('edit'),false);
    assert.deepEqual((await output()).map(a=>[a.takes,a.ref_size]),[['full','match']]);
  });
  await test('mixed image/video renders offer only shared roles for bulk selection', async () => {
    await open({referenceOptions:{},kind:'renders'});await select('v1.mp4','image.png');
    assert.deepEqual(await batch('takes').locator('option:not(:disabled)').evaluateAll(opts=>opts.map(o=>o.value)),S.IMAGE_TAKES);
    await batch('takes').selectOption('object');await batch('ref_size').selectOption('match');
    assert.deepEqual((await output()).map(a=>[a.takes,a.ref_size]),[['object','match'],['object','match']]);
  });
  await test('invalid mixed-media default is shown as Mixed rather than claiming full', async () => {
    await open({referenceOptions:{takes:'edit'},kind:'renders'});await select('v1.mp4','image.png');
    assert.equal(await batch('takes').inputValue(),'');
    assert.equal(await batch('takes').locator('option:checked').innerText(),'Mixed');
    assert.deepEqual((await output()).map(a=>a.takes),['edit','full']);
  });
  await test('audio roles apply individually and in bulk without fictitious encoding sizes', async () => {
    await open({referenceOptions:{},kind:'audio'});
    assert.equal(await batch('takes').locator('option:checked').innerText(),'Default');
    await batch('takes').selectOption('copy');await select('sound.wav','sound2.wav');
    assert.deepEqual((await output()).map(a=>[a.takes,a.ref_size]),[['copy',undefined],['copy',undefined]]);
    assert.equal(await page.locator('[name="ref_size"]').count(),0);
    const cell=page.locator('.mmc-cell').filter({has:page.locator('.mmc-cell-fallback span',{hasText:'Sound two'})});
    await cell.locator('[name="takes"]').selectOption('voice');
    assert.deepEqual((await output()).map(a=>a.takes),['copy','voice']);
    assert.equal(await batch('takes').locator('option:checked').innerText(),'Mixed');
  });
  await test('pre-encoded RefMods allow supported roles but have no encoding size selector', async () => {
    await open({referenceOptions:{takes:'camera',ref_size:'match'},kind:'refmods'});await select('refmod:vmod');
    assert.equal((await output())[0].takes,'camera');
    assert.equal(await page.locator('[name="ref_size"]').count(),0);
    assert.equal((await output())[0].ref_size,undefined);
  });
  await test('fixed-purpose callers restrict choices without leaking concepts into the picker', async () => {
    await open({referenceOptions:{allowedTakes:{audio:['voice']}},kind:'audio'});await select('sound.wav');
    assert.deepEqual(await batch('takes').locator('option:not(:disabled)').evaluateAll(opts=>opts.map(o=>o.value)),['voice']);
    assert.equal(await batch('takes').locator('option:checked').innerText(),'Default');
    await page.getByRole('button',{name:'Add',exact:true}).click();
    assert.equal(await page.evaluate(()=>result[0].takes),undefined);
    await open({referenceOptions:{allowedTakes:{audio:['voice']}},kind:'audio'});await select('sound.wav');
    await batch('takes').selectOption('voice');await page.getByRole('button',{name:'Add',exact:true}).click();
    assert.equal(await page.evaluate(()=>result[0].takes),'voice');
  });
  await test('untouched fields show Default and remain omitted, preserving caller defaults', async () => {
    await open();await select('v1.mp4');
    assert.equal(await batch('takes').locator('option:checked').innerText(),'Default');
    assert.equal(await batch('ref_size').locator('option:checked').innerText(),'Default');
    assert.equal(await page.locator('.mmc-cell[aria-selected="true"] [name="takes"] option:checked').innerText(),'Default');
    await page.getByRole('button',{name:'Add',exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>[result[0].takes,result[0].ref_size]),[undefined,undefined]);
    await open();await select('v1.mp4');await batch('takes').selectOption('full');await batch('ref_size').selectOption('max');
    await page.getByRole('button',{name:'Add',exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>[result[0].takes,result[0].ref_size]),['full','max']);
  });
  await test('organize mode hides reference controls without altering selection settings', async () => {
    await open();await select('v1.mp4');await batch('takes').selectOption('edit');
    await page.evaluate(()=>subject.setOrganize(true));
    assert.equal(await page.locator('.mmc-reference-field').count(),0);
    assert.equal(await page.locator('.mmc-reference-foot').count(),0);
    await page.evaluate(()=>subject.setOrganize(false));
    assert.equal((await output())[0].takes,'edit');
  });
  await test('sheet/cut payloads retain per-panel roles without sending roles to the plate builder', async () => {
    await open({referenceOptions:{takes:'person',ref_size:'match'},kind:'image'});await select('image.png');
    const answer=await page.evaluate(()=>subject.sheetAnswer({path:'built.png'},subject.selected));
    assert.equal(answer.path,'built.png');
    assert.deepEqual([answer.takes,answer.ref_size,answer.panels[0].takes],['person','match','person']);
    assert.equal(await page.evaluate(()=>subject.panelPayload(subject.selected[0]).takes),undefined);
    const entry=S.plateEntry(answer,new Set(),{plate:'ref',panel:'ref'});
    assert.deepEqual([entry.takes,entry.ref_size,entry.panels[0].takes],['person','match','person']);
  });
  await test('older sheet callers keep max/defaults and existing panel handles/takes', async () => {
    const kept=new Map([['source.png',{handle:'ref-3',takes:'style'}]]);
    const old=S.plateEntry({path:'sheet.png',panels:[{path:'source.png'}]},new Set(),{kept});
    assert.equal(old.ref_size,'max');assert.equal(old.takes,undefined);
    assert.deepEqual([old.panels[0].handle,old.panels[0].takes],['ref-3','style']);
    const changed=S.plateEntry({path:'sheet.png',ref_size:'match',panels:[{path:'source.png',takes:'full'}]},new Set(),{kept});
    assert.equal(changed.panels[0].takes,'full');assert.equal(changed.panels[0].handle,'ref-3');
  });
  await test('reopening an existing sheet preserves panel roles, framing and MATCH until explicitly changed', async () => {
    const panels=[{path:'image.png',takes:'person',crop:{x:0.1,w:0.8}},
                  {path:'image2.png',takes:'style'}];
    await open({referenceOptions:{takes:'full',ref_size:'match'},kind:'image',
      plate:{sheet:false,cut:false,panels}});
    assert.deepEqual((await output()).map(a=>[a.path,a.takes,a.ref_size]),
      [['image.png','person','match'],['image2.png','style','match']]);
    assert.deepEqual((await output())[0].crop,{x:0.1,w:0.8});
    let answer=await page.evaluate(()=>subject.sheetAnswer({path:'rebuilt.png'},subject.selected));
    assert.equal(answer.ref_size,'match');
    assert.deepEqual(answer.panels.map(a=>a.takes),['person','style']);
    const kept=new Map([['image.png',{handle:'ref-3',takes:'person'}],
                        ['image2.png',{handle:'ref-4',takes:'style'}]]);
    const entry=S.plateEntry(answer,new Set(),{kept});
    assert.deepEqual(entry.panels.map(a=>[a.handle,a.takes]),[['ref-3','person'],['ref-4','style']]);
    const cell=page.locator('.mmc-cell').filter({has:page.locator('img[alt="Image"]')});
    await cell.locator('[name="takes"]').selectOption('object');
    answer=await page.evaluate(()=>subject.sheetAnswer({path:'rebuilt.png'},subject.selected));
    assert.deepEqual(answer.panels.map(a=>a.takes),['object','style']);
    assert.equal(answer.ref_size,'match');
    await batch('takes').selectOption('full');
    answer=await page.evaluate(()=>subject.sheetAnswer({path:'rebuilt.png'},subject.selected));
    assert.deepEqual(answer.panels.map(a=>a.takes),['full','full']);
    assert.deepEqual(panels,[{path:'image.png',takes:'person',crop:{x:0.1,w:0.8}},
                            {path:'image2.png',takes:'style'}]);
  });
  await test('Add returns the chosen settings rather than mutating library metadata', async () => {
    await open({referenceOptions:{takes:'edit',ref_size:'match'}});await select('v1.mp4','v2.mp4');
    await page.getByRole('button',{name:'Add',exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>result.map(a=>[a.path,a.takes,a.ref_size])),
      [['v1.mp4','edit','match'],['v2.mp4','edit','match']]);
  });
  await test('footer and per-file fields stay inside the modal at narrow widths', async () => {
    await open();await select('v1.mp4','v2.mp4');
    await page.screenshot({path:path.resolve(__dirname,'../../../assets/reference-import-options-wide-harness.png')});
    await page.setViewportSize({width:520,height:680});
    const boxes=await page.locator('.mmc-reference-foot,.mmc-cell[aria-selected="true"] .mmc-reference-field').evaluateAll(nodes=>
      nodes.map(node=>{const b=node.getBoundingClientRect();return {x:b.x,right:b.right,bottom:b.bottom,width:b.width};}));
    assert.ok(boxes.every(b=>b.x>=0&&b.right<=520&&b.bottom<=680&&b.width>0),JSON.stringify(boxes));
    const media=page.locator('.mmc-cell').filter({has:page.locator('img[alt="Video one"]')});
    assert.ok(await media.locator('select[name="takes"]').isVisible());
    await page.screenshot({path:path.resolve(__dirname,'../../../assets/reference-import-options-harness.png')});
  });
  assert.deepEqual(errors,[]);assert.equal(requests,0);
  await browser.close();process.stdout.write(`PASS ${passed} isolated reference import checks (zero network requests)\n`);
})().catch(async error=>{console.error(error);await testBrowser?.close();process.exitCode=1;});
