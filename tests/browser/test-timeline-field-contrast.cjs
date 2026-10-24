// Actual Timeline mount and five production disclosures, with the stylesheet
// chunks in their real CSS-array order. Catalog/media/refiner seams are inert.
// The prior fill is toggled on the same DOM: no server, queue, AI or GPU work.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sourceRoot = process.env.CONTINUITY_SOURCE_ROOT
  ? path.resolve(process.env.CONTINUITY_SOURCE_ROOT) : path.resolve(__dirname, '../..');
const root = path.join(sourceRoot, 'web/creator');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const method = (text, name) => {
  const found = text.match(new RegExp(`^  (?:async )?${name}\\([^]*?^  \\}`, 'm'));
  assert.ok(found, `Production ${name}`); return found[0];
};
const fn = (text, name) => {
  const found = text.match(new RegExp(`^(?:export )?function ${name}\\([^]*?^\\}`, 'm'));
  assert.ok(found, `Production ${name}`); return found[0].replace(/^export /, '');
};
const styles = read('styles.js');
const aliases = Object.fromEntries([...styles.matchAll(/import \{ css as (\w+) \} from "\.\/styles\/(\w+)\.js";/g)].map(match => [match[1], match[2]]));
const cascade = styles.match(/const CSS = \[([^]*?)\]\.join\(""\);/)[1]
  .replace(/\/\*[^]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').split(',').map(name => name.trim()).filter(Boolean);
assert.equal(cascade[0], 'base'); assert.equal(cascade.at(-1), 'fullscreen');
const css = cascade.map(alias => read(`styles/${aliases[alias]}.js`).match(/export const css = `([^]*)`;\s*$/)[1]).join('\n');
const target = '.mmc-tl-modal .mmc-tl-section-head';
assert.match(css, /\.mmc-tl-modal \.mmc-tl-section-head \{[^}]*background: var\(--mmc-surface-2\);/);

// Keep every maintained baseline/action guard, and its actual mounted prompt,
// sound and music editors. Replace only its isolated Cast stub with real shelf
// constructor/render code, so the fifth header is a production disclosure too.
const adapter = fs.readFileSync(path.join(__dirname, 'test-timeline-header-layout.cjs'), 'utf8');
const prefix = adapter.slice(0, adapter.indexOf('new vm.Script(code,'));
const base = vm.runInNewContext(prefix + ';({code});', { require, __dirname, process });
const cast = read('cast.js'), state = read('state.js');
const code = base.code + `
${['motionOf', 'subjectFiles', 'replacesOf'].map(name => fn(state, name)).join('\n')}
Object.assign(S,{subjectFiles,replacesOf,castAssets:piece=>piece.assets??[],takesReferences:()=>true});
${read('media-counts.js').replace(/^import [^;]+;\r?\n/gm, '').replace(/^export /gm, '')}
const P={keepSubject:()=>{throw new Error('No library writes in contrast fixture');}};
const openPresetLibrary=()=>{throw new Error('No library API in contrast fixture');};
class CastShelf {
 ${['constructor','render'].map(name => method(cast, name)).join('\n')}
 typing(){return false;} problem(){return '';}
 card(member){return el('div',{class:'mmc-cast-card',text:member.handle});}
 addSubject(){throw new Error('No cast mutations in contrast fixture');}
 reveal(){this.section?.setOpen(true);}
}
class RealCastBridge {${['renderCast','renderPool'].map(name=>method(read('timeline.js'),name)).join('\n')}}
Subject.prototype.renderCast=RealCastBridge.prototype.renderCast;
Subject.prototype.renderPool=RealCastBridge.prototype.renderPool;
Subject.prototype.poolChip=asset=>el('span',{class:'mmc-asset',text:'@'+asset.handle});
Subject.prototype.addPoolAssets=()=>{throw new Error('No reference API in contrast fixture');};
window.sectionsForContrast=()=>[subject.promptSection,subject.soundscapeSection,subject.musicSection,subject.poolSection,subject.castShelf.section];
window.mountContrast=options=>{
 document.querySelector('#contrast-outside')?.remove();setFixture(options);
 subject.timeline.assets=[{handle:'ref-1',kind:'image',filename:'fixture-1.png'},{handle:'ref-2',kind:'image',filename:'fixture-2.png'},{handle:'ref-3',kind:'video',filename:'fixture.mp4'},{handle:'ref-4',kind:'audio',filename:'fixture.wav'}];subject.renderPool();
 const outside=createDisclosure({title:'Outside Timeline editor',content:el('textarea',{value:'Untouched editor'}),actions:[el('button',{class:'mmc-ghost',text:'Untouched'})]});
 const nodeShelf=new CastShelf({getCast:()=>[],setCast:()=>{},getAssets:()=>[],commit:()=>{},disclosure:false});nodeShelf.render();
 const editor=el('div',{class:'mmc-modal mmc-editor-sheet'},[el('div',{class:'mmc-modal-head',text:'Editor header'}),outside.root]);
 const library=el('div',{class:'mmc-modal mmc-preset-modal'},[el('div',{class:'mmc-modal-head',text:'Library header'}),el('button',{class:'mmc-tab',text:'Cast'})]);
 document.body.append(el('div',{id:'contrast-outside',class:'mmc-root'},[editor,library,nodeShelf.root]));
 window.contrastBefore=JSON.stringify(subject.timeline);
 window.contrastNodes=[subject.promptBox.root,subject.soundscapeBox,subject.musicBox,...sectionsForContrast().flatMap(s=>[s.root,s.head,s.body,s.toggle,...s.head.querySelectorAll('button')])];
};
window.contrastStyles=()=>{
 const rect=node=>{const r=node.getBoundingClientRect();return [r.left,r.top,r.right,r.bottom,r.width,r.height];};
 const probe=variable=>{const node=el('span',{style:{background:'var('+variable+')'}});document.body.append(node);const value=getComputedStyle(node).backgroundColor;node.remove();return value;};
 const sections=sectionsForContrast();
 return {heads:sections.map(s=>({fill:getComputedStyle(s.head).backgroundColor,border:getComputedStyle(s.head).borderRadius,box:rect(s.head),open:s.isOpen(),bodyFill:getComputedStyle(s.body).backgroundColor,rootFill:getComputedStyle(s.root).backgroundColor})),
 geometry:[subject.modal,subject.stripHost.closest('.mmc-tl-body'),subject.navigationHost,...sections.flatMap(s=>[s.root,s.head,s.body,s.toggle,...s.head.querySelectorAll('button')])].map(rect),
 otherFills:[...document.querySelectorAll('.mmc-tl-body,.mmc-tl-card,.mmc-tl-modal button,#contrast-outside *')].map(node=>[node.className,getComputedStyle(node).backgroundColor]),
 surface:probe('--mmc-surface'),surface2:probe('--mmc-surface-2'),surface3:probe('--mmc-surface-3'),float:probe('--mmc-float'),
 values:[subject.promptBox.root.textContent,subject.soundscapeBox.value,subject.musicBox.value],
 identities:contrastNodes.every(node=>node.isConnected),snapshot:snapshot(),overflow:document.documentElement.scrollWidth>innerWidth+1};
};
window.contrastUnchanged=()=>JSON.stringify(subject.timeline)===contrastBefore&&subject.commits===0&&subject.calls.length===0&&contrastNodes.every(node=>node.isConnected);
mountContrast({});
`;
new vm.Script(code, { filename: 'timeline-field-contrast-actual-source-fixture.js' });
const checks = [], configurations = []; let browser, requests = 0;
const errors = [];
const check = async (name, run) => { await run(); checks.push(name); console.log('PASS ' + name); };
(async () => {
  browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => { requests++; return route.abort(); });
  await page.setContent(`<style>${css}body{margin:0;background:var(--mmc-bg)}#contrast-outside{position:fixed;left:0;top:0;width:280px;visibility:hidden;pointer-events:none}*,*::before,*::after{transition:none!important;animation:none!important}</style><style id="prior-head-fill">${target}{background:transparent}</style>`);
  await page.evaluate(`(()=>{${code}})()`);
  const prior = on => page.evaluate(on => document.querySelector('#prior-head-fill').disabled = !on, on);
  const theme = name => page.evaluate(name => {
    document.documentElement.className = name === 'dark' ? 'dark-theme' : name === 'forced-dark' ? 'mmc-force-dark' : '';
    const light = name !== 'dark';
    for (const [property, value] of Object.entries({ '--comfy-menu-bg': light ? '#f0f0f0' : '#181819', '--fg-color': light ? '#222' : '#ddd', '--input-text': light ? '#333' : '#ddd', '--descrip-text': light ? '#666' : '#999', '--bg-color': light ? '#fff' : '#202020', '--primary-background':'#0b8ce9', '--destructive-background':'#b33a3a', '--error-text':'#f44' })) document.documentElement.style.setProperty(property, value);
  }, name);
  await check('Five actual production disclosures alone receive surface-2 instead of their previous transparent fill', async () => {
    await theme('dark'); await prior(false);
    assert.equal(await page.locator('.mmc-tl-modal .mmc-tl-section-head').count(), 5);
    const current = await page.evaluate(() => contrastStyles());
    assert.ok(current.heads.every(head => head.fill === current.surface2 && head.rootFill === current.surface));
    assert.notEqual(current.surface2, current.surface); assert.notEqual(current.surface2, current.surface3);
    await prior(true); const before = await page.evaluate(() => contrastStyles());
    assert.ok(before.heads.every(head => head.fill === 'rgba(0, 0, 0, 0)'));
    assert.deepEqual(current.geometry, before.geometry); assert.deepEqual(current.values, before.values);
    assert.deepEqual(current.otherFills, before.otherFills);
  });
  await check('Folded and expanded inputs use the same modest token step in dark/light/forced-dark, both locales and type scales', async () => {
    for (const width of [320,640,1600]) for (const mode of ['dark','light','forced-dark']) for (const language of ['en','ko']) for (const scale of [1,1.6]) {
      await page.setViewportSize({width,height:1050}); await theme(mode);
      await page.evaluate(options=>mountContrast(options),{language,scale}); await page.mouse.move(0,0);
      for (const opened of [false,true]) {
        await page.evaluate(opened=>sectionsForContrast().forEach(section=>section.setOpen(opened)),opened);
        await prior(true); const before = await page.evaluate(() => contrastStyles());
        await prior(false); const after = await page.evaluate(() => contrastStyles());
        assert.ok(after.heads.every(head=>head.open===opened&&head.fill===after.surface2&&head.rootFill===after.surface),JSON.stringify({width,mode,language,scale,opened,after}));
        assert.notEqual(after.surface2,after.surface); assert.notEqual(after.surface2,after.surface3);
        assert.deepEqual(after.geometry,before.geometry); assert.deepEqual(after.otherFills,before.otherFills); assert.deepEqual(after.values,before.values);
        assert.equal(after.identities,true); assert.equal(after.overflow,false); assert.equal(await page.evaluate(()=>contrastUnchanged()),true);
        for (const head of after.heads) assert.ok(head.box[0]>=after.geometry[0][0]-1&&head.box[2]<=after.geometry[0][2]+1,JSON.stringify({width,mode,language,scale,opened,head}));
        configurations.push({width,theme:mode,language,scale,opened,heads:after.heads});
      }
    }
  });
  await check('Folding retains each editor and action node; independent native toggles do not change input data', async () => {
    await page.setViewportSize({width:1600,height:1050}); await theme('dark');await page.evaluate(()=>mountContrast({language:'ko'}));await prior(false);
    for (let index=0;index<5;index++) {
      await page.evaluate(index=>sectionsForContrast()[index].setOpen(true),index);
      await page.locator('.mmc-tl-modal .mmc-tl-section-toggle').nth(index).focus();await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(index=>sectionsForContrast()[index].isOpen(),index),false);
      await page.keyboard.press('Space'); assert.equal(await page.evaluate(index=>sectionsForContrast()[index].isOpen(),index),true);
      assert.equal(await page.evaluate(()=>contrastUnchanged()),true);
    }
  });
  await check('Refine and N/A confirmation first presses stay independent of disclosure and do not execute changes', async () => {
    const before = await page.evaluate(()=>snapshot());
    await page.locator('.mmc-tl-section-actions .mmc-refine-split > button:not(.mmc-refine-more)').first().click();
    assert.equal(await page.evaluate(()=>subject.promptSection.isOpen()),true); assert.deepEqual(await page.evaluate(()=>snapshot()),before);
    await page.locator('.mmc-tl-heading').click();
    await page.locator('.mmc-tl-section-actions .mmc-tl-na').first().click();
    assert.equal(await page.evaluate(()=>subject.soundscapeSection.isOpen()),true);assert.deepEqual(await page.evaluate(()=>snapshot()),before);
  });
  assert.deepEqual(errors,[]);assert.equal(requests,0);
  const out=process.env.CONTINUITY_UX_SCREENSHOT_DIR||process.env.CONTINUITY_ARTIFACT_DIR;
  if(out){fs.mkdirSync(out,{recursive:true});await page.evaluate(()=>mountContrast({language:'ko'}));await prior(false);await page.screenshot({path:path.join(out,'timeline-field-contrast-ko.png'),fullPage:false});fs.writeFileSync(path.join(out,'timeline-field-contrast-results.json'),JSON.stringify({passed:checks.length,checks,configurations,requests,errors,cascade},null,2));}
  console.log(JSON.stringify({passed:checks.length,configurations:configurations.length,requests,errors}));
})().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(async()=>{await browser?.close();});
