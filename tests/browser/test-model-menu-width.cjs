// Production weights popover and CSS in isolated, network-blocked Chrome.
// Catalog/model metadata are fixtures; no server, real file selection or GPU.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=process.env.CONTINUITY_SOURCE_ROOT?path.resolve(process.env.CONTINUITY_SOURCE_ROOT,'web/creator'):path.resolve(__dirname,'../../web/creator');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const modelsSource=read('models.js');
const baseline=process.env.CONTINUITY_BASELINE_DIR?path.resolve(process.env.CONTINUITY_BASELINE_DIR,'web/creator'):path.resolve(__dirname,'../../../baseline/web/creator');
const fn=(source,name)=>{const found=source.match(new RegExp(`(?:export )?function ${name}\\([^]*?^\\}`,'m'));assert.ok(found,`production function ${name}`);return found[0].replace(/^export /,'').replace(/\r\n/g,'\n');};
if(fs.existsSync(path.join(baseline,'models.js'))){
 const original=fs.readFileSync(path.join(baseline,'models.js'),'utf8');
 const restored=fn(modelsSource,'openWeightsPopover')
  .replace('  let disposeMarquees = () => {};\n','').replace('    disposeMarquees();\n','')
  .replace('    disposeMarquees = mountWeightMarquees(body);\n','')
  .replace('dismissable(pop, () => disposeMarquees());','dismissable(pop);');
 assert.equal(restored,fn(original,'openWeightsPopover'),'all original weights markup, catalog/memory logic and choice callbacks remain exact apart from four presentation lifecycle hooks');
}
if(fs.existsSync(path.join(baseline,'pills.js')))assert.equal(read('pills.js'),fs.readFileSync(path.join(baseline,'pills.js'),'utf8'),'pills.js behavior unchanged');
const css=['base','popovers','stage'].map(name=>read(`styles/${name}.js`).match(/export const css = `([^]*)`;\s*$/)[1]).join('\n');
const ko=vm.runInNewContext(read('locales/ko.js').replace(/^export const /m,'const ')+';ko;',{});
const labels={fl2va:'FL2VA checkpoint',ref2va:'Ref2VA checkpoint',text_encoder:'Text encoder',video_vae:'Video VAE',audio_vae:'Audio VAE',preview:'Preview decoder',face:'Face detector',background:'Background remover',latent:'Latent upscaler',control:'ControlNet branch'};
const files={fl2va:'MiniMax-H3/minimax_h3_15B_fl2va_pruned_int8_convrot.safetensors',ref2va:'MiniMax-H3/minimax_h3_15B_ref2va_768p_shift10.3_res_multistep_simple.safetensors',text_encoder:'MiniMax-H3/text_encoders/magnetic_minimax_h3_nvfp4.safetensors',video_vae:'MiniMax-H3/vae/minimax_h3_video_vae_int8_convrot.safetensors',audio_vae:'MiniMax-H3/vae/minimax_h3_audio_vae_fp32.safetensors',preview:'taeh3.safetensors',face:'sam3.1_multiplex_fp16.safetensors',background:'birefnet.safetensors',latent:'MiniMax-H3/upscalers/latent_upscaler_3d_conv_v1_fp16.safetensors',control:''};
const code=`
${fn(read('dom.js'),'el')}
window.el=el;
const NativeResizeObserver=window.ResizeObserver,nativeMatchMedia=window.matchMedia.bind(window);
window.resizeRecords=[];window.mediaRecords=[];
window.ResizeObserver=class extends NativeResizeObserver{
 constructor(callback){super(callback);this.record={targets:[],disconnected:false};window.resizeRecords.push(this.record);}
 observe(target,options){this.record.targets.push(target);return super.observe(target,options);}
 disconnect(){this.record.disconnected=true;return super.disconnect();}
};
window.matchMedia=query=>{const media=nativeMatchMedia(query),record={media,listeners:new Set()};window.mediaRecords.push(record);
 const add=media.addEventListener.bind(media),remove=media.removeEventListener.bind(media);
 media.addEventListener=(name,listener,options)=>{if(name==='change')record.listeners.add(listener);add(name,listener,options);};
 media.removeEventListener=(name,listener,options)=>{if(name==='change')record.listeners.delete(listener);remove(name,listener,options);};return media;
};
const popoverOwners=new WeakMap(),popoverClosers=new Map();
${['floatAbove','dismissable','placeNear','closeOwnedPopovers'].map(name=>fn(read('dom.js'),name)).join('\n')}
const ko=${JSON.stringify(ko)};let locale='en';
const t=(text,values={})=>(locale==='ko'?ko[text]??text:text).replace(/\\{([^}]+)\\}/g,(_,key)=>values[key]??key);
const labels=${JSON.stringify(labels)},fixtureFiles=${JSON.stringify(files)},fields=Object.keys(labels);
const S={pieceFamily:()=> 'h3',modelFields:()=>fields,modelLabels:()=>labels,modelHints:()=>Object.fromEntries(fields.map(id=>[id,'Choose '+labels[id]])),
 deviceFields:()=>fields,routeOptions:()=>['auto','fl2va','ref2va'],checkpointsOf:()=>['fl2va','ref2va'],MAX_GPUS:8,
 requiredModels:routed=>[routed,'text_encoder','video_vae','audio_vae'],routedCheckpoints:models=>models.route==='fl2va'?'fl2va':'ref2va',routing:()=>true,
 upscalerOf:()=>null,turboOf:()=>false,raylightOf:()=>false,MODEL_DTYPES:['default','fp8_e4m3fn'],checkpointLabels:()=>({fl2va:'FL2VA',ref2va:'Ref2VA'})};
const NONE='— none —',AUTO='— auto —';let catalog={dtypes:S.MODEL_DTYPES};
${modelsSource.match(/^export const routeLabel =[^]*?;$/m)[0].replace(/^export /,'')}
const catalogFiles=()=>Object.fromEntries(fields.map(id=>[id,[fixtureFiles[id]||'control_branch.safetensors','replacement_'+id+'.safetensors']]));
const catalogDevices=()=>window.withDevices?['cuda:0','cuda:1']:[];
const hasPreviewOverride=()=>true,hasRaylight=()=>false;
const refreshCatalog=callback=>{window.paintAgain=callback;if(!window.deferCatalog)callback();},loadCatalog=callback=>{window.paintAgain=callback;if(!window.deferCatalog)callback();};
const rememberWeights=()=>window.remembered++;
const openChoicePopover=(anchor,options)=>{window.choice={anchor,options};window.choiceCalls++;};
${fn(modelsSource,'mountWeightMarquees')}
${fn(modelsSource,'openWeightsPopover')}
window.openFixture=({language='en',scale=1,devices=false,route='ref2va',veryLong=false,right=false,deferCatalog=false}={})=>{
 closeOwnedPopovers(document.body);window.resizeRecords=[];window.mediaRecords=[];locale=language;document.documentElement.style.setProperty('--mmc-type',scale);window.withDevices=devices;
 window.remembered=0;window.changed=0;window.choiceCalls=0;window.choice=null;
 window.deferCatalog=deferCatalog;catalog=deferCatalog?null:{dtypes:S.MODEL_DTYPES};
 window.piece={};window.models={...fixtureFiles,devices:{ref2va:'cuda:1'},route,dtype:'default'};
 if(veryLong)models.ref2va='Library/'+('very_long_checkpoint_name_'.repeat(14))+'ref2va.safetensors';
 const anchor=el('button',{id:'anchor',text:t('Weights'),style:{position:'fixed',left:right?(innerWidth-100)+'px':'16px',top:'20px'}});
 const outside=el('button',{id:'outside',text:'Outside',style:{position:'fixed',left:'8px',bottom:'4px'}});document.body.replaceChildren(anchor,outside);
 openWeightsPopover(anchor,{piece,models,checkpoints:['ref2va'],onChange:()=>window.changed++,face:true});
 return models;
};
window.geometry=()=>{const pop=document.querySelector('.mmc-weights-pop'),box=pop.getBoundingClientRect();return{
 box:{left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:box.width},scroll:pop.scrollWidth,client:pop.clientWidth,
 rows:[...pop.querySelectorAll('.mmc-weight-row')].map(row=>({class:row.className,opacity:getComputedStyle(row).opacity,controls:[...row.children].map(node=>{
  const r=node.getBoundingClientRect(),style=getComputedStyle(node),label=node.querySelector('.mmc-weight-file-label');return{class:node.className,text:node.textContent,left:r.left,right:r.right,top:r.top,bottom:r.bottom,
   width:r.width,scroll:node.scrollWidth,client:node.clientWidth,font:parseFloat(style.fontSize),whiteSpace:style.whiteSpace,direction:style.direction,
   title:node.title,labelWidth:label?.getBoundingClientRect().width,labelAnimations:label?.getAnimations().length,
   room:node.clientWidth-(parseFloat(style.paddingLeft)||0)-(parseFloat(style.paddingRight)||0)};})}))};};
window.marquee=()=>{const button=document.querySelectorAll('.mmc-weight-row')[2].querySelector('.mmc-weight-file'),label=button.querySelector('.mmc-weight-file-label'),animation=label.getAnimations()[0];
 return{button,label,animation};};
`;
new vm.Script(code);
let browser,requests=0;const results=[];
const check=async(name,run)=>{await run();results.push({name,passed:true});};
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined});
 const page=await browser.newPage({viewport:{width:1280,height:850}});
 await page.route('**/*',route=>{requests++;return route.abort();});
 await page.setContent(`<style>${css}:root{--comfy-menu-bg:#181818;--fg-color:#eee;--input-text:#ddd;--descrip-text:#999;--bg-color:#202020;--primary-background:#0b8ce9;--error-text:#f44}body{margin:0;background:#171718}</style>`);
 await page.evaluate(`(()=>{${code}})()`);
 await check('Desktop weights popover is 760px and stays inside the viewport at either anchor edge',async()=>{
  for(const language of ['en','ko'])for(const right of [false,true]){
   const value=await page.evaluate(options=>{openFixture(options);return geometry();},{language,right});
   assert.equal(value.box.width,760);assert.ok(value.box.left>=8&&value.box.right<=1272,JSON.stringify(value));
   assert.ok(value.rows[2].controls[1].width>=580,JSON.stringify(value));
  }
 });
 await check('Checkpoint, text-encoder and VAE filenames retain complete text at unchanged font size and animate only when overflowing',async()=>{
  for(const devices of [false,true])for(const scale of [.8,1,1.6]){
   const value=await page.evaluate(options=>{openFixture(options);return geometry();},{devices,scale});
   for(const row of value.rows)for(const control of row.controls){
    if(control.class.includes('mmc-weight-file')){assert.equal(control.whiteSpace,'nowrap');assert.equal(control.direction,'ltr');assert.ok(Math.abs(control.font-13*scale)<.01);
     assert.ok(control.title.startsWith(control.text));assert.equal(control.labelAnimations,control.labelWidth-control.room>1?1:0,JSON.stringify(control));
    }else assert.ok(control.scroll<=control.client+1,JSON.stringify(control));
   }
  }
 });
 await check('Unusually long paths stay on one line inside a stationary bounded button without losing filename text',async()=>{
  const value=await page.evaluate(()=>{openFixture({veryLong:true,devices:true});return geometry();});
  const control=value.rows[2].controls[1];assert.ok(control.bottom-control.top<35);assert.ok(control.text.endsWith('ref2va.safetensors'));
  assert.equal(control.font,13);assert.equal(control.labelAnimations,1);assert.ok(value.scroll<=value.client+1);assert.ok(control.labelWidth>control.room);
 });
 await check('Compact viewports give filenames their own full-width row in both locales and all text sizes',async()=>{
  for(const width of [320,480,600])for(const language of ['en','ko'])for(const scale of [.8,1,1.6])for(const devices of [false,true]){
   await page.setViewportSize({width,height:700});
   const value=await page.evaluate(options=>{openFixture(options);return geometry();},{language,scale,devices,veryLong:true,right:true});
   assert.equal(value.box.width,width-16);assert.ok(value.box.left>=8&&value.box.right<=width-8,JSON.stringify(value));assert.ok(value.scroll<=value.client+1,JSON.stringify(value));
   for(const row of value.rows)for(const control of row.controls){
    assert.ok(control.left>=value.box.left+8&&control.right<=value.box.right-8,JSON.stringify(control));
    if(control.class.includes('mmc-weight-file')){assert.equal(control.whiteSpace,'nowrap');assert.ok(control.bottom-control.top<50);}
    else assert.ok(control.scroll<=control.client+1,JSON.stringify(control));
   }
   const row=value.rows[2];assert.ok(row.controls[1].top>=row.controls[0].bottom,JSON.stringify(row));
  }
  await page.setViewportSize({width:1280,height:850});
 });
 await check('Forced-route, idle-checkpoint, missing-file and pinned-device states keep their original visual classes',async()=>{
  const value=await page.evaluate(()=>{openFixture({devices:true});return geometry();});
  assert.ok(value.rows[0].controls[1].class.includes('forced'));assert.ok(value.rows[1].class.includes('idle'));assert.equal(value.rows[1].opacity,'0.45');
  assert.ok(value.rows[2].controls[2].class.includes('pinned'));assert.equal(value.rows[2].controls[2].text,'cuda:1');
  assert.ok(value.rows.find(row=>row.controls[0].text==='ControlNet branch').controls[1].class.includes('empty'));
 });
 await check('Opening and inspecting controls does not select files or change generation settings',async()=>{
  assert.equal(await page.evaluate(()=>{openFixture({devices:true});const before=JSON.stringify(models);
   document.querySelectorAll('.mmc-weight-file,.mmc-weight-device').forEach(node=>node.click());
   return JSON.stringify(models)===before&&changed===0&&remembered===0&&choiceCalls>10;}),true);
 });
 await check('Existing route, file, precision and device choices still call their unchanged original handlers',async()=>{
  assert.equal(await page.evaluate(()=>{openFixture({devices:true});let pop=document.querySelector('.mmc-weights-pop');
   pop.querySelector('.mmc-weight-file').click();choice.options.onPick('always FL2VA');
   pop.querySelectorAll('.mmc-weight-row')[2].querySelector('.mmc-weight-file').click();choice.options.onPick('replacement_ref2va.safetensors');
   pop.querySelectorAll('.mmc-weight-row')[2].querySelector('.mmc-weight-device').click();choice.options.onPick('cuda:0');
   const precision=[...pop.querySelectorAll('.mmc-weight-row')].find(row=>row.querySelector('.mmc-weight-name').textContent==='Precision');
   precision.querySelector('.mmc-weight-file').click();choice.options.onPick('fp8_e4m3fn');
   return models.route==='fl2va'&&models.ref2va==='replacement_ref2va.safetensors'&&models.devices.ref2va==='cuda:0'&&models.dtype==='fp8_e4m3fn'&&changed===4&&remembered===4;}),true);
 });
 await check('Native file buttons remain keyboard reachable and Escape/outside dismissal still close the popover',async()=>{
  await page.evaluate(()=>openFixture());await page.locator('.mmc-weight-row').nth(2).locator('.mmc-weight-file').focus();await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>choice.options.find),true);await page.keyboard.press('Escape');assert.equal(await page.locator('.mmc-weights-pop').count(),0);
  await page.evaluate(()=>openFixture());await page.locator('#outside').click();assert.equal(await page.locator('.mmc-weights-pop').count(),0);
 });
 await check('The widening is scoped to weights and does not enlarge unrelated popovers',async()=>{
  assert.equal(await page.evaluate(()=>{const other=el('div',{class:'mmc-pop',style:{width:'240px',top:'10px',left:'10px'}},[el('span',{text:'Unrelated'})]);document.body.append(other);
   const same=getComputedStyle(other).width==='240px';other.remove();return same;}),true);
 });
 await check('Overflow text moves back and forth at 28px/s with one-second endpoint holds and a fixed click target',async()=>{
  await page.evaluate(()=>openFixture({veryLong:true,devices:true}));
  const value=await page.evaluate(()=>{const {button,label,animation}=marquee(),frames=animation.effect.getKeyframes(),timing=animation.effect.getTiming(),before=button.getBoundingClientRect().toJSON();
   const distance=Math.abs(parseFloat(frames[2].transform.match(/translateX\(([-.\d]+)px\)/)[1]));
   const travel=(frames[2].offset-frames[1].offset)*timing.duration;
   animation.pause();animation.currentTime=(frames[1].offset+frames[2].offset)/2*timing.duration;
   const forward=new DOMMatrixReadOnly(getComputedStyle(label).transform).m41;
   animation.currentTime=(frames[3].offset+1)/2*timing.duration;
   const backward=new DOMMatrixReadOnly(getComputedStyle(label).transform).m41;
   animation.currentTime=timing.duration*.995;const after=button.getBoundingClientRect().toJSON();
   return{distance,travel,forward,backward,before,after,startHold:frames[1].offset*timing.duration,endHold:(frames[3].offset-frames[2].offset)*timing.duration,
    easing:timing.easing,iterations:timing.iterations,readOnly:changed===0&&remembered===0};});
  assert.ok(Math.abs(value.distance/(value.travel/1000)-28)<.01);assert.ok(Math.abs(value.startHold-1000)<.01);assert.ok(Math.abs(value.endHold-1000)<.01);
  assert.ok(Math.abs(value.forward+value.distance/2)<1);assert.ok(Math.abs(value.backward+value.distance/2)<1);assert.deepEqual(value.before,value.after);assert.equal(value.readOnly,true);
  assert.equal(value.easing,'linear');assert.equal(value.iterations,Infinity);
 });
 await check('Resize recalculates actual travel distance/duration and cancels the obsolete animation',async()=>{
  await page.evaluate(()=>{openFixture({veryLong:true,devices:true});window.oldMarquee=marquee().animation;window.oldDuration=oldMarquee.effect.getTiming().duration;});
  await page.setViewportSize({width:320,height:700});await page.waitForFunction(()=>marquee().animation!==oldMarquee);
  const result=await page.evaluate(()=>({oldState:oldMarquee.playState,changedDuration:marquee().animation.effect.getTiming().duration!==oldDuration,modelsUnchanged:changed===0&&remembered===0}));
  assert.deepEqual(result,{oldState:'idle',changedDuration:true,modelsUnchanged:true});await page.setViewportSize({width:1280,height:850});
 });
 await check('A detached first render starts overflowing text after mounting without depending on catalog refresh',async()=>{
  assert.equal(await page.evaluate(()=>{openFixture({veryLong:true,deferCatalog:true});return marquee().label.getAnimations().length;}),0);
  await page.waitForFunction(()=>marquee().label.getAnimations().length===1);
  assert.equal(await page.evaluate(()=>changed===0&&remembered===0&&typeof paintAgain==='function'),true);
 });
 await check('Reduced motion cancels animation and exposes full-filename tooltip plus focused manual horizontal reading',async()=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>openFixture({veryLong:true,devices:true}));
  assert.equal(await page.evaluate(()=>marquee().label.getAnimations().length),0);assert.equal(await page.evaluate(()=>marquee().button.title.startsWith(models.ref2va)&&marquee().button.title.endsWith('Choose Ref2VA checkpoint')),true);
  const button=page.locator('.mmc-weight-row').nth(2).locator('.mmc-weight-file');await button.focus();await page.keyboard.press('End');
  assert.ok(await button.evaluate(node=>node.scrollLeft)>0);await page.keyboard.press('Home');assert.equal(await button.evaluate(node=>node.scrollLeft),0);
  await page.keyboard.press('ArrowRight');assert.ok(await button.evaluate(node=>node.scrollLeft)>0);await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>choice.options.find),true);
  assert.equal(await page.evaluate(()=>changed===0&&remembered===0),true);
  await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForFunction(()=>marquee().label.getAnimations().length===1);
 });
 await check('Catalog repaint and popover close dispose prior animations, resize observers and media listeners',async()=>{
  await page.evaluate(()=>{openFixture({veryLong:true});window.retired=marquee();window.retiredObserver=resizeRecords.findLast(record=>record.targets.length>1);
   window.retiredMedia=mediaRecords.findLast(record=>record.listeners.size);paintAgain();});
  assert.equal(await page.evaluate(()=>retired.animation.playState==='idle'&&retiredObserver.disconnected&&retiredMedia.listeners.size===0&&marquee().animation!==retired.animation),true);
  await page.evaluate(()=>{window.currentMarquee=marquee();window.currentObserver=resizeRecords.findLast(record=>record.targets.length>1);window.currentMedia=mediaRecords.findLast(record=>record.listeners.size);});
  await page.keyboard.press('Escape');assert.equal(await page.locator('.mmc-weights-pop').count(),0);
  assert.equal(await page.evaluate(()=>currentMarquee.animation.playState==='idle'&&currentObserver.disconnected&&currentMedia.listeners.size===0),true);
 });
 const out=process.env.CONTINUITY_UX_SCREENSHOT_DIR||process.env.CONTINUITY_ARTIFACT_DIR;
 if(out){fs.mkdirSync(out,{recursive:true});
  await page.setViewportSize({width:1280,height:850});await page.evaluate(()=>openFixture({language:'ko'}));await page.locator('.mmc-weights-pop').screenshot({path:path.join(out,'model-menu-ko-desktop.png')});
  await page.evaluate(()=>openFixture({devices:true,veryLong:true}));await page.locator('.mmc-weights-pop').screenshot({path:path.join(out,'model-menu-en-long-devices.png')});
  await page.evaluate(()=>{const {animation}=marquee();animation.pause();animation.currentTime=animation.effect.getKeyframes()[2].offset*animation.effect.getTiming().duration;});
  await page.locator('.mmc-weights-pop').screenshot({path:path.join(out,'model-menu-en-long-devices-tail.png')});
  await page.setViewportSize({width:320,height:700});await page.evaluate(()=>openFixture({language:'ko',scale:1.6,devices:true}));await page.locator('.mmc-weights-pop').screenshot({path:path.join(out,'model-menu-ko-narrow-large.png')});
 }
 assert.equal(requests,0,'No network requests');console.log(JSON.stringify({suite:'model-menu-width',checks:results.length,requests,results},null,2));
})().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(async()=>{await browser?.close();});
