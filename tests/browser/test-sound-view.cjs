// Actual SoundLane/SoundView/disclosure/state/CSS, RAM peaks and fake file API.
// No live server, filesystem media, profile, waveform decode, GPU or audio render.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const repo = process.env.CONTINUITY_SOURCE_ROOT ? path.resolve(process.env.CONTINUITY_SOURCE_ROOT) : path.resolve(__dirname, '../..');
const read = name => fs.readFileSync(path.join(repo, 'web/creator', name), 'utf8');
const baseline = process.env.CONTINUITY_BASELINE_DIR ? path.resolve(process.env.CONTINUITY_BASELINE_DIR) : path.resolve(repo, '../baseline');
const shared = path.join(repo, 'tests/browser/test-card-individual-preview.cjs'), legacy = fs.readFileSync(shared, 'utf8');
const boundary = legacy.indexOf('\n(async()=>{'); assert.ok(boundary > 0);
const fixture = vm.runInNewContext(legacy.slice(0, boundary) + '\n;({setupPage,errors,getRequests:()=>requests});', { require, process, __dirname: path.dirname(shared) }, { filename: shared });
const method = (source, name) => { const found = source.match(new RegExp('^  (?:async )?' + name + '\\([^]*?^  \\}', 'm')); assert.ok(found, name); return found[0]; };
const sources = Object.fromEntries(['soundlane.js', 'sound-view.js', 'sound.js', 'disclosure.js', 'waveform.js'].map(name => [name, read(name)]));
sources.onEscape = method(read('timeline.js'), 'onEscape');
const css = ['base', 'editor', 'picker', 'overlays', 'timeline'].map(name => read('styles/' + name + '.js').match(/export const css = `([^]*)`;\s*$/)[1]).join('\n');
const output = path.resolve(process.env.CONTINUITY_ARTIFACT_DIR || path.join(os.tmpdir(), 'continuity-sound-view'));
fs.mkdirSync(output, { recursive: true });

// View integration may touch lifecycle/render/drag cancellation only. Audio
// positions, copy/trim/import/store/snap/math remain the original production code.
if (fs.existsSync(path.join(baseline, 'web/creator/soundlane.js'))) {
  const before = fs.readFileSync(path.join(baseline, 'web/creator/soundlane.js'), 'utf8');
  for (const name of ['rules','seconds','commit','total','pct','frameAt','perPixel','snapPoints','snap','snapping','snapMove','syncSnaps','blocks','settle','at','store','slide','trim','matchedCard','rematch','remove','openBlock','lay','lengthOf','paint','paintGaps','showRead','snapLabels','showSnap','arrows','renderReel','renderRead','showShot','renderBlock','grip','magnet','dropper','renderGap','renderPinned','paintWaves']) {
    assert.equal(method(sources['soundlane.js'], name), method(before, name), 'Original Sound owner ' + name);
  }
  assert.equal(method(sources['soundlane.js'], 'add').replace(' selectionPurpose: "soundlane-files",', ''), method(before, 'add').replace(' selectionPurpose: "soundlane-files",', ''), 'Explicit picker annotation only');
  assert.deepEqual(fs.readFileSync(path.join(repo, 'web/creator/sound.js')), fs.readFileSync(path.join(baseline, 'web/creator/sound.js')), 'Sound frame arithmetic untouched');
  assert.deepEqual(fs.readFileSync(path.join(repo, 'creator/sound.py')), fs.readFileSync(path.join(baseline, 'creator/sound.py')), 'Backend sound untouched');
}

