// Real shared Picker + DOM + CSS, isolated local API fixtures, no native window.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../../web/creator');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const css = ['base', 'picker', 'overlays'].map(name =>
  read(`styles/${name}.js`).match(/export const css = `([^]*)`;\s*$/)[1]).join('\n');
const picker = read('picker.js').replace(/^import [^]*?;\r?\n/gm, '').replace(/^export /gm, '');
const dom = read('dom.js').replace(/^export /gm, '');
const memory = `
const {readViewPrefs,patchViewPrefs,pickerViewContext,pickerViewKind,clearViewPrefs}=(()=>{
  ${read('viewprefs.js').replace(/^export /gm,'')}
  return {readViewPrefs,patchViewPrefs,pickerViewContext,pickerViewKind,clearViewPrefs};})();
const {pickerSelectionContext,readPickedPaths,writePickedPaths}=(()=>{
  ${read('picker-checks.js').replace(/^export /gm,'')}
  return {pickerSelectionContext,readPickedPaths,writePickedPaths};})();`;
let browser, passed = 0;
async function test(name, fn) { await fn(); passed++; process.stdout.write(`ok ${passed} - ${name}\n`); }

(async () => {
  browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => { requests.push(route.request().url()); route.abort(); });
  await page.setContent(`<style>:root {--comfy-menu-bg:#191919;--fg-color:#ddd;--input-text:#ddd;--descrip-text:#999;--bg-color:#111;--warning-background:#f0a930;--primary-background:#467cb8;}body {background:#111;} ${css}</style><body></body>`);
  await page.evaluate(({ dom, picker, memory }) => {
    window.fixture = {
      folders: [{ id: 'a', name: 'Project media', path: 'H:\\Projects\\Media' },
        { id: 'b', name: 'Other folder', path: 'H:\\Projects\\Other' }],
      prefs: { favorites: [], lastShelf: {}, externalFolder: null },
      calls: [], directoryCalls: [], imports: [], choice: null, delay: null, importError: null,
      files: [
        { path: 'external:a/face.png', kind: 'image', name: 'Face', subfolder: '', size: 23, mtime: 1 },
        { path: 'external:a/sub/scene.png', kind: 'image', name: 'Scene', subfolder: 'sub', size: 42, mtime: 2 },
        { path: 'external:a/clip.mp4', kind: 'video', name: 'Clip', subfolder: '', size: 79, mtime: 3 },
        { path: 'external:a/voice.wav', kind: 'audio', name: 'Voice', subfolder: '', size: 31, mtime: 4 },
        { path: 'external:a/person.safetensors', kind: 'image', mod: true, name: 'Person RefMod', tokens: 64, subfolder: '', size: 88, mtime: 5 },
        { path: 'external:b/other.png', kind: 'image', name: 'Other', subfolder: '', size: 22, mtime: 6 },
      ],
      builtin: [{ path: 'continuity/normal.png', kind: 'image', name: 'Builtin', subfolder: 'continuity', mtime: 1 }],
      builtinFolders: {input:['3d','continuity','pasted'],output:['renders-day'],refmods:['saved']},
    };
    const preview = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><rect width="180" height="180" fill="%23445366"/><circle cx="90" cy="80" r="35" fill="%238999ae"/></svg>';
    eval(`
      const t=(text,params)=>text.replace(/\\{(\\w+)\\}/g,(all,key)=>params?.[key] ?? all);
      const takeOptions=asset=>asset.kind==='audio'||asset.track==='sound'
        ? ['full','copy','voice','ambience','music']
        : asset.kind==='video' ? ['full','person','object','scene','style','action','camera','edit','continue']
        : ['full','person','object','scene','style'];
      const takeWord=word=>word;
      const listAssets=async({root='input'}={})=>{fixture.calls.push(['builtin',root]);return root==='input'?fixture.builtin:[];};
      const listedFolders=(root='input')=>fixture.builtinFolders[root]??[],listingTruncated=()=>false;
      const loadPickerPrefs=async()=>structuredClone(fixture.prefs);
      const savePickerPrefs=prefs=>{fixture.prefs=structuredClone(prefs);};
      const listExternalFolders=async()=>({folders:structuredClone(fixture.folders)});
      const chooseExternalFolder=async()=>fixture.choice?{folder:structuredClone(fixture.choice)}:null;
      const removeExternalFolder=async id=>{fixture.calls.push(['forget',id]);fixture.folders=fixture.folders.filter(f=>f.id!==id);};
      const revealExternalFolder=async id=>{fixture.calls.push(['reveal',id]);return fixture.folders.find(f=>f.id===id)?.path;};
      const listExternalAssets=async({folder,kind,directory=''})=>{
        fixture.calls.push(['external',folder,kind]);
        fixture.directoryCalls.push([folder,kind,directory]);
        const prefix='external:'+folder+'/'+(directory?directory+'/':'');
        const candidates=fixture.files.filter(row=>row.path.startsWith(prefix));
        const names=[...new Set(candidates.map(row=>row.path.slice(prefix.length)).filter(name=>name.includes('/')).map(name=>name.split('/')[0]))];
        const folders=names.map(name=>({name,directory:(directory?directory+'/':'')+name}));
        const rows=candidates.filter(row=>!row.path.slice(prefix.length).includes('/'))
          .filter(row=>kind==='refmods'?row.mod:!row.mod&&(kind==='renders'||kind==='guides'
            ? ['image','video'].includes(row.kind):row.kind===kind));
        if(fixture.delay) await fixture.delay(folder,kind);
        if(fixture.listError) throw Error(fixture.listError);
        return {assets:structuredClone(rows),folders,directory,parent:directory?directory.split('/').slice(0,-1).join('/'):null,truncated:fixture.truncated===true};
      };
      const checkExternalAssets=async({paths})=>({assets:paths.map(path=>fixture.files.find(row=>row.path===path)).filter(Boolean)});
      const memberFromMod=async()=>{};
      const importExternalAssets=async rows=>{
        fixture.imports.push(structuredClone(rows));
        if(fixture.importDelay) await fixture.importDelay();
        if(fixture.importError) throw Error(fixture.importError);
        return rows.map(row=>({...row,path:row.mod?'refmod:imports/'+row.name+'.safetensors'
          :'continuity/external/'+row.path.slice('external:'.length),subfolder:'continuity/external'}));
      };
      const viewUrl=()=>${JSON.stringify(preview)},stillUrl=asset=>asset.kind==='audio'?null:viewUrl();
      const greyField=()=> '#222',cropLabel=()=>'',trimLabel=()=>'',dropQueued=()=>{};
      const queueState=()=>({remaining:0}),watchQueue=()=>()=>{};
      const openTrim=async options=>{fixture.calls.push(['trim',options.path]);return {trim:{start:1,end:3},track:'picture+sound'};};
      const openPicture=async options=>{fixture.calls.push(['picture',options.path]);return null;};
      const cutPanel=async options=>{fixture.calls.push(['cut',options.panels.map(p=>p.path)]);return URL.createObjectURL(new Blob(['x']));};
      const buildPlate=async options=>{fixture.calls.push(['plate',options.panels.map(p=>p.path)]);return {path:'_plates/test.png'};};
      const moveAsset=async()=>{throw Error('external originals must not move');};
      const deleteAsset=async()=>{throw Error('external originals must not delete');};
      ${dom}\n${memory}\n${picker}\nwindow.Picker=Picker;window.clearFixtureViews=clearViewPrefs;
    `);
    window.makePicker = options => {
      if (window.subject && !subject.closed) subject.close(null);
      window.clearFixtureViews();
      window.result = undefined;
      window.subject = new Picker({ kinds: ['image','video','audio','renders','refmods'], kind: 'image', ...options },
        result => { window.result = result; });
      subject.mount();
    };
  }, { dom, picker, memory });
  const open = async (options = {}) => {
    await page.evaluate(options => makePicker(options), options);
    await page.waitForFunction(() => subject.loaded);
  };
  const selectFolder = async id => {
    await page.evaluate(id => subject.selectExternalFolder(id), id);
    await page.waitForFunction(() => subject.loaded);
  };
  const calls = () => page.evaluate(() => fixture.calls);
  const paths = () => page.evaluate(() => subject.visible().map(row=>row.path));
  const builtinShelves = () => page.evaluate(() => [...subject.shelfRow.querySelectorAll('.mmc-shelf-strip > .mmc-shelf')]
    .filter(node=>node.querySelector('.mmc-shelf-name')).map(node=>node.title));
  const choose = async id => {
    await page.evaluate(id => {fixture.choice=fixture.folders.find(f=>f.id===id);},id);
    await page.getByRole('button',{name:'+ Add folder',exact:true}).click();
    await page.waitForFunction(() => subject.loaded && !subject.addFolderButton.disabled);
  };

  await test('shared modal has Add folder between Open folder and Upload, leaving search space', async () => {
    await open();
    const geometry = await page.evaluate(() => ['.mmc-search','.mmc-organize','.mmc-reveal','.mmc-add-folder','.mmc-upload'].map(selector=>{
      const r=subject.modal.querySelector(selector).getBoundingClientRect();return {x:r.x,right:r.right,width:r.width};
    }));
    assert.ok(geometry[0].width>120);
    for(let i=1;i<geometry.length;i++) assert.ok(geometry[i].x>=geometry[i-1].right);
    assert.deepEqual((await calls()).filter(c=>c[0]==='external'),[]);
  });
  await test('cancelling the native chooser leaves existing shelves and imports alone', async () => {
    await page.getByRole('button',{name:'+ Add folder',exact:true}).click();
    await page.waitForFunction(()=>!subject.addFolderButton.disabled);
    assert.equal(await page.evaluate(()=>subject.externalFolder),null);
    assert.equal(await page.evaluate(()=>fixture.imports.length),0);
  });
  await test('choosing a folder opens its image files only, without importing the folder', async () => {
    const before=await builtinShelves();
    const builtinCalls=(await calls()).filter(c=>c[0]==='builtin').length;
    await choose('a');
    assert.deepEqual(await paths(),['external:a/face.png']);
    assert.deepEqual(await page.evaluate(()=>subject.externalDirectories),[{name:'sub',directory:'sub'}]);
    assert.equal(await page.evaluate(()=>fixture.imports.length),0);
    assert.equal(await page.locator('.mmc-external-folder .mmc-shelf').count(),2);
    assert.equal(await page.locator('.mmc-organize').isVisible(),false);
    assert.equal(await page.locator('.mmc-upload').isVisible(),false);
    assert.deepEqual(before,['3d','continuity','pasted']);
    assert.deepEqual(await builtinShelves(),before);
    assert.equal((await calls()).filter(c=>c[0]==='builtin').length,builtinCalls);
    assert.deepEqual(await page.evaluate(()=>[...subject.shelfRow.querySelectorAll('[aria-selected="true"]')]
      .map(node=>node.title)),['H:\\Projects\\Media — click to refresh this folder']);
    assert.equal(await page.locator('.mmc-shelf[title="continuity"] .mmc-shelf-n').innerText(),'1');
    await page.getByRole('button',{name:'Open folder',exact:true}).click();
    assert.ok((await calls()).some(c=>c[0]==='reveal'&&c[1]==='a'));
  });
  await test('child folders remain navigable and list their own files without scanning other grants', async () => {
    const before=(await calls()).filter(c=>c[0]==='builtin').length;
    await page.evaluate(()=>subject.openExternalDirectory('sub'));
    await page.waitForFunction(()=>subject.loaded);
    assert.deepEqual(await paths(),['external:a/sub/scene.png']);
    assert.equal(await page.evaluate(()=>subject.externalParent),'');
    await page.evaluate(()=>subject.openExternalDirectory(''));
    await page.waitForFunction(()=>subject.loaded);
    assert.deepEqual(await paths(),['external:a/face.png']);
    assert.deepEqual(await page.evaluate(()=>fixture.directoryCalls.slice(-2)),[['a','image','sub'],['a','image','']]);
    assert.equal((await calls()).filter(c=>c[0]==='builtin').length,before);
  });
  await test('reclick refreshes only the chosen folder and notices manually added files', async () => {
    const before=(await calls()).filter(c=>c[0]==='builtin').length;
    await page.evaluate(()=>fixture.files.push({path:'external:a/new.png',kind:'image',name:'New image',mtime:7}));
    await selectFolder('a');
    assert.ok((await paths()).includes('external:a/new.png'));
    assert.equal((await calls()).filter(c=>c[0]==='builtin').length,before);
    assert.deepEqual((await calls()).filter(c=>c[0]==='external').map(c=>c[1]),['a','a','a','a']);
  });
  await test('video, audio, render and RefMod tabs scan the same selected folder with their own filters', async () => {
    const expected={video:['video'],audio:['audio'],renders:['image','video'],refmods:['image']};
    for(const kind of Object.keys(expected)) {
      await page.evaluate(kind=>subject.selectTab(kind),kind);
      await page.waitForFunction(()=>subject.loaded);
      const rows=await page.evaluate(()=>subject.visible());
      assert.ok(rows.length>0);
      assert.ok(rows.every(row=>expected[kind].includes(row.kind)));
      assert.equal(rows.some(row=>Boolean(row.mod)),kind==='refmods');
      assert.deepEqual((await calls()).filter(c=>c[0]==='external').at(-1),['external','a',kind]);
    }
  });
  await test('modal reopen freshly lists only remembered external folder, not builtin or other registered folders', async () => {
    await page.evaluate(()=>{fixture.calls=[];});
    await open();
    assert.deepEqual(await calls(),[['external','a','image']]);
    assert.ok((await paths()).includes('external:a/new.png'));
    assert.deepEqual(await builtinShelves(),['3d','continuity','pasted']);
    // No built-in assets were loaded into this new modal. Cached directory
    // labels remain navigable, but must not count the external image rows.
    assert.equal(await page.locator('.mmc-shelf[title="continuity"] .mmc-shelf-n').count(),0);
    const assets=path.resolve(__dirname,'../../../assets');fs.mkdirSync(assets,{recursive:true});
    await page.screenshot({path:path.join(assets,'external-folder-picker-kept-builtins-harness.png')});
  });
  await test('a kept built-in folder pill returns directly from external browsing to its own listing', async () => {
    const builtinCalls=(await calls()).filter(c=>c[0]==='builtin').length;
    await page.locator('.mmc-shelf[title="continuity"]').click();
    await page.waitForFunction(()=>subject.builtinLoaded && !subject.externalFolder && subject.loaded);
    assert.equal(await page.evaluate(()=>subject.shelf),'continuity');
    assert.deepEqual(await paths(),['continuity/normal.png']);
    assert.equal((await calls()).filter(c=>c[0]==='builtin').length,builtinCalls+3);
    assert.deepEqual(await builtinShelves(),[]); // inside continuity: no child folders
    await selectFolder('a');
    assert.deepEqual(await builtinShelves(),['3d','continuity','pasted']);
  });
  await test('fixed-purpose Guide picker uses the same visual-only external listing contract', async () => {
    await open({kinds:['guides'],kind:'guides',only:'image'});
    assert.deepEqual((await calls()).filter(c=>c[0]==='external').at(-1),['external','a','renders']);
    assert.ok(await page.evaluate(()=>subject.visible().every(row=>row.kind==='image'&&!row.mod)));
    assert.ok(await page.locator('.mmc-add-folder').isVisible());
    await open();
  });
  await test('external shortcuts share one horizontally scrolling strip and wheel scroll reaches more chips', async () => {
    await page.evaluate(()=>{
      fixture.folders.push(...Array.from({length:30},(_,index)=>({id:'extra'+index,name:'Another media folder '+index,path:'H:\\Media\\'+index})));
    });
    await open();
    const before=await page.evaluate(()=>{const s=subject.shelfRow.querySelector('.mmc-shelf-strip');return {height:subject.shelfRow.clientHeight,slack:s.scrollWidth-s.clientWidth,left:s.scrollLeft};});
    assert.ok(before.slack>0);
    await page.locator('.mmc-shelf-strip').dispatchEvent('wheel',{deltaY:160,deltaX:0});
    await page.waitForFunction(()=>subject.shelfRow.querySelector('.mmc-shelf-strip').scrollLeft>0);
    assert.ok(await page.evaluate(()=>subject.shelfRow.querySelector('.mmc-shelf-strip').scrollLeft)>before.left);
    assert.equal(await page.evaluate(()=>subject.shelfRow.clientHeight),before.height);
  });
  await test('attached sheet panels reopen without scanning builtin roots when an external folder was remembered', async () => {
    await page.evaluate(()=>{fixture.calls=[];});
    await open({referenceOptions:{ref_size:'match'},plate:{edit:true,backdrop:.5,cut:false,width:640,height:360,
      panels:[{path:'continuity/normal.png',takes:'person',crop:{x:.1,y:0,w:.9,h:1}}]}});
    await page.waitForFunction(()=>document.querySelector('.mmc-plate-edit'));
    assert.deepEqual((await calls()).filter(c=>c[0]==='builtin'),[]);
    assert.deepEqual(await page.evaluate(()=>subject.selected.map(row=>row.path)),['continuity/normal.png']);
    assert.deepEqual(await page.evaluate(()=>subject.referencePick(subject.selected[0],false).takes),'person');
    await page.getByRole('button',{name:'Cancel',exact:true}).last().click();
    await open();
  });
  await test('a duplicate native folder choice retains one shortcut and refreshes only it', async () => {
    const count=await page.locator('.mmc-external-folder').count();
    await choose('a');
    assert.equal(await page.locator('.mmc-external-folder').count(),count);
    assert.deepEqual((await calls()).filter(c=>c[0]==='external').at(-1),['external','a','image']);
  });
  await test('late listing from previous folder cannot replace newer selection', async () => {
    await page.evaluate(async()=>{
      fixture.delay=(folder)=>folder==='a'?new Promise(resolve=>setTimeout(resolve,80)):Promise.resolve();
      const first=subject.selectExternalFolder('a');
      const second=subject.selectExternalFolder('b');
      await Promise.all([first,second]);fixture.delay=null;
    });
    assert.deepEqual(await paths(),['external:b/other.png']);
    assert.equal(await page.evaluate(()=>subject.externalFolder),'b');
  });
  await test('missing folder is explained without hiding its shortcut or blocking another folder', async () => {
    await page.evaluate(()=>{fixture.listError='Folder is no longer available';});
    await selectFolder('b');
    assert.match(await page.locator('.mmc-empty').innerText(),/Could not read this folder/);
    assert.equal(await page.locator('.mmc-external-folder').count(),32);
    await page.evaluate(()=>{fixture.listError=null;});await selectFolder('a');
    assert.ok((await paths()).length>0);
  });
  await test('external cells and organize methods cannot move or delete originals', async () => {
    assert.equal(await page.locator('.mmc-cell').first().evaluate(cell=>cell.draggable),false);
    await page.evaluate(async()=>{subject.setOrganize(true);await subject.moveMany(subject.externalAssets,'somewhere');await subject.deleteMarked();});
    assert.equal(await page.evaluate(()=>subject.organize),false);
  });
  await test('view-only preview and cancel do not import any file', async () => {
    await open({viewOnly:true});
    const before=await page.evaluate(()=>fixture.imports.length);
    await page.locator('.mmc-cell').first().click();
    assert.equal(await page.locator('.mmc-light').count(),1);
    assert.equal(await page.evaluate(()=>fixture.imports.length),before);
    await page.evaluate(()=>subject.close(null));
    assert.equal(await page.evaluate(()=>result),null);
  });
  await test('Add lazily imports only selected file and preserves per-file role, size, crop, trim and track', async () => {
    await open({kind:'video',referenceOptions:{takes:'edit',ref_size:'match'}});
    await page.evaluate(()=>{
      const row=subject.visible()[0];subject.toggle(row);
      subject.settings.set(row.path,{takes:'camera',ref_size:'match',trim:{start:0.5,end:2},crop:{x:.1,y:.1,w:.8,h:.8},track:'picture+sound'});
    });
    const before=await page.evaluate(()=>fixture.imports.length);
    await page.getByRole('button',{name:'Add',exact:true}).click();
    await page.waitForFunction(()=>Array.isArray(result));
    const output=await page.evaluate(()=>result);
    assert.equal(output.length,1);assert.equal(output[0].path.startsWith('external:'),false);
    assert.deepEqual([output[0].takes,output[0].ref_size,output[0].trim,output[0].crop,output[0].track],
      ['camera','match',{start:.5,end:2},{x:.1,y:.1,w:.8,h:.8},'picture+sound']);
    assert.equal(await page.evaluate(()=>fixture.imports.length),before+1);
    assert.equal(await page.evaluate(()=>fixture.imports.at(-1).length),1);
  });
  await test('copy failure leaves picker open with original selection and an actionable message', async () => {
    await open();await page.evaluate(()=>{window.failedSelection=subject.visible()[0].path;subject.toggle(subject.visible()[0]);fixture.importError='Cannot copy selected file';});
    await page.getByRole('button',{name:'Add',exact:true}).click();
    await page.waitForFunction(()=>!subject.committing && subject.slots.textContent==='Cannot copy selected file');
    assert.equal(await page.evaluate(()=>result),undefined);
    assert.equal(await page.evaluate(()=>subject.selected[0].path),await page.evaluate(()=>failedSelection));
    await page.evaluate(()=>{fixture.importError=null;});
  });
  await test('cancelling while copying cannot later close or attach results', async () => {
    await page.evaluate(()=>{
      fixture.importDelay=()=>new Promise(resolve=>{window.finishImport=resolve;});
      window.commitPending=subject.commit();
    });
    await page.waitForFunction(()=>typeof finishImport==='function');
    await page.evaluate(()=>subject.close(null));
    await page.evaluate(async()=>{finishImport();await commitPending;fixture.importDelay=null;});
    assert.equal(await page.evaluate(()=>result),null);
  });
  await test('editing touched rows imports before editor call and remaps sheet metadata', async () => {
    await open({referenceOptions:{}});
    await page.evaluate(async()=>{
      const row=subject.visible()[0],old=row.path;subject.toggle(row);
      subject.settings.set(old,{takes:'person',ref_size:'match',crop:{x:.2}});
      subject.cuts.set(old,true);subject.rects.set(old,[.1,.1,.8,.8]);subject.points.set(old,[{x:.5,y:.5,include:true}]);subject.sheet=[old];
      await subject.editPicture(row);
    });
    const state=await page.evaluate(()=>({path:subject.selected[0].path,sheet:subject.sheet,settings:[...subject.settings],cuts:[...subject.cuts],rects:[...subject.rects],points:[...subject.points],picture:fixture.calls.filter(c=>c[0]==='picture').at(-1)}));
    assert.equal(state.path.startsWith('external:'),false);
    assert.deepEqual(state.sheet,[state.path]);
    for(const key of ['settings','cuts','rects','points']) assert.equal(state[key][0][0],state.path);
    assert.equal(state.picture[1],state.path);
  });
  await test('sheet editor materializes external pictures before any cut request', async () => {
    await open();
    await page.evaluate(async()=>{
      for(const row of subject.visible().slice(0,2)) {subject.toggle(row);subject.cuts.set(row.path,true);}
      subject.openSheet();
    });
    await page.waitForFunction(()=>document.querySelector('.mmc-plate-edit'));
    await page.waitForFunction(()=>fixture.calls.some(c=>c[0]==='cut'));
    const cutting=await page.evaluate(()=>fixture.calls.filter(c=>c[0]==='cut'));
    assert.ok(cutting.every(call=>call[1].every(name=>!name.startsWith('external:'))));
    await page.getByRole('button',{name:'Cancel',exact:true}).last().click();
  });
  await test('removing shortcut never deletes originals and keeps an already materialized selection', async () => {
    await page.evaluate(async()=>{
      const touched=subject.selected[0];
      await subject.materializeRows([touched]);
      await subject.forgetExternalFolder('a');
    });
    assert.ok((await calls()).some(c=>c[0]==='forget'&&c[1]==='a'));
    assert.ok(await page.evaluate(()=>subject.selected.length)>0);
    assert.ok(await page.evaluate(()=>fixture.files.some(row=>row.path==='external:a/face.png')));
    assert.equal(await page.evaluate(()=>fixture.prefs.externalFolder),null);
  });
  await test('narrow modal wraps toolbar rather than overlapping or hiding Add folder', async () => {
    await page.setViewportSize({width:620,height:900});await open();
    const boxes=await page.evaluate(()=>['.mmc-modal','.mmc-search','.mmc-add-folder','.mmc-upload'].map(selector=>{
      const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,bottom:r.bottom,width:r.width};
    }));
    assert.ok(boxes[2].y>=boxes[1].bottom);
    assert.ok(boxes[2].right<=boxes[0].right && boxes[3].right<=boxes[0].right);
    const assets=path.resolve(__dirname,'../../../assets');fs.mkdirSync(assets,{recursive:true});
    await page.screenshot({path:path.join(assets,'external-folder-picker-narrow-harness.png')});
    await page.setViewportSize({width:1280,height:900});
    await page.screenshot({path:path.join(assets,'external-folder-picker-wide-harness.png')});
  });

  assert.deepEqual(errors,[]);assert.equal(requests.length,0);
  process.stdout.write(`PASS: ${passed} real shared-picker checks; zero network, native dialogs or GPU calls.\n`);
  await browser.close();
})().catch(async error=>{process.stderr.write(`${error.stack}\n`);await browser?.close();process.exitCode=1;});
