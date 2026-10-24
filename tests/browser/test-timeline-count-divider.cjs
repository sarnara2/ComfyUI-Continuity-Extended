// Actual disclosure/count/DOM/i18n helpers and ordered CSS. The divider is
// presentation only: no model/API, picker, user workflow, media or GPU work.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sourceRoot = process.env.CONTINUITY_SOURCE_ROOT
  ? path.resolve(process.env.CONTINUITY_SOURCE_ROOT) : path.resolve(__dirname, '../..');
const root = path.join(sourceRoot, 'web/creator');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const stripModule = text => text.replace(/^import\b[^]*?;\r?\n/gm, '').replace(/^export /gm, '');
const baselineRoot = process.env.CONTINUITY_BASELINE_DIR
  ? path.resolve(process.env.CONTINUITY_BASELINE_DIR) : path.resolve(sourceRoot, '../baseline');
const hasBaseline = fs.existsSync(path.join(baselineRoot, 'web/creator/styles/timeline.js'));
if (process.env.CONTINUITY_BASELINE_DIR) assert.ok(hasBaseline, 'Explicit baseline must exist');
const cssSource = read('styles/timeline.js');
const cssNames = [...read('styles.js').matchAll(/import \{ css as \w+ \} from "\.\/styles\/(\w+)\.js";/g)].map(match => match[1]);
const css = cssNames.map(name => read(`styles/${name}.js`).match(/export const css = `([^]*)`;\s*$/)[1]).join('\n');
const normalize = text => text.replace(/\r\n/g, '\n');
if (hasBaseline) {
  // This patch is CSS-only. All Python, JS behavior and other CSS owners must
  // remain byte-exact; new fixture/docs are not product behavior.
  const visit = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (['.git', '__pycache__'].includes(entry.name)) return [];
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? visit(file) : entry.isFile() ? [file] : [];
  });
  for (const file of visit(baselineRoot)) {
    const rel = path.relative(baselineRoot, file).split(path.sep).join('/');
    if ((rel.endsWith('.py') && !rel.startsWith('tests/'))
        || (rel.startsWith('web/') && rel.endsWith('.js') && rel !== 'web/creator/styles/timeline.js')) {
      assert.deepEqual(fs.readFileSync(path.join(sourceRoot, rel)), fs.readFileSync(file), 'Unchanged product owner ' + rel);
    }
  }
  const main = /\/\* Separate interactive actions[^]*?(?=\.mmc-tl-modal \.mmc-tl-section-head-leading \.mmc-tl-section-actions > button \{)/;
  const compact = /  \/\* Counts occupy their own row here[^]*?::before \{ display: none; \}\n/;
  let recovered = normalize(cssSource);
  assert.equal(recovered.match(main)?.length, 1, 'One exact new divider block');
  recovered = recovered.replace(main, '');
  assert.equal(recovered.match(compact)?.length, 1, 'One exact new compact override');
  recovered = recovered.replace(compact, '');
  assert.equal(recovered, normalize(fs.readFileSync(path.join(baselineRoot, 'web/creator/styles/timeline.js'), 'utf8')),
    'Original complete Timeline CSS recovered after only the requested divider');
}
const code = `
${read('dom.js').match(/^export function el\([^]*?^\}/m)[0].replace(/^export /, '')}
${['ko','ja','zh'].map(locale => stripModule(read('locales/' + locale + '.js'))).join('\n')}
${stripModule(read('i18n.js'))}
${stripModule(read('disclosure.js'))}
${stripModule(read('media-counts.js'))}
window.app = { extensionManager: { setting: { get: () => window.fixtureLocale } } };
window.fixtureLocale = 'en';
window.fixtureState = { prompt: 'Keep source', soundscape: 'Room tone', music: 'N/A',
  segments: [{name:'Original',refined:{prompt:'Accepted'},sample:{duration:14.38}}] };
window.actionsClicked = { add: 0, person: 0, library: 0 };
window.mountFixture = (locale, scale, mode = 'many') => {
  window.fixtureLocale = locale;
  document.body.replaceChildren();
  const modal = el('div', {class:'mmc-tl-modal',style:{position:'static',width:'100%',maxWidth:'none',
    height:'auto',maxHeight:'none',overflow:'visible',padding:'0',boxSizing:'border-box','--mmc-type':String(scale)}});
  const assets = mode === 'empty' ? [] : [
    ...Array.from({length:6},(_,i)=>({handle:'image-'+i,kind:'image',filename:'image-'+i+'.png'})),
    ...Array.from({length:5},(_,i)=>({handle:'video-'+i,kind:'video',filename:'video-'+i+'.mp4'})),
    ...Array.from({length:3},(_,i)=>({handle:'audio-'+i,kind:'audio',filename:'audio-'+i+'.wav'})),
    {kind:'image',filename:'refmod:test'},{kind:'other',filename:'other.bin'}];
  const add = el('button',{type:'button',class:'mmc-ghost',text:'+ '+t('Add'),onclick:()=>actionsClicked.add++});
  const person = el('button',{type:'button',class:'mmc-ghost',text:'+ '+t('Add someone'),onclick:()=>actionsClicked.person++});
  const library = el('button',{type:'button',class:'mmc-ghost',text:t('Library'),onclick:()=>actionsClicked.library++});
  const refs = createDisclosure({title:t('Piece references'),actionsBeforeHint:true,actions:[add]});
  refs.setHintNodes(mediaCountPills(assets));
  const cast = createDisclosure({title:t('Cast'),actionsBeforeHint:true,actions:[person,library]});
  cast.setHintNodes(mediaCountPills(assets,{supportingImages:true}));
  const noActions = createDisclosure({title:'No actions',actionsBeforeHint:true});
  noActions.setHintNodes(mediaCountPills(assets));
  const plain = createDisclosure({title:'overall_soundscape',hint:'Plain text',actionsBeforeHint:true,
    actions:[el('button',{text:'N/A',type:'button'})]});
  const ordinary = createDisclosure({title:'Ordinary disclosure',actions:[el('button',{text:'Add',type:'button'})]});
  ordinary.setHintNodes(mediaCountPills(assets));
  modal.append(refs.root,cast.root,noActions.root,plain.root,ordinary.root);
  const outside = createDisclosure({title:'Node-face scope',actionsBeforeHint:true,
    actions:[el('button',{text:'Add',type:'button'})]});
  outside.setHintNodes(mediaCountPills(assets));
  document.body.append(modal,outside.root);
  window.fixture = {modal,refs,cast,noActions,plain,ordinary,outside,add,person,library,assets};
};
`;
new vm.Script(code, { filename: 'count-divider-fixture.js' });
const results = [], layouts = [];
let browser, requests = 0;
const pageErrors = [];
async function check(name, fn) { await fn(); results.push({name,passed:true}); }
const output = path.resolve(process.env.CONTINUITY_ARTIFACT_DIR || process.env.CONTINUITY_UX_SCREENSHOT_DIR
  || path.join(os.tmpdir(), 'continuity-count-divider'));
