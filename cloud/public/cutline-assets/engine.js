/* Cutline Caption Engine. One file used by the editor preview AND the HyperFrames render, so what you see is what renders.
   Everything on screen is a pure function of time t (seconds). No timers, no random. */
(function (root) {
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------- Easing ---------- */
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = (t) => ((ax * t + bx) * t + cx) * t, sy = (t) => ((ay * t + by) * t + cy) * t;
    const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
    return (x) => {
      let t = x;
      for (let i = 0; i < 8; i++) { const e = sx(t) - x, d = dx(t); if (Math.abs(e) < 1e-6) break; if (Math.abs(d) < 1e-6) break; t -= e / d; }
      if (t < 0 || t > 1 || Math.abs(sx(t) - x) > 1e-4) { let lo = 0, hi = 1; t = x; for (let i = 0; i < 30; i++) { if (sx(t) < x) lo = t; else hi = t; t = (lo + hi) / 2; } }
      return sy(t);
    };
  }
  const hardBounce = (p) => {
    const n = 7.5625, d = 2.75;
    if (p < 1 / d) return n * p * p;
    if (p < 2 / d) return n * (p -= 1.5 / d) * p + 0.75;
    if (p < 2.5 / d) return n * (p -= 2.25 / d) * p + 0.9375;
    return n * (p -= 2.625 / d) * p + 0.984375;
  };
  const softBounce = (p, bounces = 2) => 1 - Math.abs(Math.cos(Math.PI * (bounces + 0.5) * p)) * Math.pow(1 - p, 3);
  const springFn = (w, z) => {
    const wd = w * Math.sqrt(1 - z * z);
    const raw = (p) => 1 - Math.exp(-z * w * p) * (Math.cos(wd * p) + (z * w / wd) * Math.sin(wd * p));
    const end = raw(1);
    return (p) => raw(p) + (1 - end) * p;
  };
  const elastic = (amp = 1, period = 0.3) => (p) => p === 0 ? 0 : p === 1 ? 1 : amp * Math.pow(2, -10 * p) * Math.sin(((p - period / 4) * (2 * Math.PI)) / period) + 1;
  const steps = (n) => (p) => (p >= 1 ? 1 : Math.floor(p * n) / n);

  const CATEGORIES = ["ease", "bounce", "spring", "elastic", "steps", "custom"];
  // Each preset is a full ease spec: { type, ...params }. Matches the KeyEase library names.
  const PRESETS = {
    "Ease in/out": { type: "ease", bezier: [0.65, 0, 0.35, 1] },
    "Sharp in": { type: "ease", bezier: [0.12, 0.8, 0.2, 1] },
    "Gentle out": { type: "ease", bezier: [0.25, 0.1, 0.25, 1] },
    "Overshoot": { type: "ease", bezier: [0.34, 1.56, 0.64, 1] },
    "Soft bounce": { type: "bounce", style: "soft", bounces: 2 },
    "Hard bounce": { type: "bounce", style: "hard" },
    "Gentle spring": { type: "spring", stiffness: 12, damping: 0.55 },
    "Snappy spring": { type: "spring", stiffness: 20, damping: 0.4 },
    "Rubber band": { type: "elastic", amplitude: 1, period: 0.35 },
    "6 steps": { type: "steps", steps: 6 },
    "12 steps": { type: "steps", steps: 12 },
  };
  const _cache = new Map();
  function easeFn(spec) {
    spec = spec || PRESETS["Sharp in"];
    const key = JSON.stringify(spec);
    if (_cache.has(key)) return _cache.get(key);
    let f;
    switch (spec.type) {
      case "bounce": f = spec.style === "hard" ? hardBounce : (p) => softBounce(p, spec.bounces || 2); break;
      case "spring": f = springFn(spec.stiffness || 14, clamp(spec.damping ?? 0.5, 0.05, 0.95)); break;
      case "elastic": f = elastic(spec.amplitude || 1, spec.period || 0.3); break;
      case "steps": f = steps(spec.steps || 6); break;
      default: { const b = spec.bezier || [0.12, 0.8, 0.2, 1]; f = bezier(clamp(b[0]), b[1], clamp(b[2]), b[3]); }
    }
    const g = (p) => (p <= 0 ? 0 : p >= 1 ? 1 : f(p));
    _cache.set(key, g);
    return g;
  }
  const easeIn = bezier(0.55, 0, 1, 0.45);

  /* ---------- Style presets (Mac built-in fonts) ---------- */
  const base = {
    font: "Avenir Next", weight: 600, italic: false, size: 64, color: "#FFFFFF",
    fill: "solid", grad: ["#FFFFFF", "#CCCCCC"], gradAngle: 180,
    outline: { width: 0, color: "#000000" },
    shadow: { on: true, blur: 18, x: 0, y: 6, color: "#000000", opacity: 0.55 },
    glow: { on: false, color: "#FFFFFF", intensity: 50 },
    bar: { on: false, color: "#FFD23F", text: "#2a1f00" },
    letterSpacing: -1, caseMode: "asis",
  };
  const spot = (o) => Object.assign({}, base, { weight: 800, italic: true, size: 150, overlap: 0.22 }, o);
  const STYLES = {
    "Gold Punch": { words: { ...base }, spot: spot({ font: "Avenir Next", weight: 800, fill: "gradient", grad: ["#FFD23F", "#FF9F1C"] }),
      motion: { in: "blurSlide", out: "smear", appear: "one", speed: 1, grow: 4, ease: PRESETS["Sharp in"] }, layout: { align: "zigzag", lineChars: 16 } },
    "Glow Lime": { words: { ...base, font: "Avenir Next", weight: 700 }, spot: spot({ font: "Didot", weight: 700, color: "#C6FF3A", glow: { on: true, color: "#C6FF3A", intensity: 60 } }),
      motion: { in: "rise", out: "fade", appear: "one", speed: 1, grow: 2, ease: PRESETS["Gentle spring"] }, layout: { align: "center", lineChars: 14 } },
    "Neon Purple": { words: { ...base, font: "Futura", weight: 700 }, spot: spot({ font: "Bodoni 72", weight: 700, color: "#C77DFF", glow: { on: true, color: "#B26BFF", intensity: 75 } }),
      motion: { in: "pop", out: "fade", appear: "one", speed: 1, grow: 2, ease: PRESETS["Overshoot"] }, layout: { align: "center", lineChars: 14 } },
    "Cinema Red": { words: { ...base, font: "Helvetica Neue", weight: 700, color: "#9fd3ff", glow: { on: true, color: "#6fb8ff", intensity: 35 } }, spot: spot({ font: "Baskerville", weight: 400, italic: false, color: "#E0221B", glow: { on: true, color: "#FF2A1F", intensity: 55 } }),
      motion: { in: "fade", out: "fade", appear: "one", speed: 0.9, grow: 3, ease: PRESETS["Gentle out"] }, layout: { align: "center", lineChars: 12 } },
    "Italic Punch": { words: { ...base, font: "Avenir Next", weight: 800 }, spot: spot({ font: "Avenir Next", weight: 800, color: "#FFFFFF", glow: { on: true, color: "#4FA3FF", intensity: 55 } }),
      motion: { in: "zoom", out: "smear", appear: "one", speed: 1.1, grow: 3, ease: PRESETS["Snappy spring"] }, layout: { align: "left", lineChars: 14 } },
    "Stack Mono": { words: { ...base, font: "DIN Condensed", weight: 700, size: 72, caseMode: "upper", letterSpacing: 0 }, spot: spot({ font: "DIN Condensed", weight: 700, italic: false, color: "#FFFFFF", outline: { width: 3, color: "#FFD23F" }, caseMode: "upper", letterSpacing: 0 }),
      motion: { in: "rise", out: "drop", appear: "one", speed: 1.2, grow: 0, ease: PRESETS["Hard bounce"] }, layout: { align: "left", lineChars: 12 } },
    "Signature": { words: { ...base, font: "Avenir Next", weight: 700 }, spot: spot({ font: "Snell Roundhand", weight: 700, italic: false, size: 140, fill: "gradient", grad: ["#FFE08A", "#E2A23B"] }),
      motion: { in: "drift", out: "fade", appear: "one", speed: 0.9, grow: 2, ease: PRESETS["Gentle out"] }, layout: { align: "center", lineChars: 16 } },
    "Single Word": { words: { ...base, size: 72, weight: 700 }, spot: spot({ size: 72, italic: false, weight: 700 }),
      motion: { in: "pop", out: "none", appear: "all", speed: 1.2, grow: 0, ease: PRESETS["Snappy spring"] }, layout: { align: "center", lineChars: 20 }, single: true },
  };

  /* ---------- Grouping words into captions ---------- */
  const MOOD_WORDS = (mood) => (mood < 25 ? 5 : mood < 50 ? 4 : mood < 75 ? 3 : 2);
  function group(words, s) {
    const per = s.wordsPerCaption === "auto" ? MOOD_WORDS(s.mood ?? 50) : +s.wordsPerCaption;
    const out = []; let cur = [];
    const flush = () => { if (cur.length) out.push(cur); cur = []; };
    words.forEach((w, i) => {
      if (cur.length) {
        const prev = cur[cur.length - 1];
        const chars = cur.reduce((n, x) => n + x.text.length + 1, 0) + w.text.length;
        const dur = w.end - cur[0].start;
        if (cur.length >= per || /[.!?]$/.test(prev.text) || w.start - prev.end >= (s.gap ?? 0.15) || chars > (s.maxChars ?? 32) || dur > (s.maxDur ?? 3)) flush();
      }
      cur.push(w);
    });
    flush();
    return out.map((ws, i) => ({ id: "c" + i, wordIds: ws.map((w) => w.id), x: 0.5, y: 0.3, scale: 1, style: {}, words: {} }));
  }
  const STOP = new Set("the a an and or but to of in on at for with is are was were be it its it's this that you your i i'm me my we our they them so as just".split(" "));
  function autoSpotlight(doc) {
    const byId = wordMap(doc);
    doc.captions.forEach((c) => {
      if (Object.values(c.words).some((w) => w.spot !== undefined)) return;
      let best = null, score = -1;
      c.wordIds.forEach((id) => { const t = clean(byId[id].text, "asis", true).toLowerCase(); const s = STOP.has(t) ? 0 : t.length; if (s > score) { score = s; best = id; } });
      if (best && score >= 3) c.words[best] = Object.assign({}, c.words[best], { spot: true });
    });
  }

  /* ---------- Timing ---------- */
  const wordMap = (doc) => { const m = {}; doc.words.forEach((w) => (m[w.id] = w)); return m; };
  function timings(doc) {
    const m = wordMap(doc), s = doc.settings;
    const list = doc.captions.map((c) => { const ws = c.wordIds.map((id) => m[id]).filter(Boolean); return { c, ws, start: Math.max(0, ws[0].start - 0.06), end: ws[ws.length - 1].end + 0.18 }; });
    list.forEach((x, i) => {
      x.end = Math.max(x.end, x.start + (s.minDur ?? 0.6));
      const next = list[i + 1];
      if (next) x.end = Math.min(x.end, next.start);
    });
    return list;
  }

  /* ---------- Text helpers ---------- */
  function clean(text, caseMode, noPunct) {
    let t = noPunct ? text.replace(/[.,!?;:"“”]/g, "") : text;
    if (caseMode === "upper") t = t.toUpperCase(); else if (caseMode === "lower") t = t.toLowerCase();
    return t;
  }
  const merge = (...objs) => {
    const out = {};
    objs.forEach((o) => o && Object.keys(o).forEach((k) => {
      const v = o[k];
      out[k] = v && typeof v === "object" && !Array.isArray(v) ? merge(out[k], v) : v;
    }));
    return out;
  };
  // Captions by speaker: each speaker can have its own preset and style, between the global style and the caption's own.
  function speakerOf(doc, cap) { return doc.speakers && doc.speakers.length ? doc.speakers[cap.speaker || 0] || null : null; }  // no speaker set = Speaker 1
  function baseStyle(doc, cap) {
    const sp = cap ? speakerOf(doc, cap) : null;
    // a speaker with its own preset gets that preset's full look, not the global edits on top of it
    if (sp && sp.preset && STYLES[sp.preset]) return merge(STYLES[sp.preset], sp.style);
    return merge(STYLES[doc.preset] || STYLES["Gold Punch"], doc.style, sp && sp.style);
  }
  function resolve(doc, cap, wid) {
    const st = baseStyle(doc, cap);
    const cs = merge(st, cap.style);
    const wo = cap.words[wid] || {};
    const isSpot = !!wo.spot && !cs.single;
    const look = merge(isSpot ? cs.spot : cs.words, wo.look);
    return { look, isSpot, motion: merge(cs.motion, wo.motion), layout: cs.layout, single: cs.single };
  }
  const hexA = (hex, a) => { const h = hex.replace("#", ""); const n = parseInt(h.length === 3 ? h.split("").map((x) => x + x).join("") : h, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
  function lookCSS(L, scale) {
    const size = Math.round(L.size * scale);
    const css = {
      fontFamily: `"${L.font}", "Avenir Next", sans-serif`, fontWeight: L.weight, fontStyle: L.italic ? "italic" : "normal",
      fontSize: size + "px", letterSpacing: (L.letterSpacing || 0) + "px", lineHeight: 1, whiteSpace: "pre",
    };
    const filters = [];
    if (L.shadow && L.shadow.on) filters.push(`drop-shadow(${L.shadow.x}px ${L.shadow.y}px ${L.shadow.blur}px ${hexA(L.shadow.color, L.shadow.opacity)})`);
    if (L.glow && L.glow.on) { const i = clamp(L.glow.intensity / 100, 0, 1.5); filters.push(`drop-shadow(0 0 ${Math.round(4 + 10 * i)}px ${hexA(L.glow.color, 0.5 + 0.5 * Math.min(1, i))})`, `drop-shadow(0 0 ${Math.round(14 + 40 * i)}px ${hexA(L.glow.color, 0.35 + 0.4 * Math.min(1, i))})`); }
    css.filter = filters.join(" ") || "none";
    if (L.fill === "gradient") { css.backgroundImage = `linear-gradient(${L.gradAngle || 180}deg, ${L.grad[0]}, ${L.grad[1]})`; css.webkitBackgroundClip = "text"; css.backgroundClip = "text"; css.color = "transparent"; }
    else css.color = L.color;
    if (L.outline && L.outline.width > 0) { css.webkitTextStroke = `${L.outline.width}px ${L.outline.color}`; css.paintOrder = "stroke fill"; }
    // the highlight bar is drawn by the word's wrapper (see build), so it never replaces the text color or gradient
    return css;
  }
  const apply = (el, css) => { Object.keys(css).forEach((k) => { const key = k === "webkitBackgroundClip" ? "-webkit-background-clip" : k === "webkitTextStroke" ? "-webkit-text-stroke" : k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase()); el.style.setProperty(key, css[k]); }); };

  /* ---------- Lines and layout ---------- */
  function lines(doc, cap, wm) {
    const out = []; let cur = null; const s = doc.settings;
    cap.wordIds.forEach((id) => {
      const r = resolve(doc, cap, id);
      const len = clean(wm[id].text, r.look.caseMode, s.removePunct).length;
      if (r.isSpot || cur === null || cur.spot || cur.chars + len > r.layout.lineChars) { cur = { spot: r.isSpot, ids: [], chars: 0 }; out.push(cur); }
      cur.ids.push(id); cur.chars += len + 1;
      if (r.isSpot) cur = null;
    });
    return out;
  }
  function alignFor(mode, i, n, line) {
    if (mode === "zigzag") { if (n >= 3 && i === n - 1 && !line.spot) return "right"; return "left"; }
    return mode || "center";
  }

  /* ---------- Motion ---------- */
  function inFx(name, e, p, dir) {
    const r = 1 - e;
    switch (name) {
      case "blurSlide": return { tx: -dir * 380 * r, sx: 1 + 0.7 * Math.max(0, r), blur: 18 * Math.max(0, r), o: clamp(p * 3) };
      case "pop": return { sc: 0.35 + 0.65 * e, o: clamp(p * 4) };
      case "rise": return { ty: 70 * r, o: clamp(p * 2.2) };
      case "drift": return { tx: 60 * r, o: clamp(p * 1.5) };
      case "fade": return { o: clamp(e) };
      case "zoom": return { sc: 1 + 0.9 * r, blur: 10 * Math.max(0, r), o: clamp(p * 2) };
      default: return { o: p > 0 ? 1 : 0 };
    }
  }
  function outFx(name, q) {
    switch (name) {
      case "smear": return { tx: 420 * q, sx: 1 + 0.6 * q, blur: 18 * q, o: 1 - clamp(q * 1.4) };
      case "fade": return { o: 1 - q };
      case "drop": return { ty: 80 * q, o: 1 - q };
      default: return { o: q >= 1 ? 0 : 1 };
    }
  }
  const tf = (f) => `translate(${(f.tx || 0).toFixed(1)}px, ${(f.ty || 0).toFixed(1)}px) scale(${((f.sc ?? 1) * (f.sx ?? 1)).toFixed(4)}, ${(f.sc ?? 1).toFixed(4)})`;

  /* ---------- Render ---------- */
  // state lives on the root element so the editor and the render page can each hold one.
  function render(rootEl, doc, t, opts = {}) {
    const W = doc.video.w, H = doc.video.h;
    const st = rootEl.__cl || (rootEl.__cl = { built: null, key: "" });
    const tl = st.tl && st.docRef === doc && st.ver === doc.__ver ? st.tl : (st.tl = timings(doc), st.docRef = doc, st.ver = doc.__ver, st.tl);
    const wm = wordMap(doc);
    const active = tl.find((x) => t >= x.start && t < x.end) || (opts.forceCaption ? tl.find((x) => x.c.id === opts.forceCaption) : null);
    const key = active ? active.c.id + "|" + (doc.__ver || 0) : "";
    if (key !== st.key) {
      rootEl.innerHTML = ""; st.key = key; st.built = null;
      if (active) st.built = build(rootEl, doc, active, wm, W, H);
    }
    if (!st.built) return null;
    const b = st.built, a = active, s = doc.settings;
    const m0 = resolve(doc, a.c, a.c.wordIds[0]).motion;
    const speed = clamp(m0.speed || 1, 0.3, 3) * lerp(0.8, 1.4, (s.mood ?? 50) / 100);
    const dIn = 0.2 / speed, dOut = m0.out === "none" ? 0 : 0.12 / speed;
    // settled: the editor shows the caption fully built (every word in, not leaving) so it can be styled while paused.
    const lastIn = (m0.appear === "all" ? a.start : b.words[b.words.length - 1].word.start - 0.04) + dIn + 0.01;
    const tt = opts.settled ? Math.min(Math.max(t, lastIn), a.end - dOut - 0.005) : t;
    const q = dOut ? clamp((tt - (a.end - dOut)) / dOut) : tt >= a.end ? 1 : 0;
    const of = outFx(m0.out, easeIn(q));
    const k = keyAt(a.c, t - a.start);
    if (k) { b.block.style.left = k.x * W + "px"; b.block.style.top = k.y * H + "px"; }
    b.block.style.opacity = of.o * (k ? k.opacity : 1);
    b.block.style.transform = `translate(-50%, -50%) ${k ? `rotate(${k.rot.toFixed(2)}deg) scale(${k.scale.toFixed(4)}) ` : ""}${tf(of)}`; b.block.style.filter = of.blur ? `blur(${of.blur.toFixed(1)}px)` : "none";
    b.words.forEach((w) => {
      const ta = m0.appear === "all" ? a.start : Math.max(a.start, w.word.start - 0.04);
      const p = clamp((tt - ta) / dIn);
      const e = easeFn(w.motion.ease)(p);
      const f = inFx(w.motion.in, e, p, 1);
      if (w.isSpot && w.motion.grow) { const h = clamp((tt - ta - dIn) / Math.max(0.3, a.end - ta)); f.sc = (f.sc ?? 1) * (1 + (w.motion.grow / 100) * h); }
      w.anim.style.opacity = f.o; w.anim.style.transform = tf(f); w.anim.style.filter = f.blur ? `blur(${f.blur.toFixed(1)}px)` : "none";
    });
    return { caption: a.c, block: b.block, start: a.start, end: a.end };
  }
  function build(rootEl, doc, a, wm, W, H) {
    const cap = a.c, s = doc.settings;
    const block = document.createElement("div");
    block.className = "cl-block"; block.dataset.cap = cap.id; block.setAttribute("data-layout-allow-occlusion", ""); block.setAttribute("data-layout-allow-overlap", "");
    Object.assign(block.style, { position: "absolute", left: cap.x * W + "px", top: cap.y * H + "px", transformOrigin: "50% 50%", display: "flex", flexDirection: "column", willChange: "transform, opacity" });
    const L = lines(doc, cap, wm), mode = (cap.align || resolve(doc, cap, cap.wordIds[0]).layout.align);
    const words = [];
    L.forEach((ln, i) => {
      const row = document.createElement("div");
      const al = alignFor(mode, i, L.length, ln);
      Object.assign(row.style, { display: "flex", gap: "0", justifyContent: al === "left" ? "flex-start" : al === "right" ? "flex-end" : "center", alignItems: "baseline", whiteSpace: "nowrap" });
      ln.ids.forEach((id) => {
        const r = resolve(doc, cap, id);
        const wo = cap.words[id] || {};
        const anim = document.createElement("span"), txt = document.createElement("span");
        anim.style.display = "inline-block"; anim.style.transformOrigin = r.isSpot ? "0% 60%" : "50% 60%"; anim.style.willChange = "transform, opacity, filter";
        txt.className = "cl-word"; txt.dataset.word = id; txt.style.display = "inline-block";
        txt.textContent = clean(wo.text ?? wm[id].text, r.look.caseMode, s.removePunct);
        apply(txt, lookCSS(r.look, (s.scale || 1) * (cap.scale || 1) * (wo.scale || 1)));
        // word gap in the word's own size, so small and big words both space right
        if (ln.ids[ln.ids.length - 1] !== id) txt.style.marginRight = "0.24em";
        // pos holds the word's own offset (moved on its own in the editor). anim holds the in/out motion. Two layers so they never fight.
        const pos = document.createElement("span");
        pos.className = "cl-pos"; pos.dataset.word = id; pos.style.display = "inline-block";
        pos.style.transform = `translate(${wo.dx || 0}px, ${wo.dy || 0}px) rotate(${wo.rot || 0}deg)`;
        if (r.look.bar && r.look.bar.on) Object.assign(anim.style, { background: r.look.bar.color, padding: "0 0.14em", borderRadius: "0.1em", fontSize: Math.round(r.look.size * (s.scale || 1) * (cap.scale || 1) * (wo.scale || 1)) + "px", lineHeight: 1 });
        anim.appendChild(txt); pos.appendChild(anim); row.appendChild(pos);
        words.push({ id, word: wm[id], anim, txt, isSpot: r.isSpot, motion: r.motion });
      });
      if (ln.spot && i > 0) row.style.marginTop = `-${Math.round(resolve(doc, cap, ln.ids[0]).look.size * (cap.scale || 1) * (resolve(doc, cap, ln.ids[0]).look.overlap || 0))}px`;
      if (i > 0 && L[i - 1].spot) row.style.marginTop = `-${Math.round(resolve(doc, cap, L[i - 1].ids[0]).look.size * (cap.scale || 1) * 0.12)}px`;
      block.appendChild(row);
    });
    rootEl.appendChild(block);
    if (s.keepFaceClear && !(cap.keys && cap.keys.length)) avoidFace(block, facesIn(doc, a.start, a.end), cap, W, H);
    return { block, words };
  }
  // Faces on screen during a caption: from the face track (Apple Vision, made when the video is added), else the face box you placed.
  function facesIn(doc, start, end) {
    const tr = doc.faceTrack;
    if (!tr || !tr.faces || !tr.faces.length) return doc.face ? [doc.face] : [];
    const i0 = Math.max(0, Math.floor(start * tr.fps)), i1 = Math.min(tr.faces.length - 1, Math.ceil(end * tr.fps));
    const groups = [];
    // faces plus any text already burned into the video during this caption
    for (let i = i0; i <= i1; i++) [...(tr.faces[i] || []), ...((tr.text && tr.text[i]) || [])].forEach((f) => {
      const cx = f.x + f.w / 2, g = groups.find((u) => Math.abs(u.x + u.w / 2 - cx) < 0.15);
      if (!g) groups.push({ x: f.x, y: f.y, w: f.w, h: f.h });
      else { const x1 = Math.max(g.x + g.w, f.x + f.w), y1 = Math.max(g.y + g.h, f.y + f.h); g.x = Math.min(g.x, f.x); g.y = Math.min(g.y, f.y); g.w = x1 - g.x; g.h = y1 - g.y; }
    });
    return groups.map((g) => ({ x: g.x - 0.03, y: g.y - 0.04, w: g.w + 0.06, h: g.h + 0.08 }));
  }
  function avoidFace(block, faces, cap, W, H) {
    const bw = block.offsetWidth, bh = block.offsetHeight, cx = cap.x * W;
    let cy = cap.y * H;
    for (let pass = 0; pass < 3; pass++) faces.forEach((f) => {
      const fy0 = f.y * H, fy1 = (f.y + f.h) * H, fx0 = f.x * W, fx1 = (f.x + f.w) * W;
      if (!(cx + bw / 2 > fx0 && cx - bw / 2 < fx1 && cy + bh / 2 > fy0 && cy - bh / 2 < fy1)) return;
      const above = fy0 - bh / 2 - 20, below = fy1 + bh / 2 + 20;
      cy = Math.abs(above - cy) < Math.abs(below - cy) && above > bh / 2 + 220 ? above : below;
    });
    block.style.top = cy + "px";
  }

  /* ---------- Keyframes: move, scale, turn and fade a caption over its time ---------- */
  // cap.keys = [{ t (seconds from caption start), x, y, scale, rot, opacity, ease }]. The ease is how the move INTO that key feels.
  function keyAt(cap, lt) {
    const ks = cap.keys;
    if (!ks || !ks.length) return null;
    const v = (k) => ({ x: k.x, y: k.y, scale: k.scale ?? 1, rot: k.rot ?? 0, opacity: k.opacity ?? 1 });
    if (lt <= ks[0].t) return v(ks[0]);
    const last = ks[ks.length - 1];
    if (lt >= last.t) return v(last);
    const i = ks.findIndex((k, j) => lt >= k.t && lt < ks[j + 1].t), a = v(ks[i]), b = v(ks[i + 1]);
    const e = easeFn(ks[i + 1].ease || PRESETS["Ease in/out"])((lt - ks[i].t) / Math.max(1e-6, ks[i + 1].t - ks[i].t));
    return { x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e), scale: lerp(a.scale, b.scale, e), rot: lerp(a.rot, b.rot, e), opacity: clamp(lerp(a.opacity, b.opacity, e)) };
  }

  /* ---------- SRT in and out ---------- */
  const srtTime = (s) => { const ms = Math.round(s * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`; };
  function toSRT(doc) {
    const wm = wordMap(doc);
    return timings(doc).map((x, i) => `${i + 1}\n${srtTime(x.start)} --> ${srtTime(x.end)}\n${x.c.wordIds.map((id) => (x.c.words[id] && x.c.words[id].text) || wm[id].text).join(" ")}\n`).join("\n");
  }
  function fromCaptionFile(text) {
    // SRT or VTT. No word timings in these files, so each line's time is spread over its words by character count.
    const blocks = text.replace(/\r/g, "").split(/\n\n+/), words = [];
    const ts = (x) => { const m = x.trim().replace(",", ".").split(":").map(Number); return m.length === 3 ? m[0] * 3600 + m[1] * 60 + m[2] : m[0] * 60 + m[1]; };
    blocks.forEach((b) => {
      const ls = b.split("\n"), i = ls.findIndex((l) => l.includes("-->"));
      if (i < 0) return;
      const [a, z] = ls[i].split("-->").map((x) => ts(x.split(" ")[0] || x));
      const ws = ls.slice(i + 1).join(" ").split(/\s+/).filter(Boolean), total = ws.reduce((n, w) => n + w.length, 0) || 1;
      let t = a;
      ws.forEach((w) => { const d = ((z - a) * w.length) / total; words.push({ id: "w" + words.length, text: w, start: +t.toFixed(3), end: +(t + d).toFixed(3) }); t += d; });
    });
    return words;
  }

  /* ---------- Transitions on the video itself ----------
     doc.transitions = [{ id, t, type, dur, amount }]. One continuous take, so each transition is a move of the camera layer
     (zoom, whip, shake, spin) or an overlay (flash, dip, glitch, light leak), centered on t. No blur filters on footage (HyperFrames rule). */
  const TRANSITIONS = {
    punch: { label: "Punch in (cut zoom)", dur: 0, amount: 1.15, min: 1, max: 1.5, step: 0.01, note: "Cuts to a closer or wider framing and stays there" },
    zoompunch: { label: "Zoom punch", dur: 0.35, amount: 1.25, min: 1.05, max: 1.8, step: 0.01, note: "Quick push in and back" },
    whip: { label: "Whip", dur: 0.3, amount: 1, min: 0.3, max: 2, step: 0.05, note: "Fast side slide out and back in" },
    spin: { label: "Spin zoom", dur: 0.4, amount: 1, min: 0.3, max: 2, step: 0.05, note: "Turns and pushes in, then settles" },
    shake: { label: "Shake", dur: 0.35, amount: 1, min: 0.3, max: 3, step: 0.05, note: "Camera hit on a big word" },
    flash: { label: "Flash", dur: 0.25, amount: 0.9, min: 0.2, max: 1, step: 0.05, note: "White flash cut" },
    dip: { label: "Dip to black", dur: 0.2, amount: 0.6, min: 0.2, max: 1, step: 0.05, note: "Darkens for a beat so a cut reads as meant" },
    glitch: { label: "Glitch", dur: 0.3, amount: 1, min: 0.3, max: 2, step: 0.05, note: "Color slices and a jolt" },
    leak: { label: "Light leak", dur: 0.6, amount: 0.8, min: 0.2, max: 1, step: 0.05, note: "Warm light sweeps across" },
  };
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  // face center at time t from the face track, so zooms push toward the face and keep it centered
  function faceCenter(doc, t) {
    const tr = doc.faceTrack;
    if (tr && tr.faces && tr.faces.length) {
      const i = Math.min(tr.faces.length - 1, Math.max(0, Math.round(t * tr.fps)));
      for (let d = 0; d < 6; d++) for (const j of [i - d, i + d]) { const f = tr.faces[j]; if (f && f.length) { const b = f.reduce((a, c) => (c.w * c.h > a.w * a.h ? c : a)); return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; } }
    }
    return { x: 0.5, y: 0.38 };
  }
  function videoFx(doc, t) {
    const list = (doc.transitions || []).slice().sort((a, b) => a.t - b.t);
    const fx = { scale: 1, tx: 0, ty: 0, rot: 0, flash: 0, dip: 0, leak: 0, leakX: 0, glitch: 0, gseed: 0, sound: null };
    const lastPunch = list.filter((x) => x.type === "punch" && x.t <= t).pop();
    if (lastPunch) fx.scale = lastPunch.amount ?? TRANSITIONS.punch.amount;
    list.forEach((x) => {
      const T = TRANSITIONS[x.type]; if (!T || x.type === "punch") return;
      const d = Math.max(0.05, x.dur ?? T.dur), a = x.amount ?? T.amount, p = (t - (x.t - d / 2)) / d;
      if (p < 0 || p > 1) return;
      const bell = Math.sin(Math.PI * p);          // 0 -> 1 -> 0 over the transition
      switch (x.type) {
        case "zoompunch": fx.scale *= 1 + (a - 1) * easeFn(PRESETS["Sharp in"])(bell); break;
        case "whip": { const dir = hash(x.t) > 0.5 ? 1 : -1; fx.tx += dir * 0.32 * a * (p < 0.5 ? easeIn(p * 2) : -(1 - easeFn(PRESETS["Sharp in"])((p - 0.5) * 2))); fx.scale *= 1 + 0.08 * bell; break; }
        case "spin": fx.rot += 8 * a * Math.sin(Math.PI * 2 * p) * (1 - p); fx.scale *= 1 + 0.18 * a * bell; break;
        case "shake": { const f = Math.floor(t * 30); fx.tx += (hash(f) - 0.5) * 0.04 * a * (1 - p); fx.ty += (hash(f + 7) - 0.5) * 0.03 * a * (1 - p); fx.scale *= 1 + 0.04 * a * (1 - p); break; }
        case "flash": fx.flash = Math.max(fx.flash, a * Math.pow(bell, 0.6)); break;
        case "dip": fx.dip = Math.max(fx.dip, a * bell); break;
        case "glitch": fx.glitch = Math.max(fx.glitch, a * bell); fx.gseed = Math.floor(t * 30); fx.tx += (hash(fx.gseed) - 0.5) * 0.03 * a * bell; break;
        case "leak": fx.leak = Math.max(fx.leak, a * bell); fx.leakX = p; break;
      }
    });
    fx.origin = faceCenter(doc, t);
    // never show an empty edge: push in enough to cover any slide or turn
    const r = Math.abs(fx.rot) * Math.PI / 180, ar = (doc.video.h || 1920) / (doc.video.w || 1080);
    fx.scale = Math.max(fx.scale, 1 + 2 * Math.max(Math.abs(fx.tx), Math.abs(fx.ty)), Math.cos(r) + ar * Math.sin(r));
    return fx;
  }
  // cam: wrapper around the video (never the timed video itself). fxEl: overlay layer above the video, below captions.
  function renderVideo(cam, fxEl, doc, t) {
    const f = videoFx(doc, t), W = doc.video.w, H = doc.video.h;
    // keep the zoomed frame covering the screen: limit how far the origin can pull the edges in
    cam.style.transformOrigin = `${(f.origin.x * 100).toFixed(2)}% ${(f.origin.y * 100).toFixed(2)}%`;
    cam.style.transform = `translate(${(f.tx * W).toFixed(1)}px, ${(f.ty * H).toFixed(1)}px) rotate(${f.rot.toFixed(2)}deg) scale(${Math.max(1, f.scale).toFixed(4)})`;
    if (!fxEl) return f;
    const st = fxEl.__fx || (fxEl.__fx = (() => {
      const mk = (css) => { const d = document.createElement("div"); Object.assign(d.style, { position: "absolute", inset: "0", pointerEvents: "none", opacity: "0" }, css); fxEl.appendChild(d); return d; };
      const bars = []; for (let i = 0; i < 6; i++) bars.push(mk({ inset: "auto", left: "0", right: "0", height: "0", mixBlendMode: "screen" }));
      return { flash: mk({ background: "#fff" }), dip: mk({ background: "#000" }), leak: mk({ background: "radial-gradient(60% 50% at 50% 50%, rgba(255,170,90,.85), rgba(255,90,40,.35) 45%, transparent 75%)", mixBlendMode: "screen" }), bars };
    })());
    st.flash.style.opacity = f.flash.toFixed(3);
    st.dip.style.opacity = f.dip.toFixed(3);
    st.leak.style.opacity = f.leak.toFixed(3); st.leak.style.transform = `translateX(${((f.leakX - 0.5) * 120).toFixed(1)}%) scale(1.4)`;
    st.bars.forEach((b, i) => {
      if (f.glitch <= 0.02) { b.style.opacity = "0"; return; }
      const r = hash(f.gseed * 13 + i * 7.3), on = r < 0.4 + 0.5 * f.glitch;
      b.style.opacity = on ? (0.35 + 0.5 * f.glitch).toFixed(2) : "0";
      b.style.top = (hash(f.gseed + i * 3.1) * 92).toFixed(1) + "%"; b.style.height = (2 + hash(f.gseed * 2 + i) * 7).toFixed(1) + "%";
      b.style.background = ["rgba(255,0,80,.8)", "rgba(0,220,255,.8)", "rgba(255,255,255,.6)"][i % 3];
      b.style.transform = `translateX(${((hash(f.gseed + i) - 0.5) * 18).toFixed(1)}%)`;
    });
    return f;
  }
  // Auto placement: a cut-zoom on most new sentences (alternating close and wide), a few bigger moves by mood, every scene cut covered.
  function autoTransitions(doc, sceneCuts = []) {
    const tl = timings(doc), mood = doc.settings.mood ?? 50, out = [];
    const gap = lerp(5.5, 2.2, mood / 100);      // seconds between transitions: calm spaces them out, hype packs them in
    const big = mood < 25 ? ["dip"] : mood < 50 ? ["zoompunch", "flash"] : mood < 75 ? ["zoompunch", "whip", "flash", "shake"] : ["whip", "zoompunch", "glitch", "shake", "spin", "flash"];
    let last = -99, close = false, n = 0;
    const wm = wordMap(doc);
    tl.forEach((x, i) => {
      const prev = tl[i - 1], newSentence = !prev || /[.!?]$/.test(wm[prev.c.wordIds[prev.c.wordIds.length - 1]].text);
      if (x.start - last < gap || x.start < 0.8 || (!newSentence && x.start - last < gap * 1.8)) return;
      n++;
      if (n % 3 === 0) { const type = big[Math.floor(hash(n) * big.length)]; out.push({ t: +x.start.toFixed(3), type, dur: TRANSITIONS[type].dur, amount: TRANSITIONS[type].amount }); }
      else { close = !close; out.push({ t: +x.start.toFixed(3), type: "punch", dur: 0, amount: close ? 1.14 : 1 }); }
      last = x.start;
    });
    sceneCuts.forEach((c) => { if (!out.some((o) => Math.abs(o.t - c) < 0.5)) out.push({ t: +c.toFixed(3), type: mood > 60 ? "whip" : "dip", dur: TRANSITIONS[mood > 60 ? "whip" : "dip"].dur, amount: TRANSITIONS[mood > 60 ? "whip" : "dip"].amount }); });
    return out.sort((a, b) => a.t - b.t).map((o, i) => Object.assign({ id: "tr" + i }, o));
  }

  root.CaptionEngine = { TRANSITIONS, videoFx, renderVideo, autoTransitions, faceCenter, keyAt, facesIn, baseStyle, speakerOf, CATEGORIES, PRESETS, STYLES, easeFn, group, autoSpotlight, timings, render, resolve, merge, clean, toSRT, fromCaptionFile, MOOD_WORDS };
})(typeof window !== "undefined" ? window : globalThis);