async function setup(context) {
  const page = await fixture.setupPage(context); await page.addStyleTag({ content: css });
  await page.evaluate(async sources => {
    const url = text => URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    const urls = { ...moduleUrls };
    urls['api.js'] = url(`export async function probe(name){window.soundCalls.push(['probe',name]);return {duration:30};} export async function fetchPeaks(name){window.soundCalls.push(['peaks',name]);return new Float32Array(128).fill(.5);}`);
    urls['picker.js'] = url(`export async function openPicker(options){window.soundCalls.push(['picker',options]);return null;}`);
    urls['trim.js'] = url(`export async function openTrim(options){window.soundCalls.push(['trim',options]);return null;} export const formatTime=n=>Number(n).toFixed(2);`);
    const build = name => urls[name] || (urls[name] = url(sources[name].replace(/from\s*"\.\/([^"]+)"/g, (_whole, child) => 'from "' + build(child) + '"')));
    window.L = await import(build('soundlane.js')); window.Z = await import(build('sound-view.js'));
    window.Disclosure = await import(build('disclosure.js'));
    window.mountSound = ({ language = 'en', scale = 1, empty = false } = {}) => {
      window.soundLane?.destroy(); window.timelineSubject?.close(); window.destroyFixture();
      window.language = language; document.documentElement.style.setProperty('--mmc-type', String(scale));
      window.soundCalls = []; window.soundCommits = 0; window.sectionChanges = [];
      const piece = S.parseTimeline(JSON.stringify({ version: 2, face_schema: 1,
        segments: [{ prompt: 'One', duration_s: 10 }, { prompt: 'Two', duration_s: 10 }],
        sound: empty ? [] : [{ filename: 'first.wav', at_s: 2, in_s: 0, out_s: 3 }, { filename: 'second.wav', at_s: 8, in_s: 1, out_s: 4 }] }));
      window.soundPiece = piece;
      window.soundLane = new L.SoundLane({ read: () => piece, onCommit: () => soundCommits++,
        sectionOptions: { initialOpen: true, onOpenChange: open => sectionChanges.push(open) } });
      const cast = Disclosure.createDisclosure({ title: I.t('Cast'), content: D.el('div') });
      cast.root.dataset.fixture = 'cast';
      const strip = D.el('div', { class: 'fixture-independent-strip' }, [D.el('div', { style: { width: '2000px', height: '12px' } })]);
      const body = D.el('div', { class: 'mmc-tl-body' }, [cast.root, strip, soundLane.host, D.el('div', { style: { height: '1000px' } })]);
      const modal = D.el('div', { class: 'mmc-modal mmc-tl-modal' }, [body]);
      const overlay = D.el('div', { class: 'mmc-root mmc-overlay' }, [modal]); document.querySelector('#host').append(overlay);
      window.soundOverlay = overlay;
      strip.style.cssText = 'overflow-x:auto;min-width:0;flex:none';
      soundLane.render(); return JSON.stringify(piece);
    };
    window.soundInfo = () => {
      const v = soundLane.view, r = soundLane.laneEl.getBoundingClientRect(), vr = v.viewport.getBoundingClientRect();
      return { zoom: soundLane.viewState.zoom, scroll: v.viewport.scrollLeft, width: v.axis.offsetWidth,
        viewport: v.viewport.clientWidth, rect: { x: vr.x, y: vr.y, width: vr.width, height: vr.height },
        lane: { x: r.x, y: r.y, width: r.width, height: r.height }, commits: soundCommits,
        piece: JSON.stringify(soundPiece), working: Boolean(soundLane.working), dragging: Boolean(v.gesture), tool: soundLane.viewState.tool };
    };
    window.mountSoundOverlay = () => {
      window.soundModalCloses = 0;
      const Owner = new Function('D', 'return class { ' + sources.onEscape +
        ' constructor(){this.sound=window.soundLane;}' +
        ' close(){window.soundModalCloses++;this.sound.destroy();this.unmount();}' +
        ' }')(D);
      window.soundEscapeOwner = new Owner();
      soundEscapeOwner.unmount = D.mountOverlay(soundOverlay, () => soundEscapeOwner.onEscape());
    };
  }, sources);
  return page;
}

(async () => {
  const checks = [], layouts = []; let browser;
  const check = async (name, run) => { await run(); checks.push(name); console.log('PASS ' + name); };
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined,
      ignoreDefaultArgs: ['--hide-scrollbars'] });
    const context = await browser.newContext({ viewport: { width: 1200, height: 850 } });
    const page = await setup(context); await page.evaluate(() => mountSound());
    await page.waitForFunction(() => soundLane.view.room > 0);
    const initial = await page.evaluate(() => soundInfo());
    await check('Actual disclosure shares Cast title, removes prose, folds independently and never commits', async () => {
      const shape = await page.evaluate(() => ({ sound: getComputedStyle(soundLane.disclosure.root.querySelector('.mmc-tl-section-title')).font,
        cast: getComputedStyle(document.querySelector('[data-fixture="cast"] .mmc-tl-section-title')).font,
        prose: soundLane.host.querySelector('.mmc-snd-hint,.mmc-snd-how') !== null }));
      assert.equal(shape.sound, shape.cast); assert.equal(shape.prose, false);
      const pills=await page.locator('.mmc-snd .mmc-tl-header-action').evaluateAll(nodes=>nodes.map(n=>{const s=getComputedStyle(n);return{radius:parseFloat(s.borderRadius),height:n.getBoundingClientRect().height,background:s.backgroundColor,color:s.color};}));
      assert.ok(pills.every(p=>p.radius>=p.height/2&&p.background!=='rgb(239, 239, 239)'),JSON.stringify(pills));
      await page.locator('.mmc-snd .mmc-tl-section-toggle').click();
      assert.equal(await page.locator('.mmc-snd-viewport').isVisible(), false);
      assert.equal(await page.locator('[data-fixture="cast"]').getAttribute('data-open'), 'true');
      await page.locator('.mmc-snd .mmc-tl-section-toggle').click();
      assert.deepEqual(await page.evaluate(() => sectionChanges), [false,true]);
      assert.equal(await page.evaluate(() => soundCommits), 0);
    });
    await check('Ctrl+wheel always zooms at cursor, preserves exact clock/file windows, and real frameAt follows enlarged lane', async () => {
      const before = await page.evaluate(() => { const i=soundInfo(); return { ...i, frame:soundLane.frameAt({clientX:i.lane.x+i.lane.width*.4}) }; });
      await page.mouse.move(before.lane.x + before.lane.width * .4, before.lane.y + 25);
      await page.keyboard.down('Control'); await page.mouse.wheel(0,-400); await page.keyboard.up('Control');
      const after = await page.evaluate(point => ({ ...soundInfo(), frame:soundLane.frameAt({clientX:point}) }), before.lane.x + before.lane.width * .4);
      assert.ok(after.zoom > 1); assert.ok(Math.abs(after.frame-before.frame) <= 1); assert.equal(after.piece, initial.piece); assert.equal(after.commits,0);
      assert.equal(await page.evaluate(() => soundLane.viewState.tool), false);
    });
    await check('Native horizontal rail pans only Sound; reel/lane/ruler share exact axis and dragging thumb works', async () => {
      const info = await page.evaluate(() => { soundLane.view.by(2); return soundInfo(); });
      const before = await page.evaluate(() => ({ left:soundLane.view.viewport.scrollLeft,strip:document.querySelector('.fixture-independent-strip').scrollLeft,top:document.querySelector('.mmc-tl-body').scrollTop }));
      const trackY = info.rect.y + info.rect.height - 3, thumbWidth = info.viewport / info.width * info.rect.width;
      const thumbX = info.rect.x + (info.scroll / (info.width-info.viewport)) * (info.rect.width-thumbWidth) + thumbWidth/2;
      await page.mouse.move(thumbX,trackY); await page.mouse.down(); await page.mouse.move(thumbX+80,trackY,{steps:8}); await page.mouse.up();
      const after = await page.evaluate(() => ({ left:soundLane.view.viewport.scrollLeft,strip:document.querySelector('.fixture-independent-strip').scrollLeft,top:document.querySelector('.mmc-tl-body').scrollTop,
        widths:[soundLane.view.axis,...soundLane.view.axis.children].map(n=>Math.round(n.getBoundingClientRect().width)),style:getComputedStyle(soundLane.view.viewport).scrollbarColor }));
      assert.ok(after.left>before.left+10,'Native thumb moved Sound'); assert.equal(after.strip,before.strip); assert.equal(after.top,before.top);
      assert.equal(new Set(after.widths).size,1); assert.notEqual(after.style,'auto');
      await page.evaluate(()=>soundLane.view.tool(true));
      const on=await page.evaluate(()=>soundInfo()),onX=on.rect.x+(on.scroll/(on.width-on.viewport))*(on.rect.width-thumbWidth)+thumbWidth/2;
      await page.mouse.move(onX,trackY);await page.mouse.down();await page.mouse.move(onX+35,trackY,{steps:5});await page.mouse.up();
      const panned=await page.evaluate(()=>soundInfo());assert.ok(panned.scroll>on.scroll+10);assert.equal(panned.zoom,on.zoom);assert.equal(panned.commits,0);
      await page.evaluate(()=>soundLane.view.tool(false));
      await page.screenshot({path:path.join(output,'native-sound-scrollbar.png')});
    });
    await check('Zoom tool scrub preserves start cursor frame, suppresses block/grip clicks/keys and never edits audio', async () => {
      await page.evaluate(() => { soundLane.view.fit(); soundLane.view.tool(true); });
      const box = await page.locator('.mmc-snd-block').first().boundingBox(), x=box.x+box.width*.5,y=box.y+box.height*.5;
      const frame = await page.evaluate(x => soundLane.frameAt({clientX:x}),x);
      await page.mouse.move(x,y); await page.mouse.down(); await page.mouse.move(x+140,y,{steps:12});
      assert.equal(await page.evaluate(() => Boolean(soundLane.working)),false);
      await page.mouse.up();
      assert.ok(Math.abs(await page.evaluate(x => soundLane.frameAt({clientX:x}),x)-frame)<=1);
      await page.locator('.mmc-snd-block').first().focus(); await page.keyboard.press('Delete'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => soundCommits),0); assert.equal(await page.evaluate(() => JSON.stringify(soundPiece)),initial.piece);
      assert.equal(await page.evaluate(() => soundCalls.filter(c=>c[0]==='trim').length),0);
      await page.keyboard.press('Escape'); assert.equal(await page.evaluate(() => soundLane.viewState.tool),false);
      await page.getByRole('button',{name:'Zoom tool',exact:true}).click();await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(()=>soundLane.viewState.tool),false,'Escape from Zoom toolbar turns off tool before modal dismiss');
      await page.getByRole('button',{name:'Zoom tool',exact:true}).click();await page.getByRole('button',{name:'Fit',exact:true}).focus();await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(()=>soundLane.viewState.zoom),1,'Toolbar keyboard remains accessible in Zoom mode');await page.evaluate(()=>soundLane.view.tool(false));
    });
    await check('Off mode original body drag commits once; trim moves its original window once; pointer cancellation rolls back', async () => {
      await page.evaluate(() => { soundLane.view.fit(); soundLane.viewState.tool=false; });
      const before = await page.evaluate(() => soundInfo()),box = await page.locator('.mmc-snd-block').first().boundingBox();
      await page.mouse.move(box.x+box.width*.5,box.y+15); await page.mouse.down(); await page.mouse.move(box.x+box.width*.5+40,box.y+15,{steps:5}); await page.mouse.up();
      assert.equal(await page.evaluate(() => soundCommits),1);
      const moved = await page.evaluate(() => soundPiece.sound[0].at_s); assert.ok(moved>2);
      const grip = await page.locator('.mmc-snd-block .mmc-snd-grip.tail').first().boundingBox();
      await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2); await page.mouse.down(); await page.mouse.move(grip.x+grip.width/2+25,grip.y+grip.height/2,{steps:5}); await page.mouse.up();
      assert.equal(await page.evaluate(() => soundCommits),2);
      const saved = await page.evaluate(() => JSON.stringify(soundPiece));
      const current=await page.locator('.mmc-snd-block').first().boundingBox(); await page.mouse.move(current.x+current.width/2,current.y+15); await page.mouse.down(); await page.mouse.move(current.x+current.width/2+35,current.y+15);
      await page.evaluate(() => soundLane.cancelInteractions()); await page.mouse.up();
      assert.equal(await page.evaluate(() => JSON.stringify(soundPiece)),saved); assert.equal(await page.evaluate(() => soundCommits),2);
      assert.notEqual(before.piece,saved);
    });
    await check('Bounds/fit/resize/rebuild keep visual center stable, preserve zoom choice and bounded ruler/canvas width', async () => {
      await page.evaluate(() => { soundLane.view.apply(9999); });
      const bound=await page.evaluate(()=>soundInfo()); assert.ok(bound.zoom<=16&&bound.width<=16384+1);
      const center=await page.evaluate(()=>soundLane.viewState.center);
      await page.evaluate(()=>{window.resizeTrace=[];const v=soundLane.view;for(const name of ['resize','remember']){const original=v[name];v[name]=function(...args){const before={name,room:this.room,width:this.viewport.clientWidth,axis:this.axis.offsetWidth,left:this.viewport.scrollLeft,center:this.state.center};const out=original.apply(this,args);resizeTrace.push({...before,after:this.state.center,afterLeft:this.viewport.scrollLeft});return out;};}});
      await page.setViewportSize({width:900,height:850}); await page.waitForTimeout(80);
      const resizedCenter=await page.evaluate(()=>soundLane.viewState.center);
      assert.ok(Math.abs(resizedCenter-center)<.005,JSON.stringify({center,resizedCenter,trace:await page.evaluate(()=>resizeTrace)}));
      const zoom=await page.evaluate(()=>soundLane.viewState.zoom); await page.evaluate(()=>soundLane.render()); await page.waitForFunction(()=>soundLane.view.room>0);
      assert.equal(await page.evaluate(()=>soundLane.viewState.zoom),zoom);
      await page.getByRole('button',{name:'Fit',exact:true}).click(); assert.equal(await page.evaluate(()=>soundLane.viewState.zoom),1);
      assert.equal(await page.evaluate(()=>soundLane.view.viewport.scrollLeft),0);
    });
    await check('Collapse/rebuild/destroy cancel visual captures and disconnect observers/listeners without audio commits', async () => {
      await page.evaluate(()=>soundLane.view.tool(true)); const box=await page.locator('.mmc-snd-lane').boundingBox();
      await page.mouse.move(box.x+100,box.y+25); await page.mouse.down(); await page.mouse.move(box.x+140,box.y+25);
      await page.evaluate(()=>soundLane.disclosure.setOpen(false)); await page.mouse.up(); assert.equal(await page.evaluate(()=>Boolean(soundLane.view.gesture)),false);
      await page.evaluate(()=>soundLane.disclosure.setOpen(true));
      const result=await page.evaluate(()=>{const before=soundCommits,old=soundLane.view;soundLane.render();const rebuilt=old.disposed&&old.removers.length===0&&!old.gesture;const now=soundLane.view;soundLane.destroy();return{rebuilt,disposed:now.disposed,removers:now.removers.length,unchanged:soundCommits===before,working:soundLane.working};});
      assert.deepEqual(result,{rebuilt:true,disposed:true,removers:0,unchanged:true,working:null});
    });
    await check('Responsive EN/KO/JA/ZH 0.8/1/1.6 layouts, empty lane, Fit and header actions remain bounded', async () => {
      for(const width of [320,768,1600])for(const language of ['en','ko','ja','zh'])for(const scale of [.8,1,1.6]){
        await page.setViewportSize({width,height:850}); await page.evaluate(options=>mountSound(options),{language,scale,empty:width===320});
        await page.waitForFunction(()=>soundLane.view.room>0); await page.evaluate(()=>soundLane.view.by(4));
        const info=await page.evaluate(()=>{const body=document.querySelector('.mmc-tl-body'),head=soundLane.disclosure.head,v=soundLane.view.viewport;return{width:body.clientWidth,scroll:body.scrollWidth,head:head.scrollWidth,headWidth:head.clientWidth,view:v.clientWidth,outer:soundLane.host.clientWidth,commits:soundCommits,buttons:[...head.querySelectorAll('button')].map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height}))};});
        assert.ok(info.scroll<=info.width+2,JSON.stringify({width,language,scale,info})); assert.ok(info.head<=info.headWidth+2); assert.ok(info.view<=info.outer+2); assert.equal(info.commits,0); assert.ok(info.buttons.every(b=>b.w>0&&b.h>0));
        layouts.push({width,language,scale});
      }
      await page.screenshot({path:path.join(output,'responsive-sound.png')});
    });
    await check('Actual mountOverlay document capture turns Zoom tool OFF first; the next Escape closes Timeline', async () => {
      await page.evaluate(() => { mountSound(); mountSoundOverlay(); soundLane.view.tool(true); });
      await page.getByRole('button', { name: 'Zoom tool', exact: true }).focus();
      await page.keyboard.press('Escape');
      assert.deepEqual(await page.evaluate(() => ({ tool:soundLane.viewState.tool,
        closes:soundModalCloses, connected:soundOverlay.isConnected, disposed:soundLane.view.disposed,
        pressed:soundLane.zoomTool.getAttribute('aria-pressed'), commits:soundCommits })),
        {tool:false,closes:0,connected:true,disposed:false,pressed:'false',commits:0});
      await page.keyboard.press('Escape');
      assert.deepEqual(await page.evaluate(() => ({ closes:soundModalCloses,
        connected:soundOverlay.isConnected, disposed:soundLane.view.disposed, commits:soundCommits })),
        {closes:1,connected:false,disposed:true,commits:0});
    });
    await check('No live requests or errors; visual state is never serialized and supplied-media original windows remain',async()=>{
      assert.equal(fixture.getRequests(),0);assert.deepEqual(Array.from(fixture.errors),[]);
      assert.equal(await page.evaluate(()=>{const blob=JSON.parse(S.serializeTimeline(soundPiece));return !('viewState' in blob)&&!('zoom' in blob)&&!('sound_view' in blob)&&soundCommits===0;}),true);
    });
    fs.writeFileSync(path.join(output,'sound-view-report.json'),JSON.stringify({checks,layouts,requests:fixture.getRequests(),errors:Array.from(fixture.errors)},null,2));
    console.log(JSON.stringify({checks:checks.length,layouts:layouts.length,requests:fixture.getRequests(),errors:Array.from(fixture.errors)}));
  } finally { await browser?.close(); }
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
