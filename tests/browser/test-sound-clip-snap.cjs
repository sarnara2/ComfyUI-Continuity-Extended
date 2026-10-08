// Real SoundLane DOM and state/canvas arithmetic, isolated from ComfyUI/GPU.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const repo = path.resolve(__dirname, '../..');
const web = path.join(repo, 'web/creator');
const read = file => fs.readFileSync(path.join(web, file), 'utf8');
const dumped = spawnSync(process.env.PYTHON_EXE || 'python3', ['-c',
  "import sys;sys.path.insert(0,'tests');import layout;print('CATALOG:'+layout.catalog_json())"],
  { cwd: repo, encoding: 'utf8' });
assert.equal(dumped.status, 0, dumped.stderr);
const catalog = JSON.parse(dumped.stdout.match(/^CATALOG:(.+)$/m)[1]);
// A second rate catches assumptions hidden by today's two 24 fps manifests.
catalog.families.find(f => f.id === 'ltx25').canvas.fps.value = 30;
const css = ['base', 'editor', 'timeline'].map(file => read(`styles/${file}.js`)
  .match(/export const css = `([^]*)`;\s*$/)[1]).join('\n');
const stubs = {
  'api.js': 'export const probe=async()=>({duration:60});',
  'waveform.js': 'export const peaks=async()=>[];export const draw=()=>{};',
  'picker.js': 'export const openPicker=async()=>null;',
  'trim.js': 'export const openTrim=async()=>null;export const formatTime=n=>n.toFixed(3);',
};
const results = [];
let browser, external = 0;
const check = async (name, run) => { await run(); results.push(name); console.log('PASS '+name); };
(async () => {
  browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined, headless: true });
  const page = await browser.newPage({ viewport: { width: 1220, height: 500 }, locale:'en-US' });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://continuity.test') { external++; return route.abort(); }
    if (url.pathname === '/') return route.fulfill({contentType:'text/html', body:'<style>'+css+'\n:root{--comfy-menu-bg:#181818;--fg-color:#ddd;--input-text:#eee;--descrip-text:#999;--bg-color:#161616;--primary-background:#267ba7;--destructive-background:#d66;--mmc-type:1}body{margin:0;background:#181818;font-family:Arial;color:#eee}</style><body style="padding:30px"></body>'});
    const name = decodeURIComponent(url.pathname.slice(1));
    if (stubs[name]) return route.fulfill({contentType:'text/javascript', body:stubs[name]});
    if (!/^[a-z0-9/-]+\.js$/.test(name)) { external++; return route.abort(); }
    return route.fulfill({contentType:'text/javascript', body:read(name)});
  });
  await page.goto('http://continuity.test/');
  await page.evaluate(catalog => { window.__MMC_FAMILIES = catalog; }, catalog);
  await page.evaluate(async () => {
    const {SoundLane} = await import('/soundlane.js');
    const S = await import('/state.js'), C = await import('/canvas.js');
    window.S = S; window.C = C; window.SoundLane = SoundLane;
    window.mountLane = ({family='h3', sound, segments}={}) => {
      document.querySelector('#fixture')?.remove();
      window.piece = S.parseTimeline(JSON.stringify({ version:2, family, prompt:'x',
        segments:segments || [14.2,14.9,8.4].map(duration_s=>({prompt:'x',duration_s})),
        sound:sound || [{filename:'voice.wav',at_s:2,in_s:0,out_s:3.3}],
      }));
      window.snaps = new Set(); window.commits = 0; window.opened = 0;
      window.createLane = () => {
        window.lane = new SoundLane({read:()=>piece,onCommit:()=>{S.syncTimeline(piece);commits++;},snaps});
        lane.openBlock = () => { opened++; };
        for(const entry of piece.sound) lane.lengths.set(entry.filename,60);
        const host=lane.render();host.id='fixture';document.body.append(host);
      };
      createLane();
    };
    window.framesOf = () => Math.round(piece.sound[0].at_s*C.rulesFor(piece.family).fps);
    window.desiredDrag = desired => {
      const node=document.querySelector('.mmc-snd-block'),rect=node.getBoundingClientRect();
      const laneRect=lane.laneEl.getBoundingClientRect();
      const from=rect.x+rect.width*0.6,y=rect.y+rect.height*0.46;
      const current=framesOf();
      return {from,y,to:from+(desired-current)*laneRect.width/lane.total()};
    };
  });
  const drag = async desired => {
    const {from,y,to}=await page.evaluate(desired=>desiredDrag(desired),desired);
    await page.mouse.move(from,y);await page.mouse.down();await page.mouse.move(to,y,{steps:4});await page.mouse.up();
  };
  await check('Each track defaults to free drag; magnet click is UI-only and does not open trim', async()=>{
    await page.evaluate(()=>mountLane());
    const before=await page.evaluate(()=>S.serializeTimeline(piece));
    const button=page.locator('.mmc-snd-magnet');
    assert.equal(await button.getAttribute('aria-pressed'),'false');
    await button.click();
    assert.equal(await button.getAttribute('aria-pressed'),'true');
    assert.deepEqual(await page.evaluate(()=>[commits,opened,lane.working]),[0,0,null]);
    assert.equal(await page.evaluate(()=>S.serializeTimeline(piece)),before);
    await button.click();
    const cut=await page.evaluate(()=>S.passWindows(piece)[1].at);
    await drag(cut-3);
    assert.equal(await page.evaluate(()=>framesOf()),cut-3);
  });
  for(const family of ['h3','ltx25']) {
    await check(family+' body drag snaps its START to exact delivered cut regardless of grab position',async()=>{
      await page.evaluate(family=>mountLane({family}),family);
      await page.locator('.mmc-snd-magnet').click();
      const cut=await page.evaluate(()=>S.passWindows(piece)[1].at);
      await drag(cut-3);
      assert.equal(await page.evaluate(()=>framesOf()),cut);
      assert.equal(await page.evaluate(()=>commits),1);
      assert.equal(await page.locator('.mmc-snd-magnet').getAttribute('aria-pressed'),'true');
    });
    await check(family+' body drag snaps its END without changing duration or source trim',async()=>{
      await page.evaluate(family=>mountLane({family}),family);
      await page.locator('.mmc-snd-magnet').click();
      const {cut,length}=await page.evaluate(()=>({cut:S.passWindows(piece)[1].at,length:Math.round(3.3*C.rulesFor(piece.family).fps)}));
      await drag(cut-length+3);
      assert.equal(await page.evaluate(()=>framesOf()),cut-length);
      assert.deepEqual(await page.evaluate(()=>[piece.sound[0].in_s,piece.sound[0].out_s]),[0,3.3]);
    });
  }
  await check('Snap distance is seven pixels; a farther cue remains freely placed',async()=>{
    await page.evaluate(()=>mountLane());await page.locator('.mmc-snd-magnet').click();
    const at=await page.evaluate(()=>S.passWindows(piece)[1].at+Math.ceil(7*lane.perPixel())+4);
    await drag(at);assert.equal(await page.evaluate(()=>framesOf()),at);
  });
  await check('Continuity head/tail trims and a supplied clip use delivered, not nominal, edges',async()=>{
    await page.evaluate(()=>mountLane({segments:[
      {prompt:'one',duration_s:14.2},
      {prompt:'two',duration_s:14.9,continue:true,feather:22},
      {kind:'clip',filename:'cut.mp4',trim:{start:1,end:7.25},continue:true,feather:22},
    ]}));
    await page.locator('.mmc-snd-magnet').click();
    const cut=await page.evaluate(()=>S.passWindows(piece)[2].at);
    await drag(cut-2);assert.equal(await page.evaluate(()=>framesOf()),cut);
    assert.notEqual(cut,Math.round(29.1*24));
  });
  await check('Internal merged-shot cuts are also precise snap targets',async()=>{
    await page.evaluate(()=>mountLane({segments:[{prompt:'a',duration_s:7.3},{prompt:'b',duration_s:6.9,merge:true},{prompt:'c',duration_s:12}]}));
    await page.locator('.mmc-snd-magnet').click();const cut=Math.round(7.3*24);
    await drag(cut-2);assert.equal(await page.evaluate(()=>framesOf()),cut);
  });
  await check('Snapping never puts either audio edge outside the finished piece',async()=>{
    await page.evaluate(()=>mountLane());await page.locator('.mmc-snd-magnet').click();
    await drag(2);assert.equal(await page.evaluate(()=>framesOf()),0);
    const tail=await page.evaluate(()=>lane.total()-Math.round(3.3*C.rulesFor(piece.family).fps));
    await drag(tail-2);assert.equal(await page.evaluate(()=>framesOf()),tail);
  });
  await check('A neighbour may block a cut, but no false snap indicator or overlap is drawn',async()=>{
    await page.evaluate(()=>mountLane({sound:[{filename:'voice.wav',at_s:2,in_s:0,out_s:3.3},{filename:'next.wav',at_s:17,in_s:0,out_s:2}]}));
    await page.locator('.mmc-snd-magnet').first().click();
    const cut=await page.evaluate(()=>S.passWindows(piece)[1].at);
    const {from,y,to}=await page.evaluate(desired=>desiredDrag(desired),cut-2);
    await page.mouse.move(from,y);await page.mouse.down();await page.mouse.move(to,y);
    assert.equal(await page.evaluate(()=>lane.snapEl.classList.contains('on')),false);
    await page.mouse.up();
    assert.ok(await page.evaluate(()=>{
      const fps=C.rulesFor(piece.family).fps;
      return Math.round(piece.sound[0].at_s*fps)+Math.round((piece.sound[0].out_s-piece.sound[0].in_s)*fps)
        <=Math.round(piece.sound[1].at_s*fps);
    }));
  });
  await check('Magnet keyboard toggle, delete protection and local reopen survive with no serialized preference',async()=>{
    await page.evaluate(()=>mountLane());const button=page.locator('.mmc-snd-magnet');
    await button.focus();await page.keyboard.press('Space');
    assert.equal(await button.getAttribute('aria-pressed'),'true');
    await page.keyboard.press('Delete');assert.equal(await page.locator('.mmc-snd-block').count(),1);
    await page.evaluate(()=>{lane.destroy();lane.host.remove();createLane();});
    assert.equal(await page.locator('.mmc-snd-magnet').getAttribute('aria-pressed'),'true');
    await page.evaluate(()=>{lane.snaps=new Set();lane.render();});
    assert.equal(await page.locator('.mmc-snd-magnet').getAttribute('aria-pressed'),'false');
    assert.ok(!await page.evaluate(()=>S.serializeTimeline(piece).includes('snap')));
  });
  await check('Cancelled pointer drag restores layout and does not commit or open trim',async()=>{
    await page.evaluate(()=>mountLane());
    const before=await page.evaluate(()=>S.serializeTimeline(piece));
    const {from,y,to}=await page.evaluate(()=>desiredDrag(200));
    await page.mouse.move(from,y);await page.mouse.down();await page.mouse.move(to,y);
    await page.evaluate(()=>document.querySelector('.mmc-snd-block').dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,bubbles:true})));
    await page.mouse.up();
    assert.equal(await page.evaluate(()=>S.serializeTimeline(piece)),before);
    assert.equal(await page.evaluate(()=>commits),0);
    assert.equal(await page.evaluate(()=>lane.working),null);
    assert.equal(await page.evaluate(()=>opened),0);
  });
  await check('Per-track switches remain separate across reorder and deletion; no removed UI entries leak',async()=>{
    await page.evaluate(()=>mountLane({sound:[{filename:'a.wav',at_s:0,in_s:0,out_s:3},{filename:'b.wav',at_s:8,in_s:0,out_s:3}]}));
    await page.locator('.mmc-snd-magnet').nth(1).click();
    await page.evaluate(()=>lane.slide(1,-1));
    assert.deepEqual(await page.evaluate(()=>piece.sound.map((entry,index)=>[entry.filename,lane.snapping(index)])),[['b.wav',true],['a.wav',false]]);
    await page.evaluate(()=>lane.remove(0));assert.equal(await page.evaluate(()=>snaps.size),0);
  });
  await check('syncSound shortening replaces the entry without losing the magnet choice',async()=>{
    await page.evaluate(()=>mountLane());await page.locator('.mmc-snd-magnet').click();
    await page.evaluate(()=>{piece.segments=[{prompt:'a',duration_s:3}];S.syncTimeline(piece);lane.render();});
    assert.equal(await page.locator('.mmc-snd-magnet').getAttribute('aria-pressed'),'true');
    assert.equal(await page.evaluate(()=>snaps.size),1);
  });
  await check('Normal clip shows magnet bottom-left and removal bottom-right, with separate hit targets',async()=>{
    await page.evaluate(()=>mountLane());await page.locator('.mmc-snd-block').hover();
    const magnet=await page.locator('.mmc-snd-magnet').boundingBox(),drop=await page.locator('.mmc-snd-drop').boundingBox();
    assert.ok(magnet.x+magnet.width<=drop.x,'controls overlap');
    assert.equal(magnet.y,drop.y);
    const directory=process.env.SCREENSHOT_DIR;
    if(directory){fs.mkdirSync(directory,{recursive:true});await page.screenshot({path:path.join(directory,'sound-clip-snap.png')});}
  });
  await check('Short audio clips keep magnet and removal hit targets separate',async()=>{
    await page.evaluate(()=>mountLane({sound:[{filename:'short.wav',at_s:2,in_s:0,out_s:1.5}]}));
    await page.locator('.mmc-snd-block').hover();
    const magnet=await page.locator('.mmc-snd-magnet').boundingBox(),drop=await page.locator('.mmc-snd-drop').boundingBox();
    assert.ok(magnet.x+magnet.width<=drop.x,'short-clip controls overlap');
    await page.locator('.mmc-snd-magnet').click();
    assert.deepEqual(await page.evaluate(()=>[commits,opened,snaps.size]),[0,0,1]);
    const directory=process.env.SCREENSHOT_DIR;
    if(directory) await page.screenshot({path:path.join(directory,'sound-clip-snap-short.png')});
  });
  await check('Very narrow clips use separate vertical magnet/removal targets instead of overlapping',async()=>{
    await page.evaluate(()=>mountLane({sound:[{filename:'short.wav',at_s:2,in_s:0,out_s:1}]}));
    await page.locator('.mmc-snd-block').hover();
    const magnet=await page.locator('.mmc-snd-magnet').boundingBox(),drop=await page.locator('.mmc-snd-drop').boundingBox();
    assert.ok(magnet.y+magnet.height<=drop.y,'very-short-clip controls overlap');
    await page.locator('.mmc-snd-magnet').click();assert.equal(await page.evaluate(()=>snaps.size),1);
  });
  assert.equal(external,0,'no real network requests');
  console.log(JSON.stringify({passed:results.length,external,checks:results}));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();});
