/* Actual Picker class and CSS in an isolated browser. Listings and previews
 * are in-memory adapters: no ComfyUI/profile/file writes or GPU work. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = process.env.CONTINUITY_SOURCE_ROOT
  ? path.resolve(process.env.CONTINUITY_SOURCE_ROOT) : path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, 'web/creator', file), 'utf8');
const picker = read('picker.js').replace(/^import[^;]*;\r?\n/gm, '').replace(/^export /gm, '');
// Imports are stripped only by this browser fixture. Execute the real new
// display-memory helper rather than substituting behavior with fake globals.
const viewHelpers = read('viewprefs.js').replace(/^export /gm, '');
const checkHelpers = read('picker-checks.js').replace(/^export /gm, '');
const el = read('dom.js').match(/^export function el\([^]*?^\}/m)[0].replace('export ', '');
const css = ['base', 'editor', 'popovers', 'picker', 'overlays', 'timeline', 'presets', 'fullscreen']
  .map(file => read(`styles/${file}.js`).match(/export const css = `([^]*)`;\s*$/)[1]).join('\n');
const code = `
${el}
const {readViewPrefs,patchViewPrefs,clearViewPrefs,pickerViewContext,pickerViewKind}=(()=>{
${viewHelpers}
return {readViewPrefs,patchViewPrefs,clearViewPrefs,pickerViewContext,pickerViewKind};
})();
const {pickerSelectionContext,readPickedPaths,writePickedPaths,clearPickedPaths}=(()=>{
${checkHelpers}
return {pickerSelectionContext,readPickedPaths,writePickedPaths,clearPickedPaths};
})();
window.el = el;
const t = (text, values = {}) => (window.translations?.[text] || text).replace(/\\{([^}]+)\\}/g, (_, key) => values[key] ?? key);
const icon = () => el('span', {class:'fixture-icon'});
const ICONS = {image:'',video:'',audio:'',cube:''};
const svg = () => el('span');
const mountOverlay = node => { document.body.append(node); return () => node.remove(); };
const dismissable = node => () => node.remove();
const listedFolders = () => ['project', 'project/sub'];
const listingTruncated = () => false;
const savePickerPrefs = () => { window.prefsWrites++; };
const stillUrl = () => null;
const viewUrl = () => { throw new Error('Unexpected media fetch'); };
const greyField = () => '#222';
const takeOptions = () => ['full','object','scene','style','edit'];
const takeWord = key => key;
const trimLabel = setting => setting.trim ? 'Configured range' : '';
const cropLabel = crop => crop ? 'Crop' : '';
const queueState = () => ({remaining:0});
const dropQueued = () => { throw new Error('Unexpected queue change'); };
${picker}
Picker.prototype.load = function () {
  this.assets = window.listing.map(row => ({...row}));
  this.renders = window.renderListing?.map(row => ({...row})) || [];
  this.mods = window.modListing?.map(row => ({...row})) || [];
  this.meshes = window.meshListing?.map(row => ({...row})) || [];
  this.loaded = this.builtinLoaded = true;
  this.renderShelves(); this.renderGrid(); this.renderFoot();
};
Picker.prototype.view = asset => { window.previews.push(asset.path); };
window.baseListing = [
  {path:'project/clip10.mp4',name:'clip10.mp4',kind:'video',subfolder:'project',mtime:30,size:3145728},
  {path:'project/clip2.mp4',name:'clip2.mp4',kind:'video',subfolder:'project',mtime:20,size:1048576,width:480,height:832,duration:12.012},
  {path:'project/clip1.mp4',name:'clip1.mp4',kind:'video',subfolder:'project',mtime:10,size:512},
  {path:'project/clip11.mp4',name:'clip11.mp4',kind:'video',subfolder:'project',mtime:40,size:4096},
  {path:'portrait.png',name:'portrait.png',kind:'image',subfolder:'',mtime:50,size:1234},
  {path:'voice.wav',name:'voice.wav',kind:'audio',subfolder:'',mtime:60,size:2048},
];
window.mountPicker = (options = {}, rows = baseListing) => {
  window.subject?.close(null);
  // These old usability cases are independent, not close/reopen memory tests.
  // Reset only new display records; file preferences and all assertions stay.
  clearViewPrefs();
  clearPickedPaths();
  window.previews = []; window.prefsWrites = 0;
  window.listing = rows;
  window.subject = new Picker({kinds:['image','video','audio'],kind:'video',...options}, result => { window.result = result; });
  subject.mount();
  return subject;
};
window.paths = () => subject.selected.map(row => row.path);
window.displayed = () => subject.visible().map(row => row.name);
window.findCell = name => [...subject.cells.values()].find(cell => cell.getAttribute('aria-label').includes(name+' —'));
window.clickCell = (name, shiftKey = false) => findCell(name).dispatchEvent(new MouseEvent('click', {bubbles:true,shiftKey}));
mountPicker();
`;
new vm.Script(code, {filename:'picker-usability-fixture.js'});
const results = [];
const check = async (name, run) => { await run(); results.push(name); console.log(`PASS ${name}`); };
let browser, requests = 0;
(async () => {
  browser = await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH || undefined,headless:true});
  const page = await browser.newPage({viewport:{width:1280,height:900}});
  await page.route('**/*', route => { requests++; return route.abort(); });
  await page.setContent(`<html class="dark-theme" style="--comfy-menu-bg:#191919;--fg-color:#ededed;--input-text:#ddd;--descrip-text:#aaa;--bg-color:#191919;--primary-background:#0b8ce9;--mmc-type:1"><style>${css}</style><body style="background:#111"></body></html>`);
  await page.evaluate(`(() => { ${code} })()`);
  await check('Recent display uses modification time; filename display is numeric and leaves source/selection/settings order alone', async () => {
    assert.deepEqual(await page.evaluate(() => displayed()),['clip11.mp4','clip10.mp4','clip2.mp4','clip1.mp4']);
    const before = await page.evaluate(() => {
      clickCell('clip10.mp4'); clickCell('clip2.mp4');
      subject.settings.set('project/clip2.mp4',{trim:{start:2,end:5},track:'picture+sound',takes:'edit',ref_size:'match'});
      return {assets:JSON.stringify(subject.assets),selected:paths(),settings:JSON.stringify([...subject.settings])};
    });
    await page.locator('.mmc-picker-sort').selectOption('name');
    assert.deepEqual(await page.evaluate(() => displayed()),['clip1.mp4','clip2.mp4','clip10.mp4','clip11.mp4']);
    assert.deepEqual(await page.evaluate(() => ({assets:JSON.stringify(subject.assets),selected:paths(),settings:JSON.stringify([...subject.settings])})),before);
  });
  await check('Shift import adds range, keeps existing picks, advances anchor and never opens preview', async () => {
    await page.evaluate(() => {mountPicker();subject.sortOrder='name';subject.renderGrid();clickCell('clip1.mp4');clickCell('clip11.mp4',true);});
    assert.deepEqual(await page.evaluate(() => paths()),['project/clip1.mp4','project/clip2.mp4','project/clip10.mp4','project/clip11.mp4']);
    await page.evaluate(() => clickCell('clip2.mp4',true));
    assert.equal(await page.evaluate(() => paths().length),4);
    assert.deepEqual(await page.evaluate(() => previews),[]);
  });
  await check('Range capacity follows total and target track buckets without altering trim/reference settings', async () => {
    const out = await page.evaluate(() => {
      mountPicker({referenceOptions:{takes:'full',ref_size:'max'},capacity:kind=>({used:0,max:kind==='audio'?1:2,filesLeft:3})});
      subject.sortOrder='name';subject.settings.set('project/clip2.mp4',{track:'sound',trim:{start:1,end:3},takes:'edit'});
      subject.settings.set('project/clip10.mp4',{track:'picture+sound',trim:{start:2,end:4},ref_size:'match'});
      const before=JSON.stringify([...subject.settings]);subject.renderGrid();clickCell('clip1.mp4');clickCell('clip11.mp4',true);
      return {paths:paths(),same:before===JSON.stringify([...subject.settings]),audio:subject.claimed('audio'),video:subject.claimed('video'),files:subject.claimedFiles()};
    });
    assert.deepEqual(out,{paths:['project/clip1.mp4','project/clip2.mp4','project/clip10.mp4'],same:true,audio:1,video:2,files:3});
    assert.equal(await page.locator('.mmc-cell[aria-selected="true"]').count(),3);
  });
  await check('Shift+Enter imports a range; nested reference fields do not toggle selection', async () => {
    await page.evaluate(() => mountPicker({referenceOptions:{takes:'full',ref_size:'max'}}));
    // Production focuses search after mount. Settle that existing focus return
    // before the test deliberately moves keyboard focus to its target cell.
    await page.waitForFunction(() => document.activeElement===subject.search);
    await page.evaluate(() => {subject.sortOrder='name';subject.renderGrid();clickCell('clip1.mp4');findCell('clip10.mp4').focus();});
    await page.keyboard.press('Shift+Enter');
    assert.deepEqual(await page.evaluate(() => paths()),['project/clip1.mp4','project/clip2.mp4','project/clip10.mp4']);
    const count=await page.evaluate(() => paths().length);
    await page.evaluate(() => findCell('clip10.mp4').querySelector('select').dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true})));
    assert.equal(await page.evaluate(() => paths().length),count);
  });
  await check('Search/tab/shelf and sort reset the import anchor; missing anchor falls back to one pick', async () => {
    assert.equal(await page.evaluate(() => {
      mountPicker();clickCell('clip1.mp4');subject.search.value='clip2';subject.search.dispatchEvent(new Event('input'));
      const queryReset=subject.pickAnchor===null;clickCell('clip2.mp4',true);
      subject.setShelf('project');const shelfReset=subject.pickAnchor===null;
      subject.pickAnchor='project/clip2.mp4';subject.selectTab('audio');
      return queryReset&&shelfReset&&subject.pickAnchor===null&&subject.selected.length===0;
    }),true);
  });
  await check('Single-pick and view-only preserve their original Shift-click behavior', async () => {
    assert.deepEqual(await page.evaluate(() => {
      mountPicker({single:true});clickCell('clip1.mp4');clickCell('clip11.mp4',true);
      const single=paths();mountPicker({viewOnly:true});clickCell('clip1.mp4',true);
      return {single,viewPicks:paths(),previews};
    }),{single:['project/clip11.mp4'],viewPicks:[],previews:['project/clip1.mp4']});
  });
  await check('Organize keeps its own additive range without changing import picks', async () => {
    const result=await page.evaluate(() => {
      mountPicker();subject.sortOrder='name';clickCell('clip11.mp4');subject.setOrganize(true);
      clickCell('clip1.mp4');clickCell('clip10.mp4',true);
      return {picks:paths(),marks:subject.marked,anchor:subject.pickAnchor};
    });
    assert.deepEqual(result,{picks:['project/clip11.mp4'],marks:['project/clip1.mp4','project/clip2.mp4','project/clip10.mp4'],anchor:null});
  });
  await check('Single and double clicks preserve toggle and preview behavior after a range', async () => {
    assert.deepEqual(await page.evaluate(() => {
      mountPicker();clickCell('clip1.mp4');clickCell('clip2.mp4',true);
      const before=paths();clickCell('clip10.mp4');clickCell('clip10.mp4');
      return {same:JSON.stringify(before)===JSON.stringify(paths()),previews};
    }),{same:true,previews:['project/clip10.mp4']});
  });
  await check('Hover/focus panel shows only listed metadata and renders user paths as plain text', async () => {
    await page.evaluate(() => {mountPicker();findCell('clip2.mp4').focus();});
    assert.equal(await page.locator('.mmc-file-info').isVisible(),true);
    assert.match(await page.locator('.mmc-file-info').innerText(),/480 × 832/);
    assert.match(await page.locator('.mmc-file-info').innerText(),/12.012 s/);
    assert.equal(await page.evaluate(() => findCell('clip2.mp4').getAttribute('aria-describedby')===subject.fileInfo.id),true);
    await page.evaluate(() => {
      const row={path:'<img src=x onerror=alert(1)>.wav',name:'<script>alert(1)</script>.wav',kind:'audio'};
      mountPicker({kind:'audio'},[row]);subject.cells.get(row.path).focus();
    });
    assert.equal(await page.locator('.mmc-file-info img, .mmc-file-info script').count(),0);
    assert.equal(await page.locator('.mmc-file-info dt').count(),2);
    assert.match(await page.locator('.mmc-file-info').innerText(),/<script>alert\(1\)<\/script>/);
    assert.equal(requests,0);
  });
  await check('Hover shows information after a short pause; leaving and grid scrolling clear it', async () => {
    await page.evaluate(() => {mountPicker();subject.search.focus();});
    await page.locator('.mmc-cell').first().hover();
    await page.waitForFunction(() => !subject.fileInfo.hidden);
    await page.locator('.mmc-search').hover();
    assert.equal(await page.locator('.mmc-file-info').isVisible(),false);
    await page.evaluate(() => {subject.cells.values().next().value.focus();subject.grid.dispatchEvent(new Event('scroll'));});
    assert.equal(await page.locator('.mmc-file-info').isVisible(),false);
  });
  await check('Selected border/check, focus ring and hover border remain distinct; grids and popovers have thin scrollbars', async () => {
    const state=await page.evaluate(() => {
      mountPicker();clickCell('clip2.mp4');findCell('clip2.mp4').focus();
      const chosen=findCell('clip2.mp4'),style=getComputedStyle(chosen);
      const pop=el('div',{class:'mmc-pop mmc-pop-scroll'},[el('div',{text:'Long list',style:{height:'1000px'}})]);document.body.append(pop);
      const out={selected:chosen.getAttribute('aria-selected'),check:getComputedStyle(chosen.querySelector('.mmc-check')).display,border:style.borderColor,
        outline:style.outlineWidth,outlineColor:style.outlineColor,grid:getComputedStyle(subject.grid).scrollbarWidth,pop:getComputedStyle(pop).scrollbarWidth};pop.remove();return out;
    });
    assert.equal(state.selected,'true');assert.equal(state.check,'flex');assert.equal(state.outline,'2px');
    assert.notEqual(state.border,state.outlineColor);assert.equal(state.grid,'thin');assert.equal(state.pop,'thin');
  });
  await check('Display sorting handles external assets, render types and mod listings without modifying any source', async () => {
    assert.equal(await page.evaluate(() => {
      mountPicker();subject.externalFolder='folder';subject.externalAssets=baseListing.filter(row=>row.kind==='video').map(row=>({...row,path:'external:folder:'+row.name}));
      const before=JSON.stringify(subject.externalAssets);subject.sortOrder='name';
      const external=subject.visible().map(row=>row.name).join(',')==='clip1.mp4,clip2.mp4,clip10.mp4,clip11.mp4'&&before===JSON.stringify(subject.externalAssets);
      subject.externalFolder=null;subject.kind='renders';subject.renders=[{path:'r10.png',name:'r10.png',kind:'image'},{path:'r2.mp4',name:'r2.mp4',kind:'video'}];
      const renders=subject.visible().map(row=>row.name).join(',')==='r2.mp4,r10.png';
      subject.kind='refmods';subject.mods=[{path:'refmod:z10',name:'z10',kind:'image',mod:true},{path:'refmod:z2',name:'z2',kind:'image',mod:true}];
      return external&&renders&&subject.visible()[0].name==='z2';
    }),true);
  });
  await check('Missing/invalid metadata is omitted, and invalid timestamps do not disturb deterministic display order', async () => {
    assert.deepEqual(await page.evaluate(() => {
      const rows=[{path:'b10.mp4',name:'b10.mp4',kind:'video',mtime:Infinity,size:NaN,width:NaN,height:0,duration:-1},
        {path:'b2.mp4',name:'b2.mp4',kind:'video',mtime:NaN},{path:'b1.mp4',name:'b1.mp4',kind:'video'}];
      mountPicker({},rows);
      return {order:displayed(),facts:subject.fileFacts(rows[0]).map(([label])=>label)};
    }),{order:['b1.mp4','b2.mp4','b10.mp4'],facts:['File type','File path']});
  });
  await check('Zero-capacity ranges select nothing; a full video bucket still allows configured sound-only files', async () => {
    assert.deepEqual(await page.evaluate(() => {
      mountPicker({capacity:()=>({used:0,max:0,filesLeft:0})});clickCell('clip1.mp4');clickCell('clip11.mp4',true);
      const none=paths();mountPicker({capacity:kind=>({used:0,max:kind==='audio'?1:1,filesLeft:2})});subject.sortOrder='name';
      subject.settings.set('project/clip11.mp4',{track:'sound'});subject.renderGrid();clickCell('clip1.mp4');clickCell('clip11.mp4',true);
      return {none,mixed:paths()};
    }),{none:[],mixed:['project/clip1.mp4','project/clip11.mp4']});
  });
  await check('Paged range uses current displayed order and shared capacity; sheet layout remains unchanged', async () => {
    assert.deepEqual(await page.evaluate(() => {
      const rows=Array.from({length:250},(_,i)=>({path:'clip'+i+'.mp4',name:'clip'+i+'.mp4',kind:'video',mtime:i}));
      mountPicker({capacity:()=>({used:0,max:4,filesLeft:4})},rows);subject.sortOrder='name';subject.renderGrid();
      subject.toggle(subject.visible()[239]);subject.setPage(1);subject.pickRun(subject.visible()[243]);
      const paged=paths();mountPicker({kind:'image',plate:{sheet:false,panels:[{path:'portrait.png'}]}});
      subject.selected=[subject.assets.find(row=>row.kind==='image')];const sheet=[...subject.sheet];subject.sortSelect.value='name';subject.sortSelect.dispatchEvent(new Event('change'));
      return {paged,same:JSON.stringify(sheet)===JSON.stringify(subject.sheet)};
    }),{paged:['clip239.mp4','clip240.mp4','clip241.mp4','clip242.mp4'],same:true});
  });
  await check('Modal information stays inside normal/narrow/localized viewports; scrolling still reaches long grids', async () => {
    for (const [width,height,localized] of [[1280,900,false],[650,800,false],[460,760,true],[380,760,false]]) {
      await page.setViewportSize({width,height});
      await page.evaluate(localized => {
        window.translations=localized?{'Recently modified':'최근 수정순','Filename order':'파일명순','File type':'파일 종류','File path':'파일 경로','File size':'파일 크기','Modified':'수정 시각','Video':'비디오','Image':'이미지','Audio':'오디오','Organize':'정리','Open folder':'폴더 열기','+ Add folder':'+ 폴더 추가','+  Upload video':'+ 비디오 업로드'}:{};
        mountPicker({},Array.from({length:80},(_,i)=>({path:'project/clip'+i+'.mp4',name:'clip'+i+'.mp4',kind:'video',mtime:i,size:1024})));
        subject.cells.values().next().value.focus();
      },localized);
      const dims=await page.evaluate(() => {
        const modal=subject.modal.getBoundingClientRect(),info=subject.fileInfo.getBoundingClientRect(),sort=subject.sortSelect.getBoundingClientRect();
        return {inside:info.left>=modal.left&&info.right<=modal.right&&info.top>=modal.top&&info.bottom<=modal.bottom,
          sort:sort.left>=modal.left&&sort.right<=modal.right,scroll:subject.grid.scrollHeight>subject.grid.clientHeight,overflow:document.documentElement.scrollWidth>innerWidth};
      });
      assert.deepEqual(dims,{inside:true,sort:true,scroll:true,overflow:false});
      if (process.env.PICKER_SCREENSHOT_DIR) await page.screenshot({path:path.join(process.env.PICKER_SCREENSHOT_DIR,`picker-${width}${localized?'-ko':''}.png`)});
    }
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.evaluate(() => getComputedStyle(subject.fileInfo).animationName),'none');
  });
  await check('Closing clears hover timers, metadata and overlay without queue/media writes', async () => {
    assert.equal(await page.evaluate(async () => {
      mountPicker();const old=subject;old.showFileInfo(old.assets[0],old.cells.get(old.assets[0].path),true);old.close(null);
      await new Promise(resolve=>setTimeout(resolve,300));return old.fileInfo.hidden&&!old.overlay.isConnected&&old.infoTimer===null;
    }),true);
  });
  assert.equal(requests,0);
  console.log(JSON.stringify({suite:'picker-usability',passed:results.length,requests,tests:results},null,2));
})().catch(error => {console.error(error);process.exitCode=1;}).finally(async () => {await browser?.close();});