assert.ok(output !== sourceRoot && !output.startsWith(sourceRoot + path.sep), 'Evidence must be outside product');
(async () => {
  browser = await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH || undefined,headless:true});
  const page = await browser.newPage({viewport:{width:1600,height:950}});
  page.on('pageerror', error => pageErrors.push(String(error)));
  await page.route('**/*', route => {requests++;return route.abort();});
  await page.setContent('<html><head><style>'+css+'</style></head><body style="margin:12px;background:#191919;font-family:Arial;--mmc-surface:#242424;--mmc-surface-2:#333;--mmc-surface-3:#444;--mmc-text:#eee;--mmc-dim:#bbb;--mmc-line:#555;--mmc-line-2:#777;--mmc-accent:#acf;--mmc-type:1"></body></html>');
  await page.evaluate('(() => {'+code+'})()');
  await check('Only Timeline leading count groups with actions receive the decorative divider; all behavior owners are unchanged', async () => {
    assert.ok(cssNames.length > 5, 'Real ordered styles owner list');
    await page.evaluate(()=>mountFixture('en',1));
    const styles = await page.evaluate(()=>Object.fromEntries(['refs','cast','noActions','plain','ordinary','outside'].map(key=>{
      const hint=fixture[key].root.querySelector('.mmc-tl-section-hint');
      return [key,getComputedStyle(hint,'::before').content];
    })));
    assert.deepEqual(styles,{refs:'""',cast:'""',noActions:'none',plain:'none',ordinary:'none',outside:'none'});
  });
  await check('Normal and enlarged EN/KO/JA/ZH at 1600/900/640/320 retain bounded actions, counts and the intended responsive rule', async () => {
    for (const width of [1600,900,640,320]) for (const locale of ['en','ko','ja','zh']) for (const scale of [1,1.5]) {
      await page.setViewportSize({width,height:950});
      await page.evaluate(({locale,scale})=>mountFixture(locale,scale),{locale,scale});
      const rows = await page.evaluate(()=>['refs','cast'].map(key=>{
        const d=fixture[key],hint=d.root.querySelector('.mmc-tl-section-hint'),actions=d.head.querySelector('.mmc-tl-section-actions');
        const r=d.root.getBoundingClientRect(),h=hint.getBoundingClientRect(),a=actions.getBoundingClientRect(),p=getComputedStyle(hint,'::before');
        return {key,width:innerWidth,overflow:d.root.scrollWidth>d.root.clientWidth+1,
          hintsOverflow:hint.scrollWidth>hint.clientWidth+1,buttons:[...actions.children].map(button=>{const b=button.getBoundingClientRect();return {inside:b.left>=r.left-1&&b.right<=r.right+1,rounded:parseFloat(getComputedStyle(button).borderRadius)>=20};}),
          content:p.content,display:p.display,position:p.position,pointerEvents:p.pointerEvents,pseudoWidth:p.width,pseudoHeight:p.height,gradient:p.backgroundImage,
          paddingLeft:getComputedStyle(hint).paddingLeft,ownRow:h.top>=a.bottom-1,nonInteractive:d.root.querySelectorAll('.mmc-media-counts button,[role="separator"]').length===0};
      }));
      for (const row of rows) {
        assert.equal(row.overflow,false,JSON.stringify({width,locale,scale,row}));
        assert.equal(row.hintsOverflow,false,JSON.stringify({width,locale,scale,row}));
        assert.ok(row.buttons.every(button=>button.inside&&button.rounded));
        assert.equal(row.nonInteractive,true);
        assert.equal(row.content,'""');
        assert.equal(row.pointerEvents,'none');
        if(width>640){assert.equal(row.display,'block');assert.equal(row.position,'absolute');assert.equal(row.pseudoWidth,'1px');assert.equal(row.pseudoHeight,'20px');assert.match(row.gradient,/linear-gradient/);assert.equal(row.paddingLeft,'14px');}
        else {assert.equal(row.display,'none');assert.equal(row.paddingLeft,'32px');assert.equal(row.ownRow,true);}
      }
      layouts.push({width,locale,scale,groups:rows.length});
    }
  });
  await check('Localized image/video/audio/RefMod/other count pills remain separate; cast supporting images do not become extra interactive controls', async () => {
    await page.setViewportSize({width:1600,height:950});
    for(const locale of ['en','ko','ja','zh']){
      await page.evaluate(locale=>mountFixture(locale,1.5),locale);
      const counts=await page.evaluate(()=>({refs:[...fixture.refs.root.querySelectorAll('.mmc-media-count')].map(n=>n.textContent),cast:[...fixture.cast.root.querySelectorAll('.mmc-media-count')].map(n=>n.textContent),controls:[fixture.refs,fixture.cast].map(d=>d.head.querySelectorAll('button').length)}));
      assert.equal(counts.refs.length,5);assert.equal(counts.cast.length,5);assert.deepEqual(counts.controls,[2,3]);
      assert.notEqual(counts.refs[0],counts.cast[0]);assert.ok(counts.refs[0].includes('6'));assert.ok(counts.refs[1].includes('5'));assert.ok(counts.refs[2].includes('3'));
    }
  });
  await check('Empty counts keep one read-only zero pill and the divider only while actions exist', async () => {
    await page.evaluate(()=>mountFixture('ko',1.5,'empty'));
    assert.equal(await page.evaluate(()=>[fixture.refs,fixture.cast].every(d=>d.root.querySelectorAll('.mmc-media-count').length===1&&d.root.querySelector('.mmc-media-count').textContent.includes('0'))),true);
    for(const key of ['refs','cast']){
      await page.evaluate(key=>fixture[key].setActions(),key);
      assert.equal(await page.evaluate(key=>getComputedStyle(fixture[key].root.querySelector('.mmc-tl-section-hint'),'::before').content,key),'none');
    }
    await page.evaluate(()=>fixture.refs.setActions(fixture.add));
    assert.equal(await page.evaluate(()=>getComputedStyle(fixture.refs.root.querySelector('.mmc-tl-section-hint'),'::before').content),'""');
  });
  await check('Add, Add someone and Library clicks run once without folding, count mutation or workflow writes', async () => {
    for(const width of [1600,320]){
      await page.setViewportSize({width,height:950});await page.evaluate(()=>mountFixture('ko',1.5));
      const before=await page.evaluate(()=>({state:JSON.stringify(fixtureState),counts:[fixture.refs,fixture.cast].map(d=>d.root.querySelector('.mmc-media-counts').textContent),clicked:{...actionsClicked}}));
      for(const key of ['add','person','library'])await page.evaluate(key=>fixture[key].click(),key);
      const after=await page.evaluate(()=>({state:JSON.stringify(fixtureState),counts:[fixture.refs,fixture.cast].map(d=>d.root.querySelector('.mmc-media-counts').textContent),clicked:{...actionsClicked},open:[fixture.refs.isOpen(),fixture.cast.isOpen()]}));
      assert.equal(after.state,before.state);assert.deepEqual(after.counts,before.counts);assert.deepEqual(after.open,[true,true]);
      for(const key of ['add','person','library'])assert.equal(after.clicked[key],before.clicked[key]+1);
    }
  });
  await check('Pointer on the visual divider passes through to the existing header; counts retain normal header folding', async () => {
    await page.setViewportSize({width:1600,height:950});await page.evaluate(()=>mountFixture('en',1));
    for(const key of ['refs','cast']){
      const hit=await page.evaluate(key=>{const hint=fixture[key].root.querySelector('.mmc-tl-section-hint'),r=hint.getBoundingClientRect(),x=r.left+.5,y=r.top+r.height/2;const node=document.elementFromPoint(x,y);return {x,y,isHead:fixture[key].head.contains(node),isAction:fixture[key].head.querySelector('.mmc-tl-section-actions').contains(node)};},key);
      assert.equal(hit.isHead,true);assert.equal(hit.isAction,false);
      await page.mouse.click(hit.x,hit.y);
      assert.equal(await page.evaluate(key=>fixture[key].isOpen(),key),false);
      await page.evaluate(key=>fixture[key].root.querySelector('.mmc-media-count').click(),key);
      assert.equal(await page.evaluate(key=>fixture[key].isOpen(),key),true);
    }
  });
  await check('Keyboard focus remains title → existing action buttons; divider/counts add no Tab stop or separator AX node', async () => {
    await page.evaluate(()=>mountFixture('ko',1.5));
    await page.locator('.mmc-tl-section-toggle').first().focus();
    await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement===fixture.add),true);
    await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement===fixture.cast.toggle),true);
    await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement===fixture.person),true);
    await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement===fixture.library),true);
    const cdp=await page.context().newCDPSession(page),ax=await cdp.send('Accessibility.getFullAXTree');
    assert.equal(ax.nodes.filter(node=>!node.ignored&&node.role?.value==='separator').length,0);
    assert.equal(await page.evaluate(()=>fixture.modal.querySelectorAll('.mmc-media-counts [tabindex],.mmc-media-counts button,.mmc-media-counts a').length),0);
    await cdp.detach();
  });
  await check('Fold/reopen retains exact count DOM and ARIA; Enter and Space retain native disclosure operation', async () => {
    for(const key of ['refs','cast']){
      await page.evaluate(key=>{window.savedCounts=fixture[key].root.querySelector('.mmc-media-counts');fixture[key].toggle.focus();},key);
      await page.keyboard.press('Enter');assert.equal(await page.evaluate(key=>fixture[key].isOpen(),key),false);
      await page.keyboard.press('Space');assert.equal(await page.evaluate(key=>fixture[key].isOpen(),key),true);
      assert.equal(await page.evaluate(key=>fixture[key].toggle.getAttribute('aria-expanded')==='true'&&savedCounts===fixture[key].root.querySelector('.mmc-media-counts'),key),true);
    }
  });
  fs.mkdirSync(output,{recursive:true});
  for(const width of [1600,900,640,320]){
    await page.setViewportSize({width,height:950});await page.evaluate(()=>mountFixture('ko',1.5));
    await page.screenshot({path:path.join(output,`count-divider-ko-large-${width}.png`),fullPage:true});
  }
  assert.equal(requests,0);assert.deepEqual(pageErrors,[]);
  const report={suite:'timeline-count-divider',passed:results.length,baselineGuard:hasBaseline,responsiveCases:layouts.length,countGroupCases:layouts.length*2,
    networkRequests:requests,pageErrors,results,layouts,
    scope:'Actual native disclosure/count/DOM/i18n/CSS, decorative pseudo-element only; action callback counters are isolated adapters. No ComfyUI/LLM/GPU/user media/workflow mutation.'};
  fs.writeFileSync(path.join(output,'count-divider-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();});
