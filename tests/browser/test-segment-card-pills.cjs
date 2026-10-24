// Actual generated-card actions and CSS in a network-blocked browser fixture.
// Reference/model metadata are fixtures; no ComfyUI, queue or GPU execution.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=process.env.CONTINUITY_SOURCE_ROOT
  ? path.resolve(process.env.CONTINUITY_SOURCE_ROOT,'web/creator')
  : path.resolve(__dirname,'../../web/creator');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const source=read('timeline.js');
const state=read('state.js');
const method=(text,name)=>{
 const found=text.match(new RegExp(`^  (?:async )?${name}\\([^]*?^  \\}`,'m'));
 assert.ok(found,`production method ${name}`);return found[0];
};
const fn=(text,name)=>{
 const found=text.match(new RegExp(`(?:export )?function ${name}\\([^]*?^\\}`,'m'));
 assert.ok(found,`production function ${name}`);return found[0].replace(/^export /,'');
};
const constant=(text,name)=>{
 const found=text.match(new RegExp(`^(?:export )?const ${name} =[^]*?;`,'m'));
 assert.ok(found,`production constant ${name}`);return found[0].replace(/^export /,'');
};
// Later presentation releases wrap/reorder Clip controls and replace generated
// caption text with a count. Keep every actual action/calculation invariant,
// while permitting only those explicitly authorized DOM/presentation changes.
const playwrightPath=process.env.PLAYWRIGHT_MODULE||'playwright';
const {babelParse,traverse}=require(path.join(path.dirname(require.resolve(playwrightPath)),'lib/transform/babelBundle.js'));
const clean=node=>JSON.parse(JSON.stringify(node,(key,value)=>['loc','start','end','extra','leadingComments','trailingComments','innerComments','comments'].includes(key)?undefined:value));
const ownerAst=(text,name)=>babelParse('class ActualOwner {\n'+method(text,name)+'\n}',name+'-pills-receipt.js',true);
const callbacks=(text,name)=>{
 const result=[];traverse(ownerAst(text,name),{ObjectProperty(p){const key=p.node.key.name||p.node.key.value;
  const owner=p.findParent(parent=>parent.isVariableDeclarator());
  if(owner?.node.id.name==='faceChip')return; // Replaced by separately covered per-card full popover.
  if(/^on(?:click|pointer|double|key|change|blur|focus)/i.test(key))result.push(JSON.stringify({key,value:clean(p.node.value)}));}});
 return result.sort();
};
const calculations=text=>ownerAst(text,'renderCard').program.body[0].body.body[0].body.body.slice(0,-1)
 .filter(s=>!(s.type==='VariableDeclaration'&&s.declarations.every(d=>['typed','prompt','repaired','faceChip'].includes(d.id.name)))).map(clean);
// Authorized number/delete UI has separate real-control acceptance coverage;
// underlying disarm/remove/take/clip algorithms remain exact baseline source.
const baselineRoot=process.env.CONTINUITY_BASELINE_DIR
 ? path.resolve(process.env.CONTINUITY_BASELINE_DIR,'web/creator')
 : path.resolve(__dirname,'../../../baseline/web/creator');
