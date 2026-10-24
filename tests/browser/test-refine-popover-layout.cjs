// Real ES modules and stylesheet; synthetic API storage only. No live ComfyUI,
// user settings, model requests, media generation or GPU use.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = process.env.CONTINUITY_SOURCE_ROOT ? path.resolve(process.env.CONTINUITY_SOURCE_ROOT) : path.resolve(__dirname, '../..');
const web = path.join(root, 'web/creator');
const read = file => fs.readFileSync(path.join(web, file), 'utf8');
const catalogRun = spawnSync(process.env.PYTHON_EXECUTABLE_PATH || 'python', ['-c',
  "import sys;sys.path.insert(0,'tests');import layout;print(layout.catalog_json())"],
  { cwd: root, encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
assert.equal(catalogRun.status, 0, catalogRun.stderr);
const catalog = JSON.parse(catalogRun.stdout.split(/\r?\n/).find(line => line.startsWith('{')));
const css = [...read('styles.js').matchAll(/import \{ css as \w+ \} from "\.\/styles\/(\w+)\.js";/g)]
  .map(match => read(`styles/${match[1]}.js`).match(/export const css = `([^]*)`;\s*$/)[1]).join('\n');
let browser;
const tests = [];
(async () => {
  browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined,
    ignoreDefaultArgs: ['--hide-scrollbars'] });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(catalog => {
    window.__MMC_FAMILIES = catalog;
    window.app = { extensionManager: { setting: { get: key => key === 'Comfy.Locale' ? (window.locale || 'en') : undefined } } };
    window.stored = { refiner: { backend: 'local', model: 'encoder-00.safetensors', remoteModel: 'remote-00',
      skill: '', maxTokens: 6144, temperature: .3, seed: -1, language: 'English' } };
    window.writes = [];
    window.localNames = Array.from({ length: 17 }, (_, n) => `encoder-${String(n).padStart(2, '0')}.safetensors`);
    window.remoteNames = Array.from({ length: 29 }, (_, n) => `remote-${String(n).padStart(2, '0')}`);
    window.skillNames = Array.from({ length: 13 }, (_, n) => ({ name: `custom-${String(n).padStart(2, '0')}.md`, kind: 'prompt', mode: 'add' }));
  }, catalog);
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'continuity.test') { external.push(url.href); return route.abort(); }
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="dark-theme"><head><style>${css}
      :root{--comfy-menu-bg:#181819;--fg-color:#ddd;--input-text:#ddd;--descrip-text:#999;--bg-color:#202020;--primary-background:#0b8ce9;--destructive-background:#b33a3a;--error-text:#f44}
      body{margin:0;padding:20px;background:#171718;box-sizing:border-box}.fixture{padding:12px}.fixture-row{display:flex;gap:16px;align-items:center}
      </style></head><body><div class="mmc-root fixture"><button id="outside">Outside</button></div></body></html>` });
    if (url.pathname === '/scripts/app.js') return route.fulfill({ contentType: 'text/javascript', body: 'export const app=globalThis.app;' });
    if (url.pathname === '/scripts/widgets.js') return route.fulfill({ contentType: 'text/javascript', body: 'export const ComfyWidgets={};' });
    if (url.pathname === '/scripts/api.js') return route.fulfill({ contentType: 'text/javascript', body: `export const api={
      apiURL:u=>u,addEventListener(){},removeEventListener(){},getUserData:async()=>({status:404,json:async()=>null}),
      storeUserData:async()=>({status:200}),deleteUserData:async()=>({status:204}),
      async fetchApi(url,options={}){
        let body={};
        if(url==='/continuity/settings'){
          if(options.method==='POST'){const patch=JSON.parse(options.body);window.writes.push(patch);Object.assign(window.stored,patch);}
          body={settings:window.stored};
        }else if(url==='/continuity/refine/models')body={models:window.localNames};
        else if(url==='/continuity/refine/skills')body={entries:window.skillNames};
        else if(url==='/continuity/refine/remote')body={url:'http://localhost:1234/v1',key_set:true};
        else if(url==='/continuity/refine/remote/models')body={models:window.remoteNames};
        return {ok:true,status:200,json:async()=>JSON.parse(JSON.stringify(body))};
      }};` });
    if (url.pathname.startsWith('/web/creator/')) {
      const target = path.resolve(web, '.' + url.pathname.slice('/web/creator'.length));
      assert.ok(target.startsWith(web + path.sep));
      return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(target, 'utf8') });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  await page.goto('http://continuity.test/');
  await page.evaluate(async () => {
    window.R = await import('/web/creator/refine.js');
    window.API = await import('/web/creator/api.js');
    API.noteSettings(window.stored);
    const { el } = await import('/web/creator/dom.js');
    const row = el('div', { class: 'fixture-row' });
    window.calls=[];
    window.pill=R.refineButton({className:'mmc-pill mmc-section-refine',variant:'pill',contextLabel:'summary',run:async options=>calls.push(options)});
    window.rail=R.refineButton({run:async()=>{}});
    row.append(pill,rail);document.querySelector('.fixture').append(row);
    window.open=()=>{window.closeSettings?.();window.closeSettings=R.openSettings(pill,()=>{});};
    window.fitReport=()=>{
      const pop=document.querySelector('.mmc-refine-pop'),rect=pop.getBoundingClientRect();
      return {width:rect.width,height:rect.height,top:rect.top,bottom:rect.bottom,paged:pop.classList.contains('paged'),
        scroll:[pop,...pop.querySelectorAll('*')].filter(node=>node.getClientRects().length && ['auto','scroll','hidden','clip'].includes(getComputedStyle(node).overflowY) && node.scrollHeight>node.clientHeight+1 && !node.classList.contains('mmc-refine-choice-rows')).map(node=>({class:node.className,h:node.clientHeight,sh:node.scrollHeight})),
        outside:[...pop.querySelectorAll('button,input')].filter(node=>node.getClientRects().length && !node.closest('.mmc-refine-choice-rows')).filter(node=>{const r=node.getBoundingClientRect();return r.left<rect.left-1||r.right>rect.right+1||r.bottom>rect.bottom+1;}).map(node=>node.className)};
    };
  });
  const check=async(name,run)=>{await run();tests.push(name);console.log('PASS '+name);};
  const settle=()=>page.waitForTimeout(120);
  const popup=()=>page.locator('.mmc-refine-pop');
  const rows=kind=>page.locator(kind==='local'?'.mmc-refine-models .mmc-refine-choice-rows > .mmc-opt':kind==='remote'?'.mmc-refine-remote-rows .mmc-opt':'.mmc-refine-section .mmc-refine-choice-rows > .mmc-opt');
  const showTab=async index=>{if(await popup().evaluate(node=>node.classList.contains('paged')))await page.locator('.mmc-refine-settings-tabs [role=tab]').nth(index).click();};
  const fit=async()=>{await settle();const r=await page.evaluate(()=>fitReport());assert.deepEqual(r.scroll,[],JSON.stringify(r));assert.deepEqual(r.outside,[],JSON.stringify(r));assert.ok(r.top>=0&&r.bottom<=page.viewportSize().height,JSON.stringify(r));return r;};
  await check('Pill icons use compact geometry while default rail retains tile geometry',async()=>{
    const sizes=await page.evaluate(()=>[pill,rail].map(node=>{const b=node.querySelector('button'),i=b.querySelector('.mmc-tool-icon'),r=b.getBoundingClientRect();return {width:i.getBoundingClientRect().width,height:i.getBoundingClientRect().height,buttonHeight:r.height,direction:getComputedStyle(b).flexDirection};}));
    assert.equal(sizes[0].width,16);assert.equal(sizes[0].height,16);assert.equal(sizes[0].direction,'row');assert.ok(sizes[0].buttonHeight<45);assert.ok(sizes[1].width>32);
  });
  await check('Segment header settings chevron stays beside its pill at every text size',async()=>{
    await page.evaluate(()=>{
      const host=document.createElement('div');host.id='header-refine-fixture';host.className='mmc-editor-sheet-tools';
      host.style.cssText='display:flex;margin-top:12px';
      host.append(R.refineButton({label:'세그먼트 1 리파인',run:async options=>calls.push(options)}));
      document.querySelector('.fixture').append(host);
    });
    for(const scale of [.85,1,1.2]){
      await page.evaluate(scale=>document.querySelector('#header-refine-fixture').style.setProperty('--mmc-type',String(scale)),scale);
      const geometry=await page.locator('#header-refine-fixture .mmc-refine-split').evaluate(node=>{
        const main=node.firstElementChild,more=node.lastElementChild,b=main.getBoundingClientRect(),m=more.getBoundingClientRect();
        return {top:b.top, bottom:b.bottom, right:b.right, moreTop:m.top, moreBottom:m.bottom, moreLeft:m.left,
          position:getComputedStyle(more).position,hit:more.contains(document.elementFromPoint(m.left+m.width/2,m.top+m.height/2))};
      });
      assert.ok(Math.abs(geometry.top-geometry.moreTop)<1,JSON.stringify(geometry));
      assert.ok(Math.abs(geometry.bottom-geometry.moreBottom)<1,JSON.stringify(geometry));
      assert.ok(Math.abs(geometry.right-geometry.moreLeft)<1,JSON.stringify(geometry));
      assert.equal(geometry.position,'static');assert.equal(geometry.hit,true);
    }
    const more=page.locator('#header-refine-fixture .mmc-refine-more');
    await more.click();await settle();assert.equal(await popup().count(),1);await fit();
    assert.deepEqual(await page.evaluate(()=>calls),[]);
    await page.keyboard.press('Escape');assert.equal(await more.getAttribute('aria-expanded'),'false');
    await page.evaluate(()=>document.querySelector('#header-refine-fixture').remove());
  });
  await check('Chevron toggles settings, exposes expanded state, restores focus without refining',async()=>{
    const more=page.locator('.mmc-section-refine').locator('..').locator('.mmc-refine-more');
    await more.click();await settle();assert.equal(await more.getAttribute('aria-expanded'),'true');assert.equal(await popup().count(),1);
    await page.keyboard.press('Escape');assert.equal(await popup().count(),0);assert.equal(await more.getAttribute('aria-expanded'),'false');assert.equal(await more.evaluate(node=>node===document.activeElement),true);assert.deepEqual(await page.evaluate(()=>calls),[]);
  });
  await check('Clicking the same chevron twice closes rather than reopening its settings after inventory scrolling',async()=>{
    await page.setViewportSize({width:1920,height:1012});
    const more=page.locator('.mmc-section-refine').locator('..').locator('.mmc-refine-more');
    await more.click();await settle();assert.equal(await popup().count(),1);
    assert.equal(await page.locator('.mmc-refine-list .mmc-refine-choice-rows').evaluate(node=>node.clientHeight),420);
    await page.locator('.mmc-refine-list .mmc-refine-choice-rows').evaluate(node=>{node.scrollTop=node.scrollHeight;});
    assert.equal(await more.evaluate(node=>{const r=node.getBoundingClientRect();return node.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));}),true);
    if(process.env.CONTINUITY_TEST_SCREENSHOT)await page.screenshot({path:process.env.CONTINUITY_TEST_SCREENSHOT});
    await more.locator('svg').click();await settle();assert.equal(await popup().count(),0);assert.equal(await more.getAttribute('aria-expanded'),'false');
  });
  await check('Outside pointer dismissal and keyboard toggling still close and reset the same owner',async()=>{
    const more=page.locator('.mmc-section-refine').locator('..').locator('.mmc-refine-more');
    await more.click();await settle();await page.locator('#outside').click();assert.equal(await popup().count(),0);assert.equal(await more.getAttribute('aria-expanded'),'false');
    await more.focus();await page.keyboard.press('Enter');await settle();assert.equal(await popup().count(),1);
    await more.focus();await page.keyboard.press('Enter');await settle();assert.equal(await popup().count(),0);assert.equal(await more.getAttribute('aria-expanded'),'false');
  });
  await check('Compact refine retains two-press confirmation and opening settings cancels the armed request',async()=>{
    const button=page.locator('.mmc-section-refine');
    await button.click();assert.equal((await button.textContent()).trim(),'Confirm');assert.deepEqual(await page.evaluate(()=>calls),[]);
    await button.locator('..').locator('.mmc-refine-more').click();await settle();assert.equal((await button.textContent()).trim(),'Refine');await page.keyboard.press('Escape');
    await button.click();await button.click();await settle();assert.equal(await page.evaluate(()=>calls.length),1);assert.equal((await button.textContent()).trim(),'Refine');
  });
  await check('Opening, scrolling and closing are read-only; only full vertical file lists may scroll',async()=>{
    const before=await page.evaluate(()=>JSON.stringify(stored));await page.evaluate(()=>open());await settle();
    const labels=await page.evaluate(()=>{
      const reference=document.querySelector('.mmc-refine-visual-title');
      const builtin=document.querySelector('.mmc-refine-prompt-page .mmc-choice-list .mmc-opt-label')
        || document.querySelector('.mmc-refine-prompt-page .mmc-refine-choice-list .mmc-opt-label');
      const style=node=>({size:getComputedStyle(node).fontSize,color:getComputedStyle(node).color});
      return [style(reference),style(builtin)];
    });
    assert.deepEqual(labels[0],labels[1],'Reference image analysis matches the built-in row text');
    assert.equal((await fit()).paged,false);await showTab(0);
    assert.equal(await rows('local').count(),17);assert.equal(await page.locator('.mmc-refine-page-nav').count(),0);
    const list=page.locator('.mmc-refine-list .mmc-refine-choice-rows');
    assert.equal(await list.evaluate(node=>getComputedStyle(node).overflowY),'auto');
    assert.equal(await list.evaluate(node=>node.scrollHeight>node.clientHeight),true);
    await list.evaluate(node=>{node.scrollTop=node.scrollHeight;});await fit();await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>JSON.stringify(stored)),before);assert.equal(await page.evaluate(()=>writes.length),0);
  });
  await check('Selecting the last local model persists and reopens scrolled to that selected file',async()=>{
    await page.evaluate(()=>open());await settle();await rows('local').last().scrollIntoViewIfNeeded();
    await rows('local').last().click();await settle();assert.equal(await page.evaluate(()=>R.settings().model),'encoder-16.safetensors');await page.keyboard.press('Escape');await page.evaluate(()=>open());await settle();
    assert.equal(await page.locator('.mmc-refine-list .mmc-opt[aria-checked=true]').getAttribute('title'),'encoder-16.safetensors');
    assert.equal(await page.locator('.mmc-refine-list .mmc-opt[aria-checked=true]').evaluate(node=>{const r=node.getBoundingClientRect(),p=node.parentNode.getBoundingClientRect();return r.top>=p.top-1&&r.bottom<=p.bottom+1;}),true);await fit();
  });
  await check('All remote models share one scrollable list and the last model remains selectable',async()=>{
    await page.locator('.mmc-refine-seg-btn').last().click();await settle();
    assert.equal(await rows('remote').count(),29);await rows('remote').last().scrollIntoViewIfNeeded();await rows('remote').last().click();await settle();assert.equal(await page.evaluate(()=>R.settings().remoteModel),'remote-28');await fit();
  });
  await check('All custom prompt files share one scrollable list and retain add/replace plus templates',async()=>{
    await showTab(1);assert.equal(await rows('skill').count(),14);assert.equal(await page.locator('.mmc-refine-section .mmc-refine-choice-rows').evaluate(node=>node.clientHeight),210);await rows('skill').last().scrollIntoViewIfNeeded();await rows('skill').last().click();await settle();assert.equal(await page.evaluate(()=>R.settings().skill),'custom-12.md');assert.equal(await page.locator('.mmc-refine-modes').count(),1);await fit();
  });
  for(const viewport of [{width:1366,height:768},{width:1024,height:640},{width:800,height:600},{width:640,height:600}]){
    await check(`All settings fit and remain reachable at ${viewport.width}x${viewport.height}`,async()=>{
      await page.setViewportSize(viewport);await settle();for(let index=0;index<3;index++){await showTab(index);await fit();}
    });
  }
  await check('Small viewport section pages support keyboard navigation and sampling edits',async()=>{
    await showTab(0);const first=page.locator('.mmc-refine-settings-tabs [role=tab]').first();await first.focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('.mmc-refine-settings-tabs [aria-selected=true]').textContent(),'prompting');await page.keyboard.press('ArrowRight');assert.equal(await page.locator('.mmc-refine-settings-tabs [aria-selected=true]').textContent(),'Language and sampling');
    await page.locator('.mmc-refine-more-body .mmc-chip').filter({hasText:/^Korean$/}).click();await settle();assert.equal(await page.evaluate(()=>R.settings().language),'Korean');await fit();
  });
  await check('Korean, Japanese and Chinese settings fit at 125 percent text size with all pages accessible',async()=>{
    for(const locale of ['ko','ja','zh']){
      await page.keyboard.press('Escape');await page.setViewportSize({width:1024,height:768});
      await page.evaluate(locale=>{window.locale=locale;document.documentElement.style.setProperty('--mmc-type','1.25');open();},locale);
      await settle();for(let index=0;index<3;index++){await showTab(index);await fit();}
    }
    await page.keyboard.press('Escape');await page.evaluate(()=>{window.locale='en';document.documentElement.style.setProperty('--mmc-type','1');});
  });
  await check('Three actual section controls keep contextual titles and call only their own refine field',async()=>{
    await page.keyboard.press('Escape');await page.setViewportSize({width:1366,height:768});
    await page.evaluate(async()=>{
      window.S=await import('/web/creator/state.js');
      const {PromptBox}=await import('/web/creator/prompt.js');
      const {SegmentPromptSections}=await import('/web/creator/prompt-sections.js');
      const {el}=await import('/web/creator/dom.js');
      const piece=S.parseTimeline(JSON.stringify({version:2,assets:[],subjects:[],segments:[{prompt:'body',prompt_sections:{summary:'summary',retention_analysis:'rules'}}]}));
      window.fieldCalls=[];const ed={state:piece.segments[0],piece,castPiece:piece,root:el('div',{class:'mmc-root'}),refineTarget:()=>({kind:'segment',index:0}),refine:async(options,field)=>fieldCalls.push(field),commitPrompt(){},renderNotices(){},renderAssetsRow(){},dropCited(){},refinePanel:{render(){},setFieldHosts(){}}};
      ed.prompt=new PromptBox({getState:()=>ed.state,getCast:()=>[],getPool:()=>[],onInput(){},onUncited(){}});ed.prompt.setValue(ed.state.prompt);
      const sections=new SegmentPromptSections(ed);ed.root.append(sections.root);document.body.append(ed.root);
    });
    for(const [field,label]of [['summary','summary'],['retention_analysis','retention_analysis'],['prompt','detailed_description']]){
      const button=page.locator(`[data-mmc-refine-section="${field}"] > .mmc-pill`);
      assert.match(await button.getAttribute('title'),new RegExp(`Refine only ${label}`));
      assert.match(await button.getAttribute('aria-label'),new RegExp(`^${label}:`));
      assert.equal(await button.locator('.mmc-tool-icon').evaluate(node=>node.getBoundingClientRect().width),16);
      await button.click();await button.click();await settle();
    }
    assert.deepEqual(await page.evaluate(()=>fieldCalls),['summary','retention_analysis','prompt']);
  });
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log(`PASS ${tests.length} refiner UI checks; no runtime errors or external requests`);
})().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(async()=>{await browser?.close();});
