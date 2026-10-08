"""Accepted renders share a queue-batch total and retain per-render windows.

The actual queue API wrapper and Stage run under deterministic local wire/DOM
stubs. This never queues a ComfyUI render or uses the GPU.
"""

import layout

layout.skip_without_node()

from domshim import DOM  # noqa: E402
from harness import check, passed  # noqa: E402

API = """
import { readFileSync } from "node:fs";
const listeners = {};
globalThis.__say = (type, detail) => {
  for (const fn of [...(listeners[type] ?? [])]) fn({ type, detail });
};
globalThis.__history = {};
globalThis.__queue = { queue_running: [], queue_pending: [] };
globalThis.__answer = null;
globalThis.__send = null;
export const api = {
  clientId: "test",
  addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
  removeEventListener(type, fn) { listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn); },
  dispatchEvent(event) { __say(event.type, event.detail); },
  apiURL: (u) => u,
  async queuePrompt(...args) {
    if (__send) return __send(...args);
    if (__answer instanceof Error) throw __answer;
    return __answer;
  },
  async fetchApi(url, options) {
    if (String(url).startsWith("/continuity/families")) {
      return { ok: true, json: async () => JSON.parse(readFileSync(new URL("./families.json", import.meta.url), "utf8")) };
    }
    if (String(url).startsWith("/history/")) return { ok: true, json: async () => __history };
    if (url === "/queue") {
      if (options?.method === "POST") __queue.queue_pending = [];
      return { ok: true, json: async () => __queue };
    }
    return { ok: true, json: async () => ({}) };
  },
  async getUserData() { return { status: 404, json: async () => null }; },
  async storeUserData() { return { status: 200 }; },
};
"""

