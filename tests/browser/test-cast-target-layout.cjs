// Actual Cast member description/replacement rows and callback closures, with
// production locale modules/state and ordered CSS. RAM-only people/metadata;
// no file, library, picker, model, media or live server requests.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=require('./test-face-card-ownership.cjs'),{fixture,read,method,setupSubject}=base;
const output=path.resolve(process.env.CONTINUITY_ARTIFACT_DIR||path.join(os.tmpdir(),'continuity-cast-target'));
const cast=read('cast.js');
const adapter=`
const {el}=D;const {t}=I;
class CastTargetOwner {
 ${['descriptionField','placeRow'].map(name=>method(name,cast)).join('\n')}
 constructor(){this.calls=[];this.touches=0;this.blurs=0;this.assets=[{handle:'clip-one',kind:'video',takes:'edit',filename:'RAM.mp4'}];}
 getAssets(){return this.assets;}touch(){this.touches++;}renderSoon(){this.blurs++;}
 pickPlace(anchor,member,clips){this.calls.push({anchor:anchor.className,member:member.handle,clips:clips.map(a=>a.handle)});}
}
window.mountCastTarget=(options={})=>{
 window.timelineSubject?.clearCardPreviews();window.timelineSubject?.summaryFit?.disconnect();document.querySelectorAll('.mmc-overlay').forEach(n=>n.remove());
 window.language=options.language||'en';document.documentElement.style.setProperty('--mmc-type',String(options.scale||1));
 window.castTargetOwner=new CastTargetOwner();window.castTargetMember={handle:'anna',description:'Original words',replaces_what:'Original target',from:[],...(options.held?{replaces:['clip-one']}: {})};
 window.castTargetSibling={handle:'other',description:'Sibling words',replaces_what:'Sibling target'};
 const ident=D.el('div',{class:'mmc-cast-ident'},[castTargetOwner.descriptionField(castTargetMember),...castTargetOwner.placeRow(castTargetMember)]);
 const root=D.el('div',{class:'mmc-root cast-target-host'},[D.el('div',{class:'mmc-cast-card open'},[ident])]);
 document.body.replaceChildren(root);return JSON.stringify({member:castTargetMember,sibling:castTargetSibling});
};
window.castTargetGeometry=()=>{
 const row=document.querySelector('.mmc-cast-place'),left=row.querySelector('.mmc-cast-place-label'),label=left.firstElementChild,controls=left.lastElementChild,clip=controls.lastElementChild;
 const rect=n=>{const r=n.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
 const typography=n=>{const s=getComputedStyle(n);return{family:s.fontFamily,size:s.fontSize,weight:s.fontWeight,color:s.color};};
 return{description:rect(document.querySelector('.mmc-cast-description input')),input:rect(row.querySelector('input')),left:rect(left),label:rect(label),labelTypography:typography(label),controls:rect(controls),pills:[...controls.children].map(n=>{const s=getComputedStyle(n);return{box:rect(n),radius:s.borderRadius,borders:[s.borderTopWidth,s.borderRightWidth,s.borderBottomWidth,s.borderLeftWidth],padding:[s.paddingTop,s.paddingRight,s.paddingBottom,s.paddingLeft],background:s.backgroundColor,typography:typography(n),tag:n.tagName,text:n.textContent};}),clip:rect(clip),overflow:document.documentElement.scrollWidth>innerWidth+1,rowOverflow:row.scrollWidth>row.clientWidth+1};
};
`;
const checks=[],layouts=[],longClipLayouts=[];let browser;
const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name);};
const assertTargetControls=(current,options)=>{
 const [title,picker]=current.pills,detail=JSON.stringify({options,current});
 assert.equal(title.tag,'SPAN',detail);assert.equal(title.radius,'0px',detail);
 assert.deepEqual(title.borders,['0px','0px','0px','0px'],detail);assert.deepEqual(title.padding,['0px','0px','0px','0px'],detail);
 assert.equal(title.background,'rgba(0, 0, 0, 0)',detail);assert.deepEqual(title.typography,current.labelTypography,detail);
 assert.equal(picker.tag,'BUTTON',detail);assert.equal(picker.radius,'999px',detail);
 assert.ok(current.pills.every(p=>p.box.left>=current.left.left-1&&p.box.right<=current.left.right+1),detail);
 assert.ok(title.box.right+5.8<=picker.box.left,'Title and picker do not overlap '+detail);
 assert.ok(Math.abs((title.box.top+title.box.bottom)/2-(picker.box.top+picker.box.bottom)/2)<1,'Different-height title and picker remain center-aligned '+detail);
 assert.ok(current.pills.every(p=>p.box.top>=current.controls.top-1&&p.box.bottom<=current.controls.bottom+1),detail);
};
(async()=>{
 fs.mkdirSync(output,{recursive:true});browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined});
 const context=await browser.newContext({viewport:{width:1600,height:900}}),page=await setupSubject(context);
 await page.addStyleTag({content:'body{margin:24px}.cast-target-host{width:calc(100vw - 48px);max-width:1100px}'});
 await page.evaluate('(()=>{'+adapter+'})()');
 const mount=options=>page.evaluate(options=>mountCastTarget(options),options);
 await check('Replacement label owns the immediately lower plain target-kind title and clip-selection pill, before the input',async()=>{
  const before=await mount({language:'ko'});const value=await page.evaluate(()=>({order:[...document.querySelector('.mmc-cast-place').children].map(n=>n.className),left:[...document.querySelector('.mmc-cast-place-label').children].map(n=>n.className),pills:[...document.querySelector('.mmc-cast-place-controls').children].map(n=>({text:n.textContent,tag:n.tagName,tab:n.getAttribute('tabindex')})),snapshot:JSON.stringify({member:castTargetMember,sibling:castTargetSibling})}));
  assert.deepEqual(value.order,['mmc-cast-place-label','mmc-cast-desc mmc-cast-replaces']);assert.deepEqual(value.left,['mmc-cast-of','mmc-cast-place-controls']);
  assert.deepEqual(value.pills.map(n=>n.text),['대상 클립','클립 선택']);assert.equal(value.pills[0].tag,'SPAN');assert.equal(value.pills[0].tab,null);assert.equal(value.pills[1].tag,'BUTTON');assert.equal(value.snapshot,before);
 });
 await check('Both inputs start at the same closer column; controls remain below the title and bounded at 320–1600, all locales and scales',async()=>{
  for(const width of [320,640,1600])for(const language of ['en','ko','ja','zh'])for(const scale of [.8,1,1.6]){
   await page.setViewportSize({width,height:900});await mount({language,scale});const current=await page.evaluate(()=>castTargetGeometry());
   assert.ok(Math.abs(current.description.left-current.input.left)<1,JSON.stringify({width,language,scale,current}));assert.equal(current.overflow,false);assert.equal(current.rowOverflow,false);assert.ok(current.controls.top>=current.label.bottom+5.8);
   assertTargetControls(current,{width,language,scale});
   const prior=await page.addStyleTag({content:'.mmc-cast-description-label,.mmc-cast-ident > .mmc-cast-place > .mmc-cast-place-label{flex-basis:14em}'});const old=await page.evaluate(()=>castTargetGeometry());await prior.evaluate(n=>n.remove());
   if(width===1600)assert.ok(current.input.left<old.input.left,'Both fields move closer to their label, not rightward');
   layouts.push({width,language,scale});if(language==='ko'&&scale===1.6&&(width===640||width===1600))await page.screenshot({path:path.join(output,'cast-target-'+width+'-ko-large.png'),fullPage:true});
  }
 });
 await check('Original description/target input, pointer, blur and clip callbacks keep their exact member ownership',async()=>{
  await page.setViewportSize({width:1600,height:900});await mount({});
  await page.locator('.mmc-cast-description input').fill('Edited description');await page.locator('.mmc-cast-replaces').fill('Edited target');await page.locator('.mmc-cast-place-clip').click();
  const value=await page.evaluate(()=>({member:castTargetMember,sibling:castTargetSibling,touches:castTargetOwner.touches,blurs:castTargetOwner.blurs,calls:castTargetOwner.calls}));
  assert.equal(value.member.description,'Edited description');assert.equal(value.member.replaces_what,'Edited target');assert.equal(value.touches,2);assert.ok(value.blurs>=2);assert.equal(value.sibling.description,'Sibling words');assert.equal(value.sibling.replaces_what,'Sibling target');assert.deepEqual(value.calls,[{anchor:'mmc-cast-place-clip',member:'anna',clips:['clip-one']}]);
 });
 await check('Selected long clip handles wrap within the left column; no-clips/no-replacement keeps the existing omitted-row contract',async()=>{
  for(const width of [320,640,1600])for(const language of ['en','ko','ja','zh'])for(const scale of [.8,1,1.6]){
   await page.setViewportSize({width,height:900});await mount({language,scale,held:true});
   const result=await page.evaluate(()=>{castTargetMember.replaces=['a-very-long-registered-video-handle','other-registered-video-handle'];const root=document.querySelector('.mmc-cast-place');root.replaceWith(...castTargetOwner.placeRow(castTargetMember));const geometry=castTargetGeometry();const button=document.querySelector('.mmc-cast-place-clip'),clipFits=button.scrollWidth<=button.clientWidth+1&&button.scrollHeight<=button.clientHeight+1;castTargetOwner.assets=[];castTargetMember.replaces=[];return{geometry,clipFits,empty:castTargetOwner.placeRow(castTargetMember).length};});
   assert.equal(result.geometry.rowOverflow,false);assert.equal(result.geometry.overflow,false);assert.equal(result.clipFits,true);assert.equal(result.empty,0);
   assertTargetControls(result.geometry,{width,language,scale,held:true});longClipLayouts.push({width,language,scale});
  }
 });
 assert.equal(fixture.errors.length,0,JSON.stringify(fixture.errors));assert.equal(fixture.getRequests(),0);fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({checks,layouts,longClipLayouts,requests:0,errors:[]},null,2));console.log(JSON.stringify({passed:checks.length,layouts:layouts.length,longClipLayouts:longClipLayouts.length,requests:0,errors:0}));
})().finally(async()=>{await browser?.close();}).catch(error=>{console.error(error);process.exitCode=1;});
