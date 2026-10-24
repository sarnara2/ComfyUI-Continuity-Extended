// Sound viewport only. Never reads/writes workflow, audio blocks or generation.
export const MAX_ZOOM = 16;
export const MAX_AXIS_WIDTH = 16384;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/** Keep the frame fraction under a screen point while changing only view width. */
export function zoomGeometry({ width, viewport, scroll, point, zoom, wanted }) {
  const room = Math.max(1, Number(viewport) || 1);
  const maximum = Math.max(1, Math.min(MAX_ZOOM, MAX_AXIS_WIDTH / room));
  const next = clamp(Number(wanted) || 1, 1, maximum);
  const at = clamp(Number(point) || 0, 0, room);
  const before = Math.max(room, Number(width) || room * (Number(zoom) || 1));
  const fraction = clamp(((Number(scroll) || 0) + at) / before, 0, 1);
  const after = room * next;
  return { zoom: next, width: after, scroll: clamp(fraction * after - at, 0, after - room) };
}

/** A disposable native horizontal viewport. Capture-phase Zoom mode keeps the
 * existing block/grip edit handlers completely out of a visual zoom gesture. */
export class SoundView {
  constructor({ viewport, axis, state, keyboardHost = viewport, onChange, onModeChange, isBusy = () => false,
                cancelEdit = () => {} }) {
    Object.assign(this, { viewport, axis, state, onChange, onModeChange, isBusy, cancelEdit });
    this.removers = [];
    this.disposed = false;
    this.gesture = null;
    this.room = 0;
    this.blockClickUntil = 0;
    this.listen(viewport, "wheel", (event) => this.wheel(event), { passive: false });
    this.listen(viewport, "pointerdown", (event) => this.begin(event), true);
    this.listen(viewport, "pointermove", (event) => this.move(event), true);
    this.listen(viewport, "pointerup", (event) => this.end(event), true);
    this.listen(viewport, "pointercancel", (event) => this.end(event), true);
    this.listen(viewport, "lostpointercapture", () => this.cancel(), true);
    this.listen(viewport, "click", (event) => {
      if (!this.state.tool && performance.now() >= this.blockClickUntil) return;
      event.preventDefault(); event.stopImmediatePropagation();
    }, true);
    this.listen(keyboardHost, "keydown", (event) => this.key(event), true);
    this.listen(viewport, "scroll", () => this.remember());
    this.observe = typeof ResizeObserver === "function" ? new ResizeObserver(() => this.resize()) : null;
    this.observe?.observe(viewport);
    this.resize();
    this.frame = requestAnimationFrame(() => { this.frame = null; this.resize(); });
  }

  listen(node, kind, callback, options) {
    node.addEventListener(kind, callback, options);
    this.removers.push(() => node.removeEventListener(kind, callback, options));
  }

  point(clientX) {
    const rect = this.viewport.getBoundingClientRect();
    return rect.width ? clamp((clientX - rect.left) / rect.width * this.viewport.clientWidth,
      0, this.viewport.clientWidth) : 0;
  }

  remember() {
    if (this.disposed || !this.viewport.clientWidth) return;
    // A native scroll adjustment may precede ResizeObserver. Keep the last
    // normalized center until the new viewport/axis widths are applied together.
    if (this.room !== this.viewport.clientWidth) return;
    this.state.scroll = this.viewport.scrollLeft;
    this.state.center = (this.state.scroll + this.viewport.clientWidth / 2)
      / Math.max(1, this.axis.offsetWidth);
  }

  apply(wanted, point = this.viewport.clientWidth / 2) {
    if (this.disposed || this.isBusy() || !this.viewport.clientWidth) return;
    const next = zoomGeometry({ width: this.axis.offsetWidth, viewport: this.viewport.clientWidth,
      scroll: this.viewport.scrollLeft, point, zoom: this.state.zoom, wanted });
    this.state.zoom = next.zoom;
    this.axis.style.width = `${next.width}px`;
    this.viewport.scrollLeft = next.scroll;
    this.remember();
    this.onChange?.(next.zoom);
  }

