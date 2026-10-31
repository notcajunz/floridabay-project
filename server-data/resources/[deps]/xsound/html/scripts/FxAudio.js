// Made by Saif | © 2026 Saif. All rights reserved.
// FxAudio – drop-in replacement for the Howl instance xsound uses for direct audio links (mp3 / ogg / ...).
// It plays through a normal <audio> element routed into the Web Audio API so a "muffle" effect can be applied:
//     element -> bass boost (low shelf) -> low-pass -> low-pass -> volume -> speakers
// muffle 0 = clear sound, muffle 1 = the dull "bass thumping through closed windows" sound.
// If the audio server doesn't allow cross-origin (CORS) access the browser would play silence through Web Audio,
// so in that case the sound simply plays normally (no muffle) instead of breaking.
class FxAudio {
    static ctx = null;

    static supported() {
        return typeof window.AudioContext !== "undefined" || typeof window.webkitAudioContext !== "undefined";
    }

    static getCtx() {
        if (!FxAudio.ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            FxAudio.ctx = new AC();
        }
        return FxAudio.ctx;
    }

    constructor(opts) {
        this.opts = opts || {};
        this._vol = (opts.volume !== undefined) ? opts.volume : 1.0;
        this._muffle = 0;
        this._graph = null;
        this._corsTried = true;
        this._loadedFired = false;
        this._dead = false;

        const el = new Audio();
        this.el = el;
        el.preload = "auto";
        el.loop = !!opts.loop;
        el.volume = Math.max(0, Math.min(1, this._vol));
        el.crossOrigin = "anonymous";

        el.addEventListener("loadedmetadata", () => this._buildGraph());
        el.addEventListener("canplaythrough", () => {
            if (this._loadedFired) return;
            this._loadedFired = true;
            if (this.opts.onload) this.opts.onload();
        });
        el.addEventListener("playing", () => { if (this.opts.onplay) this.opts.onplay(); });
        el.addEventListener("ended", () => { if (this.opts.onend) this.opts.onend(); });
        el.addEventListener("error", () => {
            if (this._dead) return;
            if (this._corsTried && !this._graph) {
                // server refused CORS: play without the effect rather than not at all
                this._corsTried = false;
                const t = el.currentTime || 0;
                el.removeAttribute("crossorigin");
                el.src = this._src;
                el.load();
                if (t > 0) el.currentTime = t;
                if (this._wantPlay) this.play();
            } else if (this.opts.onloaderror) {
                this.opts.onloaderror();
            }
        });

        this._src = Array.isArray(opts.src) ? opts.src[0] : opts.src;
        el.src = this._src;
    }

    _buildGraph() {
        if (this._graph || this._dead || !this._corsTried) return;
        try {
            const ctx = FxAudio.getCtx();
            const source = ctx.createMediaElementSource(this.el);
            const bass = ctx.createBiquadFilter();
            bass.type = "lowshelf"; bass.frequency.value = 110; bass.gain.value = 0;
            const lp1 = ctx.createBiquadFilter();
            lp1.type = "lowpass"; lp1.frequency.value = 20000; lp1.Q.value = 0.6;
            const lp2 = ctx.createBiquadFilter();
            lp2.type = "lowpass"; lp2.frequency.value = 20000; lp2.Q.value = 0.6;
            const gain = ctx.createGain();
            gain.gain.value = this._vol;
            source.connect(bass); bass.connect(lp1); lp1.connect(lp2); lp2.connect(gain); gain.connect(ctx.destination);
            this.el.volume = 1.0;                 // volume is now controlled by the gain node
            this._graph = { source, bass, lp1, lp2, gain };
            this._applyMuffle(true);
            if (ctx.state === "suspended") ctx.resume();
        } catch (e) {
            console.log("[xsound] audio filter unavailable:", e);
        }
    }

    _applyMuffle(instant) {
        const g = this._graph;
        if (!g) return;
        const ctx = FxAudio.ctx, m = Math.max(0, Math.min(1, this._muffle));
        const freq = 20000 * Math.pow(380 / 20000, m);      // 20 kHz (clear) -> 380 Hz (closed windows)
        const bass = 10 * m;                                  // up to +10 dB of thump
        const t = instant ? 0.01 : 0.18;                      // glide, so opening a window "opens up" the sound
        g.lp1.frequency.setTargetAtTime(freq, ctx.currentTime, t);
        g.lp2.frequency.setTargetAtTime(freq, ctx.currentTime, t);
        g.bass.gain.setTargetAtTime(bass, ctx.currentTime, t);
    }

    // ---- extra API ----
    setMuffle(m) {
        this._muffle = Number(m) || 0;
        this._applyMuffle(false);
    }

    // ---- Howl-compatible API (everything xsound calls) ----
    volume(v) {
        if (v === undefined) return this._vol;
        this._vol = Math.max(0, v);
        if (this._graph) this._graph.gain.gain.setTargetAtTime(this._vol, FxAudio.ctx.currentTime, 0.02);
        else this.el.volume = Math.min(1, this._vol);
        return this;
    }
    loop(b) { if (b === undefined) return this.el.loop; this.el.loop = !!b; return this; }
    play() {
        this._wantPlay = true;
        if (FxAudio.ctx && FxAudio.ctx.state === "suspended") FxAudio.ctx.resume();
        const p = this.el.play();
        if (p && p.catch) p.catch(() => {});
        return this;
    }
    pause() { this._wantPlay = false; this.el.pause(); return this; }
    stop() { this._wantPlay = false; this.el.pause(); try { this.el.currentTime = 0; } catch (e) {} return this; }
    seek(t) { if (t === undefined) return this.el.currentTime; try { this.el.currentTime = t; } catch (e) {} return this; }
    playing() { return !this.el.paused && !this.el.ended; }
    duration() { return this.el.duration; }
    get _duration() { return this.el.duration; }
    unload() {
        this._dead = true;
        this._wantPlay = false;
        this.el.pause();
        if (this._graph) {
            try { this._graph.gain.disconnect(); this._graph.source.disconnect(); } catch (e) {}
            this._graph = null;
        }
        this.el.removeAttribute("src");
        this.el.load();
    }
}
