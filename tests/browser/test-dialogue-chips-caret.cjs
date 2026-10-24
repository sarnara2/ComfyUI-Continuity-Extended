// Production prompt/parser/view and CSS with only persistence/media adapters replaced.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.join(process.env.CONTINUITY_SOURCE_ROOT || path.resolve(__dirname,'../..'),'web/creator');
const read = file => fs.readFileSync(path.join(root,file),'utf8');
const strip = source => source.replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
const dom = read('dom.js');
const fn = name => {
  const found=dom.match(new RegExp(`export function ${name}\\([^]*?^\\}`, 'm'));
  assert.ok(found,name);return found[0].replace(/^export /,'');
};
const css=['base','editor','prompt'].map(name=>read(`styles/${name}.js`).match(/export const css = `([^]*)`;\s*$/)[1]).join('\n');
const code=`
${['el','svg','icon','keepScroll','floatAbove','mountOverlay'].map(fn).join('\n')}
${dom.match(/^export const ICONS =[^]*?^};/m)[0].replace(/^export /,'')}
const t=(text,values={})=>text.replace(/\\{([^}]+)\\}/g,(_,key)=>values[key]??key);
const localizeDiagnostic=text=>text;
const castFactsLine=()=>'', listPresets=async()=>[], loadBody=async()=>null, listAssets=async()=>[], viewUrl=()=>'';
const LANGUAGES=['English','Korean'], refineSettings=()=>({}), tagIndex=()=>0;
const citedSubjects=()=>new Set(), missingPromptHandles=()=>new Set(), subjectFiles=()=>[];
const layoutVariations=()=>({marks:[],off:[]}), isVisualReference=()=>false, previewable=()=>false;
const openReferencePreview=()=>{}, compiledTagNodes=text=>[document.createTextNode(text)],openCompiledTagPreview=()=>{};
${strip(read('dialogue.js'))}
${strip(read('dialogue-view.js'))}
${strip(read('prompt.js'))}
window.fixture=(text='', width=600)=>{
 window.box?.closeMenu();document.querySelector('#fixture')?.remove();
 window.edits=[];window.opened=[];window.cited=[];
 window.state={prompt:text,assets:[{handle:'img-1',filename:'one.png',kind:'image'}]};
 window.cast=[{handle:'subject',from:['img-1']},{handle:'subject_2',from:['img-1']}];
 window.box=new PromptBox({getState:()=>state,getCast:()=>cast,getPool:()=>[],
  onInput:value=>{state.prompt=value;edits.push(value)},onCited:handles=>cited.push(...handles),
  replaceHandles:true,onDialogueEdit:detail=>opened.push({...detail,box:null})});
 const host=el('div',{id:'fixture',class:'mmc-root',style:{width:width+'px'}},[box.frame]);
 document.body.append(host);box.setValue(text);
};
window.value=()=>box.getValue();
window.parseDialogue=parseDialogue;window.parseSpeech=parseSpeech;window.compiledBlocks=compiledBlocks;
window.readonly=text=>{document.querySelector('#readonly')?.remove();const p=el('p',{id:'readonly'},dialogueNodes(text));document.body.append(p);return p.textContent;};
window.selectAll=()=>{const range=document.createRange();range.selectNodeContents(box.root);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);};
fixture();`;
const value = () => window.value();
new vm.Script(code);
let browser;const checks=[];
const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name)};
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined});
 const page=await browser.newPage({viewport:{width:1000,height:800}}), errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>route.abort());
 await page.setContent(`<style>:root{--comfy-menu-bg:#171717;--fg-color:#ddd;--input-text:#ddd;--mmc-type:1;--mmc-accent:#ffb33d}body{background:#171717;color:#ddd}#fixture{margin:30px;padding:12px}.mmc-prompt{min-height:180px}${css}</style>`);
 await page.addScriptTag({content:code});
 await check('manual dialogue pill is exactly the d block, separate from speaker/reference chips',async()=>{
  const text='@subject_2 (S2) replies: <d>[Korean] 반갑습니다.</d> near @img-1.';
  await page.evaluate(text=>fixture(text),text);
  assert.equal(await page.evaluate(value),text);
  assert.equal(await page.locator('.mmc-dialogue').count(),1);
  assert.equal(await page.locator('.mmc-dialogue').getAttribute('data-say'),'<d>[Korean] 반갑습니다.</d>');
  assert.equal(await page.locator('.mmc-dialogue .mmc-dialogue-words').innerText(),'반갑습니다.');
  assert.equal(await page.locator('.mmc-dialogue [data-handle]').count(),0);
  assert.equal(await page.locator('.mmc-prompt [data-handle]').count(),2);
 });
 await check('canonical multi-speaker, multiline and experimental tags round-trip without consuming prefix',async()=>{
  const text='(S@subject,@subject_2) say together: <d>[Korean] <laughs> 안녕\n<deep breath> 반가워요.</d>';
  await page.evaluate(text=>fixture(text),text);
  assert.equal(await page.evaluate(value),text);
  const parsed=await page.evaluate(text=>parseSpeech(text,parseDialogue(text)[0]),text);
  assert.deepEqual(parsed.who,['subject','subject_2']);assert.equal(parsed.start,0);assert.equal(parsed.end,text.length);
  assert.equal(parsed.words,'<laughs> 안녕\n<deep breath> 반가워요.');
  assert.equal(await page.locator('.mmc-prompt [data-handle]').count(),2);
  assert.equal(await page.locator('.mmc-speaker-token').innerText(),'@subject, @subject_2');
 });
 await check('editing binds the nearest speaker event, preserving earlier natural sounds and manual speaker events',async()=>{
  const cases=[
   '(S@subject) laughs. (S@subject_2) replies: <d>[Korean] 안녕.</d>',
   '@subject (S1) pauses. @subject_2 (S2) replies: <d>[Korean] 안녕.</d>',
   '(S@subject) lets out a deep, audible sigh. (S@subject_2) whispers, <d>[Korean] 안녕.</d>',
   '(S@subject_2) lets out a deep, audible sigh. (S@subject_2) replies: <d>[Korean] 안녕.</d>',
  ];
  for(const text of cases){
   await page.evaluate(text=>fixture(text),text);await page.locator('.mmc-prompt .mmc-dialogue').click();
   const detail=await page.evaluate(()=>opened[0]);assert.deepEqual(detail.speech.who,['subject_2']);
   const expected=text.includes('@subject_2 (S2)')?'@subject_2 (S2)':'(S@subject_2)';
   assert.equal(detail.speech.start,text.lastIndexOf(expected));
   await page.evaluate(()=>{const d=opened[0];box.replaceRange(d.speech,'(S@subject_2) says: <d>[Korean] 수정.</d>');});
   assert.ok((await page.evaluate(value)).startsWith(text.slice(0,detail.speech.start)));
  }
 });
 await check('the lips-closed tail belongs only to voiceover, ordinary dialogue keeps following authored prose',async()=>{
  const tail=' while their lips remain completely closed.';
  for(const lead of ['says:','says in an off-screen voiceover:']){
   const text='(S@subject) '+lead+' <d>[Korean] 안녕.</d>'+tail;
   const speech=await page.evaluate(text=>parseSpeech(text,parseDialogue(text)[0]),text);
   assert.equal(speech.end,lead.includes('voiceover')?text.length:text.indexOf('</d>')+4);
  }
 });
 await check('multiple and unfinished dialogue openers never swallow ordinary text or following tags',async()=>{
  const text='<d>unfinished @img-1 text\n<d>[English] Complete</d> <d>[Korean] 미완성 @subject';
  await page.evaluate(text=>fixture(text),text);
  assert.equal(await page.evaluate(value),text);
  assert.equal(await page.locator('.mmc-dialogue-incomplete').count(),2);
  assert.equal(await page.locator('.mmc-dialogue').count(),1);
  assert.equal(await page.locator('.mmc-prompt [data-handle]').count(),2);
  assert.equal(await page.locator('.mmc-dialogue-incomplete').first().getAttribute('data-say'),'<d>');
 });
 await check('blank lines inside spoken text do not split the model-read dialogue into separate blocks',async()=>{
  const blocks=await page.evaluate(()=>compiledBlocks('summary: A conversation.\n\ndetailed_description: <d>[Korean] 첫 문장.\n\n둘째 문장.</d>'));
  assert.equal(blocks.length,2);assert.equal(blocks[1].value,'<d>[Korean] 첫 문장.\n\n둘째 문장.</d>');
 });
 await check('raw markup is escaped, readonly and editable views show the same spoken words',async()=>{
  const text='<d>[English] <img src=x onerror=alert(1)> <sighs> hello</d>';
  await page.evaluate(text=>{fixture(text);readonly(text)},text);
  assert.equal(await page.locator('.mmc-dialogue img').count(),0);
  assert.deepEqual(await page.locator('.mmc-dialogue-words').allTextContents(),[
   '<img src=x onerror=alert(1)> <sighs> hello','<img src=x onerror=alert(1)> <sighs> hello']);
  assert.equal(await page.evaluate(value),text);
 });
 await check('dialogue click opens composer with exact d range and full stable-speaker edit range',async()=>{
  const text='Scene. (S@subject) whispers, <d>[Korean] 안녕.</d> Finish.';
  await page.evaluate(text=>fixture(text),text);await page.locator('.mmc-prompt .mmc-dialogue').click();
  const detail=await page.evaluate(()=>opened[0]);assert.equal(detail.start,text.indexOf('<d>'));
  assert.equal(detail.end,text.indexOf('</d>')+4);assert.equal(detail.speech.start,7);
  assert.equal(detail.speech.raw,'(S@subject) whispers, <d>[Korean] 안녕.</d>');
  assert.equal(await page.evaluate(value),text);
  await page.locator('.mmc-prompt .mmc-dialogue').focus();await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>opened.length),2);
 });
 await check('plain-text copy preserves original H3 syntax, cut updates exactly once',async()=>{
  const text='@subject (S1) says: <d>[Korean] <laughs> 안녕.</d>';
  await page.evaluate(text=>fixture(text),text);
  const copy=await page.evaluate(()=>{selectAll();const data=new DataTransfer();box.root.dispatchEvent(new ClipboardEvent('copy',{bubbles:true,cancelable:true,clipboardData:data}));return data.getData('text/plain');});
  assert.equal(copy,text);
  const cut=await page.evaluate(()=>{selectAll();const data=new DataTransfer();box.root.dispatchEvent(new ClipboardEvent('cut',{bubbles:true,cancelable:true,clipboardData:data}));return {copy:data.getData('text/plain'),text:value(),edits:edits.length};});
  assert.deepEqual(cut,{copy:text,text:'',edits:1});
 });
 await check('native Range endpoints inside dialogue snap outward for copy and cut in both directions',async()=>{
  const text='Before <d>[Korean] 안녕하세요.</d> after';
  const dStart=text.indexOf('<d>'), dEnd=text.indexOf('</d>')+4;
  for(const mode of ['inside','inside-out','out-inside']){
   await page.evaluate(text=>fixture(text),text);
   const selected=await page.evaluate(mode=>{
    const words=box.root.querySelector('.mmc-dialogue-words').firstChild;
    const first=box.root.firstChild,last=box.root.lastChild;
    const range=document.createRange();
    range.setStart(mode==='out-inside'?first:words,mode==='out-inside'?3:1);
    range.setEnd(mode==='inside-out'?last:words,mode==='inside-out'?3:3);
    const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
    const spot=box.captureInsertion(),data=new DataTransfer();
    box.root.dispatchEvent(new ClipboardEvent('copy',{bubbles:true,cancelable:true,clipboardData:data}));
    const copied=data.getData('text/plain');
    box.root.dispatchEvent(new ClipboardEvent('cut',{bubbles:true,cancelable:true,clipboardData:data}));
    return{spot,copied,text:value(),edits:edits.length};
   },mode);
   const start=mode==='out-inside'?3:dStart,end=mode==='inside-out'?dEnd+3:dEnd;
   assert.deepEqual(selected,{spot:{start,end},copied:text.slice(start,end),text:text.slice(0,start)+text.slice(end),edits:1});
  }
 });
 await check('native selections inside reference and stable-speaker labels preserve whole source tokens',async()=>{
  for(const text of ['@img-1','(S@subject)']){
   await page.evaluate(text=>fixture(text),text);
   const got=await page.evaluate(()=>{
    const words=box.root.querySelector('[data-handle]').firstChild,range=document.createRange();
    range.setStart(words,1);range.setEnd(words,3);const selection=getSelection();
    selection.removeAllRanges();selection.addRange(range);
    const spot=box.captureInsertion(),data=new DataTransfer();
    box.root.dispatchEvent(new ClipboardEvent('copy',{bubbles:true,cancelable:true,clipboardData:data}));
    range.collapse(true);selection.removeAllRanges();selection.addRange(range);
    return{spot,copied:data.getData('text/plain'),collapsed:box.captureInsertion()};
   });
   assert.deepEqual(got,{spot:{start:0,end:text.length},copied:text,collapsed:{start:0,end:0}});
  }
 });
 await check('range insertion replaces only selected text and carries ordinary citation notifications',async()=>{
  await page.evaluate(()=>{fixture('Before middle after');box.replaceRange({start:7,end:13},'(S@subject) says: <d>[Korean] 안녕.</d>');});
  assert.equal(await page.evaluate(value),'Before (S@subject) says: <d>[Korean] 안녕.</d> after');
  assert.deepEqual(await page.evaluate(()=>({edits:edits.length,cited,spot:box.captureInsertion()})),{
   edits:1,cited:['subject'],spot:{start:44,end:44}});
 });
 const gap=async(text,handle,width=600)=>{
  await page.evaluate(({text,width})=>fixture(text,width),{text,width});
  const chip=page.locator('.mmc-prompt > [data-handle="'+handle+'"]');
  const rect=await chip.boundingBox();const style=await chip.evaluate(n=>({margin:parseFloat(getComputedStyle(n).marginLeft),cursor:getComputedStyle(n.parentElement).cursor}));
  assert.ok(style.margin>=10);assert.equal(style.cursor,'text');
  await page.mouse.click(rect.x-6,rect.y+rect.height/2);await page.keyboard.type('X');
  assert.equal(await page.evaluate(value),text.replace('@'+handle,'X@'+handle));
 };
 await check('10px caret lane works before the first tag and the tag body still opens its normal action',async()=>{
  await gap('@img-1','img-1');
  await page.evaluate(()=>{fixture('@subject');box.hooks.onCastChip=()=>opened.push('cast');box.hooks.replaceHandles=false;});
  await page.locator('.mmc-prompt > [data-handle]').click();assert.equal(await page.evaluate(()=>opened[0]),'cast');
 });
 await check('caret lane also works at explicit newlines and auto-wrapped tag starts without raw whitespace',async()=>{
  await gap('First line\n@img-1','img-1');
  await gap('An introductory phrase ending with @img-1','img-1',240);
  assert.equal((await page.evaluate(value)).includes('\u200b'),false);
 });
 await check('dialogue chip leading lane accepts text before it, long dialogue wraps inside the field',async()=>{
  const text='<d>[Korean] '+('긴 대사를 입력합니다. '.repeat(30))+'</d>';
  await page.evaluate(text=>fixture(text,250),text);
  const chip=page.locator('.mmc-prompt .mmc-dialogue'),rect=await chip.evaluate(n=>{const r=n.getClientRects()[0],words=document.createRange();words.selectNodeContents(n.querySelector('.mmc-dialogue-words'));return{x:r.left,y:r.top,w:r.width,h:r.height,count:words.getClientRects().length,scroll:n.parentElement.scrollWidth,client:n.parentElement.clientWidth,overflow:n.parentElement.scrollWidth>n.parentElement.clientWidth+1};});
  assert.ok(rect.count>1);assert.equal(rect.overflow,false,JSON.stringify(rect));
  await page.mouse.click(rect.x-6,rect.y+12);await page.keyboard.type('X');
  assert.equal(await page.evaluate(value),'X'+text);
 });
 await check('IME Enter is not consumed and collapsed selection offsets do not include caret pads',async()=>{
  await page.evaluate(()=>fixture('@img-1\n@subject'));
  const result=await page.evaluate(()=>{box.placeCaret(7);const e=new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true});box.root.dispatchEvent(e);return{prevented:e.defaultPrevented,spot:box.captureInsertion(),text:value()};});
  assert.deepEqual(result,{prevented:false,spot:{start:7,end:7},text:'@img-1\n@subject'});
 });
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'PASS',checks:checks.length}));
 await browser.close();
})().catch(async error=>{console.error(error);await browser?.close();process.exitCode=1;});
