// Actual individual-card source readers/controller/DOM/viewer in fresh, offline
// browsers. The API boundary maps synthetic filenames to RAM-only local media.
// No live ComfyUI, user files, profile, queue, backend mutation or GPU execution.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const repo=process.env.CONTINUITY_SOURCE_ROOT?path.resolve(process.env.CONTINUITY_SOURCE_ROOT):path.resolve(__dirname,'../..');
const root=path.join(repo,'web/creator');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const method=(text,name)=>{const match=text.match(new RegExp(`^  (?:async )?${name}\\([^]*?^  \\}`,'m'));assert.ok(match,`actual ${name}`);return match[0];};
const fn=(text,name)=>{const match=text.match(new RegExp(`(?:export )?function ${name}\\([^]*?^\\}`,'m'));assert.ok(match,`actual ${name}`);return match[0].replace(/^export /,'');};
const constant=(text,name)=>{const match=text.match(new RegExp(`^(?:export )?const ${name} =[^]*?;`,'m'));assert.ok(match,`actual ${name}`);return match[0].replace(/^export /,'');};
const source=read('timeline.js');
const previewSource=read('card-preview.js');
const python=process.env.CONTINUITY_PYTHON||'python';
const catalogRun=spawnSync(python,['-B','-c',"import sys;sys.path.insert(0,sys.argv[1]+'/tests');import layout;print(layout.catalog_json())",repo],{encoding:'utf8',env:{...process.env,PYTHONUTF8:'1',PYTHONDONTWRITEBYTECODE:'1'}});
assert.equal(catalogRun.status,0,catalogRun.stderr||catalogRun.stdout);
const catalog=JSON.parse(catalogRun.stdout.split(/\r?\n/).find(line=>line.startsWith('{')));
const cropCases=[];for(const turn of [0,90,180,270])for(const mirror of ['', 'h','v','hv'])cropCases.push({crop:{x:.25,y:.1,w:.5,h:.8,turn,mirror},width:160,height:90});
cropCases.push({crop:{x:.5,y:0,w:.5,h:1},width:201,height:101},{crop:{x:.5,y:0,w:.5,h:1},width:203,height:101});
const cropRun=spawnSync(python,['-B','-c',"import sys,json;sys.path.insert(0,sys.argv[1]+'/tests');import layout;p=layout.load('crop',package='preview_crop').crop;out=[]\nfor case in json.load(sys.stdin):\n c=p.parse(case['crop']);ow,oh=p.turned_size((case['width'],case['height']),c);l,t,r,b=p.box((case['width'],case['height']),c);out.append(dict(turn=c.turn,mirror=c.mirror,orientedWidth=ow,orientedHeight=oh,left=l,top=t,width=r-l,height=b-t))\nprint(json.dumps(out))",repo],{input:JSON.stringify(cropCases),encoding:'utf8',env:{...process.env,PYTHONUTF8:'1',PYTHONDONTWRITEBYTECODE:'1'}});
assert.equal(cropRun.status,0,cropRun.stderr||cropRun.stdout);const backendFraming=JSON.parse(cropRun.stdout.split(/\r?\n/).find(line=>line.startsWith('[')));
const css=['base','editor','picker','overlays','timeline'].map(name=>read(`styles/${name}.js`).match(/export const css = `([^]*)`;\s*$/)[1]).join('\n');
const theme=':root{--comfy-menu-bg:#181819;--fg-color:#ddd;--input-text:#ddd;--descrip-text:#999;--bg-color:#202020;--primary-background:#0b8ce9;--destructive-background:#b33a3a;--error-text:#f44}body{margin:20px;background:#181819;color:#ddd}.fixture-host{display:flex;align-items:flex-start;gap:18px;flex-wrap:wrap}.fixture-card{width:260px;background:#202020;border:1px solid #444;border-radius:18px;padding:12px;box-sizing:border-box}';

