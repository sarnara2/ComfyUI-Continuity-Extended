// EXT54 actual card/footer DOM and callback closures with production CSS order.
// Offline maintained card metadata adapter + actual RAM-only preview controller.
// No ComfyUI, user workflow/media/profile, queue, model/API or GPU execution.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os');
const playwrightPath=process.env.PLAYWRIGHT_MODULE||'playwright';
const {chromium}=require(playwrightPath);
const {babelParse,traverse}=require(path.join(path.dirname(require.resolve(playwrightPath)),'lib/transform/babelBundle.js'));
const repo=process.env.CONTINUITY_SOURCE_ROOT?path.resolve(process.env.CONTINUITY_SOURCE_ROOT):path.resolve(__dirname,'../..');
const root=path.join(repo,'web/creator');
const baseline=process.env.CONTINUITY_BASELINE_DIR?path.resolve(process.env.CONTINUITY_BASELINE_DIR):path.resolve(repo,'../baseline');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const source=read('timeline.js');
const stableWidthBlock='// Card controls have a stable base. Ready media uses the shared aspect-class\r\n// widths in CSS; only the sound lane and duration readouts represent time.\r\nconst cardWidth = () => 358;';
const durationWidthBlock='/**\r\n * Card width from duration. Compressed rather than linear: durations run 1 s to\r\n * 60 s, and at any scale that keeps a 1-second card wide enough for its own\r\n * buttons a 60-second one would be most of a metre. Square root keeps the\r\n * ordering legible — a longer shot is visibly a wider card — without that.\r\n * The lane in the node body stays strictly proportional; that is its whole job.\r\n */\r\nconst cardWidth = (seconds) => 132 + Math.round(Math.sqrt(seconds) * 26);';
const restoreDurationWidth=text=>{
 const newline=text.includes('\r\n')?'\r\n':'\n',block=stableWidthBlock.replace(/\r\n/g,newline),prior=durationWidthBlock.replace(/\r\n/g,newline);
 assert.equal(text.split(block).length,2,'One exact shared aspect-width constant/comment');
 const style='style: { width: `${cardWidth()}px` },';assert.equal(text.split(style).length,3,'Exactly the Clip and generated duration-free style calls');
 return text.replace(block,prior).replace(style,'style: { width: `${cardWidth(seconds)}px` },').replace(style,'style: { width: `${cardWidth(seconds)}px`, "--mmc-tl-card-width": `${cardWidth(seconds)}px` },');
};
const durationWidthSource=restoreDurationWidth(source);
const method=(text,name)=>{const match=text.match(new RegExp(`^  (?:async )?${name}\\([^]*?^  \\}`,'m'));assert.ok(match,'Actual '+name);return match[0];};
const fn=(text,name)=>{const match=text.match(new RegExp(`(?:export )?function ${name}\\([^]*?^\\}`,'m'));assert.ok(match,'Actual '+name);return match[0].replace(/^export /,'');};
const constant=(text,name)=>{const match=text.match(new RegExp(`^(?:export )?const ${name} =[^]*?;`,'m'));assert.ok(match,'Actual '+name);return match[0].replace(/^export /,'');};
const editAccentRule=/\.mmc-tl-card-edit-tools > \.mmc-tl-edit\.mmc-tl-card-edit-action \{\r?\n  color: var\(--mmc-accent\); font-weight: 600;\r?\n\}\r?\n/;
const portraitBlock=/\/\* BEGIN ready portrait segment card width \*\/[^]*?\/\* END ready portrait segment card width \*\/\r?\n\r?\n/;
const compactOffBlock=/\/\* --- compact cards without ready previews --- \*\/[^]*?\/\* --- end compact cards without ready previews --- \*\/\r?\n\r?\n/;
const titleLoopBlock=/\/\* BEGIN looping card titles \*\/[^]*?\/\* END looping card titles \*\/\r?\n\r?\n/;
const forgivingScrollbarBlock=/\/\* BEGIN forgiving Timeline scrollbars \*\/[^]*?\/\* END forgiving Timeline scrollbars \*\/\r?\n\r?\n/;
const narrowBaseline=path.resolve(process.env.CONTINUITY_PRESENTATION_BASELINE_DIR||path.resolve(repo,'../baseline'),'web/creator');
if(fs.existsSync(path.join(narrowBaseline,'timeline.js'))){
 const old=fs.readFileSync(path.join(narrowBaseline,'timeline.js'),'utf8');
 const wheelBlock=text=>text.match(/^    \/\/ (?:Cards scroll the Timeline vertically\.|A trackpad swipes sideways on its own;)[^]*?^    \}, \{ passive: false \}\);/m)?.[0];
 assert.ok(wheelBlock(source)&&wheelBlock(old),'Precisely bounded strip wheel handler/comments');
 const restored=durationWidthSource.replace(wheelBlock(source),wheelBlock(old)).replace('class: "mmc-tl-edit mmc-tl-card-edit-action", text: t("Edit")','class: "mmc-tl-edit", text: t("Edit")')
  .replace('style: { width: `${cardWidth(seconds)}px`, "--mmc-tl-card-width": `${cardWidth(seconds)}px` },','style: { width: `${cardWidth(seconds)}px` },')
  .replace(/    \/\/ BEGIN looping card titles[^]*?    \/\/ END looping card titles\r?\n/,'')
  .replace(/    this\.cardTitleFit\?\.disconnect\(\);\r?\n    this\.cardTitleFit = null;\r?\n/,'')
  .replace(/^import \{ createTimelineScrollbars \} from "\.\/timeline-scrollbars\.js";\r?\n/m,'')
  .replace(/    this\.scrollbars = createTimelineScrollbars\(this\.modal\.querySelector\(":scope > \.mmc-tl-body"\), this\.stripHost\);\r?\n/,'')
  .replace(/    this\.scrollbars\?\.destroy\(\);\r?\n    this\.scrollbars = null;\r?\n/,'');
 assert.equal(restored,old,'Only generated Edit class, preferred-width CSS variable, named view-only title enhancement/cleanup, bounded strip wheel handler and exact scrollbar-helper wiring change in Timeline source');
 let style=read('styles/timeline.js');assert.match(style,editAccentRule);
 style=style.replace(portraitBlock,'').replace(compactOffBlock,'').replace(titleLoopBlock,'').replace(forgivingScrollbarBlock,'').replace(editAccentRule,'')
  .replace(/\/\* BEGIN Sound header button feedback \*\/[^]*?\/\* END Sound header button feedback \*\/\r?\n/,'.mmc-snd-zoom-tool[aria-pressed="true"] { color: var(--mmc-accent); border-color: var(--mmc-accent); }\r\n')
  .replace(/\.mmc-tl-header > \.mmc-close \{\r?\n  margin-left: 0; color: var\(--mmc-accent\); font-size: calc\(20px \* var\(--mmc-type\)\); font-weight: 600;\r?\n\}/,'.mmc-tl-header > .mmc-close { margin-left: 0; }')
  .replace(/(\.mmc-tl-card-count \{[^]*?)  text-align: right;\r?\n/,'$1')
  .replace('color: var(--mmc-accent); font-family: inherit; font-size: calc(13px * var(--mmc-type)); cursor: pointer;','color: var(--mmc-dim); font-family: inherit; font-size: calc(12px * var(--mmc-type)); cursor: pointer;')
  .replace('.mmc-tl-add:hover:not(:disabled) { color: var(--mmc-accent);','.mmc-tl-add:hover:not(:disabled) { color: var(--mmc-text);')
  .replace('.mmc-tl-add-pair .mmc-tl-add span:first-child { font-size: calc(16px * var(--mmc-type)); }','.mmc-tl-add-pair .mmc-tl-add span:first-child { font-size: calc(15px * var(--mmc-type)); }');
 assert.equal(style,fs.readFileSync(path.join(narrowBaseline,'styles/timeline.js'),'utf8'),'Only named portrait/Ready OFF/title/scrollbar/Sound-feedback blocks, scoped header close paint, count alignment, Edit accent/weight and Add pair paint/size CSS change; other edit controls exact');
}
const addMarkup=method(source,'renderStrip').match(/^    parts\.push\(el\("div", \{ class: "mmc-tl-add-pair" \}, \[[^]*?^    \]\)\);/m)?.[0];
assert.ok(addMarkup,'Actual add pair source');
const clean=node=>JSON.parse(JSON.stringify(node,(key,value)=>['loc','start','end','extra','leadingComments','trailingComments','innerComments','comments'].includes(key)?undefined:value));
const receipts=(text,name)=>{
 const values=[],ast=babelParse('class ActualOwner {\n'+method(text,name)+'\n}',name+'-callback-receipt.js',true);
 traverse(ast,{ObjectProperty(p){const key=p.node.key.name||p.node.key.value;if(/^on(?:click|pointer|double|key|change|blur|focus)/i.test(key)&&!p.findParent(parent=>parent.isVariableDeclarator()&&parent.node.id.name==='faceChip'))values.push(JSON.stringify({key,value:clean(p.node.value)}));}});
 return values.sort();
};
const stateCalculations=text=>{
 const ast=babelParse('class ActualOwner {\n'+method(text,'renderCard')+'\n}','renderCard-state-receipt.js',true);
 const owner=ast.program.body[0].body.body[0];
 return owner.body.body.slice(0,-1).filter(statement=>!(statement.type==='VariableDeclaration'
  &&statement.declarations.every(d=>['typed','prompt','repaired','faceChip'].includes(d.id.name)))).map(clean);
};
let callbackReceipts=null;
if(fs.existsSync(path.join(baseline,'web/creator/timeline.js'))){
 const original=fs.readFileSync(path.join(baseline,'web/creator/timeline.js'),'utf8');
 callbackReceipts={};
 for(const name of ['renderCard','renderClipCard']){
  assert.deepEqual(receipts(source,name),receipts(original,name),name+' non-Face callback ASTs unchanged; the approved full Face popover has its separate actual-owner fixture');
  callbackReceipts[name]=receipts(source,name).length;
 }
 assert.deepEqual(receipts(source,'renderStrip'),receipts(original,'renderStrip'),'Add/Clip callbacks remain exact original AST');
 for(const name of ['holdSwitch','removeButton','disarm','remove','takeChip','takeTools','cardNameControl','cardPreview','segmentNavigator','holdAllPills','renderJoin','renderClipJoin','renderPass','mergeAt'])assert.equal(method(source,name),method(original,name),name+' exact source preserved');
 assert.deepEqual(stateCalculations(source),stateCalculations(original),'Generated-card calculations unchanged except superseded caption-only and per-card Face UI declarations');
 const bodyBlock=text=>text.match(/\/\* The full Timeline already scrolls here;[^]*?(?=\.mmc-tl-prompt \{)/)?.[0];
 assert.equal(bodyBlock(read('styles/timeline.js')),bodyBlock(fs.readFileSync(path.join(baseline,'web/creator/styles/timeline.js'),'utf8')),'EXT52 body scrollbar exact preserved');
 const armedBlock=text=>text.match(/\.mmc-tl-card-foot \.mmc-asset-x\.armed \{[^]*?(?=\/\* Free only)/)?.[0];
 assert.equal(armedBlock(read('styles/timeline.js')),armedBlock(fs.readFileSync(path.join(baseline,'web/creator/styles/timeline.js'),'utf8')),'Original delete-confirmation CSS exact preserved');
}else if(process.env.CONTINUITY_BASELINE_DIR)assert.fail('Explicit baseline exists');

// Reuse the actual renderCard/take/seed adapter; do not execute its old footer
// markup guard, superseded above by exact callbacks/state invariants for EXT54.
const baseFile=path.join(repo,'tests/browser/test-segment-card-pills.cjs');
let prefix=fs.readFileSync(baseFile,'utf8').split('new vm.Script(code);')[0];
const guardStart=prefix.indexOf("if(fs.existsSync(path.join(baselineRoot,'timeline.js'))){");
const guardEnd=prefix.indexOf("const css=['base'",guardStart);
assert.ok(guardStart>0&&guardEnd>guardStart,'Explicit legacy footer-view guard boundary');
prefix=prefix.slice(0,guardStart)+prefix.slice(guardEnd);
let {code}=vm.runInNewContext(prefix+';({code});',{require,__dirname:path.dirname(baseFile),process},{filename:baseFile});
const dictionaries={};for(const language of ['ko','ja','zh'])dictionaries[language]=vm.runInNewContext(read('locales/'+language+'.js').replace(/^export const /m,'const ')+';'+language+';',{});
code=code.replace(/const dictionaries=\{ko:[^]*?\};let locale='en';/,"const dictionaries="+JSON.stringify(dictionaries)+";let locale='en';");
for(const [name,pattern]of [['holdSwitch',/^ holdSwitch\(\)\{[^\r\n]*\}/m],['removeButton',/^ removeButton\(i\)\{[^\r\n]*\}/m],['disarm',/^ disarm\(i\)\{[^\r\n]*?\}/m]]){
 assert.match(code,pattern,'Maintained adapter '+name);code=code.replace(pattern,method(source,name));
}
assert.ok(code.includes('commit(){this.commits++;this.mount();}'),'Preserve the maintained commit/remount adapter adjacent to disarm');
code=code.replace('class Subject {','class Subject {\n'+['remove','segmentNavigator','holdAllPills','renderJoin','renderClipJoin','renderPass','mergeAt'].map(name=>method(source,name)).join('\n')+'\n renderStrip(){this.mount();}\n earlierPasses(index){return S.passes(this.timeline).filter(p=>p.end<=index);}\n openSegmentNavigator(){this.calls.push(["navigator"]);}\n');
code+='\nObject.assign(S,{rescueCastFiles:(piece,segment)=>subject.calls.push(["rescue",segment.prompt]),remapContinueFrom:()=>{}});\n';
code+="\nObject.assign(S,{shotInParts:()=>true,passes:piece=>piece.segments.map((segment,start)=>({start,end:start+1,segments:[segment]})),continues:s=>s.continue===true,continuesAudio:s=>s.continue_audio===true,continueSource:(s,i)=>i,blockedReason:()=>null,clipSeamBlocked:()=>null,feather:()=>1,featherPin:()=>false,maxClipFeather:()=>1});\n";
code+=[constant(source,'seamGroup'),constant(source,'blendSeconds'),constant(source,'blendSetsTail')].join('\n');
// The maintained card adapter now owns these actual helpers for the approved
// full Face popover too; retain one canonical set rather than redeclaring it.
for(const name of ['floatAbove','dismissable','placeNear'])assert.ok(code.includes(fn(read('dom.js'),name)),'Maintained actual '+name);
code+="\nconst viewUrl=filename=>window.footerMediaUrls[Object.keys(window.footerMediaUrls).find(aspect=>filename.includes(aspect))||window.footerAspect||'portrait'];\n"+read('card-preview.js').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
code+=`
const openReferencePreview=()=>{subject.calls.push(['large-preview']);return()=>{};};
const footerAspects={portrait:[120,208],landscape:[160,90],ultrawide:[240,60]};
window.footerReset=(options={})=>{
 for(const player of window.subject?.cardPreviews||[])player.destroy();
 setFixture(options);subject.previewMode=Boolean(options.preview);subject.cardPreviews=new Set();
 const segment=subject.timeline.segments[1];
 window.footerAspect=options.aspect||'portrait';const [width,height]=footerAspects[window.footerAspect];
 if(segment.take)Object.assign(segment.take,{width,height,duration_s:1,has_audio:false});
 if(options.clip)Object.assign(segment,{width,height,has_audio:options.noAudio?false:true});
 // Metadata belongs to the fixture boundary, before the actual DOM consumes
 // it (notably the real no-audio disabled state and initial preview aspect).
 subject.mount();
 const strip=el('div',{class:'mmc-tl-strip fixture-footer-strip'});strip.classList.toggle('individual-preview',subject.previewMode);
 subject.host.classList.add('mmc-tl-pass-cards');subject.host.replaceWith(strip);strip.append(subject.host);
 const mount=subject.mount.bind(subject);subject.mount=()=>{strip.classList.toggle('individual-preview',subject.previewMode);mount();};
 return JSON.stringify(subject.timeline);
};
window.footerNav=()=>{
 const modal=el('div',{class:'mmc-tl-modal fixture-nav-modal'}),nav=el('div',{class:'mmc-tl-navigation'});
 nav.append(subject.segmentNavigator(),...subject.holdAllPills());modal.append(nav);document.body.prepend(modal);return nav;
};
window.footerAddPair=(options={})=>{
 footerReset(options);subject.calls=[];
 subject.add=()=>subject.calls.push(['add']);subject.addClip=()=>subject.calls.push(['add-clip']);
 const parts=[],refusal=options.disabled?'Fixture capacity refusal':null,what='Segment';
 (function(){${addMarkup}}).call(subject);
 const strip=document.querySelector('.fixture-footer-strip');strip.append(parts[0]);
 return JSON.stringify(subject.timeline);
};
window.multiFooterReset=(options={})=>{
 footerReset(options);const selected=subject.timeline.segments[1];
 subject.timeline.segments=(options.aspects||['portrait','landscape','ultrawide']).map((aspect,index)=>{
  const segment=JSON.parse(JSON.stringify(selected)),[width,height]=footerAspects[aspect];
  segment.prompt=index===0?'One short prompt.':Array(8).fill('Keep source performance with the prepared identity.').join(' ');
  if(index===2&&options.unreadyLast){delete segment.take;delete segment.hold;delete segment.kind;delete segment.filename;}
  else if(index===2){segment.kind='clip';segment.filename='footer-'+aspect+'.webm';segment.width=width;segment.height=height;}
  else if(segment.take)Object.assign(segment.take,{filename:'footer-'+aspect+'.webm',width,height});
  return segment;
 });
 subject.mount=()=>{
  for(const player of subject.cardPreviews)player.destroy();subject.cardPreviews.clear();
  const strip=document.querySelector('.fixture-footer-strip');strip.classList.toggle('individual-preview',Boolean(subject.previewMode));
  strip.replaceChildren(...subject.timeline.segments.flatMap((segment,index)=>{
   const pass={start:index,end:index+1,segments:[segment]};return index?[subject.renderJoin(index),subject.renderPass(pass)]:[subject.renderPass(pass)];
  }));
 };
 subject.mount();return JSON.stringify(subject.timeline);
};
window.multiFooterMetrics=()=>({
 cards:[...document.querySelectorAll('.mmc-tl-card')].map(card=>{
  const cr=card.getBoundingClientRect(),nodes=[...card.querySelectorAll(':scope > .mmc-tl-card-status,:scope > .mmc-tl-card-seed,:scope > .mmc-tl-card-refs,.mmc-tl-card-transport,.mmc-tl-card-edit-tools')];
  const rows=[...card.querySelectorAll(':scope > .mmc-tl-card-head,:scope > .mmc-tl-card-count,:scope > .mmc-tl-card-refs,:scope > .mmc-tl-card-meta')].map(n=>{
   const r=n.getBoundingClientRect();return{class:n.className,x:r.left-cr.left,y:r.top-cr.top,height:r.height,
    adjustable:n.classList.contains('mmc-tl-card-meta')||!!n.querySelector('.mmc-tl-card-frame-fact')};
  });
  return{width:cr.width,height:cr.height,generated:!card.classList.contains('mmc-tl-clip'),preview:!!card.querySelector(':scope > .mmc-card-preview'),portrait:!!card.querySelector(':scope > .mmc-card-preview.mmc-card-preview-portrait'),wide:!!card.querySelector(':scope > .mmc-card-preview.mmc-card-preview-wide'),type:parseFloat(getComputedStyle(card).getPropertyValue('--mmc-type')),rows,controls:nodes.map(n=>{
   const r=n.getBoundingClientRect(),buttons=[...n.querySelectorAll(':scope > button')].map(button=>{
    const b=button.getBoundingClientRect(),s=getComputedStyle(button),range=document.createRange();range.selectNodeContents(button);
    return{text:button.textContent,height:b.height,lines:[...range.getClientRects()].filter(r=>r.width&&r.height).length,whiteSpace:s.whiteSpace,
     type:{font:s.font,fontFamily:s.fontFamily,fontWeight:s.fontWeight,minHeight:s.minHeight,padding:s.padding,lineHeight:s.lineHeight,borderWidth:s.borderWidth}};
   });
   return{class:n.className,x:r.left-cr.left,y:r.top-cr.top,right:r.right-cr.left,width:r.width,height:r.height,buttons};
  })};
 }),merge:[...document.querySelectorAll('.mmc-tl-join-merge')].map(node=>{const r=node.getBoundingClientRect(),s=node.closest('.mmc-tl-seam').getBoundingClientRect();return{top:r.top-s.top,left:r.left-s.left,height:r.height};})
});
window.footerGeometry=()=>{
 const card=document.querySelector('.mmc-tl-card'),foot=card.querySelector('.mmc-tl-card-foot');
 const cr=card.getBoundingClientRect(),fr=foot.getBoundingClientRect(),style=getComputedStyle(card);
 const relative=node=>{const r=node.getBoundingClientRect();return{left:r.left-cr.left,right:r.right-cr.left,top:r.top-fr.top,bottom:r.bottom-fr.top,width:r.width,height:r.height};};
 const plain=el('button',{class:'mmc-tl-edit'});foot.querySelector('.mmc-tl-card-edit-tools').append(plain);
 const originalPaint={color:getComputedStyle(plain).color,weight:getComputedStyle(plain).fontWeight};plain.remove();
 const group=node=>({rect:relative(node),buttons:[...node.children].map(n=>({text:n.textContent,rect:relative(n),disabled:n.disabled,
   editAccent:n.classList.contains('mmc-tl-card-edit-action'),color:getComputedStyle(n).color,weight:getComputedStyle(n).fontWeight,
   visible:!!n.getClientRects().length,whiteSpace:getComputedStyle(n).whiteSpace,font:getComputedStyle(n).fontSize,
   scroll:n.scrollWidth,width:n.clientWidth,inView:(()=>{const r=n.getBoundingClientRect(),strip=card.closest('.mmc-tl-strip'),s=strip.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,left=s.left+strip.clientLeft,top=s.top+strip.clientTop;return x>=left&&x<left+strip.clientWidth&&y>=top&&y<top+strip.clientHeight&&x>=0&&x<innerWidth&&y>=0&&y<innerHeight;})(),
   hit:(()=>{const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return hit===n||n.contains(hit);})()}))});
 return{card:{width:cr.width,height:cr.height,padding:parseFloat(style.paddingRight),border:parseFloat(style.borderRightWidth)},
  accent:getComputedStyle(card.querySelector('.mmc-tl-index')).backgroundColor,originalPaint,
  footer:{width:fr.width,height:fr.height,left:fr.left-cr.left,right:fr.right-cr.left,top:fr.top-cr.top},
  classes:[...foot.children].map(n=>n.className),transport:group(foot.querySelector('.mmc-tl-card-transport')),
  edits:group(foot.querySelector('.mmc-tl-card-edit-tools')),overflow:card.scrollWidth>card.clientWidth+1};
};
`;
new vm.Script(code,{filename:'card-footer-actual-source-fixture.js'});
const styles=read('styles.js'),imports=Object.fromEntries([...styles.matchAll(/import \{ css as (\w+) \} from "\.\/styles\/(\w+)\.js";/g)].map(m=>[m[1],m[2]]));
const cssOrder=styles.match(/const CSS = \[([^]*?)\]\.join\(""\);/)[1].replace(/\/\/[^\n]*/g,'').split(',').map(s=>s.trim()).filter(Boolean);
const css=cssOrder.map(owner=>read('styles/'+imports[owner]+'.js').match(/export const css = `([^]*)`;\s*$/)[1]).join('\n');
const results=[],layouts=[],errors=[];let browser,requests=0;
const output=path.resolve(process.env.CONTINUITY_ARTIFACT_DIR||process.env.CONTINUITY_UX_SCREENSHOT_DIR||path.join(os.tmpdir(),'continuity-footer-layout'));
assert.ok(output!==repo&&!output.startsWith(repo+path.sep),'Evidence outside product');
const check=async(name,run)=>{await run();results.push({name,passed:true});console.log('PASS '+name);};
const close=(a,b,message)=>assert.ok(Math.abs(a-b)<.15,message+' '+JSON.stringify({a,b}));
function valid(g,scale){
 assert.deepEqual(g.classes,['mmc-tl-card-transport','mmc-tl-card-edit-tools']);
 const right=g.card.width-g.card.padding-g.card.border;
 close(g.transport.rect.right,right,'Transport right edge');close(g.edits.rect.right,right,'Edit pill right edge');
 assert.ok(g.edits.rect.top>=g.transport.rect.bottom+2.9,'Always second row with gap '+JSON.stringify(g));
 assert.ok(g.transport.rect.top>=-.1&&g.edits.rect.bottom<=g.footer.height+.1,'Both rows inside footer');
 assert.equal(g.overflow,false,'No card overflow');
 for(const b of [...g.transport.buttons,...g.edits.buttons].filter(b=>b.visible)){
  assert.ok(b.rect.left>=g.card.padding-.1&&b.rect.right<=right+.1,'Contained controls '+JSON.stringify(b));
  if(b.inView)assert.ok(b.hit,'Native visible hit target '+JSON.stringify(b));
  assert.ok(b.rect.height>=26*scale-.1,'Reserved row height '+JSON.stringify(b));
 }
 for(const b of g.edits.buttons){assert.ok(['normal','nowrap'].includes(b.whiteSpace));assert.ok(b.scroll<=b.width+1,'Whole edit labels may wrap inside their own pill segment');}
 for(const b of g.edits.buttons){
  if(b.editAccent){assert.equal(b.color,g.accent,'Edit matches the actual yellow ordinal');assert.equal(b.weight,'600','Edit alone is semibold');}
  else{assert.equal(b.color,g.originalPaint.color,'Trim/Crop/Replace retain original paint');assert.equal(b.weight,g.originalPaint.weight,'Trim/Crop/Replace retain original weight');}
 }
}
function fixedPreview(after,before,message){
 const delta=after.width-before.width;
 if(after.preview)close(after.width,Math.max(after.portrait?338:after.wide?520:420,(after.portrait?38:58)+300*after.type),'Shared portrait/normal/wide aspect-class width '+message);
 else close(after.width,before.width,'Unready card width remains its base/readability floor');
 assert.deepEqual(after.controls.map(c=>c.class),before.controls.map(c=>c.class));
 after.controls.forEach((control,n)=>{
  const original=before.controls[n],fullRow=/^mmc-tl-card-(status|seed|refs)/.test(control.class);
  close(control.y,original.y,message+' fixed '+control.class+' y');close(control.height,original.height,message+' fixed '+control.class+' height');
  close(control.right,original.right+delta,message+' fixed '+control.class+' right inset');
  close(control.x,original.x+(fullRow?0:delta),message+' '+control.class+' left/group anchor');
  close(control.width,original.width+(fullRow?delta:0),message+' '+control.class+' width');
 });
}
function fixedModeControls(after,before,message){
 assert.deepEqual(after.controls.map(c=>c.class),before.controls.map(c=>c.class));
 assert.deepEqual(after.rows.map(r=>r.class),before.rows.map(r=>r.class));
 const shiftBefore=y=>before.rows.reduce((shift,row,n)=>shift+(row.adjustable&&row.y+row.height<=y+.15?after.rows[n].height-row.height:0),0);
 after.rows.forEach((row,n)=>{
  const original=before.rows[n];close(row.x,original.x,message+' first-row left inset');
  close(row.y,original.y+shiftBefore(original.y),message+' row y follows only preceding metadata/frame-fact height');
  if(!row.adjustable)close(row.height,original.height,message+' unchanged head/count/duration row height');
 });
 after.controls.forEach((control,n)=>{
  const original=before.controls[n];
  close(control.y,original.y+shiftBefore(original.y),message+' own-card '+control.class+' y follows only measured metadata/frame-fact compacting');
  const row=before.rows.find(r=>r.class===original.class);
  if(control.class==='mmc-tl-card-edit-tools'&&Math.abs(control.height-original.height)>.15){
   assert.deepEqual(control.buttons.map(b=>b.text),original.buttons.map(b=>b.text));
   assert.deepEqual(control.buttons.map(b=>b.type),original.buttons.map(b=>b.type),'OFF nowrap does not change edit fonts/min-height/padding');
   assert.ok(original.buttons.every(b=>b.whiteSpace==='nowrap'&&b.lines===1),'OFF edit labels are whole single lines');
   assert.ok(control.buttons.some(b=>b.lines>1),'Only original ON label wrapping permits a footer height difference');
   const textDelta=Math.max(...control.buttons.map(b=>b.height))-Math.max(...original.buttons.map(b=>b.height));
   close(control.height-original.height,textDelta,message+' edit row height tracks only measured legacy label wrapping');
  }else if(!row?.adjustable)close(control.height,original.height,message+' own-card '+control.class+' height');
  close(after.width-control.right,before.width-original.right,message+' own-card '+control.class+' right inset');
 });
 const transport=after.controls.find(c=>c.class==='mmc-tl-card-transport'),edits=after.controls.find(c=>c.class==='mmc-tl-card-edit-tools');
 const oldTransport=before.controls.find(c=>c.class==='mmc-tl-card-transport'),oldEdits=before.controls.find(c=>c.class==='mmc-tl-card-edit-tools');
 close(edits.y-transport.y-transport.height,oldEdits.y-oldTransport.y-oldTransport.height,message+' unchanged footer internal row gap');
}
(async()=>{
 browser=await chromium.launch({headless:true,ignoreDefaultArgs:['--hide-scrollbars'],executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined});
 const page=await browser.newPage({viewport:{width:1200,height:1100}});page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>{requests++;return route.abort();});
 await page.setContent('<style>'+css+':root{--comfy-menu-bg:#181819;--fg-color:#ddd;--input-text:#ddd;--descrip-text:#999;--bg-color:#202020;--primary-background:#0b8ce9;--destructive-background:#b33a3a;--error-text:#f44}body{margin:24px;background:#171718}.fixture-host{width:max-content;height:auto;padding:0}.fixture-footer-strip{width:calc(100vw - 48px);box-sizing:border-box}</style>');
 await page.evaluate(async()=>{
  window.footerMediaUrls={};
  for(const [aspect,[width,height]]of Object.entries({portrait:[120,208],landscape:[160,90],ultrawide:[240,60]})){
   const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d');ctx.fillStyle='#37516a';ctx.fillRect(0,0,width,height);
   ctx.fillStyle='#d6e6ee';ctx.font='12px sans-serif';ctx.fillText('RAM '+aspect,12,Math.min(height-12,90));
   const stream=c.captureStream(10),chunks=[],r=new MediaRecorder(stream,{mimeType:'video/webm'}),done=new Promise(resolve=>r.onstop=resolve);
   // Keep drawing RAM-only frames: a completely static canvas records one
   // zero-duration frame, which is intentionally rejected by the real player.
   r.ondataavailable=e=>chunks.push(e.data);r.start();let frame=0;
   const ticker=setInterval(()=>{ctx.fillStyle=++frame%2?'#d6e6ee':'#37516a';ctx.fillRect(0,0,1,1);},50);
   await new Promise(resolve=>setTimeout(resolve,600));clearInterval(ticker);r.stop();await done;stream.getTracks().forEach(t=>t.stop());
   window.footerMediaUrls[aspect]=URL.createObjectURL(new Blob(chunks,{type:'video/webm'}));
  }
 });
 await page.evaluate('(()=>{'+code+'})()');
 const reset=options=>page.evaluate(options=>footerReset(options),options);
 const widthReference=()=>page.evaluate(blocks=>{
  const style=document.querySelector('style'),current=style.textContent;
  style.textContent=blocks.reduce((text,block)=>text.replace(new RegExp(block),''),current);
  const metrics=multiFooterMetrics();style.textContent=current;return metrics;
 },[portraitBlock.source,compactOffBlock.source]);
 await check('Every generated/clip footer is transport-right first row and edit-right unified pill second row',async()=>{
  for(const clip of [false,true]){await reset({clip});const g=await page.evaluate(()=>footerGeometry());valid(g,1);
   assert.deepEqual(g.edits.buttons.map(b=>b.text),clip?['Trim','Replace','Crop']:['Trim','Crop','Edit']);
   const skin=await page.locator('.mmc-tl-card-edit-tools').evaluate(n=>({radius:getComputedStyle(n).borderRadius,border:getComputedStyle(n).borderTopWidth,
    padding:[...n.children].map(b=>parseFloat(getComputedStyle(b).paddingLeft)),font:[...n.children].map(b=>getComputedStyle(b).fontSize)}));
   assert.equal(skin.radius,'999px');assert.equal(skin.border,'1px');assert.ok(skin.padding.every(p=>p>6));assert.ok(skin.font.every(f=>f==='11px'));
  }
 });
 await check('Only generated Edit is ordinal-yellow and weight 600 on normal, hover and focus; existing edit neighbours keep their paint',async()=>{
  for(const language of ['en','ko','ja','zh'])for(const scale of [.8,1,1.6])for(const options of [{},{take:false},{clip:true}]){
   await reset({language,scale,...options});const before=await page.evaluate(()=>JSON.stringify(subject.timeline));
   const edit=page.locator('.mmc-tl-card-edit-action');assert.equal(await edit.count(),options.clip?0:1);
   if(!options.clip){
    assert.equal(await edit.evaluate(node=>node===node.parentElement.lastElementChild),true,'Edit remains rightmost');
    for(const state of ['normal','hover','focus']){
     if(state==='normal')await page.mouse.move(0,0);if(state==='hover')await edit.hover();if(state==='focus')await edit.focus();
     const g=await page.evaluate(()=>footerGeometry());valid(g,scale);
     const highlighted=g.edits.buttons.filter(b=>b.editAccent);assert.equal(highlighted.length,1);
     assert.equal(highlighted[0].color,g.accent);assert.equal(highlighted[0].weight,'600');
    }
   }else valid(await page.evaluate(()=>footerGeometry()),scale);
   assert.equal(await page.evaluate(()=>JSON.stringify(subject.timeline)),before);assert.equal(await page.evaluate(()=>subject.commits),0);
  }
 });
 await check('Actual Segment/Clip Add pair uses 13px labels and 16px plus with persistent yellow normal/hover/disabled paint and unchanged callbacks',async()=>{
  for(const width of [320,640,1600])for(const language of ['en','ko','ja','zh'])for(const scale of [.8,1,1.6])for(const disabled of [false,true]){
   await page.setViewportSize({width,height:1300});const before=await page.evaluate(options=>footerAddPair(options),{language,scale,disabled});
   const buttons=page.locator('.mmc-tl-add-pair > button');assert.equal(await buttons.count(),2);
   const inspect=()=>buttons.evaluateAll(nodes=>nodes.map(node=>{
    const s=getComputedStyle(node),plus=node.children[0],label=node.children[1],p=getComputedStyle(plus),l=getComputedStyle(label);
    const token=document.createElement('span');token.style.color='var(--mmc-accent)';node.append(token);const accent=getComputedStyle(token).color;token.remove();
    return{disabled:node.disabled,color:s.color,plus:p.color,label:l.color,plusFont:parseFloat(p.fontSize),labelFont:parseFloat(l.fontSize),text:label.textContent,accent,
     overflow:node.scrollWidth>node.clientWidth+1};
   }));
   for(let index=0;index<2;index++){
    const button=buttons.nth(index);await button.scrollIntoViewIfNeeded();
    for(const state of ['normal','hover']){
     if(state==='normal')await page.mouse.move(0,0);else await button.hover();
     for(const paint of await inspect()){
      assert.equal(paint.disabled,disabled);assert.equal(paint.color,paint.accent);assert.equal(paint.plus,paint.accent);assert.equal(paint.label,paint.accent);
      close(paint.plusFont,16*scale,'Add plus typography');close(paint.labelFont,13*scale,'Add label typography');assert.equal(paint.overflow,false,'Add labels remain bounded');
     }
    }
    if(disabled)await button.evaluate(node=>node.click());else await button.click();
   }
   assert.deepEqual(await page.evaluate(()=>subject.calls),disabled?[]:[['add'],['add-clip']]);
   assert.equal(await page.evaluate(()=>JSON.stringify(subject.timeline)),before);assert.equal(await page.evaluate(()=>subject.commits),0);
  }
  await page.setViewportSize({width:1200,height:1100});
 });
 await check('Locked/unlocked/missing/shared/no-take states retain two-row height and both group right anchors',async()=>{
  for(const language of ['en','ko','ja','zh'])for(const scale of [.8,1,1.6])for(const duration of [1,14.38,40]){
   let reference=null;
   for(const options of [{},{kept:false},{missing:true},{take:false},{shared:true},{edited:true},{face:true},{face:true,faceOff:true}]){
    await reset({language,scale,duration,...options});const g=await page.evaluate(()=>footerGeometry());valid(g,scale);
    // Existing status/seed min-width rules can widen a card independently of
    // its footer. Keep the right inset stable, not its old absolute left-origin x.
    const same={transportTop:g.transport.rect.top,editTop:g.edits.rect.top,transportRightInset:g.card.width-g.transport.rect.right,editRightInset:g.card.width-g.edits.rect.right};
    if(reference)for(const k of Object.keys(same))close(same[k],reference[k],language+' '+scale+' '+duration+' stable '+k);else reference=same;
    layouts.push({language,scale,duration,options,geometry:g});
   }
  }
 });
 await check('Short/normal/long clip and generated labels fit in compact/wide views for EN/KO/JA/ZH typography',async()=>{
  for(const width of [320,640,1600])for(const language of ['en','ko','ja','zh'])for(const scale of [.8,1,1.6])for(const clip of [false,true]){
   await page.setViewportSize({width,height:1300});await reset({language,scale,clip,duration:1});
   const g=await page.evaluate(()=>footerGeometry());valid(g,scale);layouts.push({width,language,scale,clip,geometry:g});
   for(const button of await page.locator('.mmc-tl-card-foot button').all()){
    await button.scrollIntoViewIfNeeded();assert.equal(await button.evaluate(n=>{const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return hit===n||n.contains(hit);}),true,'Each compact control remains reachable via existing horizontal strip');
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'No whole-page horizontal overflow');
  }
  await page.setViewportSize({width:1200,height:1100});
 });
 await check('Every conditional face/motion/take pill combination keeps a whole right-aligned status row and unchanged footer pill format',async()=>{
  const states=[{},{kept:false},{edited:true},{missing:true},{missing:true,kept:false},{take:false},{take:false,kept:false},{shared:true}];
  const variants=[{motion:false},{motion:true},{motion:true,fixed:true},{motion:false,face:true},{motion:true,face:true},{motion:true,face:true,faceOff:true}];
  for(const language of ['en','ko','ja','zh'])for(const scale of [.8,1,1.6])for(const state of states)for(const variant of variants){
   const options={language,scale,duration:1,...state,...variant};await reset(options);const footer=await page.evaluate(()=>footerGeometry());valid(footer,scale);
   const expectedEdits=state.shared||state.kept===false||state.missing||state.take===false?1:3;assert.equal(footer.edits.buttons.length,expectedEdits);
   const status=await page.evaluate(()=>{
    const card=document.querySelector('.mmc-tl-card'),row=card.querySelector('.mmc-tl-card-status'),c=card.getBoundingClientRect();if(!row)return null;
    const r=row.getBoundingClientRect();return{right:r.right-c.left,badges:[...row.children].map(n=>{const b=n.getBoundingClientRect(),s=getComputedStyle(n);return{class:n.className,left:b.left-c.left,right:b.right-c.left,cy:b.top+b.height/2,scroll:n.scrollWidth,width:n.clientWidth,font:parseFloat(s.fontSize)};})};
   });
   const expectedClasses=[...(!state.shared&&(state.take!==false||state.kept!==false)?['mmc-tl-card-state']:[]),...(variant.motion?['mmc-tl-card-motion']:[]),...(variant.face?['mmc-tl-card-face']:[])];
   if(!expectedClasses.length)assert.equal(status,null,'Absent statuses do not leave empty badges');
   else{
    assert.deepEqual(status.badges.map(b=>b.class.split(' ')[0]),expectedClasses);close(status.badges.at(-1).right,status.right,'Conditional status right anchor');
    for(let i=0;i<status.badges.length;i++){
     const b=status.badges[i];close(b.cy,status.badges[0].cy,'Status centre line');close(b.font,10*scale,'Existing status typography');
     assert.ok(b.scroll<=b.width+1&&b.left>=footer.card.padding&&b.right<=footer.card.width-footer.card.padding,'Whole contained conditional status '+JSON.stringify({options,b,card:footer.card}));
     if(i)close(b.left-status.badges[i-1].right,6,'Conditional status gap');
    }
   }
   layouts.push({options,conditionalStatus:status,conditionalFooter:footer});
  }
 });
 await check('Delete confirmation hides only its transport neighbours; right edit row and footer heights never jump',async()=>{
  for(const clip of [false,true])for(const language of ['en','ko','ja','zh'])for(const scale of [.8,1,1.6]){
   await reset({clip,language,scale,duration:1});const before=await page.evaluate(()=>footerGeometry()),data=await page.evaluate(()=>JSON.stringify(subject.timeline));
   await page.locator('.mmc-tl-card-transport > .mmc-asset-x').click();const armed=await page.evaluate(()=>footerGeometry());valid(armed,scale);
   close(armed.footer.height,before.footer.height,'Armed footer height');close(armed.edits.rect.top,before.edits.rect.top,'Armed edit row position');close(armed.edits.rect.right,before.edits.rect.right,'Armed edit group anchor');
   assert.ok(armed.transport.buttons.filter(b=>b.visible).length===1);assert.equal(await page.evaluate(()=>JSON.stringify(subject.timeline)),data);
   await page.locator('.mmc-tl-card').dispatchEvent('pointerleave');assert.equal(await page.locator('.mmc-asset-x.armed').count(),0);
   const restored=await page.evaluate(()=>footerGeometry());close(restored.footer.height,before.footer.height,'Dismiss height');valid(restored,scale);
  }
 });
 await check('Actual ready-preview controller grows after the footer without shifting either footer row or mutating card data',async()=>{
  for(const clip of [false,true])for(const kept of [false,true]){
   await reset({clip,kept});const before=await page.evaluate(()=>footerGeometry()),snapshot=await page.evaluate(()=>JSON.stringify(subject.timeline));
   await page.evaluate(()=>{subject.previewMode=true;subject.mount();});await page.waitForFunction(()=>document.querySelector('.mmc-card-preview-media')?.readyState>=2);
   const after=await page.evaluate(()=>footerGeometry());valid(after,1);assert.ok(after.card.height>before.card.height+80);
   close(after.footer.top,before.footer.top,'Preview footer offset');close(after.footer.height,before.footer.height,'Preview footer row height');
   assert.equal(await page.evaluate(()=>JSON.stringify(subject.timeline)),snapshot);
   await page.evaluate(()=>{for(const p of subject.cardPreviews)p.destroy();subject.cardPreviews.clear();subject.previewMode=false;subject.mount();});
   const restored=await page.evaluate(()=>footerGeometry());close(restored.footer.top,before.footer.top,'Preview closed footer offset');
  }
 });
 await check('Each edit and transport control keeps its original callback once and clip audio alone changes only sound',async()=>{
  for(const clip of [false,true]){
   await reset({clip});const before=await page.evaluate(()=>JSON.stringify(subject.timeline));
   for(const button of await page.locator('.mmc-tl-card-edit-tools > button').all())await button.click();
   assert.deepEqual(await page.evaluate(()=>subject.calls),clip?[['clip-trim',1],['replace',1],['clip-crop',1]]:[['trim',1],['crop',1],['edit',1]]);
   assert.equal(await page.evaluate(()=>JSON.stringify(subject.timeline)),before);assert.equal(await page.evaluate(()=>subject.commits),0);
   await page.evaluate(()=>{subject.calls=[];});
   for(const text of ['◀','▶'])await page.locator('.mmc-tl-card-transport > button').filter({hasText:text}).click();
   if(!clip)await page.locator('.mmc-tl-card-transport > button').filter({hasText:'⧉'}).click();
   assert.deepEqual(await page.evaluate(()=>subject.calls),clip?[['move',1,-1],['move',1,1]]:[['move',1,-1],['move',1,1],['duplicate',1]]);
   if(clip){await page.locator('.mmc-tl-card-transport > .mmc-ghost').first().click();const after=await page.evaluate(()=>JSON.parse(JSON.stringify(subject.timeline))),expected=JSON.parse(before);expected.segments[1].sound=false;assert.deepEqual(after,expected);}
  }
  await reset({clip:true,noAudio:true});const before=await page.evaluate(()=>JSON.stringify(subject.timeline));const audio=page.locator('.mmc-tl-card-transport > .mmc-ghost').first();assert.equal(await audio.isDisabled(),true);
  await audio.evaluate(n=>n.click());assert.equal(await page.evaluate(()=>JSON.stringify(subject.timeline)),before);
 });
 await check('Clip audio icon stays centred with its neighbours and only the present active sound state is red',async()=>{
  for(const language of ['en','ko','ja','zh'])for(const scale of [.8,1,1.6]){
   await reset({clip:true,language,scale,duration:1});
   const inspect=()=>page.locator('.mmc-tl-clip-sound').evaluate(node=>{
    const r=node.getBoundingClientRect(),svg=node.querySelector('svg').getBoundingClientRect(),style=getComputedStyle(node);
    const probe=document.createElement('span');probe.style.color='var(--mmc-bad)';node.parentElement.append(probe);const red=getComputedStyle(probe).color;probe.remove();
    const neighbours=[...node.parentElement.querySelectorAll(':scope > button')].map(n=>{const q=n.getBoundingClientRect();return{width:q.width,height:q.height,cy:q.top+q.height/2};});
    return{color:style.color,red,pressed:node.getAttribute('aria-pressed'),disabled:node.disabled,width:r.width,height:r.height,cx:r.left+r.width/2,cy:r.top+r.height/2,sx:svg.left+svg.width/2,sy:svg.top+svg.height/2,neighbours};
   });
   const active=await inspect();assert.equal(active.color,active.red);assert.equal(active.pressed,'true');
   close(active.cx,active.sx,'Audio horizontal centre');close(active.cy,active.sy,'Audio vertical centre');
   for(const neighbour of active.neighbours){close(neighbour.cy,active.cy,'Transport lower-row centre');close(neighbour.width,active.width,'Equal normal icon hitbox width');close(neighbour.height,active.height,'Equal normal icon hitbox height');}
   await page.locator('.mmc-tl-clip-sound').click();const muted=await inspect();assert.notEqual(muted.color,muted.red);assert.equal(muted.pressed,'false');assert.equal(await page.evaluate(()=>subject.commits),1);
   await page.locator('.mmc-tl-clip-sound').click();assert.equal((await inspect()).color,active.red);assert.equal(await page.evaluate(()=>subject.commits),2);
   await reset({clip:true,noAudio:true,language,scale});const absent=await inspect();assert.equal(absent.disabled,true);assert.notEqual(absent.color,absent.red);assert.equal(absent.pressed,'false');
  }
 });
 await check('The normal remove glyph uses the existing warning red without changing hitbox, background, hover geometry or two-press confirmation',async()=>{
  const glyphRule=/\/\* Only the unarmed remove glyph[^]*?\.mmc-tl-card-transport > \.mmc-asset-x:not\(\.armed\) \{ color: var\(--mmc-warn\); \}\r?\n/;
  assert.match(css,glyphRule,'EXT59 changes only the normal glyph colour declaration');
  for(const clip of [false,true])for(const language of ['en','ko','ja','zh'])for(const scale of [.8,1,1.6]){
   await reset({clip,language,scale,duration:1});const remove=page.locator('.mmc-tl-card-transport > .mmc-asset-x');
   const inspect=()=>remove.evaluate(node=>{
    const s=getComputedStyle(node),r=node.getBoundingClientRect(),probe=document.createElement('span');probe.style.color='var(--mmc-warn)';node.parentElement.append(probe);const warning=getComputedStyle(probe).color;probe.remove();
    // Unpainted border/outline colours inherit currentColor and necessarily
    // follow a glyph-only colour change. Compare their actual style/geometry.
    return{color:s.color,warning,properties:{width:r.width,height:r.height,padding:s.padding,bg:s.backgroundColor,borderWidth:s.borderWidth,borderStyle:s.borderStyle,outlineWidth:s.outlineWidth,outlineStyle:s.outlineStyle,outlineOffset:s.outlineOffset,font:s.font,fontFamily:s.fontFamily,display:s.display}};
   });
   await page.mouse.move(0,0);const normal=await inspect();assert.equal(normal.color,normal.warning);
   await remove.hover();const hover=await inspect();
   const originalStyle=await page.locator('style').first().textContent();
   await page.locator('style').first().evaluate((node,expression)=>{node.textContent=node.textContent.replace(new RegExp(expression,'m'),'');},glyphRule.source);
   await page.mouse.move(0,0);const without=await inspect();await remove.hover();const withoutHover=await inspect();
   assert.deepEqual(normal.properties,without.properties,'Colour-only normal glyph delta');assert.deepEqual(hover.properties,withoutHover.properties,'Hover geometry/background unchanged');
   await page.locator('style').first().evaluate((node,text)=>{node.textContent=text;},originalStyle);
   const before=await page.evaluate(()=>JSON.stringify(subject.timeline));await remove.click();assert.equal(await page.evaluate(()=>JSON.stringify(subject.timeline)),before);assert.equal(await page.evaluate(()=>subject.commits),0);
   const armed=await inspect();assert.equal(armed.color,armed.warning);assert.equal(await remove.getAttribute('class'),'mmc-asset-x armed');
   close(armed.properties.height,normal.properties.height,'Confirmation original height');
   await remove.click();assert.equal(await page.evaluate(()=>subject.timeline.segments.length),2);assert.equal(await page.evaluate(()=>subject.commits),1,'Only confirmed delete commits once');
  }
 });
 await check('Native Tab order follows transport-first/edit-second DOM rows and keyboard actions use the same callbacks',async()=>{
  for(const clip of [false,true]){
   await reset({clip});const expected=await page.locator('.mmc-tl-card-foot button:enabled').evaluateAll(nodes=>nodes.map(n=>n.textContent));
   const first=page.locator('.mmc-tl-card-foot button:enabled').first();await first.focus();const visited=[];
   for(let i=0;i<expected.length;i++){visited.push(await page.evaluate(()=>document.activeElement.textContent));if(i<expected.length-1)await page.keyboard.press('Tab');}
   assert.deepEqual(visited,expected);
   await page.locator('.mmc-tl-card-edit-tools > button').filter({hasText:clip?/^Trim$/:/^Edit$/}).focus();await page.keyboard.press('Enter');
   assert.deepEqual(await page.evaluate(()=>subject.calls),[clip?['clip-trim',1]:['edit',1]]);
   await reset({clip});await page.locator('.mmc-tl-card-transport > .mmc-asset-x').focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>subject.timeline.segments.length),3);
   await page.locator('.mmc-asset-x.armed').focus();await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>subject.timeline.segments.length),2);
  }
 });
 await check('Actual card navigator uses the same pill geometry/tokens as whole-strip locks at wide and compact typography',async()=>{
  for(const width of [320,640,1600])for(const language of ['en','ko','ja','zh'])for(const scale of [.8,1,1.6]){
   await page.setViewportSize({width,height:1300});await reset({language,scale});await page.evaluate(()=>footerNav());
   await page.mouse.move(0,0);
   const before=await page.evaluate(()=>JSON.stringify(subject.timeline));
   const geometry=await page.evaluate(()=>{
    const props=n=>{const s=getComputedStyle(n);return{padding:s.padding,gap:s.gap,radius:s.borderRadius,bg:s.backgroundColor,border:s.borderTopWidth,borderColor:s.borderTopColor,font:s.fontSize,fontFamily:s.fontFamily,height:s.height,minHeight:s.minHeight};};
    const nav=document.querySelector('.mmc-tl-jump-select'),lock=document.querySelector('.mmc-tl-holdall');return{nav:props(nav),lock:props(lock)};
   });
   assert.deepEqual(geometry.nav,geometry.lock,JSON.stringify({width,language,scale,geometry}));
   await page.locator('.mmc-tl-jump-select').click();assert.deepEqual(await page.evaluate(()=>subject.calls),[['navigator']]);assert.equal(await page.evaluate(()=>JSON.stringify(subject.timeline)),before);
  }
  await page.setViewportSize({width:1200,height:1100});
 });
 await check('Mixed actual pass/grid cards preserve own-card control anchors with compact Ready OFF and shared portrait/normal/wide Ready ON widths',async()=>{
  await page.setViewportSize({width:2400,height:1500});
  for(const language of ['en','ko','ja','zh'])for(const scale of [.8,1,1.6])for(const kept of [false,true])for(const aspects of [['portrait','landscape','ultrawide'],['ultrawide','portrait','landscape']]){
   await page.evaluate(options=>multiFooterReset(options),{language,scale,kept,aspects});
   const before=await page.evaluate(()=>multiFooterMetrics()),data=await page.evaluate(()=>JSON.stringify(subject.timeline));
   await page.evaluate(()=>{subject.previewMode=true;subject.mount();});
   await page.waitForFunction(()=>[...document.querySelectorAll('.mmc-card-preview-media')].every(n=>n.readyState>=2)&&document.querySelectorAll('.mmc-card-preview-media').length===3);
   const after=await page.evaluate(()=>multiFooterMetrics()),reference=await widthReference();
   for(let index=0;index<before.cards.length;index++){
    const context=JSON.stringify({language,scale,kept,aspects,index});
    fixedModeControls(after.cards[index],before.cards[index],'Mixed aspect Ready OFF/ON '+context);
    fixedPreview(after.cards[index],reference.cards[index],'Mixed aspect ON width reference '+context);assert.ok(after.cards[index].height>before.cards[index].height+25);
   }
   assert.deepEqual(after.merge,before.merge,'One-pass button stays in its original seam flow, not pushed down by tall previews');
   assert.equal(await page.evaluate(()=>JSON.stringify(subject.timeline)),data);
   await page.evaluate(()=>{subject.previewMode=false;subject.mount();});const restored=await page.evaluate(()=>multiFooterMetrics());
   assert.deepEqual(restored,before,'Closing Ready previews restores exactly the original multi-pass layout');
   layouts.push({language,scale,kept,aspects,mixedBefore:before,mixedAfter:after});
  }
  await page.evaluate(()=>multiFooterReset());const before=await page.evaluate(()=>JSON.parse(JSON.stringify(subject.timeline)));
  await page.locator('.mmc-tl-join-merge').click();const after=await page.evaluate(()=>JSON.parse(JSON.stringify(subject.timeline))),expected=before;expected.segments[1].merge=true;
  assert.deepEqual(after,expected);assert.equal(await page.evaluate(()=>subject.commits),1,'One-pass original callback commits only its target flag once');
  await page.setViewportSize({width:1200,height:1100});
 });
 await check('Face/motion pass toggles and an unready final Edit-only segment retain the same right footer rows beside ready generated cards',async()=>{
  await page.setViewportSize({width:2400,height:1500});
  for(const language of ['en','ko','ja','zh'])for(const scale of [.8,1,1.6])for(const kept of [false,true])for(const face of [false,true])for(const fixed of [false,true]){
   await page.evaluate(options=>multiFooterReset(options),{language,scale,kept,face,fixed,unreadyLast:true,aspects:['portrait','landscape','ultrawide']});
   const before=await page.evaluate(()=>multiFooterMetrics()),data=await page.evaluate(()=>JSON.stringify(subject.timeline));
   const edits=await page.locator('.mmc-tl-card-edit-tools').evaluateAll(groups=>groups.map(g=>[...g.children].map(n=>n.textContent)));
   assert.equal(edits[2].length,1,'Unready last generated card has Edit only');assert.ok(edits.slice(0,2).every(labels=>labels.length===(kept?3:1)),'Ready trim/crop availability follows the original take/hold condition');
   await page.evaluate(()=>{subject.previewMode=true;subject.mount();});await page.waitForFunction(()=>document.querySelectorAll('.mmc-card-preview-media').length===2&&[...document.querySelectorAll('.mmc-card-preview-media')].every(n=>n.readyState>=2));
   assert.equal(await page.locator('.mmc-card-preview-unavailable').count(),1,'Unready card never invents a video');
   const after=await page.evaluate(()=>multiFooterMetrics()),reference=await widthReference();
   for(let index=0;index<3;index++){
    const context=JSON.stringify({language,scale,kept,face,fixed,index});
    fixedModeControls(after.cards[index],before.cards[index],'Mixed ready/unready Ready OFF/ON '+context);
    fixedPreview(after.cards[index],reference.cards[index],'Mixed ready/unready ON width reference '+context);
   }
   assert.deepEqual(after.merge,before.merge);assert.equal(await page.evaluate(()=>JSON.stringify(subject.timeline)),data);
   await page.evaluate(()=>{subject.previewMode=false;subject.mount();});assert.deepEqual(await page.evaluate(()=>multiFooterMetrics()),before);
   layouts.push({language,scale,kept,face,fixed,unreadyLast:true,mixedBefore:before,mixedAfter:after});
  }
  await page.setViewportSize({width:1200,height:1100});
 });
 fs.mkdirSync(output,{recursive:true});
 for(const language of ['en','ko','ja','zh'])for(const clip of [false,true]){
  await reset({language,clip,scale:1.6,preview:true});await page.screenshot({path:path.join(output,'footer-'+language+'-'+(clip?'clip':'generated')+'-large.png')});
 }
 assert.equal(requests,0);assert.deepEqual(errors,[]);
 const report={sourceRoot:repo,baselineRoot:baseline,cssOrder,callbackReceipts,checks:results.length,results,layouts,requests,errors,
  limits:'Actual render methods/callback closures/CSS order; maintained read-only metadata adapter and actual RAM preview controller. No live ComfyUI, user files, API, workflow/profile mutation or GPU.'};
 fs.writeFileSync(path.join(output,'card-footer-layout-report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({passed:results.length,layouts:layouts.length,requests,errors,output}));await browser.close();
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1;});