  resize() {
    if (this.disposed || this.isBusy() || !this.viewport.clientWidth) return;
    const room = this.viewport.clientWidth;
    if (room === this.room) return;
    this.cancel();
    this.room = room;
    const center = Number.isFinite(this.state.center) ? this.state.center : .5;
    const maximum = Math.max(1, Math.min(MAX_ZOOM, MAX_AXIS_WIDTH / room));
    this.state.zoom = clamp(Number(this.state.zoom) || 1, 1, maximum);
    this.axis.style.width = `${room * this.state.zoom}px`;
    this.viewport.scrollLeft = this.state.zoom === 1 ? 0
      : clamp(center * this.axis.offsetWidth - room / 2, 0, this.axis.offsetWidth - room);
    this.remember();
    this.onChange?.(this.state.zoom);
  }

  fit() { this.apply(1); }
  by(factor) { this.apply((Number(this.state.zoom) || 1) * factor); }

  tool(on) {
    if (this.disposed) return;
    this.cancel();
    this.state.tool = Boolean(on);
    this.viewport.classList.toggle("zoom-tool", this.state.tool);
    this.onModeChange?.(this.state.tool);
    if (on) this.cancelEdit();
  }

  wheel(event) {
    if (!event.ctrlKey || this.disposed) return;
    // Even during an audio edit, Ctrl+wheel must not zoom the browser/graph.
    event.preventDefault(); event.stopPropagation();
    if (this.isBusy() || this.gesture) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.viewport.clientWidth : 1;
    const delta = clamp(event.deltaY * unit, -500, 500);
    this.apply((Number(this.state.zoom) || 1) * Math.exp(-delta * .002), this.point(event.clientX));
  }

  begin(event) {
    if (!this.state.tool || this.disposed || event.button !== 0 || this.isBusy()) return;
    // Native scrollbar dragging is panning in either mode, never scrubby zoom.
    const rect = this.viewport.getBoundingClientRect();
    const rail = this.viewport.offsetHeight - this.viewport.clientHeight;
    if (rail > 0 && event.clientY >= rect.bottom - rail * rect.height / this.viewport.offsetHeight) return;
    event.preventDefault(); event.stopImmediatePropagation();
    this.cancel();
    this.gesture = { pointer: event.pointerId, x: event.clientX, point: this.point(event.clientX),
      zoom: this.state.zoom, width: this.axis.offsetWidth, scroll: this.viewport.scrollLeft };
    this.viewport.setPointerCapture(event.pointerId);
    this.viewport.classList.add("zooming");
  }

  move(event) {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.pointer || this.disposed) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const rect = this.viewport.getBoundingClientRect();
    const dx = rect.width ? (event.clientX - gesture.x) / rect.width * this.viewport.clientWidth : 0;
    const next = zoomGeometry({ width: gesture.width, viewport: this.viewport.clientWidth,
      scroll: gesture.scroll, point: gesture.point, zoom: gesture.zoom,
      wanted: gesture.zoom * Math.exp(clamp(dx, -1000, 1000) * .008) });
    this.state.zoom = next.zoom;
    this.axis.style.width = `${next.width}px`;
    this.viewport.scrollLeft = next.scroll;
    this.remember();
    this.onChange?.(next.zoom);
  }

  end(event) {
    if (!this.gesture || event.pointerId !== this.gesture.pointer) return;
    event.preventDefault(); event.stopImmediatePropagation();
    this.cancel();
  }

  cancel() {
    const gesture = this.gesture;
    this.gesture = null;
    this.viewport.classList.remove("zooming");
    if (gesture) {
      this.blockClickUntil = performance.now() + 250;
      if (this.viewport.hasPointerCapture(gesture.pointer)) this.viewport.releasePointerCapture(gesture.pointer);
    }
  }

  key(event) {
    if (event.key === "Escape" && this.state.tool) {
      event.preventDefault(); event.stopPropagation(); this.tool(false); return;
    }
    if (!this.state.tool) return;
    if (!this.viewport.contains(event.target)) return;
    // In Zoom mode keys must not reach an audio block's existing edit handler.
    if (["ArrowLeft", "ArrowRight", "Delete", "Backspace", "Enter", " "].includes(event.key)) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.key === "ArrowLeft") this.viewport.scrollLeft -= 40;
      if (event.key === "ArrowRight") this.viewport.scrollLeft += 40;
    }
  }

  destroy() {
    if (this.disposed) return;
    this.remember(); this.cancel(); this.disposed = true;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.observe?.disconnect();
    this.removers.splice(0).forEach((remove) => remove());
  }
}
