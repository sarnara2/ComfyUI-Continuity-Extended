// Full ES-module browser integration with RAM-only API/media adapters.
// Private Timeline helpers are exported only in this test's served response.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(process.env.CONTINUITY_SOURCE_ROOT||path.join(__dirname,'../..'));
const web=path.join(root,'web/creator');
const catalogRun=spawnSync(process.env.PYTHON_EXECUTABLE_PATH||'python',['-B','-c',"import sys;sys.path.insert(0,'tests');import layout;print(layout.catalog_json())"],{cwd:root,encoding:'utf8',env:{...process.env,PYTHONUTF8:'1'}});
assert.equal(catalogRun.status,0,catalogRun.stderr);
const catalog=JSON.parse(catalogRun.stdout.split(/\r?\n/).find(line=>line.startsWith('{')));
const results=[];
let browser;
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined});
 const page=await browser.newPage({viewport:{width:1600,height:1000}});
 const errors=[],remote=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(catalog=>{
  window.__MMC_FAMILIES=catalog;
  window.app={extensionManager:{setting:{get:key=>key==='Comfy.Locale'?'en':undefined}}};
  window.compileReplies=[];window.compileRequests=[];window.apiRequests=[];
  window.apiFixture=async(url,options={})=>{
   apiRequests.push(url);let body={};
   if(url==='/continuity/compiled_prompt'){
    compileRequests.push(JSON.parse(options.body));
    body=compileReplies.shift()||{passes:[{prompt:'summary:\nBASE\n\ndetailed_description:\nBASE MOTION',base_prompt:'summary:\nBASE\n\ndetailed_description:\nBASE MOTION',mode:'T2VA',prompt_binding:{version:'default'},tags:[],loras:[]}],cards:{0:0,1:0}};
   }else if(url==='/continuity/models')body={};
   else if(url==='/continuity/settings')body={};
   else if(/\/continuity\/(?:refine|job)/.test(url))throw new Error('No model or queue jobs in this fixture');
   return{ok:true,status:200,json:async()=>structuredClone(body)};
  };
 },catalog);
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname!=='continuity.integration'){remote.push(url.href);return route.abort();}
  if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><style>body{margin:20px}.fixture-editor{width:1200px}.mmc-asset{display:flex;gap:12px;margin:6px}.mmc-asset-thumb{width:36px;height:36px}.mmc-editor-sheet-tools,.mmc-tl-card{margin:12px}</style></head><body></body></html>'});
  if(url.pathname==='/scripts/app.js')return route.fulfill({contentType:'text/javascript',body:'export const app=globalThis.app;'});
  if(url.pathname==='/scripts/widgets.js')return route.fulfill({contentType:'text/javascript',body:'export const ComfyWidgets={};'});
  if(url.pathname==='/scripts/api.js')return route.fulfill({contentType:'text/javascript',body:'export const api={apiURL:u=>u,addEventListener(){},removeEventListener(){},getUserData:async()=>({status:404,json:async()=>null}),storeUserData:async()=>({status:200}),deleteUserData:async()=>({status:204}),fetchApi:(url,options)=>globalThis.apiFixture(url,options)};'});
  if(url.pathname.startsWith('/web/creator/')){
   const target=path.resolve(web,'.'+url.pathname.slice('/web/creator'.length));assert.ok(target.startsWith(web+path.sep));
   let source=fs.readFileSync(target,'utf8');
   if(url.pathname==='/web/creator/timeline.js')source+='\nexport { compiledFor as integrationCompiledFor, Timeline as IntegrationTimeline };\n';
   return route.fulfill({contentType:'text/javascript',body:source});
  }
  if(url.pathname==='/view'||url.pathname.startsWith('/continuity/thumb'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="gray"/></svg>'});
  return route.fulfill({status:404,body:''});
 });
 await page.goto('http://continuity.integration/');
 const check=async(name,run)=>{await run();results.push(name);console.log('PASS '+name);};
 await check('Full Timeline and Editor ES module graphs import with actual exports',async()=>{
  const loaded=await page.evaluate(async()=>{
   window.S=await import('/web/creator/state.js');
   window.Editor=(await import('/web/creator/editor.js')).CreatorEditor;
   const timeline=await import('/web/creator/timeline.js');window.compiledFor=timeline.integrationCompiledFor;window.Timeline=timeline.IntegrationTimeline;
   window.draftTools=await import('/web/creator/prompt-overrides.js');window.dom=await import('/web/creator/dom.js');
   return[typeof Editor,typeof compiledFor,typeof Timeline];
  });assert.deepEqual(loaded,['function','function','function']);
 });
 await check('Actual compiledFor recovers stale bindings, clears old runtime drafts and permits fresh opt-in',async()=>{
  const answer=await page.evaluate(async()=>{
   const piece=S.parseTimeline(JSON.stringify({version:2,prompt:'GLOBAL',segments:[{card_id:'first',prompt:'FIRST'},{card_id:'second',prompt:'SECOND',merge:true}]}));
   const original=JSON.stringify(piece),base='summary:\nBASE\n\ndetailed_description:\nMOTION';let changes=0;
   const pass=(text,binding)=>({passes:[{prompt:text,base_prompt:base,mode:'REF2VA',prompt_binding:{version:binding},tags:[],loras:[]}],cards:{0:0,1:0}});
   compileReplies.push(pass(base,'old'));const initial=await compiledFor(piece,1,123,()=>changes++);
   const firstEnabled=initial.override.set(true,'OLD DRAFT');const activeBefore=JSON.parse(S.serializeTimeline(piece)).prompt_overrides;
   compileReplies.push({passes:[],problem:'The final-prompt draft no longer matches its reference binding.'},pass(base,'new'));
   const requestsBefore=compileRequests.length;const recovered=await compiledFor(piece,1,123,()=>changes++);
   const recoveryRequests=compileRequests.slice(requestsBefore),afterRecovery=JSON.parse(S.serializeTimeline(piece)).prompt_overrides;
   const staleSet=initial.override.set(true,'STALE SHOULD NOT REACTIVATE');
   const enabledAgain=recovered.override.set(true,'FRESH DRAFT');const fresh=JSON.parse(S.serializeTimeline(piece)).prompt_overrides;
   draftTools.clearRuntimePrompts(piece);
   return{firstEnabled,activeBefore,recoveryRequests,afterRecovery,staleSet,enabledAgain,fresh,enabled:recovered.override.enabled,warnings:recovered.warnings,scope:recovered.scope,unchanged:JSON.stringify(piece)===original,changes};
  });
  assert.equal(answer.firstEnabled,true);assert.equal(answer.activeBefore[0].text,'OLD DRAFT');assert.equal(answer.recoveryRequests.length,2);
  assert.ok(answer.recoveryRequests[0].creator_data.prompt_overrides);assert.equal(answer.recoveryRequests[1].creator_data.prompt_overrides,undefined);
  assert.equal(answer.afterRecovery,undefined);assert.equal(answer.staleSet,false);assert.equal(answer.enabled,false);assert.equal(answer.enabledAgain,true);assert.equal(answer.fresh[0].text,'FRESH DRAFT');assert.deepEqual(answer.fresh[0].binding,{version:'new'});assert.equal(answer.unchanged,true);
  assert.match(answer.scope,/entire merged pass/);assert.ok(answer.warnings.some(text=>text.includes('reference binding changed')));
 });
 await page.evaluate(()=>{
  window.resetEditor=()=>{
   window.ed?.destroy();document.querySelector('.fixture-editor')?.remove();document.querySelector('.fixture-tools')?.remove();
   window.piece=S.parseTimeline(JSON.stringify({version:2,prompt:'GLOBAL ORIGINAL',assets:[{handle:'ref-1',kind:'image',role:'reference',filename:'shared.png',ref_size:'max'}],subjects:[],segments:[{card_id:'one',prompt:'@ref-1 remains in card one.',duration_s:6,assets:[]},{card_id:'two',prompt:'@img-1 uses @ref-1.',duration_s:6,assets:[{handle:'img-1',kind:'image',role:'reference',filename:'local.png',ref_size:'max'}]}]}));
   window.commits=0;
   window.ed=new Editor({state:piece.segments[1],piece,castPiece:piece,structuredPrompt:true,openCast:()=>{},refineTarget:()=>({kind:'segment',index:1,data:JSON.parse(S.serializeTimeline(piece))}),onCommit:()=>{commits++;S.syncTimeline(piece);}});
   ed.root.classList.add('fixture-editor');document.body.append(ed.root);const tools=dom.el('div',{class:'fixture-tools'},[ed.headerTools]);document.body.append(tools);
  };
  resetEditor();
 });
 await check('Actual own reference max/match pill changes only the card attachment and commits once',async()=>{
  const before=await page.evaluate(()=>({local:piece.segments[1].assets[0].ref_size,shared:piece.assets[0].ref_size,prompt:piece.segments[1].prompt,commits}));
  const own=page.locator('.fixture-editor .mmc-asset:not(.mmc-asset-pooled-chip) .mmc-asset-ref-size');
  assert.equal(await own.count(),1);assert.equal(await own.textContent(),'max');await own.click();
  assert.deepEqual(await page.evaluate(()=>({local:piece.segments[1].assets[0].ref_size,shared:piece.assets[0].ref_size,prompt:piece.segments[1].prompt,commits})),{...before,local:'match',commits:before.commits+1});
 });
 await check('Actual shared reference max/match pill changes the piece owner visible to both cards',async()=>{
  const before=await page.evaluate(()=>({local:piece.segments[1].assets[0].ref_size,commits}));
  await page.locator('.fixture-editor .mmc-asset-pooled-chip .mmc-asset-ref-size').click();
  const after=await page.evaluate(()=>({local:piece.segments[1].assets[0].ref_size,shared:piece.assets[0].ref_size,mirrors:piece.segments.map(segment=>segment.pool[0].ref_size),commits}));
  assert.equal(after.local,before.local);assert.equal(after.shared,'match');assert.deepEqual(after.mirrors,['match','match']);assert.equal(after.commits,before.commits+1);
 });
 await check('Actual asset section Clear requires two clicks, removes own attachments and preserves shared refs and prose',async()=>{
  const before=await page.evaluate(()=>({source:S.serializeTimeline(piece),prompt:ed.state.prompt,shared:structuredClone(piece.assets),other:structuredClone(piece.segments[0]),commits}));
  const clear=page.locator('.fixture-editor .mmc-editor-references .mmc-clear-compact');assert.equal(await clear.count(),1);
  await clear.click();assert.equal(await page.evaluate(()=>S.serializeTimeline(piece)),before.source);await clear.click();
  const after=await page.evaluate(()=>({local:ed.state.assets,prompt:ed.state.prompt,shared:piece.assets,other:piece.segments[0],commits,disabled:ed.assetsClear.disabled}));
  assert.deepEqual(after.local,[]);assert.equal(after.prompt,before.prompt);assert.deepEqual(after.shared,before.shared);assert.deepEqual(after.other,before.other);assert.equal(after.commits,before.commits+1);assert.equal(after.disabled,true);
 });
 await check('Actual structured editor toolbar labels its whole-card refine with the selected segment number',async()=>{
  assert.equal((await page.locator('.fixture-tools .mmc-refine-split > button:not(.mmc-refine-more)').textContent()).trim(),'Refine segment 2');
 });
 await check('Actual generated and clip card renderers both expose the final-prompt icon',async()=>{
  await page.evaluate(()=>{
   const host=Object.create(Timeline.prototype);Object.assign(host,{timeline:piece,gone:new Set(),pieceSeed:()=>123,onPromptCommit:()=>{},soloBadge:()=>dom.el('span'),cardNameControl:()=>dom.el('span'),holdSwitch:()=>dom.el('button'),takeChip:()=>null,takeTools:()=>[],removeButton:()=>dom.el('button'),cardPreview:()=>null,geometry:()=>({width:832,height:480})});
   window.cardHost=host;const generated=host.renderCard(piece.segments[1],1,{start:1,segments:[piece.segments[1]]});generated.classList.add('fixture-generated');document.body.append(generated);
   const clip={kind:'clip',filename:'unused.mp4',duration_s:4};const rendered=host.renderCard(clip,2,{start:2,segments:[clip]});rendered.classList.add('fixture-clip');document.body.append(rendered);
  });
  assert.equal(await page.locator('.fixture-generated .mmc-tl-card-compiled').count(),1);assert.equal(await page.locator('.fixture-clip .mmc-tl-card-compiled').count(),1);
  await page.locator('.fixture-generated .mmc-tl-card-compiled').click();await page.waitForSelector('.mmc-final-prompt');
  assert.equal(await page.locator('.mmc-final-prompt [role="switch"]').isEnabled(),true);
  await page.evaluate(()=>cardHost.compiledView.close());
 });
 await check('Segment LoRA scope stays compact with long global filenames and opens both managers',async()=>{
  await page.evaluate(async()=>{
   (await import('/web/creator/styles.js')).installStyles();resetEditor();
   piece.loras=Array.from({length:10},(_,i)=>({name:`folder/${'long_filename_'.repeat(15)}${i}.safetensors`,strength:1,enabled:i===0,modes:['ref']}));
   ed.state.loras=[];ed.render();
  });
  const scope=page.locator('.fixture-editor .mmc-segment-lora-scope');
  assert.equal(await scope.locator('button').count(),2);
  assert.doesNotMatch(await scope.textContent(),/long_filename/);
  const geometry=await scope.evaluate(x=>({height:x.getBoundingClientRect().height,overflow:x.scrollWidth>x.clientWidth}));
  assert.ok(geometry.height<=40,JSON.stringify(geometry));assert.equal(geometry.overflow,false);
  const before=await page.evaluate(()=>S.serializeTimeline(piece));
  for(const name of ['global','local']){
   await page.locator(`.fixture-editor .mmc-segment-lora-${name}`).click();
   await page.waitForSelector('.mmc-lora-unified',{timeout:5000});
   assert.match(await page.locator('.mmc-lora-unified .mmc-modal-head').textContent(),name==='global'?/Global LoRAs/:/Segment LoRAs/);
   await page.locator('.mmc-lora-unified .mmc-close').click();
   await page.waitForSelector('.mmc-lora-unified',{state:'detached',timeout:5000});
  }
  assert.equal(await page.evaluate(()=>S.serializeTimeline(piece)),before);
 });
 await page.evaluate(()=>ed.destroy());assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
 console.log(JSON.stringify({passed:results.length,pageErrors:errors,externalRequests:remote.length,results},null,2));
})().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(async()=>{await browser?.close();});
