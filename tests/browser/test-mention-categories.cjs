// Real PromptBox and styles, RAM-only media/preset API; no server or model jobs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(process.env.CONTINUITY_SOURCE_ROOT || path.join(__dirname, '../..'));
const web = path.join(root, 'web/creator');
const read = file => fs.readFileSync(path.join(web, file), 'utf8');
const catalogRun = spawnSync(process.env.PYTHON_EXECUTABLE_PATH || 'python', ['-B', '-c',
  "import sys;sys.path.insert(0,'tests');import layout;print(layout.catalog_json())"],
  {cwd:root, encoding:'utf8', env:{...process.env, PYTHONUTF8:'1'}});
assert.equal(catalogRun.status, 0, catalogRun.stderr);
const catalog = JSON.parse(catalogRun.stdout.split(/\r?\n/).find(line => line.startsWith('{')));
const results = [];
let browser;
(async () => {
  browser = await chromium.launch({headless:true, executablePath:process.env.BROWSER_EXECUTABLE_PATH || undefined});
  const page = await browser.newPage({viewport:{width:1366, height:768}});
  page.setDefaultTimeout(5000);
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(catalog => {
    window.__MMC_FAMILIES = catalog;
    window.locale = 'en';
    window.app = {extensionManager:{setting:{get:key => key === 'Comfy.Locale' ? locale : undefined}}};
    window.calls = [];
    window.apiFixture = async (url, options = {}) => {
      calls.push({url, method:options.method || 'GET'});
      let body = {};
      if (url.startsWith('/continuity/assets')) body = {assets:[
        {path:'input-only-image.png', kind:'image'},
        {path:'input-only-video.mp4', kind:'video'},
        {path:'input-only-audio.wav', kind:'audio'},
      ]};
      if (/\/(?:refine|job|generate|prompt)(?:\?|$)/.test(url)) throw Error('No model or queue calls in this fixture');
      return {ok:true, status:200, json:async () => body};
    };
    window.userDataFixture = async name => {
      calls.push({url:`userdata:${name}`, method:'GET'});
      const body = name === 'continuity.presets.json' ? {presets:[
        {id:'roster-1', scope:'cast', name:'library-only-person', note:'Never registered in this piece', builtin:true,
          data:{cast:{handle:'library-only-person', takes:'person', description:'Library person', from:[]}}},
      ]} : null;
      return {status:body ? 200 : 404, json:async () => body};
    };
  }, catalog);
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'continuity.test') { external.push(url.href); return route.abort(); }
    if (url.pathname === '/') return route.fulfill({contentType:'text/html', body:'<!doctype html><html><head><style>body{margin:0;background:#191919}.fixture{position:fixed;left:24px;right:24px;bottom:32px}.fixture .mmc-prompt{min-height:80px;padding:12px}</style></head><body></body></html>'});
    if (url.pathname === '/scripts/app.js') return route.fulfill({contentType:'text/javascript', body:'export const app=globalThis.app;'});
    if (url.pathname === '/scripts/api.js') return route.fulfill({contentType:'text/javascript', body:'export const api={apiURL:u=>u,addEventListener(){},removeEventListener(){},fetchApi:(url,opts)=>apiFixture(url,opts),getUserData:name=>userDataFixture(name)};'});
    if (url.pathname.startsWith('/web/creator/')) return route.fulfill({contentType:'text/javascript', body:read(url.pathname.slice('/web/creator/'.length))});
    if (url.pathname === '/view' || url.pathname === '/continuity/thumb') return route.fulfill({contentType:'image/svg+xml', body:'<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"><rect width="30" height="30" fill="#62798b"/></svg>'});
    return route.fulfill({status:404, body:''});
  });
  await page.goto('http://continuity.test/');
  await page.evaluate(async () => {
    const {PromptBox} = await import('/web/creator/prompt.js');
    const {el} = await import('/web/creator/dom.js');
    const S = await import('/web/creator/state.js');
    (await import('/web/creator/styles.js')).installStyles();
    window.fixture = (options = {}) => {
      window.box?.closeMenu(); document.querySelector('.fixture')?.remove();
      window.inputs = []; window.attaches = []; window.castImports = []; window.doors = [];
      const a = (handle, kind, filename) => ({handle, kind, role:'reference', filename});
      const own = options.empty ? [] : [a('img-1','image','portrait.png'), a('local-1','image','local-scene.png'), a('ref-dup','video','local-duplicate.mp4')];
      const pool = options.empty ? [] : [a('img-1','image','stale-portrait.png'), a('img-2','video','movement.mp4'), a('aud-1','audio','voice.wav'),
        a('ref-1','image',`environment/${'very-long-reference-name_'.repeat(18)}.png`), a('ref-2','video','ocean.mp4'),
        a('ref-3','audio','rain.wav'), a('ref-dup','video','stale-duplicate.mp4')];
      const subjects = options.empty ? [] : [
        {handle:'subject', takes:'person', from:['img-1'], motion:'img-2', voice:'aud-1', description:'First registered actor'},
        {handle:'subject_2', takes:'person', from:[], description:'Second registered actor'},
      ];
      if (options.many) for (let index=4; index<=55; index++) pool.push(a(`ref-${index}`,'image',`${'long_file_'.repeat(30)}${index}.png`));
      window.piece = S.parseTimeline(JSON.stringify({version:2, segments:[{prompt:''}]}));
      piece.assets=pool;piece.subjects=subjects;
      window.state = piece.segments[0];
      state.assets=own;state.subjects=subjects;
      window.screens = options.empty ? [] : [{handle:'phone-1', label:'Phone screen', file:'screen.png'}];
      window.blocked = !!options.blocked;
      window.box = new PromptBox({getState:() => state, getCast:() => piece.subjects, getPool:() => piece.assets,
        getScreens:() => screens, attachBlocked:() => blocked ? 'Keyframe references blocked' : null,
        replaceHandles:true, onInput:text => {inputs.push(text); state.prompt=text;},
        onAttach:row => {attaches.push(row.path); return 'new-ref';},
        castFromLibrary:member => {castImports.push(member.handle); return member.handle;},
        castStyle:() => 'style', openLibrary:scope => doors.push(scope), onBrowse:() => doors.push('browse')});
      const host=el('div',{class:'mmc-root fixture'},[el('div',{},[box.root])]);document.body.append(host);box.setValue('');
    };
    fixture();
  });
  const check = async (name, run) => { await run(); results.push(name); console.log('PASS '+name); };
  const menu = () => page.locator('.mmc-mention:not(.mmc-handle-replace)');
  const category = which => page.locator(`.mmc-mention-categories [data-mention-category="${which}"]`);
  const handles = () => menu().locator('.mmc-mention-items .mmc-mention-handle').allTextContents();
  const reset = async options => { await page.evaluate(options => fixture(options), options || {}); };
  const type = async (text='@', prefix='') => {
    await page.evaluate(prefix => {box.closeMenu();box.setValue(prefix);box.placeCaret(prefix.length);}, prefix);
    await page.keyboard.type(text);
    try { await menu().waitFor({state:'visible'}); }
    catch (error) { console.error('Menu diagnostics',await page.evaluate(() => ({text:box.getValue(),mode:box.mode,focus:document.activeElement?.outerHTML,html:box.menu?.outerHTML})),errors);throw error; }
  };
  const choose = async handle => menu().locator('.mmc-mention-row').filter({has:page.locator('.mmc-mention-handle',{hasText:new RegExp(`^@${handle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}$`)})}).click();
  const inspect = () => page.evaluate(() => ({text:box.getValue(), caret:box.captureInsertion(), inputs:[...inputs], focused:document.activeElement===box.root}));

  await check('@ offers only registered cast and their owned files, without input-folder or preset reads', async () => {
    await type();
    assert.equal(await category('cast').getAttribute('aria-pressed'),'true');
    assert.deepEqual(new Set(await handles()),new Set(['@subject','@subject_2','@img-1','@img-2','@aud-1']));
    assert.equal(await page.locator('.mmc-mention-head').count(),0);
    assert.deepEqual(await page.evaluate(() => calls.filter(call => call.url.startsWith('/continuity/assets') || call.url.startsWith('userdata:'))),[]);
    assert.doesNotMatch(await menu().innerText(),/library-only|input-only|Attached|In this piece/);
  });
  await check('Category switch preserves the active typing caret and emits no prompt change', async () => {
    const before=await inspect(); await category('refs').click(); const after=await inspect();
    assert.deepEqual(after,before);
    assert.deepEqual(new Set(await handles()),new Set(['@local-1','@ref-dup','@ref-1','@ref-2','@ref-3','@phone-1']));
    assert.equal((await handles()).filter(handle => handle==='@ref-dup').length,1);
    const duplicate=menu().locator('.mmc-mention-row').filter({hasText:'@ref-dup'});
    assert.match(await duplicate.innerText(),/local-duplicate/);assert.doesNotMatch(await duplicate.innerText(),/stale-duplicate/);
    await page.waitForTimeout(160);assert.equal(await menu().isVisible(),true);
  });
  await check('Picking a piece reference inserts at the original mid-sentence caret and leaves suffix untouched', async () => {
    await page.evaluate(() => {box.closeMenu();box.setValue('Before  after');box.placeCaret(7);});
    await page.keyboard.type('@'); await category('refs').click();await choose('ref-2');
    const result=await inspect();assert.equal(result.text,'Before @ref-2  after');assert.equal(result.focused,true);
    assert.deepEqual(await page.evaluate(() => ({attaches,castImports})),{attaches:[],castImports:[]});
    await page.keyboard.type('moves');assert.equal(await page.evaluate(() => box.getValue()),'Before @ref-2 moves after');
  });
  await check('Query falls back to the matching category, and empty query retains an explicit category choice until close', async () => {
    await reset();await type();await category('refs').click();
    await page.keyboard.type('subject_2');
    assert.equal(await category('cast').getAttribute('aria-pressed'),'true');assert.deepEqual(await handles(),['@subject_2']);
    for (let index=0;index<'subject_2'.length;index++) await page.keyboard.press('Backspace');
    await category('refs').click();await page.keyboard.type('ocean');
    assert.deepEqual(await handles(),['@ref-2']);
    for (let index=0;index<'ocean'.length;index++) await page.keyboard.press('Backspace');
    assert.equal(await category('refs').getAttribute('aria-pressed'),'true');assert.equal((await handles()).length,6);
    await page.keyboard.press('Escape');await type();assert.equal(await category('cast').getAttribute('aria-pressed'),'true');
  });
  await check('Unmatched and empty categories retain both pills and a meaningful empty-state message', async () => {
    await page.keyboard.type('no-such-handle');assert.equal(await handles().then(rows=>rows.length),0);
    assert.equal(await page.locator('.mmc-mention-categories button').count(),2);assert.ok(await menu().locator('.mmc-mention-empty').innerText());
    await reset({empty:true});await type();assert.equal(await page.locator('.mmc-mention-categories button').count(),2);
    assert.ok(await menu().locator('.mmc-mention-empty').innerText());await category('refs').click();assert.ok(await menu().locator('.mmc-mention-empty').innerText());
    assert.equal(await page.evaluate(() => calls.some(call=>call.url.startsWith('/continuity/assets')||call.url.startsWith('userdata:'))),false);
  });
  await check('A keyframe-blocked pool stays unavailable while already attached files and screen citations remain usable', async () => {
    await reset({blocked:true});await type();
    const cast=await handles();assert.ok(cast.includes('@subject'));assert.ok(cast.includes('@img-1'));assert.ok(!cast.includes('@img-2'));assert.ok(!cast.includes('@aud-1'));
    await category('refs').click();assert.deepEqual(new Set(await handles()),new Set(['@local-1','@ref-dup','@phone-1']));
    await choose('local-1');assert.equal(await page.evaluate(() => box.getValue()),'@local-1 ');
  });
  await check('Owned files use the same category and are recognized as atomic chips after picking', async () => {
    await reset();await type('@voice');assert.equal(await category('cast').getAttribute('aria-pressed'),'true');
    assert.deepEqual(await handles(),['@aud-1']);await choose('aud-1');
    assert.equal(await page.locator('.fixture .mmc-ref[data-handle="aud-1"]').count(),1);
    assert.equal(await page.evaluate(() => box.getValue()),'@aud-1 ');
  });
  await check('/ remains the import menu with library fetches, source branches and file insertion', async () => {
    await reset();await type('/');assert.equal(await page.locator('.mmc-mention-categories').count(),0);
    await page.waitForFunction(() => calls.some(call=>call.url.startsWith('/continuity/assets')) && calls.some(call=>call.url==='userdata:continuity.presets.json'));
    assert.match(await menu().innerText(),/Style/);assert.match(await menu().innerText(),/Cast/);assert.match(await menu().innerText(),/References/);
    await menu().locator('.mmc-mention-row').filter({hasText:'References'}).click();
    await menu().locator('.mmc-mention-row').filter({hasText:'input-only-video.mp4'}).click();
    assert.deepEqual(await page.evaluate(() => attaches),['input-only-video.mp4']);assert.equal(await page.evaluate(() => box.getValue()),'@new-ref ');
    await type('@');assert.equal(await page.locator('.mmc-mention-categories button').count(),2);assert.doesNotMatch(await menu().innerText(),/input-only|library-only/);
  });
  await check('Repeated @ / quote mode transitions do not retain the wrong tabs, branch or insertion target', async () => {
    await reset();
    for (let index=0;index<3;index++) {
      await type();await category('refs').click();await page.keyboard.press('Escape');
      await type('/');assert.equal(await page.locator('.mmc-mention-categories').count(),0);await page.keyboard.press('Escape');
    }
    await type('"Hello."');assert.equal(await page.locator('.mmc-mention-categories').count(),0);
    await page.keyboard.press('Escape');await type();await choose('subject_2');
    assert.equal(await page.evaluate(() => box.getValue()),'@subject_2 ');
  });
  await check('Existing handle replacement remains its own dialog without category tabs', async () => {
    await reset();await page.evaluate(() => {box.setValue('@ref-1 watches @ref-1.');box.editHandle(box.root.querySelector('[data-handle="ref-1"]'));});
    const replacement=page.locator('.mmc-handle-replace');await replacement.waitFor({state:'visible'});
    assert.equal(await replacement.locator('.mmc-mention-categories').count(),0);
    await replacement.getByRole('textbox',{name:'Replacement handle'}).fill('ref-2');
    await replacement.getByRole('button',{name:'Replace',exact:true}).click();
    assert.equal(await page.evaluate(() => box.getValue()),'@ref-2 watches @ref-1.');
  });
  await check('Large lists scroll only the items, keep the pills stationary, and ellipsize long file names', async () => {
    await reset({many:true});await type();await category('refs').click();
    const geometry=await menu().evaluate(node=>{
      const items=node.querySelector('.mmc-mention-items'),header=node.querySelector('.mmc-mention-categories'),r=node.getBoundingClientRect();
      return {width:r.width,height:r.height,scroll:items.scrollHeight>items.clientHeight,outer:node.scrollHeight>node.clientHeight+1,wide:node.scrollWidth>node.clientWidth+1,headerTop:header.getBoundingClientRect().top};
    });
    assert.ok(geometry.width>=390,JSON.stringify(geometry));assert.ok(geometry.height>=350,JSON.stringify(geometry));
    assert.equal(geometry.scroll,true);assert.equal(geometry.outer,false);assert.equal(geometry.wide,false);
    await menu().locator('.mmc-mention-items').evaluate(node=>{node.scrollTop=500;node.dispatchEvent(new Event('scroll'));});
    assert.equal(await menu().locator('.mmc-mention-categories').evaluate(node=>node.getBoundingClientRect().top),geometry.headerTop);
    assert.ok(await menu().locator('.mmc-mention-sub').evaluateAll(nodes=>nodes.some(node=>node.scrollWidth>node.clientWidth)));
  });
  await check('Mention geometry stays in the viewport at normal and 125% text sizes including a narrow screen', async () => {
    for (const viewport of [{width:1366,height:768},{width:800,height:600},{width:360,height:640}]) for (const scale of [1,1.25]) {
      await page.setViewportSize(viewport);await page.evaluate(scale=>{document.documentElement.style.setProperty('--mmc-type',scale);},scale);
      await reset({many:true});await type();await category('refs').click();
      const geometry=await menu().evaluate(node=>{
        const r=node.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,
          menuWide:node.scrollWidth>node.clientWidth+1,listWide:node.querySelector('.mmc-mention-items').scrollWidth>node.querySelector('.mmc-mention-items').clientWidth+1};
      });
      assert.ok(geometry.x>=7&&geometry.y>=7&&geometry.right<=viewport.width-7&&geometry.bottom<=viewport.height-7,JSON.stringify({viewport,scale,geometry}));
      assert.equal(geometry.menuWide,false);assert.equal(geometry.listWide,false);
      assert.equal(await page.locator('.mmc-mention-categories button').count(),2);
      for (const button of await page.locator('.mmc-mention-categories button').all()) assert.equal(await button.isVisible(),true);
    }
  });
  await check('Escape dismisses the mention picker before its real parent overlay', async () => {
    await page.setViewportSize({width:1366,height:768});await reset();
    await page.evaluate(async () => {
      const {mountOverlay}=await import('/web/creator/dom.js');
      const overlay=document.createElement('div');overlay.className='mmc-overlay fixture-overlay';
      overlay.append(document.querySelector('.fixture'));window.overlayEscapes=0;
      const unmount=mountOverlay(overlay,()=>{overlayEscapes++;unmount();});
    });
    await type();await category('refs').click();
    assert.equal(await menu().evaluate(node=>node.classList.contains('mmc-pop')),true);
    await page.keyboard.press('Escape');
    assert.equal(await menu().count(),0);assert.equal(await page.locator('.fixture-overlay').count(),1);
    assert.equal(await page.evaluate(()=>overlayEscapes),0);assert.equal(await page.evaluate(()=>box.getValue()),'');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.fixture-overlay').count(),0);assert.equal(await page.evaluate(()=>overlayEscapes),1);
  });
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log(JSON.stringify({passed:results.length,pageErrors:errors,externalRequests:external.length,results},null,2));
})().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(async()=>{await browser?.close();});
