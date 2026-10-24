"""Finished Stage and fullscreen review audio preferences, without media or GPU."""

import json
import re
import subprocess

import layout
from domshim import DOM
from harness import check, died, passed

layout.skip_without_node()

SCRIPT = r'''
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
const { el } = await import("./web/creator/dom.js");
const { noteSettings } = await import("./web/creator/api.js");
const { Stage } = await import("./web/creator/stage.js");
const moduleUrl = pathToFileURL(path.join(process.cwd(), "web/creator/fullscreen.js"));
const source = readFileSync(moduleUrl, "utf8")
  .replace("class Fullscreen {", "export class Fullscreen {")
  .replace(/from "(\.[^"]+)"/g, (_, spec) => `from "${new URL(spec, moduleUrl).href}"`)
  .replaceAll("import.meta.url", JSON.stringify(moduleUrl.href));
const { Fullscreen } = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
NodeClass.prototype.pause = function () { this.paused = true; };
NodeClass.prototype.getAnimations = () => [];
NodeClass.prototype.animate = () => ({ finished: Promise.resolve() });
const result = {url:"/view?filename=fixture.mp4", name:"fixture.mp4", isImage:false};
const fire = (node, type) => {
  for (const fn of node.listeners[type] ?? []) fn({currentTarget:node});
};
let checks = 0;
const eq = (actual, expected, name) => { assert.deepEqual(actual, expected, name); checks++; };
const audio = (video, name) => {
  eq(video.muted, true, `${name}: property is muted before any pointer event`);
  Object.assign(video, {currentTime:7.25, paused:false, volume:0.4});
  fire(video,"mouseenter"); eq(video.muted,true,`${name}: default hover stays muted`);
  fire(video,"mouseleave"); eq(video.muted,true,`${name}: default leave stays muted`);
  video.muted=false;
  fire(video,"mouseenter"); fire(video,"mouseleave");
  eq(video.muted,false,`${name}: native manual audio survives pointer movement`);
  noteSettings({preview_audio:"hover"});
  fire(video,"mouseenter"); eq(video.muted,false,`${name}: opt-in hover enables audio`);
  fire(video,"mouseleave"); eq(video.muted,true,`${name}: opt-in leave mutes audio`);
  noteSettings({preview_audio:"muted"});
  fire(video,"mouseenter"); eq(video.muted,true,`${name}: current player reads changed preference`);
  noteSettings({preview_audio:"unknown"});
  fire(video,"mouseenter"); eq(video.muted,true,`${name}: unknown values cannot authorize hover sound`);
  eq([video.currentTime,video.paused,video.volume],[7.25,false,0.4],`${name}: preference preserves playback and volume`);
  noteSettings({preview_audio:"muted"});
};
const stage = Object.create(Stage.prototype);
stage.result=result;
const video = stage.video();
audio(video,"stage");
eq(video.getAttribute("autoplay"),"","autoplay defaults on independently");
noteSettings({preview_audio:"hover",autoplay_previews:false});
const paused = stage.video();
eq(paused.getAttribute("autoplay"),undefined,"autoplay can remain off with hover audio");
eq(paused.muted,true,"hover preference never enables audio on creation");
noteSettings({preview_audio:"muted"});
const shell = Object.create(Fullscreen.prototype);
shell.dock=el("div");
document.body.append(shell.dock);
const tile=el("button");
document.body.append(tile);
shell.review(result,tile);
audio(shell.reviewing.media,"fullscreen review");
shell.endReview({animate:false});
await Promise.resolve();
eq(shell.reviewing,null,"review disposes normally");
stage.frame="/fixture-step.mp4";stage.frameIsClip=true;
noteSettings({preview_audio:"hover",autoplay_previews:false});
const step=stage.previewFrame();
eq(step.muted,true,"step preview stays silent independently");
fire(step,"mouseenter");eq(step.muted,true,"step preview cannot inherit hover sound");
eq(step.getAttribute("autoplay"),"","step preview keeps its existing autoplay");
console.log(JSON.stringify({checks}));
'''

with layout.pack(skip=["atlas"]) as target:
    proc = subprocess.run(["node", "--input-type=module"], input=DOM + SCRIPT,
                          capture_output=True, text=True, cwd=target, timeout=60)
    if proc.returncode != 0:
        error = re.sub(r"data:text/javascript;base64,[A-Za-z0-9+/=]+", "fullscreen-test-module", proc.stderr)
        died(f"node failed:\n{error}")
    got = json.loads(proc.stdout)

check("actual player audio preference scenarios ran", got["checks"] >= 25, True)
passed("preview audio default, hover, manual controls and playback isolation passed")