// Preserve production ES modules, including state parsing/serialization and
// translations. Only imports are rebased onto local Blob URLs. The declared
// family catalog is the real Python catalog, not a replacement state reader.
const moduleSources={};
const collect=name=>{
 if(Object.hasOwn(moduleSources,name))return;
 if(name==='api.js'){
  moduleSources[name]=`export function viewUrl(filename,options){window.urlCalls.push({filename,options});return filename.includes('bad-media')?window.badMediaUrl:window.mediaUrl;}\nexport async function probe(filename){window.probeCalls.push(filename);return {missing:filename.includes('missing')};}\nexport function isFramed(crop){return Boolean(crop&&(crop.turn||crop.mirror||(crop.w??1)<1||(crop.h??1)<1||(crop.x??0)>0||(crop.y??0)>0));}`;
  return;
 }
 const text=read(name);moduleSources[name]=text;
 for(const match of text.matchAll(/(?:from\s*|import\s*\()(["'])(\.\/[^"']+)\1/g)){
  const dependency=path.posix.normalize(path.posix.join(path.posix.dirname(name),match[2]));collect(dependency);
 }
};
for(const name of ['state.js','canvas.js','dom.js','i18n.js','card-preview.js','reference-preview.js','viewprefs.js'])collect(name);
// Actual card/pass/strip/navigation/close methods. Only unrelated panel actions,
// their render host and the media API are fixture boundaries. No preview method,
// source resolver, controller, state reader or lifecycle callback is replaced.
const timelineCode=`
 const {el,icon,svg,mountOverlay,placeNear,dismissable}=D;const {t}=I;
 const {emptyFace,parseFace,isClip,pieceFamily,canDo,MIN_FACE_CANVAS,MAX_FACE_CANVAS,MIN_FACE_DENOISE,MAX_FACE_DENOISE}=S;
 ${['stepperPill','facesPill','openFacesPopover'].map(name=>fn(read('pills.js'),name)).join('\n')}
 const {rulesFor,framesForSeconds,secondsForFrames,isTrainedLength}=C;
 const {cardPreviewSource,createCardPreview,pauseCardPreviews}=P;
 const {openReferencePreview}=V;const {probe}=await import(window.moduleUrls['api.js']);
 const {readViewPrefs,patchViewPrefs}=W;
 ${constant(source,'cardWidth')}
 ${constant(source,'holdSkin')}
 const trimLabel=take=>take.trim?take.trim.start+'–'+take.trim.end:'whole';
 const cropLabel=crop=>crop?'cropped':'';
 ${fn(read('sampling.js'),'segmentSeedPill')}
 class Subject {
  ${['renderCard','renderClipCard','renderPass','renderCut','renderStrip','renderNavigation','segmentNavigator','holdAllPills','holdSwitch','takeChip','takeTools','soloBadge','cardLabel','cardNameControl','removeButton','disarm','askTakes','clearCardPreviews','cardPreview','clearAudioUndo','close'].map(name=>method(source,name)).join('\n')}
  constructor(piece){this.timeline=piece;${method(source,'constructor').match(/    this\.previewMode =[^\r\n]*;/)[0].trim()}this.cardPreviews=new Set();this.cardPreviewClose=null;this.gone=new Set(['missing.webm [output]']);this.asked=new Set();this.edited=new Set();this.armed=null;this.calls=[];this.commits=0;this.audioVersions={soundscape:0,music:0};}
  pieceSeed(){return 692093657;}geometry(){return {width:480,height:832};}
  edit(index){this.calls.push(['edit',index]);}editTake(index){this.calls.push(['trim',index]);}editTakeCrop(index){this.calls.push(['crop',index]);}
  editClip(index){this.calls.push(['clip-trim',index]);}replaceClip(index){this.calls.push(['replace',index]);}editClipCrop(index){this.calls.push(['clip-crop',index]);}
  move(index,direction){this.calls.push(['move',index,direction]);}duplicate(index){this.calls.push(['duplicate',index]);}remove(index){this.calls.push(['remove',index]);}
  splitPass(pass){this.calls.push(['split',pass.start]);}splitAt(index){this.calls.push(['split-at',index]);}add(){this.calls.push(['add']);}addClip(){this.calls.push(['add-clip']);}
  renderJoin(){return el('div',{class:'mmc-tl-seam fixture-join'});}
  openSegmentNavigator(){this.calls.push(['navigator']);}
  commit(){this.commits++;this.render();}
  render(){this.renderNavigation();this.renderStrip();}
 }
 window.mountTimelineFixture=(options={})=>{
  window.timelineSubject?.close();window.destroyFixture();
  // The legacy toggle/geometry flows intentionally start OFF. Default-ON and
  // durable last-choice behavior have their own actual-constructor fixture.
  patchViewPrefs('timeline:preview',{preview:'off'});
  window.language=options.language||'en';document.documentElement.style.setProperty('--mmc-type',String(options.scale||1));
  const piece=S.parseTimeline(options.blob||savedBlob);const subject=new Subject(piece);window.timelineSubject=subject;
  subject.navigationHost=el('div',{class:'mmc-tl-navigation'});subject.stripHost=el('div',{class:'mmc-tl-strip'});
  subject.modal=el('div',{class:'mmc-modal mmc-tl-modal'},[el('div',{class:'mmc-tl-body'},[subject.navigationHost,subject.stripHost])]);
  subject.overlay=el('div',{class:'mmc-overlay fixture-timeline-overlay'},[subject.modal]);
  subject.unmount=mountOverlay(subject.overlay,()=>subject.close());subject.resolve=()=>{window.timelineCloses=(window.timelineCloses||0)+1;};
  subject.render();return JSON.stringify(piece);
 };
`;
const results=[];let browser,requests=0;const errors=[];
const check=async(name,run)=>{await run();results.push(name);console.log('PASS '+name);};
let mediaBase64='';
async function setupPage(context,{language='en',scale=1}={}){
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>{requests++;return route.abort();});
 await page.setContent(`<style>${css}${theme}</style><button id="outside">Outside</button><div class="mmc-root fixture-host" id="host"></div>`);
 await page.evaluate(async({sources,catalog,base64,language,scale})=>{
  window.app={extensionManager:{setting:{get:key=>key==='Comfy.Locale'?window.language:null}}};window.language=language;
  document.documentElement.style.setProperty('--mmc-type',String(scale));
  window.__MMC_FAMILIES=catalog;window.urlCalls=[];window.probeCalls=[];window.controllers=[];window.opened=[];
  const bytes=Uint8Array.from(atob(base64),character=>character.charCodeAt(0));
  window.mediaUrl=URL.createObjectURL(new Blob([bytes],{type:'video/webm'}));
  window.badMediaUrl=URL.createObjectURL(new Blob(['not a playable file'],{type:'video/webm'}));
  const urls={};
  const build=name=>{
   if(urls[name])return urls[name];
   const code=sources[name].replace(/(from\s*|import\s*\()(["'])(\.\/[^"']+)\2/g,(whole,prefix,quote,relative)=>{
    const parts=name.split('/');parts.pop();for(const part of relative.split('/')){if(part==='.'||!part)continue;if(part==='..')parts.pop();else parts.push(part);}
    return prefix+quote+build(parts.join('/'))+quote;
   });
   return urls[name]=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
  };
  window.moduleUrls=urls;window.moduleSources=sources;
  window.S=await import(build('state.js'));window.C=await import(build('canvas.js'));
  window.D=await import(build('dom.js'));window.P=await import(build('card-preview.js'));
  window.V=await import(build('reference-preview.js'));window.I=await import(build('i18n.js'));
  window.W=await import(build('viewprefs.js'));
  window.savedBlob=JSON.stringify({version:2,extended_ui:{card_names:{ready:'Saved card',kept:'Edited kept card',clip:'Provided clip'}},segments:[
   {card_id:'ready',prompt:'Original ready shot',duration_s:1,take:{filename:'render/final-ready.webm [output]',duration_s:2.4,width:160,height:90,has_audio:true,stamp:'old-ready'}},
   {card_id:'kept',prompt:'Edited later',duration_s:8,hold:true,take:{filename:'render/final-kept.webm [output]',duration_s:2.4,width:160,height:90,has_audio:true,stamp:'old-kept',trim:{start:.4,end:1.8},crop:{x:.25,y:0,w:.5,h:1,turn:90,mirror:'h'}}},
   {card_id:'unshot',prompt:'No take yet',duration_s:3,hold:true},
   {card_id:'clip',kind:'clip',filename:'source-footage.webm',duration_s:2.4,width:160,height:90,sound:false,trim:{start:.5,end:1.5},crop:{x:.1,y:.1,w:.8,h:.8}},
   {card_id:'missing',prompt:'Missing saved file',duration_s:2,take:{filename:'missing.webm [output]',duration_s:2.4}},
  ]});
  window.timeline=S.parseTimeline(savedBlob);window.gone=new Set(['missing.webm [output]']);
  window.sourceAt=(index,piece=timeline,missing=gone)=>P.cardPreviewSource({timeline:piece,segment:piece.segments[index],index,pass:S.passOf(piece,index),gone:missing});
  window.destroyFixture=()=>{window.closeLarge?.();window.closeLarge=null;for(const controller of controllers)controller.destroy();controllers=[];document.querySelector('#host').replaceChildren();};
  window.addController=(source,key,{hover=true,label=key}={})=>{
   const wrapper=D.el('section',{class:'fixture-card','data-card':key},[D.el('div',{text:label})]);
   const controller=P.createCardPreview(source,{key,label,hover,onOpen:()=>opened.push(key)});
   controller.root.dataset.key=key;wrapper.append(controller.root);document.querySelector('#host').append(wrapper);controllers.push(controller);return controller;
  };
 },{sources:moduleSources,catalog,base64:mediaBase64,language,scale});
 await page.evaluate(`(async()=>{${timelineCode}})()`);
 return page;
}

(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined,args:['--autoplay-policy=no-user-gesture-required']});
 const context=await browser.newContext({viewport:{width:1100,height:850}});
 const recording=await context.newPage();await recording.setContent('<button>Local media fixture</button>');
 mediaBase64=await recording.evaluate(async()=>{
  const canvas=document.createElement('canvas');canvas.width=160;canvas.height=90;
  const context=canvas.getContext('2d');let frame=0;
  const draw=()=>{frame++;for(const [x,y,color]of [[0,0,'#d93938'],[80,0,'#21a85a'],[0,45,'#247fe5'],[80,45,'#dfc633']]){context.fillStyle=color;context.fillRect(x,y,80,45);}context.fillStyle='#fff';context.font='14px sans-serif';context.fillText('LOCAL '+frame,45,49);};draw();
  const stream=canvas.captureStream(20),audio=new AudioContext(),oscillator=audio.createOscillator(),destination=audio.createMediaStreamDestination();
  oscillator.frequency.value=220;oscillator.connect(destination);oscillator.start();await audio.resume();
  destination.stream.getAudioTracks().forEach(track=>stream.addTrack(track));
  const chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm'}),done=new Promise(resolve=>recorder.onstop=resolve);
  recorder.ondataavailable=event=>chunks.push(event.data);recorder.start();const ticker=setInterval(draw,50);
  await new Promise(resolve=>setTimeout(resolve,2700));clearInterval(ticker);recorder.stop();await done;
  oscillator.stop();stream.getTracks().forEach(track=>track.stop());await audio.close();
  const bytes=new Uint8Array(await new Blob(chunks).arrayBuffer());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary);
 });await recording.close();
 const page=await setupPage(context);
 await check('Persisted ready, kept-edited and provided-clip sources resolve without a current render session',async()=>{
  const value=await page.evaluate(()=>[0,1,3].map(index=>sourceAt(index)));
  assert.deepEqual(value.map(source=>source.filename),['render/final-ready.webm [output]','render/final-kept.webm [output]','source-footage.webm']);
  assert.deepEqual(value.map(source=>source.range),[{start:0,end:2.4},{start:.4,end:1.8},{start:.5,end:1.5}]);
  assert.deepEqual(value.map(source=>source.shared),[false,false,false]);
 });
 await check('Source resolution is read-only, omits unshot/missing files and preserves takes independently of hold',async()=>{
  assert.equal(await page.evaluate(()=>{const before=JSON.stringify(timeline);const absent=sourceAt(2)===null&&sourceAt(4)===null;sourceAt(0);sourceAt(1);sourceAt(3);return absent&&before===JSON.stringify(timeline)&&!S.isHeld(timeline.segments[0])&&S.takeOn(timeline.segments[0])!==null;}),true);
 });
 await check('Saved actual take length and framing survive edited target duration, trim and clip normalization',async()=>{
  const value=await page.evaluate(()=>({source:sourceAt(1),name:S.cardName(timeline.segments[1]),raw:JSON.parse(S.serializeTimeline(timeline))}));
  assert.equal(value.name,'Edited kept card');assert.equal(value.source.crop.turn,90);assert.equal(value.source.crop.mirror,'h');
  assert.equal(value.raw.segments[1].duration_s,8);assert.equal(value.raw.segments[1].take.duration_s,2.4);
  assert.ok(value.raw.extended_ui.card_names.kept);assert.ok(!Object.hasOwn(value.raw.segments[1],'extended_card_name'));
 });
 await check('Merged members use the complete actual shared file even when a follower duration changes',async()=>{
  const value=await page.evaluate(()=>{
   const merged=S.parseTimeline(JSON.stringify({version:2,segments:[{card_id:'a',duration_s:1,prompt:'Head',take:{filename:'merged-final.webm [output]',duration_s:2.4,stamp:'head'}},{card_id:'b',duration_s:1.4,prompt:'Cut',merge:true}]}));
   const stamp=merged.segments[0].take.stamp;const before=[sourceAt(0,merged,new Set()),sourceAt(1,merged,new Set())];merged.segments[1].duration_s=99;
   return {before,after:sourceAt(1,merged,new Set()),stampUnchanged:merged.segments[0].take.stamp===stamp};
  });
  assert.equal(value.stampUnchanged,true);for(const source of [...value.before,value.after]){assert.equal(source.filename,'merged-final.webm [output]');assert.equal(source.shared,true);assert.deepEqual(source.range,{start:0,end:2.4});}
 });
 await check('Legacy shared takes without historical stamps remain playable rather than requesting another render',async()=>{
  assert.equal(await page.evaluate(()=>{const merged=S.parseTimeline(JSON.stringify({version:2,segments:[{duration_s:6,take:{filename:'legacy.webm [output]',duration_s:2.4}},{duration_s:6,merge:true}]}));return [0,1].every(index=>{const source=sourceAt(index,merged,new Set());return source?.shared===true&&source.range.end===2.4;});}),true);
 });

 // Controller/actual-card/viewer assertions follow the production interfaces.
 await check('Real synthetic media loads through the uncropped video API boundary',async()=>{
  await page.evaluate(()=>{destroyFixture();addController(sourceAt(1),'kept');});
  await page.waitForFunction(()=>controllers[0].media.readyState>=2);
  const value=await page.evaluate(()=>({call:urlCalls.at(-1),src:controllers[0].media.currentSrc,root:controllers[0].root.isConnected}));
  assert.equal(value.call.filename,'render/final-kept.webm [output]');assert.ok(!value.call.options?.crop);assert.match(value.src,/^blob:/);assert.equal(value.root,true);
 });
 await check('Scrub is a real bounded range input below its own preview image',async()=>{
  const value=await page.evaluate(()=>{const root=controllers[0].root,scrub=root.querySelector('.mmc-card-preview-scrub'),stage=root.querySelector('.mmc-card-preview-stage'),a=scrub.getBoundingClientRect(),b=stage.getBoundingClientRect();return {tag:scrub.tagName,type:scrub.type,min:Number(scrub.min),max:Number(scrub.max),below:a.top>=b.bottom-1};});
  assert.equal(value.tag,'INPUT');assert.equal(value.type,'range');assert.equal(value.below,true);assert.ok(value.max>value.min);
 });
 await check('Hover starts only the hovered preview and leave pauses it with no background audio',async()=>{
  await page.locator('.mmc-card-preview-stage').hover();await page.waitForFunction(()=>!controllers[0].media.paused);
  await page.locator('#outside').hover();await page.waitForFunction(()=>controllers[0].media.paused);
  assert.equal(await page.evaluate(()=>controllers.every(controller=>controller.media.paused)),true);
 });
 await check('Only one actual controller can play at a time, including a programmatic play event',async()=>{
  await page.evaluate(()=>{addController(sourceAt(0),'ready');});await page.waitForFunction(()=>controllers[1].media.readyState>=2);
  await page.locator('[data-card="kept"] .mmc-card-preview-stage').hover();await page.waitForFunction(()=>!controllers[0].media.paused);
  await page.locator('[data-card="ready"] .mmc-card-preview-stage').hover();await page.waitForFunction(()=>!controllers[1].media.paused&&controllers[0].media.paused);
  await page.evaluate(async()=>{try{await controllers[0].media.play();}catch{}});await page.waitForFunction(()=>controllers[0].media.paused);
  await page.locator('[data-card="kept"] .mmc-card-preview-stage').hover();await page.waitForFunction(()=>!controllers[0].media.paused&&controllers[1].media.paused);
  await page.evaluate(()=>P.pauseCardPreviews());assert.equal(await page.evaluate(()=>controllers.every(controller=>controller.media.paused)),true);
 });
 await check('Scrubbing stays inside the actual saved trim, not the edited duration',async()=>{
  await page.evaluate(()=>{const input=controllers[0].root.querySelector('.mmc-card-preview-scrub');input.value=input.max;input.dispatchEvent(new Event('input',{bubbles:true}));});
  const time=await page.evaluate(()=>controllers[0].media.currentTime);assert.ok(time>=.4&&time<=1.8+.025);
 });
 await check('Paused scrubbing to the end retains the final selected frame until the next hover playback',async()=>{
  await page.locator('#outside').hover();await page.evaluate(()=>{P.pauseCardPreviews();const input=controllers[0].root.querySelector('.mmc-card-preview-scrub');input.value=input.max;input.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForTimeout(120);assert.equal(await page.evaluate(()=>controllers[0].media.paused),true);assert.ok(Math.abs(await page.evaluate(()=>controllers[0].media.currentTime)-1.8)<.03);
  await page.locator('[data-card="kept"] .mmc-card-preview-stage').hover();await page.waitForFunction(()=>!controllers[0].media.paused);assert.ok(await page.evaluate(()=>controllers[0].media.currentTime)<1.1);await page.locator('#outside').hover();
 });
 await check('Opening the same card targets its own existing source without bubbling to edit controls',async()=>{
  await page.locator('[data-card="kept"] .mmc-card-preview-stage').dblclick();assert.deepEqual(await page.evaluate(()=>opened),['kept']);
 });
 await check('Destroy is idempotent, pauses/unloads media and stops controller playback after removal',async()=>{
  const value=await page.evaluate(()=>{const controller=controllers[0],media=controller.media;controller.root.remove();controller.destroy();controller.destroy();media.dispatchEvent(new Event('play'));return {paused:media.paused,src:media.getAttribute('src'),connected:media.isConnected};});
  assert.deepEqual(value,{paused:true,src:null,connected:false});
 });
 await check('Crop framing follows clockwise turn, mirror and rounded post-orientation pixel bounds',async()=>{
  const value=await page.evaluate(()=>[P.cardPreviewFraming({x:.25,y:0,w:.5,h:1,turn:90,mirror:'h'},160,90),P.cardPreviewFraming({x:2,w:-1,turn:35},160,90)]);
  assert.deepEqual(value,[{turn:90,mirror:'h',orientedWidth:90,orientedHeight:160,left:22,top:0,width:46,height:160},{turn:0,mirror:'',orientedWidth:160,orientedHeight:90,left:0,top:0,width:160,height:90}]);
 });
 await check('All turn/mirror framing and half-even boundaries match the actual Python crop implementation',async()=>{
  const value=await page.evaluate(cases=>cases.map(item=>P.cardPreviewFraming(item.crop,item.width,item.height)),cropCases);assert.deepEqual(value,backendFraming);
 });
 await check('Actual drawn video pixels match inverse clockwise/mirror/window coordinates for all 16 orientations',async()=>{
  const failures=[];
  for(const item of cropCases.slice(0,16)){
   await page.evaluate(item=>{destroyFixture();window.fixturePixelCrop=item.crop;addController({...sourceAt(0),crop:item.crop},'pixels');},item);await page.waitForFunction(()=>controllers[0].media.readyState>=2&&controllers[0].root.querySelector('canvas').width!==300);
   const value=await page.evaluate(()=>{
    P.pauseCardPreviews();const player=controllers[0],media=player.media,frame=player.root.querySelector('canvas'),raw=document.createElement('canvas');raw.width=media.videoWidth;raw.height=media.videoHeight;raw.getContext('2d').drawImage(media,0,0);
    const crop=window.fixturePixelCrop;const box=P.cardPreviewFraming(crop,raw.width,raw.height),errors=[];
    for(const fx of [.12,.82])for(const fy of [.12,.82]){const x=Math.floor(frame.width*fx),y=Math.floor(frame.height*fy);let ox=box.left+x,oy=box.top+y;if(box.mirror.includes('h'))ox=box.orientedWidth-1-ox;if(box.mirror.includes('v'))oy=box.orientedHeight-1-oy;let rx=ox,ry=oy;if(box.turn===90){rx=oy;ry=raw.height-1-ox;}else if(box.turn===180){rx=raw.width-1-ox;ry=raw.height-1-oy;}else if(box.turn===270){rx=raw.width-1-oy;ry=ox;}const actual=[...frame.getContext('2d').getImageData(x,y,1,1).data],expected=[...raw.getContext('2d').getImageData(rx,ry,1,1).data];if(actual.some((color,index)=>Math.abs(color-expected[index])>18))errors.push({x,y,rx,ry,actual,expected});}
    return {size:[frame.width,frame.height],expected:[box.width,box.height],errors};
   });
   if(value.errors.length||value.size[0]!==value.expected[0]||value.size[1]!==value.expected[1])failures.push({crop:item.crop,...value});
  }
  assert.deepEqual(failures,[]);
 });
 await check('Zero preview volume persists on a stable card through controller replacement, without changing rendered sound',async()=>{
  await page.evaluate(()=>{destroyFixture();addController(sourceAt(0),'persisted-mute');});await page.waitForFunction(()=>controllers[0].media.readyState>=2);
  const before=await page.evaluate(()=>JSON.stringify(timeline));await page.locator('.mmc-card-preview-mute').click();
  assert.equal(await page.evaluate(()=>controllers[0].media.muted),true);assert.equal(await page.evaluate(()=>controllers[0].media.volume),0);assert.equal(await page.locator('.mmc-card-preview-mute').getAttribute('aria-expanded'),'true');
  await page.evaluate(()=>{const slider=document.querySelector('.mmc-card-preview-volume-slider');slider.value='0';slider.dispatchEvent(new Event('input',{bubbles:true}));});await page.keyboard.press('Escape');
  await page.locator('#outside').hover();await page.waitForFunction(()=>controllers[0].media.paused);
  await page.evaluate(()=>{destroyFixture();addController(sourceAt(0),'persisted-mute');});await page.waitForFunction(()=>controllers[0].media.readyState>=2);
  assert.equal(await page.evaluate(()=>controllers[0].media.muted),true);assert.equal(await page.evaluate(()=>JSON.stringify(timeline)),before);
  await page.locator('.mmc-card-preview-stage').hover();await page.waitForFunction(()=>!controllers[0].media.paused);assert.equal(await page.evaluate(()=>controllers[0].media.muted),true);
  await page.locator('#outside').hover();await page.waitForFunction(()=>controllers[0].media.paused);
 });
 await check('Suspended inline previews cannot restart below a large viewer and resume requires fresh reentry',async()=>{
  await page.evaluate(()=>controllers[0].suspend());await page.locator('.mmc-card-preview-stage').hover();await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>controllers[0].media.paused),true);await page.evaluate(()=>controllers[0].resume());await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>controllers[0].media.paused),true);await page.locator('#outside').hover();await page.locator('.mmc-card-preview-stage').hover();await page.waitForFunction(()=>!controllers[0].media.paused);
  await page.locator('#outside').hover();await page.waitForFunction(()=>controllers[0].media.paused);
 });
 await check('Removing mounted preview DOM automatically unloads it via the actual lifecycle observer',async()=>{
  await page.evaluate(()=>{destroyFixture();addController(sourceAt(0),'auto-remove');});await page.waitForFunction(()=>controllers[0].media.readyState>=2);
  await page.locator('.mmc-card-preview-stage').hover();await page.waitForFunction(()=>!controllers[0].media.paused);
  await page.evaluate(()=>{window.removedMedia=controllers[0].media;controllers[0].root.remove();});await page.waitForFunction(()=>removedMedia.paused&&removedMedia.getAttribute('src')===null);
  assert.equal(await page.evaluate(()=>removedMedia.isConnected),false);
 });
 await check('Unsupported synthetic media fails visibly, disables playback and never touches timeline state',async()=>{
  const before=await page.evaluate(()=>JSON.stringify(timeline));await page.evaluate(()=>{destroyFixture();addController({...sourceAt(0),filename:'bad-media.webm'},'bad');});
  await page.waitForFunction(()=>controllers[0].root.querySelector('.mmc-card-preview-status').hidden===false);
  assert.equal(await page.locator('.mmc-card-preview-play').isDisabled(),true);assert.equal(await page.locator('.mmc-card-preview-scrub').isDisabled(),true);
  assert.equal(await page.evaluate(()=>controllers[0].media.paused),true);assert.equal(await page.evaluate(()=>JSON.stringify(timeline)),before);
 });
 await check('Fresh browser context recovers named saved ready/kept-edited media without Stage history',async()=>{
  const fresh=await browser.newContext({viewport:{width:1100,height:850}});const restarted=await setupPage(fresh);
  const value=await restarted.evaluate(()=>{const round=S.parseTimeline(S.serializeTimeline(timeline));return [0,1,3].map(index=>({name:S.cardName(round.segments[index]),source:sourceAt(index,round)}));});
  assert.deepEqual(value.map(item=>item.name),['Saved card','Edited kept card','Provided clip']);assert.ok(value.every(item=>item.source.filename));
  await restarted.evaluate(()=>{addController(sourceAt(0),'after-reboot');});await restarted.waitForFunction(()=>controllers[0].media.readyState>=2);
  assert.equal(await restarted.evaluate(()=>controllers[0].media.paused),true);await restarted.evaluate(()=>destroyFixture());await fresh.close();
 });
 await check('Actual navigation toggle expands every playable card in place without changing model or render data',async()=>{
  const before=await page.evaluate(()=>{const snapshot=mountTimelineFixture();return {snapshot,boxes:[...document.querySelectorAll('.mmc-tl-card')].map(card=>({width:card.offsetWidth,height:card.offsetHeight,minWidth:getComputedStyle(card).minWidth,alignSelf:getComputedStyle(card).alignSelf,overflow:card.scrollWidth>card.clientWidth+1,noWrap:[...card.querySelectorAll('.mmc-tl-card-frame-fact,.mmc-tl-card-edit-tools > .mmc-tl-edit')].every(node=>{const range=document.createRange();range.selectNodeContents(node);const glyph=range.getBoundingClientRect(),box=node.getBoundingClientRect();return getComputedStyle(node).whiteSpace==='nowrap'&&glyph.width<=box.width+1&&glyph.height<=box.height+1;})}))};});
  assert.equal(await page.locator('.mmc-tl-card .mmc-card-preview').count(),0);
  await page.locator('.mmc-tl-individual-preview').click();
  assert.equal(await page.locator('.mmc-tl-card .mmc-card-preview').count(),3);assert.equal(await page.locator('.mmc-card-preview-unavailable').count(),2);
  const value=await page.evaluate(()=>({snapshot:JSON.stringify(timelineSubject.timeline),calls:timelineSubject.calls,mode:timelineSubject.previewMode,type:parseFloat(document.documentElement.style.getPropertyValue('--mmc-type')),boxes:[...document.querySelectorAll('.mmc-tl-card')].map(card=>({width:card.offsetWidth,height:card.offsetHeight,preferred:parseFloat(card.style.width),floor:parseFloat(getComputedStyle(card).minWidth)||0,preview:!!card.querySelector(':scope > .mmc-card-preview'),portrait:!!card.querySelector(':scope > .mmc-card-preview.mmc-card-preview-portrait'),wide:!!card.querySelector(':scope > .mmc-card-preview.mmc-card-preview-wide')}))}));
  assert.equal(value.snapshot,before.snapshot);assert.deepEqual(value.calls,[]);assert.equal(value.mode,true);
  // OFF now uses each card's readable max-content floor, not its old duration
  // width. ON uses the same portrait/normal/wide width for both card kinds;
  // unready/missing cards retain the duration-free base/readability floor.
  assert.equal(value.boxes.length,5);
  for(let index=0;index<value.boxes.length;index++){
   const off=before.boxes[index],on=value.boxes[index];assert.equal(off.minWidth,'0px');assert.equal(off.alignSelf,'flex-start');assert.equal(off.overflow,false);assert.equal(off.noWrap,true);
   const expected=on.preview?Math.max(on.portrait?338:on.wide?520:420,(on.portrait?38:58)+300*value.type):Math.max(on.preferred,on.floor);
   assert.equal(on.width,Math.round(expected),'ON shared aspect-class/readability width for card '+index);
  }
  for(const index of [0,1,2,4])assert.ok(before.boxes[index].width<value.boxes[index].width,'OFF generated card is compact, including no-ready cards');
  for(const index of [0,1,3])assert.ok(value.boxes[index].height>before.boxes[index].height+50);
 });
 await check('Inline preview lives inside its own real card below existing actions, not a separate lower timeline panel',async()=>{
  const value=await page.evaluate(()=>[...document.querySelectorAll('.mmc-tl-card .mmc-card-preview')].map(preview=>{const card=preview.closest('.mmc-tl-card'),foot=card.querySelector('.mmc-tl-card-foot'),a=preview.getBoundingClientRect(),b=foot.getBoundingClientRect(),c=card.getBoundingClientRect();return {direct:preview.parentElement===card,after:foot.compareDocumentPosition(preview)&Node.DOCUMENT_POSITION_FOLLOWING,below:a.top>=b.bottom-1,inside:a.bottom<=c.bottom+1};}));
  assert.ok(value.every(item=>item.direct&&item.after&&item.below&&item.inside));
 });
 await check('Ready preview native keyboard activation retains focus and its localized value after navigation rebuild',async()=>{
  const button=page.locator('.mmc-tl-individual-preview');await button.focus();await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('mmc-tl-individual-preview')),true);assert.equal(await button.getAttribute('aria-pressed'),'false');assert.equal(await button.textContent(),'Ready preview');
  await page.keyboard.press('Space');assert.equal(await button.getAttribute('aria-pressed'),'true');assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('mmc-tl-individual-preview')),true);
 });
 await check('All 14 ready cards resolve together; unlocked takes are not filtered by ready/kept status chips',async()=>{
  const blob=JSON.stringify({version:2,segments:Array.from({length:14},(_,index)=>({card_id:'ready-'+index,prompt:'Ready shot '+index,duration_s:index%2?1:8,...(index%3?{}:{hold:true}),take:{filename:'final-'+index+'.webm [output]',duration_s:2.4,width:160,height:90,has_audio:true,stamp:'old-'+index}}))});
  await page.evaluate(blob=>mountTimelineFixture({blob}),blob);await page.locator('.mmc-tl-individual-preview').click();
  assert.equal(await page.locator('.mmc-tl-card').count(),14);assert.equal(await page.locator('.mmc-tl-card .mmc-card-preview').count(),14);assert.equal(await page.locator('.mmc-card-preview-unavailable').count(),0);
  assert.equal(await page.evaluate(()=>timelineSubject.cardPreviews.size),14);assert.ok(await page.evaluate(()=>[...timelineSubject.cardPreviews].every(player=>player.media.paused)));
 });
 await check('Double-clicking a real card preview opens that card source/range/framing and suspends every inline player',async()=>{
  await page.evaluate(()=>mountTimelineFixture());await page.locator('.mmc-tl-individual-preview').click();
  const target=page.locator('[data-mmc-segment-index="1"] .mmc-card-preview-stage');await target.scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>[...timelineSubject.cardPreviews].every(player=>player.media.readyState>=2));
  await target.dblclick();assert.equal(await page.locator('.mmc-reference-preview').count(),1);
  await page.waitForFunction(()=>document.querySelector('.mmc-reference-preview .mmc-card-preview-media').readyState>=2);
  await page.waitForFunction(()=>{const canvas=document.querySelector('.mmc-reference-preview canvas.mmc-card-preview-frame');return canvas.width===46&&canvas.height===160;});
  const value=await page.evaluate(()=>({caption:document.querySelector('.mmc-reference-preview-head strong').textContent,file:document.querySelector('.mmc-reference-preview-name').textContent,call:urlCalls.at(-1),paused:[...timelineSubject.cardPreviews].every(player=>player.media.paused),calls:timelineSubject.calls,canvas:{width:document.querySelector('.mmc-reference-preview canvas.mmc-card-preview-frame').width,height:document.querySelector('.mmc-reference-preview canvas.mmc-card-preview-frame').height}}));
  assert.match(value.caption,/Edited kept card/);assert.equal(value.file,'render/final-kept.webm [output]');assert.equal(value.call.filename,value.file);assert.ok(!value.call.options?.crop);assert.equal(value.paused,true);assert.deepEqual(value.calls,[]);assert.deepEqual(value.canvas,{width:46,height:160});
  await page.evaluate(()=>{for(const player of timelineSubject.cardPreviews)player.root.dispatchEvent(new PointerEvent('pointerenter'));});await page.waitForTimeout(100);assert.ok(await page.evaluate(()=>[...timelineSubject.cardPreviews].every(player=>player.media.paused)));
 });
 await check('Large viewer uses real play/scrub controls and explicit preview volume synchronizes with its suspended inline card',async()=>{
  const large=page.locator('.mmc-reference-preview');await large.locator('.mmc-card-preview-play').click();await page.waitForFunction(()=>!document.querySelector('.mmc-reference-preview video').paused);
  assert.ok(await page.evaluate(()=>[...timelineSubject.cardPreviews].every(player=>player.media.paused)));
  await large.locator('.mmc-card-preview-mute').click();assert.equal(await large.locator('.mmc-card-preview-mute').getAttribute('aria-expanded'),'true');
  assert.equal(await page.evaluate(()=>document.querySelector('.mmc-reference-preview video').volume),0);
  await page.evaluate(()=>{const slider=document.querySelector('.mmc-card-preview-volume-slider');slider.value='25';slider.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await page.evaluate(()=>document.querySelector('.mmc-reference-preview video').volume),.25);
  assert.equal(await page.evaluate(()=>document.querySelector('[data-mmc-segment-index="1"] video').volume),.25);
  assert.ok(await page.evaluate(()=>document.querySelector('[data-mmc-segment-index="1"] video').muted));
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!document.querySelector('.mmc-card-preview-volume-pop'));
  await page.evaluate(()=>{const scrub=document.querySelector('.mmc-reference-preview .mmc-card-preview-scrub');scrub.value=String(Number(scrub.max)/2);scrub.dispatchEvent(new Event('input',{bubbles:true}));});
  const at=await page.evaluate(()=>document.querySelector('.mmc-reference-preview video').currentTime);assert.ok(at>=.4&&at<=1.8);
 });
 await check('Generated and clip hover stages have accessible labels but no native help title; the larger non-hover stage retains its title',async()=>{
  const value=await page.evaluate(()=>{
   const attrs=stage=>({title:stage.getAttribute('title'),label:stage.getAttribute('aria-label')});
   return{generated:attrs(document.querySelector('[data-mmc-segment-index="0"] .mmc-card-preview-stage')),clip:attrs(document.querySelector('[data-mmc-segment-index="3"] .mmc-card-preview-stage')),large:attrs(document.querySelector('.mmc-reference-preview .mmc-card-preview-stage'))};
  });
  for(const stage of [value.generated,value.clip]){assert.equal(stage.title,null);assert.ok(stage.label?.trim());}
  assert.ok(value.large.title?.trim());assert.equal(value.large.title,value.large.label);
 });
 await check('Escape closes only large preview, cleans media and returns focus without opening the segment editor',async()=>{
  await page.evaluate(()=>window.largeVideo=document.querySelector('.mmc-reference-preview video'));await page.keyboard.press('Escape');
  assert.equal(await page.locator('.mmc-reference-preview').count(),0);assert.equal(await page.locator('.fixture-timeline-overlay').count(),1);
  const value=await page.evaluate(()=>({paused:largeVideo.paused,src:largeVideo.getAttribute('src'),connected:largeVideo.isConnected,focus:document.activeElement.className,calls:timelineSubject.calls,inlinePaused:[...timelineSubject.cardPreviews].every(player=>player.media.paused)}));
  assert.equal(value.paused,true);assert.equal(value.src,null);assert.equal(value.connected,false);assert.equal(value.focus,'mmc-card-preview-stage');assert.deepEqual(value.calls,[]);assert.equal(value.inlinePaused,true);
 });
 await check('Turning preview off releases every source and keeps explicit preview volume when the same card is reopened',async()=>{
  await page.evaluate(()=>window.oldInline=[...timelineSubject.cardPreviews].map(player=>player.media));await page.locator('.mmc-tl-individual-preview').click();
  assert.equal(await page.locator('.mmc-tl-card .mmc-card-preview').count(),0);assert.equal(await page.evaluate(()=>timelineSubject.cardPreviews.size),0);
  assert.ok(await page.evaluate(()=>oldInline.every(media=>media.paused&&media.getAttribute('src')===null&&!media.isConnected)));
  await page.locator('.mmc-tl-individual-preview').click();assert.equal(await page.evaluate(()=>document.querySelector('[data-mmc-segment-index="1"] video').volume),.25);assert.equal(await page.evaluate(()=>document.querySelector('[data-mmc-segment-index="1"] video').muted),true);
 });
 await check('Actual strip rebuild and modal close both unload active inline and large viewers',async()=>{
  await page.locator('[data-mmc-segment-index="0"] .mmc-card-preview-stage').scrollIntoViewIfNeeded();await page.locator('[data-mmc-segment-index="0"] .mmc-card-preview-stage').hover();await page.waitForFunction(()=>![...timelineSubject.cardPreviews][0].media.paused);
  await page.evaluate(()=>{window.preRebuild=[...timelineSubject.cardPreviews].map(player=>player.media);timelineSubject.renderStrip();});
  assert.ok(await page.evaluate(()=>preRebuild.every(media=>media.paused&&media.getAttribute('src')===null&&!media.isConnected)));
  await page.locator('[data-mmc-segment-index="0"] .mmc-card-preview-stage').dblclick();await page.waitForFunction(()=>Boolean(document.querySelector('.mmc-reference-preview video')));
  await page.evaluate(()=>{window.preClose=[...timelineSubject.cardPreviews].map(player=>player.media);window.preCloseLarge=document.querySelector('.mmc-reference-preview video');timelineSubject.close();});
  assert.equal(await page.locator('.fixture-timeline-overlay').count(),0);assert.equal(await page.locator('.mmc-reference-preview').count(),0);
  assert.ok(await page.evaluate(()=>[...preClose,preCloseLarge].every(media=>media.paused&&media.getAttribute('src')===null&&!media.isConnected)));
 });
 await check('A delayed native play promise cannot restart after pointer leave or destruction',async()=>{
  await page.evaluate(()=>{destroyFixture();addController(sourceAt(0),'late-play');});await page.waitForFunction(()=>controllers[0].media.readyState>=2);
  await page.evaluate(()=>{const media=controllers[0].media,native=media.play.bind(media);window.lateCalls=0;media.play=()=>{lateCalls++;return new Promise((resolve,reject)=>window.releasePlay=()=>native().then(resolve,reject));};});
  await page.locator('.mmc-card-preview-stage').hover();await page.waitForFunction(()=>Boolean(window.releasePlay));await page.locator('#outside').hover();await page.evaluate(()=>releasePlay());await page.waitForFunction(()=>controllers[0].media.paused);
  assert.equal(await page.evaluate(()=>lateCalls),1);assert.equal(await page.evaluate(()=>controllers[0].media.muted),true);
  await page.evaluate(()=>{window.releasePlay=null;});await page.locator('.mmc-card-preview-stage').hover();await page.waitForFunction(()=>Boolean(window.releasePlay));
  await page.evaluate(()=>{controllers[0].destroy();releasePlay();});await page.waitForTimeout(120);assert.equal(await page.evaluate(()=>controllers[0].media.paused),true);
 });
 await check('Autoplay rejection follows the real muted retry; only explicit slider input can authorize audio',async()=>{
  await page.locator('#outside').hover();await page.evaluate(()=>{destroyFixture();addController(sourceAt(0),'autoplay-fallback');});await page.waitForFunction(()=>controllers[0].media.readyState>=2);
  await page.evaluate(()=>{const media=controllers[0].media,native=media.play.bind(media);window.autoplayCalls=0;media.play=()=>{autoplayCalls++;return autoplayCalls===1?Promise.reject(new DOMException('Synthetic autoplay denial','NotAllowedError')):native();};});
  await page.locator('.mmc-card-preview-stage').hover();await page.waitForFunction(()=>!controllers[0].media.paused&&autoplayCalls===2);
  assert.equal(await page.evaluate(()=>controllers[0].media.muted),true);assert.equal(await page.evaluate(()=>controllers[0].media.volume),0);assert.equal(await page.locator('.mmc-card-preview-status').isVisible(),true);
  await page.locator('.mmc-card-preview-mute').click();assert.equal(await page.evaluate(()=>controllers[0].media.volume),0);assert.equal(await page.evaluate(()=>controllers[0].media.muted),true);
  await page.evaluate(()=>{const slider=document.querySelector('.mmc-card-preview-volume-slider');slider.value='25';slider.dispatchEvent(new Event('input',{bubbles:true}));});await page.waitForFunction(()=>!controllers[0].media.muted&&!controllers[0].media.paused);
  assert.equal(await page.locator('.mmc-card-preview-status').isVisible(),false);await page.locator('#outside').hover();await page.waitForFunction(()=>controllers[0].media.paused&&controllers[0].media.muted);
 });
 await check('Delayed hover autoplay cannot restart when the actual navigation toggle is switched off',async()=>{
  await page.evaluate(()=>mountTimelineFixture());await page.locator('.mmc-tl-individual-preview').click();await page.waitForFunction(()=>[...timelineSubject.cardPreviews][0].media.readyState>=2);
  await page.evaluate(()=>{window.offMedia=[...timelineSubject.cardPreviews][0].media;const native=offMedia.play.bind(offMedia);offMedia.play=()=>{const result=native().then(()=>({ok:true}),error=>({error}));return new Promise((resolve,reject)=>window.releaseOff=()=>{result.then(value=>value.ok?resolve():reject(value.error));});};});
  await page.locator('[data-mmc-segment-index="0"] .mmc-card-preview-stage').hover();await page.waitForFunction(()=>Boolean(window.releaseOff));await page.locator('.mmc-tl-individual-preview').click();
  await page.evaluate(()=>{releaseOff();});await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>offMedia.paused),true);assert.equal(await page.evaluate(()=>offMedia.getAttribute('src')),null);assert.equal(await page.locator('.mmc-tl-card .mmc-card-preview').count(),0);await page.evaluate(()=>timelineSubject.close());
 });
 await check('Non-hover keyboard Play cannot start inline audio; keyboard Space opens the same larger viewer',async()=>{
  await page.evaluate(()=>{destroyFixture();addController(sourceAt(0),'keyboard');});await page.waitForFunction(()=>controllers[0].media.readyState>=2);await page.locator('#outside').hover();
  await page.locator('.mmc-card-preview-play').focus();await page.keyboard.press('Enter');await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>controllers[0].media.paused),true);
  await page.locator('.mmc-card-preview-stage').focus();await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>opened.at(-1)),'keyboard');assert.equal(await page.evaluate(()=>controllers[0].media.paused),true);
 });
 await check('Preview audio is scoped: unrelated media is not paused when a hovered card starts',async()=>{
  await page.evaluate(async()=>{destroyFixture();addController(sourceAt(0),'scope');window.unrelated=D.el('video',{src:mediaUrl,muted:true});document.body.append(unrelated);await unrelated.play();});await page.waitForFunction(()=>controllers[0].media.readyState>=2);
  await page.locator('.mmc-card-preview-stage').hover();await page.waitForFunction(()=>!controllers[0].media.paused);assert.equal(await page.evaluate(()=>unrelated.paused),false);
  await page.evaluate(()=>{unrelated.pause();unrelated.removeAttribute('src');unrelated.load();unrelated.remove();});await page.locator('#outside').hover();
 });
 await check('Hidden or offscreen inline previews stop and mute without clearing the saved preference',async()=>{
  await page.locator('.mmc-card-preview-stage').hover();await page.waitForFunction(()=>!controllers[0].media.paused);
  await page.evaluate(()=>controllers[0].root.hidden=true);await page.waitForFunction(()=>controllers[0].media.paused);assert.equal(await page.evaluate(()=>controllers[0].media.muted),true);
  await page.evaluate(()=>{controllers[0].root.hidden=false;});await page.locator('#outside').hover();await page.locator('.mmc-card-preview-stage').hover();await page.waitForFunction(()=>!controllers[0].media.paused);
  await page.evaluate(()=>{controllers[0].root.style.position='absolute';controllers[0].root.style.top='4000px';});await page.waitForFunction(()=>controllers[0].media.paused);assert.equal(await page.evaluate(()=>controllers[0].media.muted),true);
 });
 await check('Ordinary reference viewer still plays the uncropped/untrimmed source with native controls and no autoplay',async()=>{
  await page.evaluate(()=>{destroyFixture();window.defaultAsset={kind:'video',filename:'ordinary-reference.webm',trim:{start:.5,end:1.5},crop:{x:.1,y:.1,w:.8,h:.8}};window.closeLarge=V.openReferencePreview([defaultAsset]);});
  const value=await page.evaluate(()=>{const media=document.querySelector('.mmc-reference-preview video');return {controls:media.controls,autoplay:media.autoplay,paused:media.paused,players:document.querySelectorAll('.mmc-reference-preview .mmc-card-preview').length,call:urlCalls.at(-1),note:document.querySelector('.mmc-reference-preview-note').textContent};});
  assert.equal(value.controls,true);assert.equal(value.autoplay,false);assert.equal(value.paused,true);assert.equal(value.players,0);assert.equal(value.call.filename,'ordinary-reference.webm');assert.ok(!value.call.options?.crop);assert.match(value.note,/crop, trim and mirroring are not applied/);assert.match(value.note,/0.5–1.5 s/);await page.keyboard.press('Escape');
 });
 await check('Portrait large viewer stays inside 320/640 viewports at normal and large type with bottom scrub controls',async()=>{
  const failures=[];
  for(const width of [320,640])for(const scale of [1,1.6]){
   await page.setViewportSize({width,height:900});await page.evaluate(({scale})=>{destroyFixture();window.language='ko';document.documentElement.style.setProperty('--mmc-type',String(scale));const source=sourceAt(1);window.closeLarge=V.openReferencePreview([{kind:'video',filename:source.filename}],{caption:'준비된 미리보기 — 세로 화면',playback:{source,key:'portrait-large',label:'세로 화면'}});},{scale});
   await page.waitForFunction(()=>document.querySelector('.mmc-reference-preview video').readyState>=2);
   const value=await page.evaluate(()=>{const dialog=document.querySelector('.mmc-reference-preview'),stage=dialog.querySelector('.mmc-card-preview-stage'),controls=dialog.querySelector('.mmc-card-preview-controls'),a=dialog.getBoundingClientRect(),b=stage.getBoundingClientRect(),c=controls.getBoundingClientRect();return {bounds:[a.left,a.top,a.right,a.bottom],below:c.top>=b.bottom-1,controls:[...controls.children].every(child=>{const rect=child.getBoundingClientRect();return rect.left>=a.left-1&&rect.right<=a.right+1&&rect.bottom<=a.bottom+1;})};});
   if(value.bounds[0]<0||value.bounds[1]<0||value.bounds[2]>width+1||value.bounds[3]>901||!value.below||!value.controls)failures.push({width,scale,...value});
   if(process.env.CONTINUITY_UX_SCREENSHOT_DIR&&width===320&&scale===1.6){const directory=process.env.CONTINUITY_UX_SCREENSHOT_DIR;fs.mkdirSync(directory,{recursive:true});await page.screenshot({path:path.join(directory,'card-individual-preview-portrait-320-ko-large.png'),fullPage:false});}
   await page.keyboard.press('Escape');
  }
  assert.deepEqual(failures,[]);
 });
 await check('Desktop/compact KO-large short, clip and shared cards keep controls bounded and a visible shared-file note',async()=>{
  const failures=[];
  for(const width of [640,1200])for(const language of ['en','ko'])for(const scale of [1,1.6]){
   await page.setViewportSize({width,height:1000});
   const blob=JSON.stringify({version:2,segments:[{card_id:'short',duration_s:1,prompt:'Short saved shot',take:{filename:'short.webm [output]',duration_s:2.4,width:160,height:90}},{card_id:'clip',kind:'clip',filename:'clip.webm',duration_s:2.4,width:160,height:90},{card_id:'head',duration_s:2,prompt:'Merged head',take:{filename:'shared.webm [output]',duration_s:2.4,width:160,height:90}},{card_id:'tail',duration_s:1,merge:true,prompt:'Merged member'}]});
   await page.evaluate(options=>mountTimelineFixture(options),{blob,language,scale});await page.locator('.mmc-tl-individual-preview').click();await page.waitForFunction(()=>[...timelineSubject.cardPreviews].every(player=>player.media.readyState>=2));
   const value=await page.evaluate(()=>[...document.querySelectorAll('.mmc-tl-card')].map(card=>{const preview=card.querySelector('.mmc-card-preview'),stage=preview.querySelector('.mmc-card-preview-stage'),controls=preview.querySelector('.mmc-card-preview-controls'),a=preview.getBoundingClientRect(),b=stage.getBoundingClientRect(),c=controls.getBoundingClientRect();return {index:card.dataset.mmcSegmentIndex,bounded:[...controls.children].every(child=>{const rect=child.getBoundingClientRect();return rect.left>=a.left-1&&rect.right<=a.right+1;}),below:c.top>=b.bottom-1,inside:a.bottom<=card.getBoundingClientRect().bottom+1,visible:getComputedStyle(controls).display!=='none',shared:preview.querySelector('.mmc-card-preview-shared')?.textContent||''};}));
   for(const item of value)if(!item.bounded||!item.below||!item.inside||!item.visible||Number(item.index)>1&&!item.shared)failures.push({width,language,scale,...item});
   if(process.env.CONTINUITY_UX_SCREENSHOT_DIR&&width===1200&&language==='ko'&&scale===1.6){const directory=process.env.CONTINUITY_UX_SCREENSHOT_DIR;fs.mkdirSync(directory,{recursive:true});await page.screenshot({path:path.join(directory,'card-individual-preview-ko-large.png'),fullPage:false});}
  }
  assert.deepEqual(failures,[]);await page.evaluate(()=>timelineSubject.close());
 });
 await page.evaluate(()=>destroyFixture());
 assert.equal(requests,0,'No external or live ComfyUI requests');assert.deepEqual(errors,[],'No browser runtime errors');
 console.log(JSON.stringify({passed:results.length,requests,errors:errors.length},null,2));await context.close();await browser.close();
})().catch(async error=>{console.error(error.stack||error);await browser?.close();process.exitCode=1;});
