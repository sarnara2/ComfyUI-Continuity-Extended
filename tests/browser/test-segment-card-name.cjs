// Actual card/name/navigation controls and overlay Escape lifecycle, offline.
// Real state round trips and baseline compiler payloads; no queue or GPU work.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {pathToFileURL}=require('node:url');
const {spawnSync}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const repo=process.env.CONTINUITY_SOURCE_ROOT?path.resolve(process.env.CONTINUITY_SOURCE_ROOT):path.resolve(__dirname,'../..');
const root=path.join(repo,'web/creator');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const source=read('timeline.js'),stateSource=read('state.js'),dom=read('dom.js');
const method=(text,name)=>{const found=text.match(new RegExp(`^  (?:async )?${name}\\([^]*?^  \\}`,'m'));assert.ok(found,name);return found[0];};
const fn=(text,name)=>{const found=text.match(new RegExp(`(?:export )?function ${name}\\([^]*?^\\}`,'m'));assert.ok(found,name);return found[0].replace(/^export /,'');};
const baseline=process.env.CONTINUITY_BASELINE_DIR?path.resolve(process.env.CONTINUITY_BASELINE_DIR):null;
const python=process.env.CONTINUITY_PYTHON||'python';
const py=(script,args=[],input)=>{
 const result=spawnSync(python,['-c',script,repo,...args],{encoding:'utf8',input,env:{...process.env,PYTHONUTF8:'1',PYTHONDONTWRITEBYTECODE:'1'}});
 assert.equal(result.status,0,result.stderr||result.stdout);
 // The original layout harness prints its atexit summary after the JSON line.
 return JSON.parse(result.stdout.split(/\r?\n/).find(line=>/^[\[{]/.test(line)));
};
const catalog=py("import sys;sys.path.insert(0,sys.argv[1]+'/tests');import layout;print(layout.catalog_json())");
const baseFile=path.join(__dirname,'test-segment-card-pills.cjs');
const baseSource=fs.readFileSync(baseFile,'utf8');
const base=vm.runInNewContext(baseSource.slice(0,baseSource.indexOf('new vm.Script(code);'))+';({code,css});',{require,__dirname,process});
const popoverCss=read('styles/popovers.js').match(/export const css = `([^]*)`;\s*$/)[1];
const code=base.code.replace('class Subject {','class Subject {\n'+['segmentNavigator','openSegmentNavigator'].map(name=>method(source,name)).join('\n')+'\n')+`
${fn(dom,'mountOverlay')}
${fn(dom,'floatAbove')}
const popoverClosers=new Map();
const popoverOwners=new WeakMap();
${fn(dom,'dismissable')}
${fn(dom,'placeNear')}
window.fixtureS=S;
window.mountNameFixture=options=>{
 window.nameUnmount?.();subject?.jumpMenu?.close();setFixture(options);
 subject.timeline.segments.forEach((card,index)=>card.card_id='fixture-card-'+index);
 subject.stripHost=subject.host;
 const navigation=subject.segmentNavigator();subject.host.prepend(navigation);
 subject.mount=()=>{subject.host.replaceChildren(subject.segmentNavigator(),subject.renderCard(subject.timeline.segments[1],1,{segments:subject.shared?subject.timeline.segments.slice(0,2):[subject.timeline.segments[1]]}));};
 window.overlayClosed=0;const overlay=el('div',{class:'mmc-overlay'},[subject.host]);
 window.nameUnmount=mountOverlay(overlay,()=>{overlayClosed++;nameUnmount();});
 return JSON.stringify(subject.timeline);
};mountNameFixture();
`;
new vm.Script(code);
const results=[];let browser,requests=0;
const check=async(name,run)=>{await run();results.push(name);console.log('PASS '+name);};
(async()=>{
 globalThis.__MMC_FAMILIES=catalog;
 const S=await import(pathToFileURL(path.join(root,'state.js')).href);
 let oldState=null;
 if(baseline&&fs.existsSync(path.join(baseline,'web/creator/state.js'))){
  oldState=await import(pathToFileURL(path.join(baseline,'web/creator/state.js')).href);
  assert.equal(fs.readFileSync(path.join(repo,'creator/compile.py'),'utf8'),fs.readFileSync(path.join(baseline,'creator/compile.py'),'utf8'),'Compiler remains exact baseline bytes');
 }
 const fresh=()=>S.parseTimeline(JSON.stringify({version:2,segments:[{card_id:'one',prompt:'A woman walks through a garden.',duration_s:6},{card_id:'two',kind:'clip',filename:'footage.mp4',duration_s:4,width:480,height:832}]}));
 await check('Unnamed workflows serialize byte-identically to baseline; no new metadata is emitted',async()=>{
  const timeline=fresh();assert.ok(!JSON.parse(S.serializeTimeline(timeline)).extended_ui);
  if(oldState)assert.equal(S.serializeTimeline(timeline),oldState.serializeTimeline(oldState.parseTimeline(S.serializeTimeline(timeline))));
 });
 await check('Both kinds round-trip names only in the top-level UI map, not model segment input',async()=>{
  const timeline=fresh();timeline.segments[0].extended_card_name='  Opening scene  ';timeline.segments[1].extended_card_name='Inserted footage';
  const raw=JSON.parse(S.serializeTimeline(timeline));
  assert.deepEqual(raw.extended_ui,{card_names:{one:'Opening scene',two:'Inserted footage'}});
  assert.ok(raw.segments.every(card=>!Object.hasOwn(card,'extended_card_name')));
  const loaded=S.parseTimeline(JSON.stringify(raw));assert.deepEqual(loaded.segments.map(S.cardName),['Opening scene','Inserted footage']);
 });
 await check('Names follow stable identity on reorder/clone; deleting cards removes stale map entries',async()=>{
  const timeline=fresh();timeline.segments[0].extended_card_name='First';timeline.segments[1].extended_card_name='Footage';
  const copy=S.cloneSegment(timeline.segments[0]);assert.notEqual(copy.card_id,'one');assert.equal(S.cardName(copy),'First');
  timeline.segments=[timeline.segments[1],copy,timeline.segments[0]];
  let loaded=S.parseTimeline(S.serializeTimeline(timeline));assert.deepEqual(loaded.segments.map(S.cardName),['Footage','First','First']);
  loaded.segments.pop();const map=JSON.parse(S.serializeTimeline(loaded)).extended_ui.card_names;assert.ok(!Object.hasOwn(map,'one'));
  loaded.segments.forEach(card=>delete card.extended_card_name);assert.ok(!JSON.parse(S.serializeTimeline(loaded)).extended_ui);
 });
 await check('Unknown view keys survive; invalid/blank/oversized/missing-ID names are safely normalized',async()=>{
  const timeline=fresh();timeline.extended_ui={panel:'notes',card_names:{stale:'Gone'}};timeline.segments[0].extended_card_name='x'.repeat(100);
  const raw=JSON.parse(S.serializeTimeline(timeline));assert.equal(raw.extended_ui.panel,'notes');assert.equal(raw.extended_ui.card_names.one.length,80);assert.ok(!raw.extended_ui.card_names.stale);
  raw.extended_ui.card_names={one:44,two:'  '};raw.segments[0].extended_card_name='stray';assert.deepEqual(S.parseTimeline(JSON.stringify(raw)).segments.map(S.cardName),['','']);
  assert.equal(S.cardName({extended_card_name:5}),'');delete timeline.segments[0].card_id;assert.ok(!JSON.parse(S.serializeTimeline(timeline)).extended_ui.card_names);
 });
 await check('Rename does not change queued take stamps or mark an existing take edited',async()=>{
  const timeline=fresh();const queued=S.queuedCards(timeline);S.attachTakes(timeline,[{segment:1,filename:'take.mp4',duration_s:6}],queued);
  const before=S.queuedCards(timeline);timeline.segments[0].extended_card_name='Changed display name';timeline.segments[1].extended_card_name='Clip name';
  assert.deepEqual(S.queuedCards(timeline),before);assert.deepEqual([...S.editedSince(timeline)],[]);
  timeline.segments[0].prompt+=' A real prompt edit.';assert.deepEqual([...S.editedSince(timeline)],[0]);
 });
 await check('Current and baseline Python chained/group/clip payloads and cache request strings are identical',async()=>{
  const samples=[];
  for(const kind of ['chained','merged','clip']){
   const timeline=fresh();if(kind!=='clip')timeline.segments[1]={...S.emptySegment(),card_id:'two',prompt:'The woman smiles.',duration_s:6};
   if(kind==='merged')timeline.segments[1].merge=true;
   const unnamed=JSON.parse(S.serializeTimeline(timeline));timeline.segments.forEach((card,index)=>card.extended_card_name='View name '+index);
   samples.push({kind,unnamed,named:JSON.parse(S.serializeTimeline(timeline))});
  }
  const output=py("import sys,json;sys.path.insert(0,sys.argv[1]+'/tests');import layout;p=layout.load('canvas','h3_declare','contextir','subjects','compile',package='name_candidate');data=json.load(sys.stdin);out=[]\nfor case in data:\n a=p.compile.timeline_payloads(case['unnamed']);b=p.compile.timeline_payloads(case['named']);assert a==b,case['kind'];assert json.dumps(a,sort_keys=True)==json.dumps(b,sort_keys=True);out.append(case['kind'])\nif len(sys.argv)>2:\n layout.PY_ROOT=sys.argv[2]+'/creator';q=layout.load('canvas','h3_declare','contextir','subjects','compile',package='name_baseline')\n for case in data: assert q.compile.timeline_payloads(case['named'])==p.compile.timeline_payloads(case['unnamed']),case['kind']\nprint(json.dumps(out))",baseline?[baseline]:[],JSON.stringify(samples));
  assert.deepEqual(output,['chained','merged','clip']);
 });
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined});
 const page=await browser.newPage({viewport:{width:1000,height:750}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>{requests++;return route.abort();});
 await page.setContent(`<style>${base.css}${popoverCss}:root{--comfy-menu-bg:#171718;--fg-color:#fff;--input-text:#ddd;--descrip-text:#999;--bg-color:#202020;--primary-background:#0b8ce9;--destructive-background:#b33a3a;--error-text:#f44}body{margin:24px;background:#171718}.fixture-host{width:max-content;height:auto;padding:0}.mmc-overlay{align-items:flex-start;justify-content:flex-start;padding:24px;box-sizing:border-box}</style>`);
 await page.evaluate(`(()=>{${code}})()`);
 const reset=options=>page.evaluate(options=>mountNameFixture(options),options);
 const rename=async(value,key='Enter')=>{await page.locator('.mmc-tl-card-name-button').click();await page.locator('.mmc-tl-card-name-input').fill(value);if(key)await page.keyboard.press(key);};
 await check('Native label buttons default to localized Segment/Clip; editing starts without changing card controls',async()=>{
  for(const [language,clip,label] of [['en',false,'Segment'],['en',true,'Clip'],['ko',false,'세그먼트'],['ko',true,'클립']]){
   const before=await reset({language,clip});assert.equal(await page.locator('.mmc-tl-card-name-button').textContent(),label);
   await page.locator('.mmc-tl-card-name-button').dblclick();assert.equal(await page.locator('.mmc-tl-card-name-input').count(),1);
   assert.equal(await page.evaluate(()=>JSON.stringify(subject.timeline)),before);assert.deepEqual(await page.evaluate(()=>subject.calls),[]);
  }
 });
 await check('Enter commits one trimmed name on the clicked card only, never prompt/seed/take/model/hold/routes',async()=>{
  const before=JSON.parse(await reset());await rename('  Opening scene  ');
  const after=await page.evaluate(()=>JSON.parse(JSON.stringify(subject.timeline)));assert.equal(after.segments[1].extended_card_name,'Opening scene');delete after.segments[1].extended_card_name;
  assert.deepEqual(after,before);assert.equal(await page.evaluate(()=>subject.commits),1);assert.deepEqual(await page.evaluate(()=>subject.calls),[]);
  assert.equal(await page.locator('.mmc-tl-card-name-button').textContent(),'Opening scene');
  assert.equal(await page.evaluate(()=>document.activeElement.className),'mmc-tl-card-name-button');
 });
 await check('Real mountOverlay Escape cancels inline rename, retains modal and restores button focus',async()=>{
  const before=await page.evaluate(()=>JSON.stringify(subject.timeline));await rename('Discard me','Escape');
  assert.equal(await page.evaluate(()=>JSON.stringify(subject.timeline)),before);assert.equal(await page.evaluate(()=>overlayClosed),0);
  assert.equal(await page.locator('.mmc-overlay').count(),1);assert.equal(await page.locator('.mmc-tl-card-name-input').count(),0);
  assert.equal(await page.evaluate(()=>document.activeElement.className),'mmc-tl-card-name-button');assert.equal(await page.locator('.mmc-pop.mmc-tl-card-name-guard').count(),0);
 });
 await check('Blur saves once, blank resets default and unchanged value does not commit',async()=>{
  await reset();await rename('Blur saved',null);await page.locator('.mmc-tl-index').click();assert.equal(await page.evaluate(()=>subject.commits),1);
  await rename('Blur saved');assert.equal(await page.evaluate(()=>subject.commits),1);await rename('   ');assert.equal(await page.evaluate(()=>subject.commits),2);
  assert.equal(await page.locator('.mmc-tl-card-name-button').textContent(),'Segment');assert.equal(await page.evaluate(()=>Object.hasOwn(subject.timeline.segments[1],'extended_card_name')),false);
 });
 await check('Transient Escape gate exists only during editing and is cleared by every completion/removal path',async()=>{
  for(const action of ['Enter','Escape','blur','rerender','card removal','modal close']){
   await reset();assert.equal(await page.locator('.mmc-tl-card-name-guard').count(),0);await rename('Draft',null);
   const guard=page.locator('.mmc-tl-card-name-guard');assert.equal(await guard.count(),1);
   assert.deepEqual(await guard.evaluate(node=>({display:getComputedStyle(node).display,aria:node.getAttribute('aria-hidden')})),{display:'none',aria:'true'});
   if(action==='Enter'||action==='Escape')await page.keyboard.press(action);
   else if(action==='blur')await page.locator('.mmc-tl-index').click();
   else await page.evaluate(action=>{
    if(action==='rerender')subject.mount();
    if(action==='card removal')document.querySelector('.mmc-tl-card').remove();
    if(action==='modal close')nameUnmount();
   },action);
   assert.equal(await page.locator('.mmc-tl-card-name-guard').count(),0,action);
   if(['rerender','card removal','modal close'].includes(action))assert.equal(await page.evaluate(()=>subject.commits),0,action);
   if(action!=='modal close'){
    await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>overlayClosed),1,action);
   }
  }
 });
 await check('Stale card replacement/disconnected input cannot rename a new card; IME Enter does not prematurely save',async()=>{
  await reset();await rename('Stale',null);assert.equal(await page.evaluate(()=>{
   const input=document.querySelector('.mmc-tl-card-name-input');input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true}));return subject.commits===0&&input.isConnected;
  }),true);
  await page.evaluate(()=>{subject.timeline.segments[1]={card_id:'replacement',prompt:'New',duration_s:4};});await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>subject.timeline.segments[1].extended_card_name??null),null);assert.equal(await page.evaluate(()=>subject.commits),0);
  await reset();await rename('Detached',null);assert.equal(await page.evaluate(()=>{
   const input=document.querySelector('.mmc-tl-card-name-input');subject.host.remove();input.dispatchEvent(new FocusEvent('blur'));return subject.commits===0&&!subject.timeline.segments[1].extended_card_name;
  }),true);
 });
 await check('Names are text not markup, bounded to 80, with complete accessible tooltip',async()=>{
  await reset();await rename('<img src=x onerror=alert(1)>');assert.equal(await page.locator('.mmc-tl-card-name img').count(),0);
  await rename('x'.repeat(100));assert.equal(await page.evaluate(()=>subject.timeline.segments[1].extended_card_name.length),80);
  assert.ok((await page.locator('.mmc-tl-card-name-button').getAttribute('title')).startsWith('x'.repeat(80)+'\n'));
 });
 await check('Reference count and unchanged duration share one row; duration retains its original callback/title and auto gate',async()=>{
  for(const options of [{},{shared:true},{clip:true}]){
   await reset(options);const geometry=await page.evaluate(()=>{
    const row=document.querySelector('.mmc-tl-card-refs'),duration=row.querySelector('.mmc-tl-dur'),refs=row.querySelector('span:not(.mmc-tl-dur)');const d=duration.getBoundingClientRect();
    return {headerDuration:!!document.querySelector('.mmc-tl-card-head .mmc-tl-dur'),count:refs?.textContent??null,duration:duration.textContent,title:duration.title,same:!refs||Math.abs(refs.getBoundingClientRect().top+refs.getBoundingClientRect().height/2-d.top-d.height/2)<1,right:!refs||refs.getBoundingClientRect().right<d.left};
   });assert.ok(!geometry.headerDuration&&geometry.same&&geometry.right);assert.ok(geometry.duration.includes('14.'));assert.ok(geometry.title);
  }
  await reset();assert.equal(await page.evaluate(()=>{
   fixtureS.canDo=(piece,kind)=>kind==='duration'||(kind==='motion_fix'&&piece.motion);subject.mount();const button=document.querySelector('.mmc-tl-card-refs .mmc-tl-dur');const valid=button.tagName==='BUTTON'&&button.title.includes('model pick')&&getComputedStyle(button).fontSize===getComputedStyle(document.querySelector('.mmc-tl-card')).fontSize;button.click();return valid&&subject.timeline.segments[1].auto_duration===true&&document.querySelector('.mmc-tl-dur').textContent.startsWith('~');
  }),true);
 });
 await check('Jump menu uses live card names/defaults plus ordinals, keeping navigation and stale guards',async()=>{
  await reset();await rename('Opening');await page.evaluate(()=>{subject.timeline.segments[0].extended_card_name='First';subject.timeline.segments[2].kind='clip';subject.jumped=[];subject.jumpToSegment=index=>subject.jumped.push(index);});
  await page.locator('.mmc-tl-jump-select').click();assert.deepEqual(await page.locator('.mmc-tl-jump-option').allTextContents(),['1 · First','2 · Opening','3 · Clip']);
  await page.locator('.mmc-tl-jump-option').nth(1).click();assert.deepEqual(await page.evaluate(()=>subject.jumped),[1]);
  await page.locator('.mmc-tl-jump-select').click();await page.keyboard.press('End');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'3 · Clip');await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'2 · Opening');
  await page.evaluate(()=>subject.timeline.segments[1]={card_id:'new'});await page.keyboard.press('Enter');assert.deepEqual(await page.evaluate(()=>subject.jumped),[1]);
 });
 await check('Short/long labels and inline input remain bounded without font shrinking, EN/KO type scales and both card kinds',async()=>{
  for(const language of ['en','ko'])for(const scale of [.8,1,1.6])for(const clip of [false,true])for(const duration of [1,14.38]){
   await reset({language,scale,clip,duration,take:false,motion:false});await rename('아주 긴 카드 이름 '.repeat(8));
   for(const editing of [false,true]){
    if(editing)await page.locator('.mmc-tl-card-name-button').click();
    const value=await page.evaluate(()=>{
     const card=document.querySelector('.mmc-tl-card'),node=document.querySelector('.mmc-tl-card-name-input')??document.querySelector('.mmc-tl-card-name-button');const rect=node.getBoundingClientRect(),bounds=card.getBoundingClientRect();
     const others=[...document.querySelector('.mmc-tl-card-head').children].filter(element=>!element.classList.contains('mmc-tl-card-name')).map(element=>element.getBoundingClientRect());
     return {width:rect.width,left:rect.left,right:rect.right,font:parseFloat(getComputedStyle(node).fontSize),card:{left:bounds.left,right:bounds.right},overlap:others.some(other=>rect.left<other.right-.1&&rect.right>other.left+.1&&rect.top<other.bottom-.1&&rect.bottom>other.top+.1)};
    });assert.ok(value.width>=20&&value.left>=value.card.left+12&&value.right<=value.card.right-12&&!value.overlap,JSON.stringify({language,scale,clip,duration,editing,value}));assert.ok(Math.abs(value.font-12*scale)<.02);
   }
  }
 });
 const out=process.env.CONTINUITY_UX_SCREENSHOT_DIR||process.env.CONTINUITY_ARTIFACT_DIR;
 if(out){fs.mkdirSync(out,{recursive:true});await reset({language:'ko',face:true});await rename('오프닝 장면');await page.screenshot({path:path.join(out,'card-name-ko.png')});await reset({language:'ko',scale:1.6,duration:1,take:false,motion:false});await rename('긴 장면 이름을 직접 지정할 수 있습니다');await page.locator('.mmc-tl-card-name-button').click();await page.screenshot({path:path.join(out,'card-name-short-large-editing.png')});}
 assert.equal(requests,0);assert.deepEqual(errors,[]);await browser.close();browser=null;
 console.log(JSON.stringify({passed:results.length,requests,pageErrors:errors.length,results},null,2));
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1;});