if(fs.existsSync(path.join(baselineRoot,'timeline.js'))){
 const baseline=fs.readFileSync(path.join(baselineRoot,'timeline.js'),'utf8');
 for(const name of ['disarm','remove','takeChip','takeTools'])
  assert.equal(method(source,name),method(baseline,name),`${name} behavior unchanged`);
 for(const name of ['renderCard','renderClipCard'])assert.deepEqual(callbacks(source,name),callbacks(baseline,name),name+' original callback ASTs unchanged outside presentation wrappers');
 assert.deepEqual(calculations(source),calculations(baseline),'generated-card state calculations unchanged except removed caption-only typed/prompt declarations');
 assert.doesNotMatch(method(source,'renderCard'),/ondblclick: \(\) => this\.edit\(index\)/);
}
const css=['base','editor','picker','overlays','timeline'].map(name=>{
 const found=read(`styles/${name}.js`).match(/export const css = `([^]*)`;\s*$/);
 assert.ok(found,`production CSS ${name}`);return found[1];
}).join('\n');
const ko=vm.runInNewContext(read('locales/ko.js').replace(/^export const /m,'const ')+';ko;',{});
const code=`
${fn(read('dom.js'),'el')}
${read('dom.js').match(/^export const ICONS =[^]*?^};/m)[0].replace(/^export /,'')}
${fn(read('dom.js'),'svg')}
${fn(read('dom.js'),'icon')}
const dictionaries={ko:${JSON.stringify(ko)}};let locale='en';
const t=(text,values={})=>(dictionaries[locale]?.[text]??text).replace(/\\{([^}]+)\\}/g,(_,key)=>values[key]??key);
const isClip=segment=>segment.kind==='clip';
const canDo=(piece,kind)=>kind==='motion_fix'&&piece.motion||kind==='face'&&piece.faceSupported;
const pieceFamily=()=> 'h3';
const VIDEO_RULES={minShortEdge:128,nativeShortEdge:768,multiple:32};
${['DEFAULT_FACE_CANVAS','MIN_FACE_CANVAS','MAX_FACE_CANVAS','DEFAULT_FACE_DENOISE','MIN_FACE_DENOISE','MAX_FACE_DENOISE','emptyFace'].map(name=>constant(state,name)).join('\n')}
${fn(state,'parseFace')}
const popoverOwners=new WeakMap(),popoverClosers=new Map();
${['floatAbove','dismissable','placeNear'].map(name=>fn(read('dom.js'),name)).join('\n')}
${['stepperPill','facesPill','openFacesPopover'].map(name=>fn(read('pills.js'),name)).join('\n')}
${['isHeld','takeOn','isKept'].map(name=>constant(state,name)).join('\n')}
${fn(state,'motionFix')}
${fn(state,'segmentSeed')}
${fn(state,'cardName')}
const passes=timeline=>timeline.segments.map((segment,start)=>({start,segments:[segment]}));
${fn(state,'dropTake')}
const S={isClip,isHeld,takeOn,isKept,motionFix,canDo,segmentSeed,cardName,pieceFamily:()=> 'h3',
 references:s=>s.assets??[],citedPool:()=>[],activeLoras:()=>[],storyboardSheet:()=>[],dropTake,
 faceOn:(_piece,segment)=>segment.face?.on===true,
 mode:()=> 'REF2VA',showSeconds:value=>Number(value).toFixed(2),addSegmentRefusal:piece=>piece.refusal??null,
 clipSeconds:s=>s.duration_s,clipSize:s=>({width:s.width??480,height:s.height??832}),clipSound:s=>s.sound!==false};
const rulesFor=()=>({fps:24});const framesForSeconds=seconds=>Math.round(seconds*24);
const secondsForFrames=frames=>frames/24;const isTrainedLength=()=>true;
${constant(source,'cardWidth')}
${constant(source,'holdSkin')}
const trimLabel=take=>take.trim?take.trim.start+'–'+take.trim.end:'whole';
const cropLabel=crop=>crop?'cropped':'';
${fn(read('sampling.js'),'segmentSeedPill')}
class Subject {
 ${['renderCard','takeChip','takeTools','renderClipCard','soloBadge','cardLabel','cardNameControl','cardPreview'].map(name=>method(source,name)).join('\n')}
 constructor(){this.timeline={motion:true,assets:[],segments:[]};this.gone=new Set();this.edited=new Set();this.calls=[];this.commits=0;}
 holdSwitch(){return el('button',{class:'mmc-tl-card-state mmc-ghost'},[icon('lockOpen',13)]);}
 pieceSeed(){return 692093657;}geometry(){return {width:480,height:832};}
 edit(i){this.calls.push(['edit',i]);}editTake(i){this.calls.push(['trim',i]);}editTakeCrop(i){this.calls.push(['crop',i]);}
 move(i,d){this.calls.push(['move',i,d]);}duplicate(i){this.calls.push(['duplicate',i]);}
 removeButton(i){return el('button',{class:'mmc-asset-x',text:'✕',onclick:()=>this.calls.push(['remove',i])});}
 disarm(i){this.calls.push(['disarm',i]);}commit(){this.commits++;this.mount();}
 editClip(i){this.calls.push(['clip-trim',i]);}replaceClip(i){this.calls.push(['replace',i]);}editClipCrop(i){this.calls.push(['clip-crop',i]);}
 mount(){const segment=this.timeline.segments[1];this.host.replaceChildren(this.renderCard(segment,1,
  {start:this.shared?0:1,segments:this.shared?[this.timeline.segments[0],segment]:[segment]}));}
}
window.Subject=Subject;
window.setFixture=({language='en',duration=14.38,kept=true,take=true,missing=false,shared=false,motion=true,
 trim=false,crop=false,clip=false,scale=1,face=false,faceOff=false,fixed=false,edited=false}={})=>{
 locale=language;document.documentElement.style.setProperty('--mmc-type',String(scale));
 const subject=new Subject();window.subject=subject;subject.shared=shared;subject.timeline.motion=motion;
 subject.timeline.faceSupported=face;
 const segment={duration_s:duration,prompt:'summary: [video editing + reference generation + audio reuse] Replace the selected performer while retaining the original performance.',
  seed:692093657,assets:[{handle:'ref-1'},{handle:'ref-2'},{handle:'ref-3'}],
  face:{on:face&&!faceOff,canvas:512,denoise:.45},...(kept?{hold:true}:{}),...(fixed?{motion_fix:true}:{}),...(take?{take:{filename:'take.mp4',seed:692093657,
  ...(trim?{trim:{start:1,end:9}}:{}),...(crop?{crop:{left:0.1}}:{})}}:{}),...(clip?{kind:'clip',filename:'clip.mp4'}:{})};
 subject.timeline.segments=[{duration_s:12,prompt:'Before'},segment,{duration_s:12,prompt:'After'}];
 if(missing)subject.gone.add('take.mp4');
 if(edited)subject.edited.add(1);
 subject.host=el('div',{class:'mmc-root fixture-host'});subject.modal=subject.host;document.body.replaceChildren(subject.host);subject.mount();
 return subject;
};setFixture();
`;
new vm.Script(code);
const results=[];let browser,requests=0;
const check=async(name,fn)=>{await fn();results.push({name,passed:true});};
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined});
 const page=await browser.newPage({viewport:{width:1000,height:700}});
 await page.route('**/*',route=>{requests++;return route.abort();});
 await page.setContent(`<style>${css}:root{--comfy-menu-bg:#171718;--fg-color:#fff;--input-text:#ddd;--descrip-text:#999;--bg-color:#202020;--primary-background:#0b8ce9;--destructive-background:#b33a3a;--error-text:#f44}
 body{margin:24px;background:#171718}.fixture-host{width:max-content;height:auto;padding:0}</style><body></body>`);
 await page.evaluate(`(()=>{${code}})()`);
 await check('Kept generated take groups Trim, Crop and rightmost Edit; clips retain their original order',async()=>{
  assert.deepEqual(await page.evaluate(()=>[...document.querySelector('.mmc-tl-card-edit-tools').children].map(n=>n.textContent)),['Trim','Crop','Edit']);
  assert.equal(await page.evaluate(()=>document.querySelectorAll('.mmc-tl-card-edit-tools').length),1);
 });
 await check('Each grouped button invokes its original callback once without changing the take',async()=>{
  const before=await page.evaluate(()=>JSON.stringify(subject.timeline));
  await page.evaluate(()=>[...document.querySelector('.mmc-tl-card-edit-tools').children].forEach(n=>n.click()));
  assert.deepEqual(await page.evaluate(()=>subject.calls),[['trim',1],['crop',1],['edit',1]]);
  assert.equal(await page.evaluate(()=>JSON.stringify(subject.timeline)),before);
  assert.equal(await page.evaluate(()=>subject.commits),0);
 });
 await check('Existing enabled/disabled transport actions remain separate and functional',async()=>{
  assert.deepEqual(await page.evaluate(()=>{
   setFixture();const buttons=[...document.querySelector('.mmc-tl-card-transport').children];
   const text=buttons.map(n=>n.textContent);buttons.forEach(n=>n.click());return {text,calls:subject.calls};
  }),{text:['◀','▶','⧉','✕'],calls:[['move',1,-1],['move',1,1],['duplicate',1],['remove',1]]});
 });
 await check('Boundary moves and budget-refused duplicates keep their original disabled behavior',async()=>{
  assert.equal(await page.evaluate(()=>{
   setFixture();subject.timeline.refusal='Over budget';
   const first=subject.timeline.segments[0];subject.host.replaceChildren(subject.renderCard(first,0,{segments:[first]}));
   const firstButtons=document.querySelector('.mmc-tl-card-transport').children;
   const firstBlocked=firstButtons[0].disabled&&firstButtons[2].disabled;firstButtons[0].click();firstButtons[2].click();
   const last=subject.timeline.segments[2];subject.host.replaceChildren(subject.renderCard(last,2,{segments:[last]}));
   const lastButtons=document.querySelector('.mmc-tl-card-transport').children;
   const lastBlocked=lastButtons[1].disabled;lastButtons[1].click();return firstBlocked&&lastBlocked&&subject.calls.length===0;
  }),true);
 });
 await check('Shared, retake, missing-take and held-unshot cards retain Edit only',async()=>{
  for(const options of [{shared:true},{kept:false},{missing:true},{take:false}]){
   assert.deepEqual(await page.evaluate(options=>{setFixture(options);return [...document.querySelector('.mmc-tl-card-edit-tools').children].map(n=>n.textContent);},options),['Edit']);
  }
 });
 await check('Set Trim/Crop states and labels preserve their existing on classes',async()=>{
  assert.equal(await page.evaluate(()=>{
   setFixture({trim:true,crop:true});const buttons=document.querySelector('.mmc-tl-card-edit-tools').children;
   return buttons[0].classList.contains('on')&&buttons[1].classList.contains('on')&&buttons[0].title.includes('1–9')&&buttons[1].title==='cropped';
  }),true);
 });
 await check('Motion repair remains a capability-gated button with the same reversible action',async()=>{
  assert.equal(await page.evaluate(()=>{
   setFixture();const before=JSON.stringify(subject.timeline);let button=document.querySelector('.mmc-tl-card-motion');
   const off=button.tagName==='BUTTON'&&button.textContent==='no motion fix';button.click();
   button=document.querySelector('.mmc-tl-card-motion');const on=button.classList.contains('on')&&button.textContent==='motion fix'&&subject.commits===1;
   button.click();const restored=JSON.stringify(subject.timeline)===before&&subject.commits===2;
   setFixture({motion:false});return off&&on&&restored&&!document.querySelector('.mmc-tl-card-motion');
  }),true);
 });
 await check('Actual takeChip preserves ready/kept/edited/missing states and forget-take action',async()=>{
  for(const [options,expected] of [[{},'kept'],[{kept:false},'take ready'],[{edited:true},'kept · edited'],
   [{missing:true},'kept · file gone'],[{missing:true,kept:false},'take · file gone'],[{take:false},'not shot']]){
   assert.equal(await page.evaluate(options=>{setFixture(options);return document.querySelector('.mmc-tl-card-status > .mmc-tl-card-state')?.firstChild.textContent;},options),expected);
  }
  assert.equal(await page.evaluate(()=>{setFixture();document.querySelector('.mmc-tl-take-x').click();return !subject.timeline.segments[1].take&&subject.commits===1&&subject.calls.length===0;}),true);
 });
 await check('Face pass full popover changes only the individual block and never opens editor',async()=>{
  assert.equal(await page.evaluate(()=>{
   setFixture({face:true});const before=JSON.stringify(subject.timeline);let button=document.querySelector('.mmc-tl-card-face');
   const on=button.textContent==='Face pass'&&button.classList.contains('on');button.click();
   document.querySelectorAll('.mmc-faces-pop .mmc-opt')[0].click();
   button=document.querySelector('.mmc-tl-card-face');const off=button.textContent==='Face pass'&&!button.classList.contains('on')&&subject.timeline.segments[1].face.on===false;
   document.querySelectorAll('.mmc-faces-pop .mmc-opt')[1].click();return on&&off&&JSON.stringify(subject.timeline)===before&&subject.commits===2&&subject.calls.length===0;
  }),true);
 });
 await check('Take/motion/face statuses stay centered and whole across both toggles, languages, sizes and durations',async()=>{
  for(const language of ['en','ko'])for(const scale of [.8,1,1.6])for(const duration of [1,14.38])
   for(const takeState of [{},{edited:true},{missing:true},{kept:false}])for(const faceOff of [false,true])for(const fixed of [false,true]){
    const value=await page.evaluate(options=>{
     setFixture({...options,face:true});const card=document.querySelector('.mmc-tl-card'),row=document.querySelector('.mmc-tl-card-status');
     const box=card.getBoundingClientRect(),rowBox=row.getBoundingClientRect(),badges=[...row.children].map(node=>{
      const rect=node.getBoundingClientRect(),style=getComputedStyle(node);return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,
       center:rect.top+rect.height/2,text:node.textContent,scroll:node.scrollWidth,width:node.clientWidth,font:parseFloat(style.fontSize),whiteSpace:style.whiteSpace};
     });
     return{card:{left:box.left,right:box.right,width:box.width,scroll:card.scrollWidth,client:card.clientWidth},row:{left:rowBox.left,right:rowBox.right,top:rowBox.top,bottom:rowBox.bottom},badges};
    },{language,scale,duration,faceOff,fixed,...takeState});
    assert.equal(value.badges.length,3,JSON.stringify(value));
    assert.ok(Math.max(...value.badges.map(b=>b.center))-Math.min(...value.badges.map(b=>b.center))<.5,JSON.stringify(value));
    assert.ok(value.card.scroll<=value.card.client+1,JSON.stringify(value));
    assert.ok(Math.abs(value.badges.at(-1).right-value.row.right)<.5,JSON.stringify(value));
    for(let i=1;i<value.badges.length;i++)assert.ok(Math.abs(value.badges[i].left-value.badges[i-1].right-6)<.5,JSON.stringify(value));
    for(const badge of value.badges){
     assert.ok(badge.left>=value.card.left+12&&badge.right<=value.card.right-12,JSON.stringify(value));
     assert.ok(badge.scroll<=badge.width+1,JSON.stringify(value));assert.equal(badge.whiteSpace,'nowrap');
     assert.ok(Math.abs(badge.font-10*scale)<.01,JSON.stringify(value));
    }
   }
 });
 await check('Conditional take/motion/face badges close up into the same right-aligned 6px-spaced row without empty slots',async()=>{
  for(const language of ['en','ko'])for(const scale of [.8,1,1.6])for(const duration of [1,14.38])
   for(const state of [{},{edited:true},{missing:true},{kept:false},{missing:true,kept:false},{take:false},{take:false,kept:false},{shared:true}])
    for(const motion of [false,true])for(const face of [false,true]){
     const value=await page.evaluate(options=>{
      setFixture(options);const card=document.querySelector('.mmc-tl-card'),row=document.querySelector('.mmc-tl-card-status');
      const box=card.getBoundingClientRect();if(!row)return{absent:true,expected:!options.motion&&!options.face&&(options.shared||options.take===false&&options.kept===false)};
      const rowBox=row.getBoundingClientRect(),badges=[...row.children].map(node=>{
       const rect=node.getBoundingClientRect(),style=getComputedStyle(node);return {left:rect.left,right:rect.right,center:rect.top+rect.height/2,
        class:node.className,scroll:node.scrollWidth,width:node.clientWidth,font:parseFloat(style.fontSize),marginLeft:style.marginLeft,marginRight:style.marginRight};
      });
      const expected=[...(!options.shared&&(options.take!==false||options.kept!==false)?['mmc-tl-card-state']:[]),
       ...(options.motion?['mmc-tl-card-motion']:[]),...(options.face?['mmc-tl-card-face']:[])];
      return{card:{left:box.left,right:box.right,scroll:card.scrollWidth,client:card.clientWidth},row:{left:rowBox.left,right:rowBox.right},badges,expected};
     },{language,scale,duration,motion,face,...state});
     if(value.absent){assert.equal(value.expected,true);continue;}
     assert.equal(value.badges.length,value.expected.length,JSON.stringify(value));
     assert.ok(Math.abs(value.badges.at(-1).right-value.row.right)<.5,JSON.stringify(value));
     assert.ok(Math.max(...value.badges.map(b=>b.center))-Math.min(...value.badges.map(b=>b.center))<.5,JSON.stringify(value));
     assert.ok(value.card.scroll<=value.card.client+1,JSON.stringify(value));
     for(let i=0;i<value.badges.length;i++){
      const badge=value.badges[i];assert.ok(badge.class.split(' ').includes(value.expected[i]),JSON.stringify(value));
      assert.equal(badge.marginLeft,'0px');assert.equal(badge.marginRight,'0px');
      assert.ok(badge.left>=value.card.left+12&&badge.right<=value.card.right-12,JSON.stringify(value));
      assert.ok(badge.scroll<=badge.width+1,JSON.stringify(value));assert.ok(Math.abs(badge.font-10*scale)<.01,JSON.stringify(value));
      if(i)assert.ok(Math.abs(badge.left-value.badges[i-1].right-6)<.5,JSON.stringify(value));
     }
    }
 });
 await check('Status labels are stable for face on/off and optional statuses do not allocate empty badges',async()=>{
  for(const language of ['en','ko'])for(const scale of [.8,1,1.6]){
   assert.equal(await page.evaluate(options=>{
    setFixture({...options,face:true});const a=document.querySelector('.mmc-tl-card').getBoundingClientRect().width;
    document.querySelector('.mmc-tl-card-face').click();const b=document.querySelector('.mmc-tl-card').getBoundingClientRect().width;
    setFixture({...options,face:true,take:false,kept:false});const withoutTake=document.querySelector('.mmc-tl-card-status').children.length;
    setFixture({...options,face:false,motion:false,take:false,kept:false});const empty=document.querySelector('.mmc-tl-card-status');
    return a===b&&withoutTake===2&&!empty;
   },{language,scale}),true);
  }
 });
 await check('Generated card background, character count, number and status single/double clicks never open editor',async()=>{
  await page.evaluate(()=>setFixture({face:true}));
  for(const selector of ['.mmc-tl-card','.mmc-tl-card-count','.mmc-tl-card-refs','.mmc-tl-index','.mmc-tl-card-status > .mmc-tl-card-state']){
   await page.locator(selector).evaluate(node=>{node.dispatchEvent(new MouseEvent('click',{bubbles:true}));node.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));});
  }
  await page.locator('.mmc-tl-card-motion').dblclick();await page.locator('.mmc-tl-card-face').dblclick();
  assert.equal(await page.evaluate(()=>subject.calls.filter(call=>call[0]==='edit').length),0);
  await page.locator('.mmc-tl-card-edit-tools > button').filter({hasText:/^Edit$/}).click();
  assert.deepEqual(await page.evaluate(()=>subject.calls),[['edit',1]]);
 });
 await check('Supplied clip actions use the same grouped pill and retain the original three labels',async()=>{
  assert.deepEqual(await page.evaluate(()=>{
   setFixture({clip:true});return {group:document.querySelectorAll('.mmc-tl-card-edit-tools').length,
    labels:[...document.querySelectorAll('.mmc-tl-card-edit-tools > .mmc-tl-edit')].map(n=>n.textContent),motion:!!document.querySelector('.mmc-tl-card-motion')};
  }),{group:1,labels:['Trim','Replace','Crop'],motion:false});
 });
 await check('Normal and short cards fit three whole labels on one row in EN/KO and all text sizes',async()=>{
  for(const language of ['en','ko'])for(const scale of [.8,1,1.6])for(const duration of [1,14.38]){
   const value=await page.evaluate(options=>{
    setFixture(options);const card=document.querySelector('.mmc-tl-card'),group=document.querySelector('.mmc-tl-card-edit-tools');
    const rect=card.getBoundingClientRect(),g=group.getBoundingClientRect(),buttons=[...group.children].map(n=>({rect:n.getBoundingClientRect(),font:getComputedStyle(n).fontSize,family:getComputedStyle(n).fontFamily,scroll:n.scrollWidth,width:n.clientWidth}));
    const seedStyle=getComputedStyle(document.querySelector('.mmc-tl-card-seed .mmc-seed-mode'));
    const motion=document.querySelector('.mmc-tl-card-motion');
    const transport=document.querySelector('.mmc-tl-card-transport').getBoundingClientRect();
    return {card:{left:rect.left,right:rect.right,scroll:card.scrollWidth,width:card.clientWidth},group:{left:g.left,right:g.right,top:g.top,bottom:g.bottom},
     buttons:buttons.map(v=>({top:v.rect.top,bottom:v.rect.bottom,height:v.rect.height,font:parseFloat(v.font),family:v.family,scroll:v.scroll,width:v.width})),
     seed:{font:parseFloat(seedStyle.fontSize),family:seedStyle.fontFamily},
     outerBorder:parseFloat(getComputedStyle(group).borderTopWidth),radius:parseFloat(getComputedStyle(group).borderRadius),
     motionRadius:parseFloat(getComputedStyle(motion).borderRadius),motionBorder:parseFloat(getComputedStyle(motion).borderTopWidth),
     transport:{left:transport.left,right:transport.right,centers:[...document.querySelector('.mmc-tl-card-transport').children].map(n=>{const r=n.getBoundingClientRect();return r.top+r.height/2;})}};
   },{language,scale,duration});
   assert.equal(value.buttons.length,3);
   assert.ok(Math.max(...value.buttons.map(v=>v.top))-Math.min(...value.buttons.map(v=>v.top))<.5,JSON.stringify(value));
   assert.ok(value.group.left>=value.card.left&&value.group.right<=value.card.right,JSON.stringify(value));
   assert.ok(value.card.scroll<=value.card.width+1,JSON.stringify(value));
   assert.ok(value.transport.left>=value.card.left&&value.transport.right<=value.card.right,JSON.stringify(value));
   assert.ok(Math.max(...value.transport.centers)-Math.min(...value.transport.centers)<.5,JSON.stringify(value));
   assert.ok(Math.abs(value.seed.font-11*scale)<.01,JSON.stringify(value));
   for(const b of value.buttons){assert.ok(b.scroll<=b.width+1,JSON.stringify(value));assert.equal(b.font,value.seed.font);assert.equal(b.family,value.seed.family);}
   assert.equal(value.outerBorder,1);assert.ok(value.radius>=100);assert.equal(value.motionBorder,1);assert.ok(value.motionRadius>=100);
  }
 });
 await check('Generated footer DOM order matches right transport then right edit groups through every conditional take state',async()=>{
  for(const language of ['en','ko'])for(const scale of [.8,1,1.6])for(const duration of [1,14.38])
   for(const state of [{},{edited:true},{missing:true},{kept:false},{take:false},{shared:true}]){
    const value=await page.evaluate(options=>{
     setFixture(options);const footer=document.querySelector('.mmc-tl-card-foot'),transport=footer.querySelector('.mmc-tl-card-transport'),group=footer.querySelector('.mmc-tl-card-edit-tools');
     const rect=node=>{const r=node.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom};};
     return{order:[...footer.children].map(node=>node.className),footer:rect(footer),transport:rect(transport),group:rect(group),
      buttons:[...footer.querySelectorAll('button')].map(node=>({box:rect(node),disabled:node.disabled,hit:document.elementFromPoint(node.getBoundingClientRect().left+node.getBoundingClientRect().width/2,node.getBoundingClientRect().top+node.getBoundingClientRect().height/2)===node}))};
    },{language,scale,duration,...state});
    assert.deepEqual(value.order,['mmc-tl-card-transport','mmc-tl-card-edit-tools']);
    assert.ok(Math.abs(value.transport.right-value.footer.right)<.5,JSON.stringify(value));
    assert.ok(Math.abs(value.group.right-value.footer.right)<.5,JSON.stringify(value));
    assert.ok(value.transport.bottom<=value.group.top-3,JSON.stringify(value));
    for(const button of value.buttons){assert.ok(button.box.left>=value.footer.left-1&&button.box.right<=value.footer.right+1,JSON.stringify(value));if(!button.disabled)assert.equal(button.hit,true,JSON.stringify(value));}
   }
 });
 await check('Native Tab order follows visible transport then edit actions without changing any callbacks or take data',async()=>{
  for(const state of [{},{shared:true},{kept:false},{missing:true},{take:false}]){
   await page.evaluate(options=>setFixture(options),state);
   const before=await page.evaluate(()=>JSON.stringify(subject.timeline));
   const buttons=page.locator('.mmc-tl-card-foot button:not(:disabled)');const labels=await buttons.allTextContents();
   assert.deepEqual(labels,state.shared||state.kept===false||state.missing||state.take===false?['◀','▶','⧉','✕','Edit']:['◀','▶','⧉','✕','Trim','Crop','Edit']);
   await buttons.first().focus();
   for(let i=0;i<labels.length;i++){
    assert.equal(await page.evaluate(()=>document.activeElement.textContent),labels[i]);
    if(i<labels.length-1)await page.keyboard.press('Tab');
   }
   assert.equal(await page.evaluate(()=>JSON.stringify(subject.timeline)),before);assert.equal(await page.evaluate(()=>subject.calls.length),0);
   await page.locator('.mmc-tl-card-edit-tools > button').filter({hasText:/^Edit$/}).focus();await page.keyboard.press('Enter');
   assert.deepEqual(await page.evaluate(()=>subject.calls),[['edit',1]]);
  }
 });
 await check('Grouped native actions are keyboard accessible and do not make their wrapper clickable',async()=>{
  await page.evaluate(()=>setFixture());await page.locator('.mmc-tl-card-edit-tools > button').nth(1).focus();await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(()=>subject.calls),[['crop',1]]);
  assert.equal(await page.evaluate(()=>document.querySelector('.mmc-tl-card-edit-tools').tagName),'DIV');
 });
 const out=process.env.CONTINUITY_UX_SCREENSHOT_DIR||process.env.CONTINUITY_ARTIFACT_DIR;
 if(out){fs.mkdirSync(out,{recursive:true});
  await page.evaluate(()=>setFixture({language:'ko'}));await page.locator('.fixture-host').screenshot({path:path.join(out,'segment-card-pills-ko-normal.png')});
  await page.evaluate(()=>setFixture({language:'ko',scale:1.6,duration:1}));await page.locator('.fixture-host').screenshot({path:path.join(out,'segment-card-pills-ko-short-large.png')});
  await page.evaluate(()=>setFixture({language:'ko',scale:1.6,duration:1,face:true,faceOff:true,edited:true}));await page.locator('.fixture-host').screenshot({path:path.join(out,'segment-card-status-ko-short-large.png')});
  await page.evaluate(()=>setFixture({language:'en',face:true,faceOff:true,missing:true}));await page.locator('.fixture-host').screenshot({path:path.join(out,'segment-card-status-en-file-gone.png')});
  await page.evaluate(()=>setFixture({language:'ko',face:true,edited:true}));await page.locator('.fixture-host').screenshot({path:path.join(out,'segment-card-status-ko-grouped.png')});
  await page.evaluate(()=>setFixture({language:'ko',take:false,kept:false,face:true}));await page.locator('.fixture-host').screenshot({path:path.join(out,'segment-card-status-ko-no-take.png')});
  await page.evaluate(()=>setFixture({language:'ko',face:false,edited:true}));await page.locator('.fixture-host').screenshot({path:path.join(out,'segment-card-status-ko-no-face.png')});
 }
 assert.equal(requests,0,'No network requests');console.log(JSON.stringify({suite:'segment-card-pills',checks:results.length,requests,results},null,2));
})().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(async()=>{await browser?.close();});
