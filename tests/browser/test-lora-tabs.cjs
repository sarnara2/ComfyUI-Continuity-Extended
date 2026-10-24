// Actual LoRA manager/state controls/view memory plus complete production CSS.
// Inventories/presets/detail callbacks are RAM fixtures; no server/model/media,
// user prefs/workflow/browser profile, AI/GPU or external request is involved.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const sourceRoot=process.env.CONTINUITY_SOURCE_ROOT?path.resolve(process.env.CONTINUITY_SOURCE_ROOT):path.resolve(__dirname,'../..');
const root=path.join(sourceRoot,'web/creator'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
const sharedFile=path.join(sourceRoot,'tests/browser/test-lora-unified.cjs');
const prefix=fs.readFileSync(sharedFile,'utf8').split('let browser,requests=0;')[0];
assert.ok(prefix.includes('new vm.Script(code'),'Explicit maintained production-manager fixture boundary');
const {code:sharedCode,ko}=vm.runInNewContext(prefix+'\n;({code,ko});',{require,process,__dirname:path.dirname(sharedFile)},{filename:sharedFile});
const styles=read('styles.js'),imports=Object.fromEntries([...styles.matchAll(/import \{ css as (\w+) \} from "\.\/styles\/(\w+)\.js";/g)].map(m=>[m[1],m[2]]));
const cssOrder=styles.match(/const CSS = \[([^]*?)\]\.join\(""\);/)[1].replace(/\/\/[^\n]*/g,'').split(',').map(x=>x.trim()).filter(Boolean);
const css=cssOrder.map(name=>read('styles/'+imports[name]+'.js').match(/export const css = `([^]*)`;\s*$/)[1]).join('\n');
assert.equal(cssOrder.at(-1),'fullscreen');
const baseline=process.env.CONTINUITY_BASELINE_DIR?path.resolve(process.env.CONTINUITY_BASELINE_DIR):path.resolve(sourceRoot,'../baseline');
if(fs.existsSync(path.join(baseline,'web/creator/state.js'))){
  // Face migration and registered-folder APIs have their own actual-source
  // suites. Their shared modules need not be byte-identical, but every LoRA
  // declaration/callback and all independent behavior owners still must be.
  for(const name of ['loras.js','dom.js','presets.js','settings.js'])assert.deepEqual(fs.readFileSync(path.join(root,name)),fs.readFileSync(path.join(baseline,'web/creator',name)),'Unchanged behavior owner '+name);
  const playwrightPath=process.env.PLAYWRIGHT_MODULE||'playwright';
  const {babelParse}=require(path.join(path.dirname(require.resolve(playwrightPath)),'lib/transform/babelBundle.js'));
  const declarations=(text,name)=>{
    const found=new Map();
    for(const node of babelParse(text,name,true).program.body){
      const owner=node.declaration||node;
      const names=owner.type==='FunctionDeclaration'?[owner.id.name]
        :owner.type==='VariableDeclaration'?owner.declarations.map(row=>row.id.name).filter(Boolean):[];
      for(const key of names)found.set(key,text.slice(node.start,node.end));
    }
    return found;
  };
  const scopes={
    'state.js':name=>/lora|trigger|wears|checkpoint/i.test(name)||['routesOf','NO_ROUTING','ROUTED','routing','DEFAULT_STRENGTH','MAX_STRENGTH','round2'].includes(name),
    'api.js':name=>/lora/i.test(name)||['CACHE_MS','LEGACY_FOLDER_KEY','MAX_REMEMBERED','words','names','normalizeUsed','normalizePinned','normalizeWears','normalizeGuide','detailCache'].includes(name),
  };
  for(const [name,inScope]of Object.entries(scopes)){
    const before=declarations(fs.readFileSync(path.join(baseline,'web/creator',name),'utf8'),name);
    const after=declarations(read(name),name);
    const names=[...before.keys()].filter(inScope);
    assert.ok(names.length>10,'Nonempty LoRA ownership guard '+name);
    assert.deepEqual([...after.keys()].filter(inScope),names,'Unchanged LoRA declaration inventory '+name);
    for(const key of names)assert.equal(after.get(key),before.get(key),'Unchanged LoRA declaration '+name+':'+key);
  }
  const visit=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{if(['.git','__pycache__'].includes(e.name))return[];const file=path.join(dir,e.name);return e.isDirectory()?visit(file):e.isFile()?[file]:[];});
  const separatelyCovered=new Set(['creator/compile.py','creator/folders.py','creator/routes/folders.py']);
  for(const file of visit(baseline)){
    const relative=path.relative(baseline,file),portable=relative.split(path.sep).join('/');
    if(file.endsWith('.py')&&!relative.startsWith('tests'+path.sep)&&!separatelyCovered.has(portable))assert.deepEqual(fs.readFileSync(path.join(sourceRoot,relative)),fs.readFileSync(file),'Unchanged backend '+relative);
  }
}else if(process.env.CONTINUITY_BASELINE_DIR)assert.fail('Explicit baseline must exist');
const code=sharedCode+`\n
window.tabFixtureEl=el;
window.viewRecord=()=>readViewPrefs('loras:normal');
window.fullReport=()=>({state:JSON.stringify(subject.state),commits,prefs:JSON.stringify(prefs),details:details.map(x=>x.name),view:readViewPrefs('loras:normal')});
window.reopenTabsFixture=(options={})=>{
  const state=subject.state;subject.close();
  window.subject=new Subject({state,onChange:()=>commits++,unified:options.unified!==false,family:options.family||'h3',
    targets:['ref'],swapping:options.swapping||null,reveal:options.reveal||null},()=>{});
  subject.mount();return JSON.stringify(state);
};
window.addBulkRows=()=>{
  if(fixtureRows.some(row=>row.name==='library/bulk_0.safetensors'))return;
  fixtureRows.push(...Array.from({length:90},(_,index)=>({name:'library/bulk_'+index+'.safetensors',title:'Bulk '+index,
    base:'bulk_'+index,model_id:1000+index,strength:.7,trained_words:['bulk'+index],sources:['sidecar']})));
};
window.tabLayout=()=>{
  const rect=node=>{const r=node.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
  const visible=node=>getComputedStyle(node).display!=='none';
  return {tab:subject.tab,modal:rect(subject.modal),head:rect(subject.modal.querySelector('.mmc-modal-head')),
    pageOverflow:document.documentElement.scrollWidth>innerWidth+1,modalOverflow:subject.modal.scrollWidth>subject.modal.clientWidth+1,
    visible:{added:visible(subject.addedPane),grid:visible(subject.grid),bar:visible(subject.bar),stacks:visible(subject.stacksPane)},
    selected:[...subject.tabs].map(node=>node.getAttribute('aria-selected')),added:{...rect(subject.addedGrid),scroll:subject.addedGrid.scrollHeight,client:subject.addedGrid.clientHeight,
      scrollTop:subject.addedGrid.scrollTop,gutter:subject.addedGrid.offsetWidth-subject.addedGrid.clientWidth,width:getComputedStyle(subject.addedGrid).scrollbarWidth},
    grid:{...rect(subject.grid),scroll:subject.grid.scrollHeight,client:subject.grid.clientHeight,scrollTop:subject.grid.scrollTop},
    closeHit:(()=>{const n=subject.modal.querySelector('.mmc-close'),r=n.getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===n;})()};
};
`;
new vm.Script(code,{filename:'lora-tabs-current-source-fixture.js'});
const output=path.resolve(process.env.CONTINUITY_ARTIFACT_DIR||process.env.CONTINUITY_UX_SCREENSHOT_DIR||path.join(os.tmpdir(),'continuity-lora-tabs'));
assert.ok(output!==sourceRoot&&!output.startsWith(sourceRoot+path.sep),'Evidence outside product');
const checks=[],layouts=[],errors=[];let browser,requests=0;
const check=async(name,run)=>{await run();checks.push({name,passed:true});console.log('PASS '+name);};
(async()=>{
  browser=await chromium.launch({headless:true,ignoreDefaultArgs:['--hide-scrollbars'],executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined});
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',route=>{requests++;return route.abort();});
  await page.setContent('<html class="dark-theme"><head><style>'+css+':root{--comfy-menu-bg:#181819;--fg-color:#ddd;--input-text:#ddd;--descrip-text:#999;--bg-color:#202020;--primary-background:#0b8ce9;--destructive-background:#b33a3a;--error-text:#f44}body{margin:0;background:#171718}@media(max-width:640px){.mmc-overlay{padding:12px}}</style></head><body></body></html>');
  await page.evaluate(ko);await page.evaluate('(()=>{'+code+'})()');
  const ready=()=>page.waitForFunction(()=>subject.loaded&&subject.attachedPending.size===0);
  const reset=async(options={})=>{await page.evaluate(options=>setFixture(options),options);await ready();};
  const tab=key=>page.evaluate(key=>subject.setTab(key),key);
  const art=name=>page.locator('.mmc-lora-grid [data-lora-name="'+name+'"] .mmc-lora-art');
  const top=name=>page.locator('.mmc-lora-added-card[data-lora-name="'+name+'"]');
  const single=async name=>{await art(name).click();await page.waitForTimeout(450);await ready();};
  await ready();fs.mkdirSync(output,{recursive:true});
  await check('Timeline-only three tabs select exactly one full-height pane; tab navigation never edits render inputs',async()=>{
    const before=await page.evaluate(()=>fullReport());
    assert.deepEqual(await page.evaluate(()=>[...subject.tabs].map(node=>node.textContent)),['LoRAs','LoRA library','Stacks']);
    for(const [key,expected]of [['loras',{added:true,grid:false,bar:false,stacks:false}],['library',{added:false,grid:true,bar:true,stacks:false}],['stacks',{added:false,grid:false,bar:false,stacks:true}]]){
      await tab(key);const shape=await page.evaluate(()=>tabLayout());assert.deepEqual(shape.visible,expected);assert.equal(shape.selected.filter(x=>x==='true').length,1);
      assert.equal(await page.evaluate(()=>fullReport().state),before.state);assert.equal(await page.evaluate(()=>fullReport().commits),0);
    }
  });
  await check('An exact selected file toggles off on its second intentional click; blue check and attached X stay synchronized',async()=>{
    await reset({entries:[]});await tab('library');await single('library/camera.safetensors');
    assert.equal(await art('library/camera.safetensors').locator('.mmc-check').evaluate(node=>getComputedStyle(node).display),'flex');
    assert.equal(await top('library/camera.safetensors').count(),1);
    await single('library/camera.safetensors');assert.equal(await page.evaluate(()=>subject.state.loras.length),0);
    assert.equal(await page.locator('.mmc-lora-grid [data-lora-name="library/camera.safetensors"]').getAttribute('aria-selected'),'false');
    assert.equal(await art('library/camera.safetensors').locator('.mmc-check').evaluate(node=>getComputedStyle(node).display),'none');
    await single('library/camera.safetensors');await tab('loras');await top('library/camera.safetensors').locator('button[title^="Remove "]').click();await tab('library');
    assert.equal(await page.locator('.mmc-lora-grid [data-lora-name="library/camera.safetensors"]').getAttribute('aria-selected'),'false');
    assert.equal(await page.evaluate(()=>fullReport().commits),4);
  });
  await check('Removing a muted held file preserves every sibling setting; re-add restores remembered strength/triggers/audio/routes',async()=>{
    const camera={name:'library/camera.safetensors',strength:1.61,enabled:false,modes:['plain'],triggers:['custom'],audio:.23};
    const light={name:'library/light.safetensors',strength:-.44,enabled:false,modes:['ref'],triggers:['keep'],audio:.66};
    await reset({entries:[camera,light]});await tab('library');await single(camera.name);
    assert.deepEqual(await page.evaluate(()=>subject.state.loras),[light]);
    await single(camera.name);const added=await page.evaluate(()=>subject.state.loras.at(-1));
    assert.equal(added.strength,camera.strength);assert.deepEqual(added.modes,camera.modes);assert.deepEqual(added.triggers,camera.triggers);assert.equal(added.audio,camera.audio);
    assert.deepEqual(await page.evaluate(()=>subject.state.loras[0]),light);
  });
  await check('Grouped version browsing is selection-neutral; deselection affects the shown exact version only',async()=>{
    await reset({folder:'style'});await tab('library');const before=await page.evaluate(()=>fullReport().state);
    await page.locator('.mmc-lora-grid .mmc-ver').last().click();assert.equal(await page.evaluate(()=>fullReport().state),before);
    const name=await page.locator('.mmc-lora-grid .mmc-lora').first().getAttribute('data-lora-name');assert.equal(name,'style/face_v2.safetensors');
    await single(name);assert.deepEqual(await page.evaluate(()=>subject.state.loras.map(e=>e.name)),['style/face_v1.safetensors','missing/gone.safetensors']);
    assert.equal(await page.evaluate(()=>subject.state.loras[0].strength),1.23);
  });
  await check('Selected and unselected native double-clicks open details without any state, memory or commit mutation',async()=>{
    await reset();await tab('library');
    for(const name of ['library/camera.safetensors','library/light.safetensors']){
      if(name.endsWith('light.safetensors'))await single(name);
      const before=await page.evaluate(()=>fullReport());await art(name).dblclick();await page.waitForTimeout(450);
      const after=await page.evaluate(()=>fullReport());assert.equal(after.state,before.state);assert.equal(after.prefs,before.prefs);assert.equal(after.commits,before.commits);assert.equal(after.details.at(-1),name);
    }
  });
  await check('Held native Enter/Space repeat cannot toggle twice; a new deliberate keyboard activation deselects immediately',async()=>{
    await reset({entries:[]});await tab('library');await art('library/camera.safetensors').focus();await page.keyboard.down('Enter');
    await art('library/camera.safetensors').focus();await page.keyboard.down('Enter');await page.keyboard.up('Enter');
    assert.equal(await page.evaluate(()=>fullReport().commits),1);assert.equal(await page.evaluate(()=>subject.state.loras.length),1);
    await art('library/camera.safetensors').focus();await page.keyboard.down('Space');
    await art('library/camera.safetensors').focus();await page.keyboard.down('Space');await page.keyboard.up('Space');
    assert.equal(await page.evaluate(()=>fullReport().commits),2);assert.equal(await page.evaluate(()=>subject.state.loras.length),0);
  });
  await check('A pending click cannot re-add after the attached X or touch a replacement/stack-created entry',async()=>{
    const camera={name:'library/camera.safetensors',strength:.81,enabled:true,modes:['ref'],triggers:['cam']};
    await reset({entries:[camera]});await tab('library');await art(camera.name).click();await tab('loras');await top(camera.name).locator('button[title^="Remove "]').click();await page.waitForTimeout(450);
    assert.equal(await page.evaluate(()=>subject.state.loras.length),0);assert.equal(await page.evaluate(()=>fullReport().commits),1);
    await reset({entries:[camera]});await tab('library');await art(camera.name).click();
    await page.evaluate(()=>{subject.state.loras[0]={...subject.state.loras[0],strength:9,audio:.12};subject.renderAdded();});
    const replaced=await page.evaluate(()=>fullReport().state);await page.waitForTimeout(450);assert.equal(await page.evaluate(()=>fullReport().state),replaced);assert.equal(await page.evaluate(()=>fullReport().commits),0);
    await reset({entries:[]});await tab('library');await art(camera.name).click();
    await page.evaluate(camera=>{subject.state.loras.push({...camera,enabled:false});subject.renderAdded();},camera);
    const stack=await page.evaluate(()=>fullReport().state);await page.waitForTimeout(450);assert.equal(await page.evaluate(()=>fullReport().state),stack);assert.equal(await page.evaluate(()=>fullReport().commits),0);
  });
  await check('Pinned files cannot be deselected through the library; localized notice appears and removal works only after unpin',async()=>{
    await reset({entries:[{name:'library/camera.safetensors',strength:1.24,enabled:true,modes:['ref'],triggers:['cam']}],language:'ko'});
    await top('library/camera.safetensors').locator('.mmc-lora-added-actions button').first().click();
    assert.equal(await top('library/camera.safetensors').locator('button').filter({hasText:'✕'}).count(),0);
    await tab('library');const before=await page.evaluate(()=>fullReport());await single('library/camera.safetensors');
    const after=await page.evaluate(()=>fullReport());assert.equal(after.state,before.state);assert.equal(after.prefs,before.prefs);assert.equal(after.commits,before.commits);
    const notice=await page.locator('.mmc-lora-pin-notice').textContent();assert.notEqual(notice,'Unpin this LoRA first.');assert.equal(notice,await page.evaluate(()=>window.ko['Unpin this LoRA first.']));assert.equal(await page.locator('.mmc-lora-pin-notice').isVisible(),true);
    await tab('loras');await top('library/camera.safetensors').locator('.mmc-lora-added-actions button').first().click();await tab('library');await single('library/camera.safetensors');assert.equal(await page.evaluate(()=>subject.state.loras.length),0);
  });
  await check('Library tab/folder/query persist independently; normal and swap callers retain their original tab sets and fallback',async()=>{
    await reset({entries:[]});await tab('library');await page.locator('.mmc-folder').selectOption('style');await ready();await page.locator('.mmc-search').fill('face');
    const state=await page.evaluate(()=>fullReport().state);await page.evaluate(()=>reopenTabsFixture());await ready();
    assert.equal(await page.evaluate(()=>subject.tab),'library');assert.equal(await page.locator('.mmc-folder').inputValue(),'style');assert.equal(await page.locator('.mmc-search').inputValue(),'face');assert.equal(await page.evaluate(()=>fullReport().state),state);
    await page.evaluate(()=>reopenTabsFixture({unified:false}));await ready();assert.equal(await page.evaluate(()=>subject.tab),'loras');assert.equal(await page.locator('.mmc-tab').count(),2);assert.equal(await page.locator('.mmc-lora-unified').count(),0);
    await page.evaluate(()=>reopenTabsFixture({swapping:'style/face_v1.safetensors'}));await ready();assert.equal(await page.locator('.mmc-tab').count(),1);assert.equal(await page.locator('.mmc-lora-unified').count(),0);
  });
  await check('Attached reveals navigate to their editing tab; unattached reveals navigate to the library without editing a piece',async()=>{
    await reset();await tab('library');await page.evaluate(()=>reopenTabsFixture({reveal:'style/face_v1.safetensors'}));await ready();
    assert.equal(await page.evaluate(()=>subject.tab),'loras');assert.equal(await top('style/face_v1.safetensors').isVisible(),true);assert.equal(await top('style/face_v1.safetensors').locator('.mmc-lora-ctl').count(),1);
    const before=await page.evaluate(()=>fullReport().state);await page.evaluate(()=>reopenTabsFixture({reveal:'library/camera.safetensors'}));await ready();
    assert.equal(await page.evaluate(()=>subject.tab),'library');assert.equal(await page.locator('.mmc-lora-grid [data-lora-name="library/camera.safetensors"]').evaluate(node=>node.classList.contains('mmc-lora-found')),true);assert.equal(await page.evaluate(()=>fullReport().state),before);
  });
  await check('Many attached LoRAs use the full selected pane with a visible native rail; thumb drag and keyboard reach bottom controls',async()=>{
    const entries=Array.from({length:32},(_,i)=>({name:'missing/long_'+i+'.safetensors',strength:.8,enabled:true,modes:['ref'],triggers:['word'+i]}));
    await reset({entries});const before=await page.evaluate(()=>tabLayout());assert.ok(before.added.client>before.modal.height*.6);assert.ok(before.added.scroll>before.added.client);assert.equal(before.added.width,'thin');assert.ok(before.added.gutter>0);
    assert.deepEqual(before.visible,{added:true,grid:false,bar:false,stacks:false});
    const thumb=before.added.client*before.added.client/before.added.scroll,x=before.added.right-before.added.gutter/2,y=before.added.top+Math.max(12,thumb/2);
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+160,{steps:15});await page.mouse.up();await page.waitForFunction(()=>subject.addedGrid.scrollTop>30);
    await page.locator('.mmc-lora-added-grid').focus();await page.keyboard.press('Control+End');await page.waitForFunction(()=>subject.addedGrid.scrollTop+subject.addedGrid.clientHeight>=subject.addedGrid.scrollHeight-1);
    const after=await page.evaluate(()=>tabLayout());assert.deepEqual(after.head,before.head);assert.equal(after.closeHit,true);
    const last=await top('missing/long_31.safetensors').boundingBox();assert.ok(last.y+last.height<after.modal.bottom);
    await page.locator('.mmc-modal').screenshot({path:path.join(output,'lora-tabs-loaded-bottom.png')});
  });
  await check('Loaded/library scroll positions survive switching; hidden library does not eagerly drain all lazy chunks',async()=>{
    const loadedBefore=await page.evaluate(()=>subject.addedGrid.scrollTop);assert.ok(loadedBefore>0);await tab('library');await tab('stacks');await tab('loras');assert.equal(await page.evaluate(()=>subject.addedGrid.scrollTop),loadedBefore);
    await page.evaluate(()=>addBulkRows());await reset();await tab('library');
    assert.ok(await page.evaluate(()=>subject.shown<subject.pending.length));
    await page.evaluate(()=>{subject.grid.scrollTop=400;});await page.waitForTimeout(20);const before=await page.evaluate(()=>subject.grid.scrollTop);await tab('loras');await tab('library');assert.equal(await page.evaluate(()=>subject.grid.scrollTop),before);
    await tab('loras');const shown=await page.evaluate(()=>subject.shown);await page.evaluate(()=>subject.fill());assert.equal(await page.evaluate(()=>subject.shown),shown);
  });
  await check('EN/KO normal/large desktop and compact layouts give only the selected pane space, with bounded footer and Close',async()=>{
    const entries=Array.from({length:18},(_,i)=>({name:'missing/responsive_'+i+'.safetensors',strength:.8,enabled:true,modes:['ref'],triggers:['word'+i]}));
    for(const width of [1280,640,320])for(const language of ['en','ko'])for(const scale of [1,1.6]){
      await page.setViewportSize({width,height:900});await page.evaluate(scale=>document.documentElement.style.setProperty('--mmc-type',String(scale)),scale);await reset({entries,language});
      for(const key of ['loras','library','stacks']){
        await tab(key);const l=await page.evaluate(()=>tabLayout());assert.equal(l.pageOverflow,false,JSON.stringify({width,language,scale,key,l}));assert.equal(l.modalOverflow,false);assert.equal(l.closeHit,true);
        assert.equal(l.selected.filter(x=>x==='true').length,1);if(key==='loras')assert.ok(l.added.client>80);if(key==='library')assert.ok(l.grid.client>80);
        layouts.push({width,language,scale,key,height:key==='loras'?l.added.client:l.grid.client});
        if(language==='ko'&&scale===1.6&&(width===1280||width===320))await page.locator('.mmc-modal').screenshot({path:path.join(output,'lora-tabs-ko-large-'+width+'-'+key+'.png')});
      }
    }
  });
  assert.equal(requests,0);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(output,'lora-tabs-report.json'),JSON.stringify({sourceRoot,baseline,cssOrder,passed:checks.length,checks,layouts,requests,errors,scope:'Isolated actual manager/state controls/view store/CSS; RAM catalogue/preset/detail adapters, not live ComfyUI, user media or AI/GPU.'},null,2));
  console.log(JSON.stringify({passed:checks.length,layouts:layouts.length,requests,errors,output}));await browser.close();
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1;});