CHECK = r"""
await import("./dom.mjs");
const assert = (await import("node:assert/strict")).default;
const { api } = await import("../scripts/api.js");
const { Stage, timingChips } = await import("./web/creator/stage.js");
const { cancelPrompt } = await import("./web/creator/queue.js");
let now = 0, nextTimer = 0;
const timers = new Map();
Date.now = () => now;
globalThis.setInterval = (fn) => { const id = ++nextTimer; timers.set(id, fn); return id; };
globalThis.clearInterval = (id) => timers.delete(id);
const cases = [], stages = new Set();
const make = (id = 7) => { const stage = new Stage({ nodeId: () => id }); stages.add(stage); return stage; };
const close = () => {
  for (const stage of stages) stage.destroy();
  stages.clear(); __history = {}; __send = null;
  __queue = { queue_running: [], queue_pending: [] };
};
const fields = (stage) => stage.clockTiming();
const start = (id, timestamp) => __say("execution_start", { prompt_id: id, timestamp });
const progress = (id, node = 7) => __say("progress_state", { prompt_id: id,
  nodes: { [`${node}.2`]: { parent_node_id: String(node), node_id: `${node}.2`,
    prompt_id: id, state: "running", value: 1, max: 20 } } });
const save = (id, name = `${id}.mp4`) => __say("executed", {
  prompt_id: id, display_node: "7",
  output: { mmc_video: [{ filename: name, type: "output", subfolder: "" }] },
});
const stop = (id, timestamp, type = "execution_success") => __say(type, { prompt_id: id, timestamp });
const queue = async (id, targets = ["7"], nodes = ["7"]) => {
  __answer = { prompt_id: id };
  const output = Object.fromEntries(nodes.map((node) => [node, { class_type: "MiniMaxH3Creator" }]));
  return api.queuePrompt(0, { output }, { partialExecutionTargets: targets });
};
const flush = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); };
const history = (id, startAt, endAt) => ({ [id]: { outputs: {},
  status: { status_str: "success", completed: true, messages: [
    ["execution_start", { prompt_id: id, timestamp: startAt }],
    ["execution_success", { prompt_id: id, timestamp: endAt }],
  ] } } });

// Two accepted button presses are one total, not two reset execution clocks.
{
  const stage = make();
  now = 1000; await queue("first");
  now = 2000; await queue("second");
  now = 5000; start("first", 100000); progress("first");
  now = 8000; save("first"); const first = stage.result;
  now = 9000; stop("first", 104000);
  assert.deepEqual(fields(stage), { totalMs: 8000, tookMs: 3000, totalPending: true });
  now = 11000; stage.tick();
  assert.equal(first.totalMs, 10000, "total includes time waiting for the successor");
  now = 12000; start("second", 107000); progress("second");
  assert.deepEqual(fields(stage), { totalMs: 11000, tookMs: 0, totalPending: true });
  now = 16000; save("second"); const second = stage.result;
  now = 18000; stop("second", 113000);
  assert.deepEqual(fields(stage), { totalMs: 17000, tookMs: 4000, totalPending: false });
  assert.deepEqual([first.totalMs, first.tookMs, first.totalPending], [17000, 3000, false]);
  assert.equal(timers.size, 0);

  // Docking/fullscreen physically moves this Stage, so the owner and clock do
  // not change. Historical review consumes the same finalized result fields.
  const ordinary = stage.root.parentNode;
  const fullscreen = document.createElement("div"); fullscreen.append(stage.root);
  assert.deepEqual(fields(stage), { totalMs: 17000, tookMs: 4000, totalPending: false });
  ordinary?.append(stage.root);
  assert.equal(timingChips(second)[0].textContent, timingChips(fields(stage))[0].textContent);

  now = 20000; await queue("retry");
  assert.deepEqual(fields(stage), { totalMs: 0, tookMs: null, totalPending: true },
    "a fresh queue starts its total immediately without leaking the last span");
  now = 21000; start("retry", 120000); progress("retry");
  assert.deepEqual(fields(stage), { totalMs: 1000, tookMs: 0, totalPending: true });
  start("first", 100000); // stale start must not steal the successor's identity
  progress("first"); save("first", "stale.mp4");
  assert.equal(stage.renderPromptId, "retry");
  assert.equal(stage.state, "sampling");
  now = 24000; save("retry"); stop("retry", 123000);
  assert.deepEqual(fields(stage), { totalMs: 4000, tookMs: 3000, totalPending: false });
  assert.equal(first.totalMs, 17000, "new batches cannot rewrite historical totals");
  assert.equal(second.totalMs, 17000);
  cases.push("two queue presses, continuous waits, independent spans, fullscreen dock, frozen review and retry");
  close(); await flush();
}

// A refused request is not a batch member; unrelated partial targets do not
// get charged to this stage even when its node exists in the submitted graph.
{
  const stage = make();
  now = 100; await queue("own");
  now = 200; await queue("other", ["9"], ["7", "9"]);
  __answer = new Error("refused");
  await assert.rejects(api.queuePrompt(0, { output: { "7": {} } }, { partialExecutionTargets: ["7"] }));
  assert.deepEqual(stage.timing.queuedRuns().map((run) => run.promptId), ["own"]);
  now = 300; start("own", 1000); progress("own");
  now = 800; save("own"); stop("own", 1500);
  now = 1000; start("other", 2000); progress("other", 9); stop("other", 4000);
  assert.deepEqual(fields(stage), { totalMs: 700, tookMs: 500, totalPending: false });
  cases.push("refusal and foreign partial targets excluded");
  close(); await flush();
}

// Errors and interrupted renders stop their own span; a cancelled queued
// successor closes the remaining total without running its sampler.
{
  const stage = make();
  now = 100; await queue("error"); await queue("removed");
  now = 300; start("error", 1000); progress("error");
  now = 800; stop("error", 1500, "execution_error");
  assert.equal(stage.clockTiming().totalPending, true);
  __queue.queue_pending = [[0, "removed", {}]];
  now = 1000; assert.equal(await cancelPrompt("removed"), "removed");
  assert.equal(stage.timing.read(stage.timing.runs.get("error")).totalMs, 900);
  assert.equal(stage.timing.queuedRuns().length, 0);
  // A generic terminal error need not belong to this stage's failure slate.
  stage.reset();
  now = 2000; await queue("cancelled");
  now = 2200; start("cancelled", 3000); progress("cancelled");
  now = 2700; stop("cancelled", 3500, "execution_interrupted");
  assert.equal(stage.state, "idle");
  assert.equal(stage.timing.read(stage.timing.runs.get("cancelled")).totalMs, 700);
  assert.equal(timers.size, 0);
  cases.push("error, interruption and targeted pending cancellation settle the batch");
  close(); await flush();
}

// Deleting a pending prompt via ComfyUI's queue panel emits no execution event.
// Queue-empty reconciliation confirms absence, rather than relying on count.
{
  const stage = make();
  now = 100; await queue("deleted-in-panel");
  now = 200; __say("status", { exec_info: { queue_remaining: 0 } }); await flush();
  assert.equal(stage.timing.queuedRuns().length, 0);
  assert.deepEqual(stage.timing.read(stage.timing.runs.get("deleted-in-panel")),
    { totalMs: 100, totalPending: false });
  assert.equal(timers.size, 0);
  cases.push("external pending queue deletion stops total after local queue/history verification");
  close(); await flush();
}

// A queue count of zero from an older websocket message cannot remove a prompt
// that is still present in the authoritative queue response.
{
  const stage = make();
  now = 100; await queue("still-pending");
  __queue.queue_pending = [[0, "still-pending", {}]];
  now = 200; __say("status", { exec_info: { queue_remaining: 0 } }); await flush();
  assert.equal(stage.timing.queuedRuns().length, 1);
  now = 300; __say("mmc_queue_removed", { prompt_id: "still-pending" });
  assert.equal(timers.size, 0);
  cases.push("stale queue count does not cancel a still-pending render");
  close(); await flush();
}

// Cached/no-sample saves do not inherit a previous render span. A request that
// finishes inside its POST roundtrip already has a terminal record on accept.
{
  const stage = make();
  now = 100; await queue("sampled"); start("sampled", 1000); progress("sampled");
  now = 400; save("sampled"); stop("sampled", 1300);
  now = 500; await queue("cached");
  now = 600; start("cached", 2000); save("cached");
  now = 700; stop("cached", 2100);
  assert.deepEqual(fields(stage), { totalMs: 200, tookMs: null, totalPending: false });
  __send = () => {
    start("fast", 3000); save("fast"); stop("fast", 3000);
    return { prompt_id: "fast" };
  };
  now = 800; await queue("fast");
  assert.deepEqual(fields(stage), { totalMs: 0, tookMs: null, totalPending: false });
  assert.equal(timers.size, 0);
  cases.push("cache-only and finish-before-accept requests avoid span leakage and zombie totals");
  close(); await flush();
}

// Recovery uses the observed local start plus authoritative server duration,
// never the delayed history receipt time as a pretend completion boundary.
{
  const stage = make();
  now = 100; await queue("recovered");
  now = 500; start("recovered", 10000); progress("recovered");
  now = 1500; save("recovered");
  __history = history("recovered", 10000, 18000);
  now = 999000; __say("reconnected"); await flush();
  assert.deepEqual(fields(stage), { totalMs: 8400, tookMs: 1000, totalPending: false });
  assert.equal(timers.size, 0);
  cases.push("history recovery excludes browser offline time with a measured clock anchor");
  close(); await flush();
}

// Without any observed server start, recovery stops but an exact batch total
// is unknown. A made-up duration since reconnection would be misleading.
{
  const stage = make();
  now = 100; await queue("unknown-anchor");
  __history = history("unknown-anchor", 10000, 18000);
  now = 999000; __say("reconnected"); await flush();
  assert.deepEqual(stage.timing.read(stage.timing.runs.get("unknown-anchor")),
    { totalMs: null, totalPending: false });
  assert.equal(timers.size, 0);
  cases.push("missing clock anchor is unavailable rather than fabricated");
  close(); await flush();
}

// A reattached socket may have seen sampling but missed execution_start and
// then the cancellation. An absent queue/history must not leave sampling alive.
{
  const stage = make();
  now = 100; await queue("missed-cancel");
  now = 200; progress("missed-cancel");
  now = 300; __say("status", { exec_info: { queue_remaining: 0 } }); await flush();
  assert.equal(stage.state, "failed");
  assert.equal(stage.timing.queuedRuns().length, 0);
  assert.equal(timers.size, 0);
  cases.push("missing start plus lost cancellation never leaves a phantom sampling clock");
  close(); await flush();
}

assert.equal(timers.size, 0);
console.log(JSON.stringify({ cases, activeTimers: timers.size }));
"""

with layout.pack(skip=["atlas"], extra_stubs={"api.js": API}) as target:
    got = layout.in_pack(CHECK.replace('await import("./dom.mjs");', DOM), target)

check("all queue timing scenarios completed", len(got["cases"]), 9)
check("all batch stage timers disposed", got["activeTimers"], 0)
passed("queued renders share a whole-run clock and keep separate render spans")
