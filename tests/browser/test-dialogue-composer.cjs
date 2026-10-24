// Isolated browser integration: real fields, composer and stylesheet; no server or GPU.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = process.env.CONTINUITY_SOURCE_ROOT || path.resolve(__dirname, '../..');
const web = path.join(root, 'web/creator');
const read = file => fs.readFileSync(path.join(web, file), 'utf8');
const catalogRun = spawnSync(process.env.PYTHON_EXECUTABLE_PATH || 'python', ['-c',
  "import sys;sys.path.insert(0,'tests');import layout;print(layout.catalog_json())"], { cwd: root, encoding: 'utf8', env: {...process.env, PYTHONUTF8:'1'} });
assert.equal(catalogRun.status, 0, catalogRun.stderr);
const catalog = JSON.parse(catalogRun.stdout.split(/\r?\n/).find(line => line.startsWith('{')));
const css = [...read('styles.js').matchAll(/import \{ css as \w+ \} from "\.\/styles\/([\w-]+)\.js";/g)]
  .map(match => read(`styles/${match[1]}.js`).match(/export const css = `([^]*)`;\s*$/)[1]).join('\n');
let browser;
const results = [];
(async () => {
  browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined });
  const page = await browser.newPage({viewport:{width:1366,height:850}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(catalog => {
    window.__MMC_FAMILIES = catalog;
    window.app = {extensionManager:{setting:{get:key => key === 'Comfy.Locale' ? (window.locale || 'en') : undefined}}};
    Object.defineProperty(navigator, 'clipboard', {value:{async writeText(text){window.copied=text;}},configurable:true});
  }, catalog);
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    assert.equal(url.hostname, 'continuity.test', 'no external requests');
    if (url.pathname === '/') return route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><style>${css}
      :root{--comfy-menu-bg:#181819;--fg-color:#ddd;--input-text:#ddd;--descrip-text:#999;--bg-color:#202020;--primary-background:#0b8ce9;--destructive-background:#b33a3a;--error-text:#f44}
      body{margin:0;background:#171718}.fixture{padding:20px}</style></head><body><button id="open">Open</button></body></html>`});
    if (url.pathname === '/scripts/api.js') return route.fulfill({contentType:'text/javascript',body:'export const api={apiURL:u=>u,addEventListener(){},removeEventListener(){},fetchApi:async()=>({ok:true,status:200,json:async()=>({})})};'});
    if (url.pathname === '/scripts/app.js') return route.fulfill({contentType:'text/javascript',body:'export const app=globalThis.app;'});
    if (url.pathname === '/continuity/thumb') return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="60" height="72" viewBox="0 0 60 72"><rect width="60" height="72" rx="8" fill="#26343e"/><circle cx="30" cy="23" r="12" fill="#8ba7ba"/><path d="M8 65v-7c0-16 44-16 44 0v7" fill="#8ba7ba"/></svg>'});
    if (url.pathname.startsWith('/web/creator/')) return route.fulfill({contentType:'text/javascript',body:read(url.pathname.slice('/web/creator/'.length))});
    return route.fulfill({status:404,body:''});
  });
  await page.goto('http://continuity.test/');
  await page.evaluate(async () => {
    const {el} = await import('/web/creator/dom.js');
    const {PromptBox} = await import('/web/creator/prompt.js');
    const {SegmentPromptSections} = await import('/web/creator/prompt-sections.js');
    const {openDialogueComposer} = await import('/web/creator/dialogue-composer.js');
    const S = await import('/web/creator/state.js');
    window.fixture = (speakerCount = 2) => {
      document.querySelector('.fixture')?.remove();
      const many = speakerCount > 2;
      const assets = many ? Array.from({length:speakerCount},(_,index)=>({handle:`ref-${index+1}`,kind:'image',role:'reference',filename:`portrait-${index+1}.png`,takes:'person'}))
        : [{handle:'ref-1',kind:'image',role:'reference',filename:'portrait.png',takes:'person'}];
      const subjects = many ? Array.from({length:speakerCount},(_,index)=>({handle:index ? `subject_${index+1}` : 'subject',takes:'person',from:[`ref-${index+1}`],description:`Person ${index+1}`}))
        : [{handle:'subject',takes:'person',from:['ref-1']},{handle:'subject_2',takes:'person',description:'Second speaker'}];
      window.piece = S.parseTimeline(JSON.stringify({version:2,assets,
        subjects:[...subjects,{handle:'place',takes:'scene',description:'Courtyard'}],
        segments:[{prompt:'Original scene.',prompt_sections:{summary:'Summary.',retention_analysis:'Rules.'},refined:{enabled:true,body:'Old body.',fields:['prompt','summary'],sections:{summary:'Old summary.'}}},{prompt:'Other segment.'}]}));
      window.ed={piece,castPiece:piece,state:piece.segments[0],refineEpoch:0,root:el('div',{class:'mmc-root fixture'}),
        commit(){},commitPrompt(){this.refineEpoch++;},renderNotices(){},renderAssetsRow(){},dropCited(){}};
      ed.prompt=new PromptBox({getState:()=>ed.state,getCast:()=>piece.subjects,getPool:()=>piece.assets,onInput:text=>ed.state.prompt=text});
      ed.prompt.setValue(ed.state.prompt);
      ed.refinePanel={readSource:null,setFieldHosts(){},clearField(field){window.cleared=field;
        if(field==='prompt')delete ed.state.refined.body;else delete ed.state.refined.sections[field];
        ed.state.refined.fields=ed.state.refined.fields.filter(f=>f!==field);},render(){}};
      window.sections=new SegmentPromptSections(ed);
      ed.root.append(sections.root); document.body.append(ed.root);
      window.show=()=>openDialogueComposer(document.querySelector('#open'),ed);
      document.querySelector('#open').onclick=()=>show();
    };
    fixture();
  });
  const check = async (name, run) => { await run(); results.push(name); console.log('PASS '+name); };
  const open = async () => { await page.locator('#open').click(); };
  const tab = name => page.locator(`[data-dialogue-page="${name}"]`);
  const openSpeakers = async () => {
    await tab('line').click();
    await page.locator('.mmc-dialogue-open-speakers').click();
  };
  const scrollSpeakers = async () => {
    const list = page.locator('.mmc-dialogue-speakers');
    await list.hover();
    await page.mouse.wheel(0,2000);
    await page.waitForFunction(()=>document.querySelector('.mmc-dialogue-speakers').scrollTop > 0);
    return list;
  };
  await check('Composer applies to one detailed field, clears only its stale draft and keeps other cards and sections', async () => {
    await open();
    await page.getByRole('combobox',{name:'Speaker',exact:true}).selectOption('subject_2');
    await page.getByRole('combobox',{name:'Spoken language'}).selectOption('Korean');
    await page.getByRole('textbox',{name:'Words to speak'}).fill('반갑습니다.');
    await page.locator('[data-dialogue-apply]').click();
    const state=await page.evaluate(()=>({prompt:ed.state.prompt,other:piece.segments[1].prompt,summary:ed.state.prompt_sections.summary,rules:ed.state.prompt_sections.retention_analysis,cleared,refined:ed.state.refined}));
    assert.equal(state.prompt,'Original scene.\n(S@subject_2) says: <d>[Korean] 반갑습니다.</d>');
    assert.equal(state.other,'Other segment.'); assert.equal(state.summary,'Summary.'); assert.equal(state.rules,'Rules.');
    assert.equal(state.cleared,'prompt'); assert.deepEqual(state.refined.fields,['summary']); assert.equal(state.refined.sections.summary,'Old summary.');
  });
  await check('Help shows readable speaker syntax without exposing the stable storage token', async () => {
    await open(); await tab('help').click();
    const example=await page.locator('.mmc-dialogue-example').innerText();
    assert.equal(example,'@subject (S1) says: <d>[Korean] 안녕하세요.</d>');
    assert.ok(!example.includes('S@'),'The help example is public prompt syntax, not internal storage syntax');
    assert.match(await page.locator('.mmc-dialogue-panel').innerText(),/S1 identifies a vocal source/);
    await page.keyboard.press('Escape');
  });
  await check('Natural sounds are outside dialogue, intensity changes prose, experimental inline is opt-in', async () => {
    await open(); await page.getByRole('textbox',{name:'Words to speak'}).fill('Hello.');
    await tab('sounds').click(); await page.getByRole('combobox',{name:'Nonverbal sound',exact:true}).selectOption('laugh');
    await page.locator('[data-dialogue-value="2"]').click();
    await page.getByRole('button',{name:'Add sound',exact:true}).click();
    assert.match(await page.locator('.mmc-dialogue-preview-text').innerText(),/laughs loudly\.\n.*<d>\[Korean\] Hello\.<\/d>/);
    await page.getByRole('switch').click();
    assert.match(await page.locator('.mmc-dialogue-preview-text').innerText(),/<d>\[Korean\] <laughs> Hello\.<\/d>/);
    await page.keyboard.press('Escape');
  });
  await check('Saved favorite recipes never store person, line or reference; reopening starts with an empty line', async () => {
    await open(); await page.getByRole('textbox',{name:'Words to speak'}).fill('Never store this line.');
    await tab('recipes').click(); await page.getByRole('textbox',{name:'Combination name'}).fill('Quiet Korean');
    await page.getByRole('button',{name:'Save combination',exact:true}).click(); await page.getByRole('button',{name:'Favorite',exact:true}).click();
    const saved = await page.evaluate(()=>JSON.parse(localStorage.getItem('continuity-dialogue-recipes-v1')));
    assert.equal(saved[0].favorite,true); assert.ok(!JSON.stringify(saved).includes('Never store')); assert.ok(!JSON.stringify(saved).includes('subject'));
    await page.keyboard.press('Escape'); await open();
    assert.equal(await page.getByRole('textbox',{name:'Words to speak'}).inputValue(),'');
    await tab('recipes').click(); await page.getByRole('button',{name:'Delete Quiet Korean',exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('continuity-dialogue-recipes-v1'))),[]);
    await page.keyboard.press('Escape');
  });
  await check('Existing dialogue chip reopens composer and replaces its full prefix without duplicating speaker', async () => {
    await page.locator('.fixture .mmc-dialogue').first().click();
    await page.getByRole('textbox',{name:'Words to speak'}).fill('다시 만나요.');
    await page.locator('[data-dialogue-apply]').click();
    const text=await page.evaluate(()=>ed.state.prompt);
    assert.equal((text.match(/\(S@subject_2\)/g)||[]).length,1); assert.ok(text.includes('<d>[Korean] 다시 만나요.</d>'));
  });
  await check('Changing the source while dialog is open prevents stale insertion', async () => {
    await open(); await page.getByRole('textbox',{name:'Words to speak'}).fill('Do not insert.');
    await page.evaluate(()=>ed.prompt.setValue('Changed elsewhere.'));
    await page.locator('[data-dialogue-apply]').click();
    assert.ok(await page.locator('.mmc-dialogue-status').innerText());
    assert.equal(await page.evaluate(()=>ed.prompt.getValue()),'Changed elsewhere.'); await page.keyboard.press('Escape');
  });
  await check('Multiple sound cues retain order, split around a text cursor and work without speech',async()=>{
    const composed=await page.evaluate(async()=>{
      const {composeDialogue}=await import('/web/creator/dialogue-composer.js');
      const cues=[{sound:'laugh',intensity:2,placement:'before'},{text:'clears their throat quietly',placement:'cursor',at:6},{sound:'sigh',intensity:2,placement:'after'}];
      return {normal:composeDialogue({language:'Korean',cues},'subject','안녕하세요. 반갑습니다.'),
        sound:composeDialogue({mode:'sound',cues},'subject',''),
        inline:composeDialogue({language:'English',experimental:true,cues:[{sound:'laugh',placement:'after'},{sound:'sigh',placement:'after'}]},'subject','Hello.'),
        bare:composeDialogue({language:'Korean'},'subject','안녕하세요.')};
    });
    assert.equal(composed.normal,'(S@subject) laughs loudly.\n(S@subject) says: <d>[Korean] 안녕하세요.</d>\n(S@subject) clears their throat quietly.\n(S@subject) says: <d>[Korean] 반갑습니다.</d>\n(S@subject) lets out a deep, audible sigh.');
    assert.ok(!composed.sound.includes('<d>'));assert.ok(composed.sound.includes('clears their throat quietly.'));
    assert.match(composed.inline,/<laughs> <sighs>/);assert.equal(composed.bare,'(S@subject) says: <d>[Korean] 안녕하세요.</d>');
  });
  await check('Sounds can be typed, added, reordered and removed without entering speech markup',async()=>{
    await page.evaluate(()=>fixture());await open(); await tab('sounds').click();
    await page.getByRole('textbox',{name:'Custom sound instruction'}).fill('조용히 헛기침한다');
    await page.getByRole('button',{name:'Add sound',exact:true}).click();
    await page.getByRole('combobox',{name:'Nonverbal sound',exact:true}).selectOption('sigh');
    await page.getByRole('button',{name:'Add sound',exact:true}).click();
    assert.equal(await page.locator('.mmc-dialogue-cue').count(),2);
    await page.getByRole('button',{name:'Move earlier',exact:true}).nth(1).click();
    assert.match(await page.locator('.mmc-dialogue-cue').first().innerText(),/Sigh/);
    await page.getByRole('button',{name:'Remove sound',exact:true}).first().click();
    assert.match(await page.locator('.mmc-dialogue-cue').first().innerText(),/조용히 헛기침한다/);
    await tab('voice').click();await page.locator('[data-dialogue-value="sound"]').click();
    assert.ok(!await page.locator('.mmc-dialogue-preview-text').innerText().then(text=>text.includes('<d>')));
    await page.keyboard.press('Escape');
  });
  await check('Words are saved only with an explicit option; loading a recipe retains the chosen actor',async()=>{
    await open();await page.getByRole('combobox',{name:'Speaker',exact:true}).selectOption('subject_2');
    await page.getByRole('textbox',{name:'Words to speak'}).fill('Save this sentence explicitly.');await tab('recipes').click();
    await page.getByRole('checkbox',{name:'Include these spoken words'}).check();
    await page.getByRole('textbox',{name:'Combination name'}).fill('With sentence');await page.getByRole('button',{name:'Save combination',exact:true}).click();
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('continuity-dialogue-recipes-v1')));
    assert.equal(saved[0].words,'Save this sentence explicitly.');assert.equal(saved[0].saveWords,true);assert.ok(!JSON.stringify(saved).includes('subject_2'));
    await page.keyboard.press('Escape');await open();assert.equal(await page.getByRole('textbox',{name:'Words to speak'}).inputValue(),'');
    await page.getByRole('combobox',{name:'Speaker',exact:true}).selectOption('subject_2');await tab('recipes').click();
    await page.getByRole('button',{name:'With sentence',exact:true}).click();
    assert.equal(await page.getByRole('textbox',{name:'Words to speak'}).inputValue(),'Save this sentence explicitly.');
    assert.equal(await page.getByRole('combobox',{name:'Speaker',exact:true}).inputValue(),'subject_2');await page.keyboard.press('Escape');
  });
  await check('Plain speech accepts punctuation without prompt menus and rejects duplicate d structural tags',async()=>{
    await open();await page.getByRole('textbox',{name:'Words to speak'}).fill('안녕 / 괜찮아? (정말)');
    assert.equal(await page.locator('.mmc-mention').count(),0);
    assert.equal(await page.locator('[data-dialogue-apply]').isDisabled(),false);
    await page.getByRole('textbox',{name:'Words to speak'}).fill('<d>[Korean] 중첩 태그</d>');
    assert.equal(await page.locator('[data-dialogue-apply]').isDisabled(),true);await page.keyboard.press('Escape');
  });
  await check('Editing a summary dialogue invalidates only summary ownership',async()=>{
    await page.evaluate(()=>{fixture();ed.state.prompt_sections.summary='(S@subject) says: <d>[Korean] 안녕하세요.</d>';sections.refresh();});
    await page.locator('.mmc-summary-section .mmc-dialogue').click();
    await page.getByRole('textbox',{name:'Words to speak'}).fill('요약의 대사만 변경.');await page.locator('[data-dialogue-apply]').click();
    const state=await page.evaluate(()=>({prompt:ed.state.prompt,summary:ed.state.prompt_sections.summary,refined:ed.state.refined,cleared}));
    assert.equal(state.prompt,'Original scene.');assert.equal(state.refined.body,'Old body.');assert.equal(state.cleared,'summary');
    assert.ok(state.summary.includes('요약의 대사만 변경.'));
  });
  await check('Reference-person creation is explicit, reuses its image and avoids recasting an existing person',async()=>{
    await page.evaluate(()=>{fixture();piece.subjects=piece.subjects.filter(member=>member.handle!=='subject');});
    await open();await openSpeakers();await page.locator('[data-dialogue-value="references"]').click();
    await page.locator('[data-dialogue-speaker="ref-1"]').click();
    const added=await page.evaluate(()=>({cast:piece.subjects,assets:piece.assets.length}));
    assert.equal(added.assets,1);assert.equal(added.cast.filter(member=>(member.from||[]).includes('ref-1')).length,1);
    await openSpeakers();await page.locator('[data-dialogue-value="references"]').click();await page.locator('[data-dialogue-speaker="ref-1"]').click();
    assert.equal(await page.evaluate(()=>piece.subjects.filter(member=>(member.from||[]).includes('ref-1')).length),1);await page.keyboard.press('Escape');
  });
  await check('Editing a shared line retains both speakers until the user explicitly chooses another actor',async()=>{
    await page.evaluate(()=>{fixture();ed.prompt.setValue('(S@subject,@subject_2) say together: <d>[Korean] 안녕.</d>');ed.state.prompt=ed.prompt.getValue();});
    await page.locator('.fixture .mmc-dialogue').click();await page.getByRole('textbox',{name:'Words to speak'}).fill('함께 인사합니다.');
    await page.locator('[data-dialogue-apply]').click();
    assert.equal(await page.evaluate(()=>ed.state.prompt),'(S@subject,@subject_2) say together: <d>[Korean] 함께 인사합니다.</d>');
    await page.locator('.fixture .mmc-dialogue').click();await page.getByRole('combobox',{name:'Speaker',exact:true}).selectOption('subject_2');
    await page.locator('[data-dialogue-apply]').click();
    assert.equal(await page.evaluate(()=>ed.state.prompt),'(S@subject_2) says: <d>[Korean] 함께 인사합니다.</d>');
  });
  await check('An authored delivery phrase survives adding a sound cue',async()=>{
    await page.evaluate(()=>{fixture();ed.prompt.setValue('(S@subject) declares in a deliberately flat voice: <d>[Korean] 안녕.</d>');ed.state.prompt=ed.prompt.getValue();});
    await page.locator('.fixture .mmc-dialogue').click();await tab('sounds').click();
    await page.getByRole('combobox',{name:'Nonverbal sound',exact:true}).selectOption('sigh');await page.getByRole('button',{name:'Add sound',exact:true}).click();
    await page.locator('[data-dialogue-apply]').click();assert.ok((await page.evaluate(()=>ed.state.prompt)).includes('declares in a deliberately flat voice: <d>'));
  });
  await check('Speaker picker is entered from Dialogue only, shows six people and scrolls to the last person',async()=>{
    for(const viewport of [{width:1366,height:850},{width:1504,height:825}]) {
      await page.setViewportSize(viewport);
      await page.evaluate(()=>{document.documentElement.style.setProperty('--mmc-type','1');fixture(8);});
      await open();
      assert.equal(await tab('speaker').count(),0,'Speaker must not duplicate the top-level Dialogue category');
      await page.getByRole('textbox',{name:'Words to speak'}).fill('Keep this authored line.');
      await openSpeakers();
      await page.locator('.mmc-dialogue-speaker-back').click();
      assert.equal(await page.getByRole('textbox',{name:'Words to speak'}).inputValue(),'Keep this authored line.','Back returns without changing the line');
      await openSpeakers();
      assert.equal(await tab('line').getAttribute('aria-selected'),'true','Internal picker remains part of Dialogue');
      assert.equal(await page.locator('.mmc-dialogue-dialog').getAttribute('data-page'),'speaker');
      const list=page.locator('.mmc-dialogue-speakers');
      assert.equal(await list.getAttribute('role'),'list');
      assert.equal(await list.getByRole('listitem').count(),8,'Every person is rendered without pagination; scene cast is excluded');
      assert.equal(await page.locator('.mmc-dialogue-panel .mmc-dialogue-pager').count(),0,'Speaker picker has no Previous/Next controls');
      const initial=await list.evaluate(node=>{
        const r=node.getBoundingClientRect(),top=r.top+node.clientTop,bottom=top+node.clientHeight;
        return {top,bottom,height:node.clientHeight,scrollHeight:node.scrollHeight,scrollTop:node.scrollTop,
          firstSix:[...node.children].slice(0,6).map(card=>{const b=card.getBoundingClientRect();return {top:b.top,bottom:b.bottom};})};
      });
      assert.equal(initial.scrollTop,0);
      assert.ok(initial.scrollHeight > initial.height,JSON.stringify({viewport,initial}));
      assert.ok(initial.firstSix.every(card=>card.top>=initial.top-1 && card.bottom<=initial.bottom+1),JSON.stringify({viewport,initial}));
      await scrollSpeakers();
      await page.locator('[data-dialogue-speaker="subject_8"]').click();
      assert.equal(await page.locator('.mmc-dialogue-dialog').getAttribute('data-page'),'line');
      assert.equal(await page.getByRole('combobox',{name:'Speaker',exact:true}).inputValue(),'subject_8');
      assert.equal(await page.getByRole('textbox',{name:'Words to speak'}).inputValue(),'Keep this authored line.');
      await page.keyboard.press('Escape');
    }
  });
  await check('Changing Cast and reference sources resets only the scroll list and keeps the final reference selectable',async()=>{
    await page.setViewportSize({width:1366,height:850});
    await page.evaluate(()=>fixture(8));await open();await openSpeakers();await scrollSpeakers();
    await page.locator('[data-dialogue-value="references"]').click();
    const list=page.locator('.mmc-dialogue-speakers');
    assert.equal(await list.getByRole('listitem').count(),8);
    assert.equal(await list.evaluate(node=>node.scrollTop),0,'New source begins at the first item');
    await scrollSpeakers();
    await page.locator('[data-dialogue-value="cast"]').click();
    assert.equal(await list.evaluate(node=>node.scrollTop),0,'Switching back to Cast also begins at the first item');
    await page.locator('[data-dialogue-value="references"]').click();await scrollSpeakers();
    await page.locator('[data-dialogue-speaker="ref-8"]').click();
    assert.equal(await page.getByRole('combobox',{name:'Speaker',exact:true}).inputValue(),'subject_8');
    assert.equal(await page.evaluate(()=>piece.subjects.filter(member=>(member.from||[]).includes('ref-8')).length),1,'Existing reference person is reused');
    await page.keyboard.press('Escape');
  });
  await check('Speaker list supports keyboard scrolling and natural forward and reverse focus without losing the draft',async()=>{
    await page.setViewportSize({width:1366,height:850});
    await page.evaluate(()=>{document.documentElement.style.setProperty('--mmc-type','1');fixture(16);});
    await open();
    await page.getByRole('textbox',{name:'Words to speak'}).fill('Keep this keyboard navigation draft.');
    await openSpeakers();
    const list=page.locator('.mmc-dialogue-speakers');
    await list.focus();
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(()=>document.querySelector('.mmc-dialogue-speakers').scrollTop>0);
    const afterArrow=await list.evaluate(node=>node.scrollTop);
    await page.keyboard.press('PageDown');
    await page.waitForFunction(previous=>document.querySelector('.mmc-dialogue-speakers').scrollTop>previous,afterArrow);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('[data-dialogue-speaker="subject"]').evaluate(node=>node===document.activeElement),true,'Tab follows the list into its first Choose control, not Close');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await list.evaluate(node=>node===document.activeElement),true,'Reverse tab returns to the scrollable list');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.locator('.mmc-dialogue-speaker-back').evaluate(node=>node===document.activeElement),true,'Reverse order continues to the preceding source controls');
    await page.keyboard.press('Tab');
    assert.equal(await list.evaluate(node=>node===document.activeElement),true);
    await page.locator('.mmc-dialogue-speaker-back').click();
    assert.equal(await page.getByRole('textbox',{name:'Words to speak'}).inputValue(),'Keep this keyboard navigation draft.');
    await openSpeakers();await page.keyboard.press('Escape');
    assert.equal(await page.locator('.mmc-dialogue-dialog').count(),0,'Escape closes the overlay from the picker');
    assert.equal(await page.locator('#open').evaluate(node=>node===document.activeElement),true,'Closing returns focus to the opener');
    assert.equal(await page.evaluate(()=>ed.state.prompt),'Original scene.','Navigation and Escape never apply or rewrite the original field');
  });
  await check('Every tab reflows without dialog scrolling across viewport and text scales', async () => {
    await page.evaluate(()=>fixture(8));
    for (const viewport of [{width:1366,height:850},{width:1024,height:768},{width:800,height:600},{width:640,height:600}]) {
      await page.setViewportSize(viewport);
      for (const scale of [1,1.25,1.6]) {
        await page.evaluate(scale=>document.documentElement.style.setProperty('--mmc-type',String(scale)),scale);
        await open();
        for (const name of ['line','speaker','voice','sounds','recipes','help','preview']) {
          if (name==='preview' && !await tab(name).isVisible()) continue;
          if(name==='speaker') await openSpeakers();
          else await tab(name).click();
          if(name==='sounds') for(let n=0;n<3;n++) {
            await page.getByRole('textbox',{name:'Custom sound instruction'}).fill('A quiet audible breath');
            await page.getByRole('button',{name:'Add sound',exact:true}).click();
          }
          const bounds=await page.locator('.mmc-dialogue-dialog').evaluate(node=>{
            const r=node.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,overflow:node.scrollHeight-node.clientHeight};
          });
          assert.ok(bounds.top>=0 && bounds.bottom<=viewport.height+1 && bounds.left>=0 && bounds.right<=viewport.width+1,JSON.stringify({viewport,scale,name,bounds}));
          assert.ok(bounds.overflow<=2,JSON.stringify({viewport,scale,name,bounds}));
          const nested=await page.locator('.mmc-dialogue-dialog').evaluate(node=>[...node.querySelectorAll('*')]
            .filter(child=>child.clientHeight>0 && child.scrollHeight-child.clientHeight>2 && ['auto','scroll'].includes(getComputedStyle(child).overflowY))
            .map(child=>child.className));
          assert.ok(nested.every(className=>name==='speaker' && className==='mmc-dialogue-speakers'),JSON.stringify({viewport,scale,name,nested}));
          if(name==='speaker') {
            const list=page.locator('.mmc-dialogue-speakers');
            assert.equal(await list.getByRole('listitem').count(),8);
            assert.equal(await list.evaluate(node=>getComputedStyle(node).overflowY),'auto');
            assert.ok(await list.evaluate(node=>node.clientHeight>0 && node.scrollHeight>node.clientHeight));
          }
        }
        await page.keyboard.press('Escape');
      }
    }
  });
  if(process.env.CONTINUITY_PROOF_DIR) {
    // This is a synthetic isolated QA fixture, never the user's server or workflow.
    fs.mkdirSync(process.env.CONTINUITY_PROOF_DIR,{recursive:true});
    await page.setViewportSize({width:1366,height:850});
    await page.evaluate(()=>{window.locale='ko';document.documentElement.style.setProperty('--mmc-type','1');fixture(8);
      piece.subjects.filter(member=>member.takes==='person').forEach((member,index)=>member.description=`검증용 인물 ${index+1}`);});
    await open();await page.locator('.mmc-dialogue-words').fill('안녕하세요. 반갑습니다.');await openSpeakers();
    await page.locator('.mmc-dialogue-dialog').screenshot({path:path.join(process.env.CONTINUITY_PROOF_DIR,'speaker-list-six.png')});
    await page.keyboard.press('Escape');
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:results.length,results}));
})().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(async()=>{await browser?.close();});
