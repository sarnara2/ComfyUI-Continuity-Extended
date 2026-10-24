// LoRA previews share one policy in the library, attached cards and detail sheet.
// Only visible media own a source: leaving the view releases its decoder, not
// merely its playback, so large libraries don't exhaust the browser's media cap.
export class LoraThumbnails {
  constructor() {
    this.media = new Map();
    this.closed = false;
    this.suspended = false;
    this.watch = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const held = this.media.get(entry.target);
        if (!held) continue;
        held.visible = entry.isIntersecting;
        this.update(held);
      }
    });
    this.onVisibility = () => this.sync();
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  create(kind, source) {
    const video = kind === "video";
    const media = document.createElement(video ? "video" : "img");
    const held = { media, source, video, visible: false, failed: false };
    if (video) {
      media.autoplay = true;
      media.loop = true;
      media.playsInline = true;
      media.controls = false;
      media.preload = "none";
      // Both the default and live state are muted before a source is assigned.
      // Even script/native volume changes must never turn thumbnail audio on.
      const silence = () => {
        media.defaultMuted = true;
        media.muted = true;
        media.volume = 0;
      };
      silence();
      media.addEventListener("volumechange", silence);
    } else {
      media.alt = "";
      media.decoding = "async";
    }
    media.addEventListener("error", () => {
      held.failed = true;
      media.style.visibility = "hidden";
      this.stop(held);
    });
    this.media.set(media, held);
    this.watch.observe(media);
    return media;
  }

  active(held) {
    return this.media.get(held.media) === held
      && !this.closed && !this.suspended && !held.failed && held.visible
      && document.visibilityState !== "hidden" && held.media.isConnected
      && held.media.getClientRects().length > 0;
  }

  update(held) {
    if (!this.active(held)) { this.stop(held); return; }
    const media = held.media;
    if (!media.hasAttribute("src")) media.src = held.source;
    if (held.video && media.paused) {
      // Autoplay rejection or an interrupted load is a local preview failure,
      // never an unhandled rejection or a reason to change LoRA settings.
      media.play().then(() => {
        if (!this.active(held)) this.stop(held);
      }, () => {});
    }
  }

  stop(held) {
    const media = held.media;
    if (held.video) media.pause();
    if (!media.hasAttribute("src")) return;
    media.removeAttribute("src");
    if (held.video) media.load();
  }

  sync() {
    for (const held of this.media.values()) this.update(held);
  }

  setSuspended(value) {
    this.suspended = value;
    this.sync();
  }

  release(container) {
    for (const [media, held] of this.media) {
      if (media !== container && !container.contains(media)) continue;
      this.watch.unobserve(media);
      this.stop(held);
      this.media.delete(media);
    }
  }

  clear() {
    for (const [media, held] of this.media) {
      this.watch.unobserve(media);
      this.stop(held);
    }
    this.media.clear();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.clear();
    this.watch.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibility);
  }
}
