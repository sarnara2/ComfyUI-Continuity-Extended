// Presentation-only rails over the Timeline's unchanged native scroll gutters.
// All positions remain on the existing scroll containers; no workflow state.
import { t } from "./i18n.js";

let nextScrollbarId = 0;

export function createTimelineScrollbars(body, strip) {
  const modal = body?.parentElement;
  if (!modal?.classList.contains("mmc-tl-modal") || !strip || !body.contains(strip)) {
    return { destroy() {} };
  }
  let disposed = false, frame = 0, dragging = null;
  const cleanup = [], rails = [];
  const listen = (node, type, handler, options) => {
    node.addEventListener(type, handler, options);
    cleanup.push(() => node.removeEventListener(type, handler, options));
  };
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const makeRail = (target, horizontal) => {
    const originalId = target.id;
    if (!originalId) target.id = `mmc-tl-scroll-${++nextScrollbarId}`;
    const rail = document.createElement("div"), thumb = document.createElement("div");
    rail.className = `mmc-tl-scroll-rail ${horizontal ? "horizontal" : "vertical"}`;
    thumb.className = "mmc-tl-scroll-thumb";
    rail.setAttribute("role", "scrollbar"); rail.tabIndex = 0;
    rail.setAttribute("aria-label", t("Timeline"));
    rail.setAttribute("aria-orientation", horizontal ? "horizontal" : "vertical");
    rail.setAttribute("aria-controls", target.id); rail.setAttribute("aria-valuemin", "0");
    rail.append(thumb); modal.append(rail);
    const state = { target, horizontal, rail, thumb, maximum: 0, length: 0, travel: 0, start: 0, rect: null };
    rails.push(state);
    cleanup.push(() => { if (!originalId && target.id === rail.getAttribute("aria-controls")) target.removeAttribute("id"); rail.remove(); });
    return state;
  };
  const vertical = makeRail(body, false), horizontal = makeRail(strip, true);
  const position = state => state.horizontal ? state.target.scrollLeft : state.target.scrollTop;
  const scrollTo = (state, value) => {
    if (state.horizontal) state.target.scrollLeft = clamp(value, 0, state.maximum);
    else state.target.scrollTop = clamp(value, 0, state.maximum);
    schedule();
  };
  const update = () => {
    if (disposed || !modal.isConnected) return;
    const mr = modal.getBoundingClientRect(), br = body.getBoundingClientRect(), sr = strip.getBoundingClientRect();
    const left = mr.left + modal.clientLeft, top = mr.top + modal.clientTop;
    for (const state of rails) {
      const horizontal = state.horizontal, bounds = horizontal ? sr : br;
      state.maximum = Math.max(0, horizontal ? strip.scrollWidth - strip.clientWidth : body.scrollHeight - body.clientHeight);
      state.length = horizontal ? strip.clientWidth : body.clientHeight;
      const visible = state.maximum > 1 && state.length > 0
        && (!horizontal || (sr.bottom - 16 >= br.top && sr.bottom + 8 <= br.top + body.clientHeight + 1));
      state.rail.hidden = !visible;
      state.rail.setAttribute("aria-valuemax", String(Math.round(state.maximum)));
      state.rail.setAttribute("aria-valuenow", String(Math.round(position(state))));
      if (!visible) { state.rail.classList.remove("near"); continue; }
      const size = Math.min(state.length, Math.max(24, state.length * state.length / (state.length + state.maximum)));
      state.travel = state.length - size;
      state.start = state.travel * position(state) / state.maximum;
      if (horizontal) {
        state.rail.style.left = `${sr.left + strip.clientLeft - left}px`;
        state.rail.style.top = `${sr.bottom - 16 - top}px`;
        state.rail.style.width = `${state.length}px`;
        state.thumb.style.width = `${size}px`; state.thumb.style.left = `${state.start}px`;
      } else {
        state.rail.style.left = `${br.right - 30 - left}px`;
        state.rail.style.top = `${br.top + body.clientTop - top}px`;
        state.rail.style.height = `${state.length}px`;
        state.thumb.style.height = `${size}px`; state.thumb.style.top = `${state.start}px`;
      }
      state.rect = state.rail.getBoundingClientRect();
    }
    // Paint only: never change scrollbar width, overflow, gutter or padding.
    if (!modal.classList.contains("mmc-tl-scrollbars")) modal.classList.add("mmc-tl-scrollbars");
    if (!body.classList.contains("mmc-tl-scroll-managed")) body.classList.add("mmc-tl-scroll-managed");
    if (!strip.classList.contains("mmc-tl-scroll-managed")) strip.classList.add("mmc-tl-scroll-managed");
  };
  function schedule() { if (!disposed && !frame) frame = requestAnimationFrame(() => { frame = 0; update(); }); }
  const nearPointer = event => {
    const br = body.getBoundingClientRect(), sr = strip.getBoundingClientRect();
    vertical.rail.classList.toggle("near", !vertical.rail.hidden && event.clientY >= br.top && event.clientY <= br.bottom
      && Math.abs(event.clientX - (br.right - 9)) <= 28);
    horizontal.rail.classList.toggle("near", !horizontal.rail.hidden && event.clientX >= sr.left && event.clientX <= sr.right
      && Math.abs(event.clientY - (sr.bottom - 3)) <= 32);
  };
  listen(modal, "pointermove", nearPointer);
  listen(modal, "pointerleave", () => { for (const state of rails) state.rail.classList.remove("near"); });
  const finishDrag = event => {
    if (!dragging || (event && event.pointerId !== dragging.id)) return;
    const { state, id } = dragging; dragging = null;
    state.rail.classList.remove("dragging");
    if (state.rail.hasPointerCapture(id)) state.rail.releasePointerCapture(id);
    schedule();
  };
  for (const state of rails) {
    listen(state.target, "scroll", schedule, { passive: true });
    listen(state.rail, "pointerdown", event => {
      if (event.button !== 0 || state.rail.hidden || dragging) return;
      update();
      const rect = state.rail.getBoundingClientRect(), point = state.horizontal ? event.clientX - rect.left : event.clientY - rect.top;
      const size = state.length - state.travel;
      const onThumb = point >= state.start && point <= state.start + size;
      const offset = onThumb ? point - state.start : size / 2;
      event.preventDefault(); event.stopPropagation(); state.rail.focus({ preventScroll: true });
      dragging = { state, id: event.pointerId, offset };
      state.rail.classList.add("dragging"); state.rail.setPointerCapture(event.pointerId);
      if (!onThumb) scrollTo(state, (point - offset) / Math.max(1, state.travel) * state.maximum);
    });
    listen(state.rail, "pointermove", event => {
      if (!dragging || dragging.state !== state || dragging.id !== event.pointerId) return;
      const rect = state.rail.getBoundingClientRect(), point = state.horizontal ? event.clientX - rect.left : event.clientY - rect.top;
      event.preventDefault();
      scrollTo(state, (point - dragging.offset) / Math.max(1, state.travel) * state.maximum);
    });
    listen(state.rail, "pointerup", finishDrag);
    listen(state.rail, "pointercancel", finishDrag);
    listen(state.rail, "lostpointercapture", finishDrag);
    listen(state.rail, "keydown", event => {
      const step = 40, page = state.length * .9;
      const values = { Home: 0, End: state.maximum, PageUp: position(state) - page, PageDown: position(state) + page };
      if (state.horizontal) Object.assign(values, { ArrowLeft: position(state) - step, ArrowRight: position(state) + step });
      else Object.assign(values, { ArrowUp: position(state) - step, ArrowDown: position(state) + step });
      if (!(event.key in values)) return;
      event.preventDefault(); event.stopPropagation(); scrollTo(state, values[event.key]);
    });
    listen(state.rail, "wheel", event => {
      if (event.ctrlKey || (!event.deltaX && !event.deltaY)) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? state.length : 1;
      const delta = state.horizontal && Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      event.preventDefault(); event.stopPropagation(); scrollTo(state, position(state) + delta * unit);
    }, { passive: false });
  }
  listen(window, "resize", schedule);
  listen(document, "scroll", schedule, { capture: true, passive: true });
  const resize = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
  resize?.observe(modal); resize?.observe(body); resize?.observe(strip);
  const mutations = new MutationObserver(schedule);
  mutations.observe(body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["class", "hidden", "style"] });
  update();
  return {
    destroy() {
      if (disposed) return;
      disposed = true; finishDrag(); if (frame) cancelAnimationFrame(frame); frame = 0;
      resize?.disconnect(); mutations.disconnect();
      for (const dispose of cleanup.reverse()) dispose();
      body.classList.remove("mmc-tl-scroll-managed"); strip.classList.remove("mmc-tl-scroll-managed"); modal.classList.remove("mmc-tl-scrollbars");
    },
  };
}
