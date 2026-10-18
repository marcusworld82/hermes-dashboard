import fs from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";
import type { ReactElement, ReactNode } from "react";
import { canvas, safeBox, fitText } from "@/lib/carousel/layout";
import { FONTS, fontById, lineHeightOf } from "@/lib/carousel/fonts";
import { templateById, splitAccent, plain, applyCase, type CreativeStyle } from "@/lib/carousel/templates";
import type { BrandKit, Carousel, Slide } from "@/lib/carousel/types";
import { readMedia } from "./carousels";
import { getBrandKit } from "./brand-kits";

// Draws one slide to PNG with next/og. The page preview uses the same function, so the preview is the posted image.
// Every template keeps text inside the safe zone (layout.ts). Text that had to shrink below a readable size is flagged.

const MIN_HEAD = 64;
const MIN_BODY = 28;
const HANDLE_ROOM = 64;

type Ctx = { car: Carousel; kit: BrandKit; slide: Slide; index: number; total: number; preview: boolean; flags: string[]; W: number; H: number };

const fontCache = new Map<string, ArrayBuffer>();
function fontData(file: string) {
  let d = fontCache.get(file);
  if (!d) {
    const b = fs.readFileSync(path.join(process.cwd(), "assets/fonts", file));
    d = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    fontCache.set(file, d);
  }
  return d;
}
function fontsFor(ids: string[]) {
  return [...new Set([...ids, "inter"])].flatMap((id) => {
    const f = fontById(id);
    return f.files.map((x) => ({ name: f.family, data: fontData(x.file), weight: x.weight as 400, style: x.style }));
  });
}
const family = (id: string) => fontById(id).family;

function dataUrl(file: string | undefined): string | null {
  if (!file) return null;
  try {
    const { bytes, mime } = readMedia(file);
    return `data:${mime};base64,${bytes.toString("base64")}`;
  } catch { return null; }
}

function charW(fontId: string, upper: boolean) {
  const f = fontById(fontId);
  return f.charWidth * (upper && !f.caps ? 1.12 : 1);
}

function fit(ctx: Ctx, text: string, fontId: string, upper: boolean, box: { w: number; h: number }, maxPx: number, minPx: number, lineHeight: number, label: string) {
  const r = fitText(plain(text), { box, maxPx: Math.round(maxPx), minPx, lineHeight, charWidth: charW(fontId, upper) });
  if (!r.fits && text.trim()) ctx.flags.push(`Slide ${ctx.index + 1}: ${label} is too long and shrank below a readable size.`);
  return r.px;
}

function Words(p: { text: string; px: number; font: string; color: string; accent: string; align: "left" | "center"; textCase: "upper" | "title" | "sentence"; style?: "color" | "highlight" | "italic" | "script"; lineHeight?: number; width: number; weight?: number }) {
  const words = splitAccent(p.text);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: p.align === "center" ? "center" : "flex-start", width: p.width, paddingLeft: p.font === "homemade-apple" ? Math.round(p.px * 0.35) : 0, fontFamily: family(p.font), fontSize: p.px, lineHeight: p.lineHeight ?? lineHeightOf(p.font), color: p.color, fontWeight: p.weight ?? 400 }}>
      {words.map((w, i) => {
        const txt = p.style === "script" && w.accent ? w.word : applyCase(w.word, p.textCase);
        const s: Record<string, string | number> = { marginRight: Math.round(p.px * 0.24) };
        if (w.accent) {
          if (p.style === "highlight") Object.assign(s, { backgroundColor: p.accent, padding: `0 ${Math.round(p.px * 0.12)}px` });
          else if (p.style === "italic") Object.assign(s, { fontStyle: "italic" });
          else if (p.style === "script") Object.assign(s, { fontFamily: family("great-vibes"), color: p.accent, fontSize: Math.round(p.px * 1.15) });
          else s.color = p.accent;
        }
        return <span key={i} style={s}>{txt}</span>;
      })}
    </div>
  );
}

function Body(p: { text: string; px: number; font: string; color: string; align: "left" | "center"; width: number }) {
  return <div style={{ display: "flex", width: p.width, fontFamily: family(p.font), fontSize: p.px, lineHeight: 1.35, color: p.color, textAlign: p.align, justifyContent: p.align === "center" ? "center" : "flex-start", whiteSpace: "pre-wrap" }}>{plain(p.text)}</div>;
}

function Placeholder(p: { w: number; h: number; x: number; y: number; color: string; preview: boolean; label?: string }) {
  if (!p.preview) return null;
  return <div style={{ position: "absolute", left: p.x, top: p.y, width: p.w, height: p.h, border: `4px dashed ${p.color}`, borderRadius: 24, display: "flex", alignItems: "center", justifyContent: "center", color: p.color, fontSize: 34, fontFamily: "Inter", opacity: 0.6 }}>{p.label ?? "Add an image"}</div>;
}

function Img(p: { src: string; x: number; y: number; w: number; h: number; radius?: number; border?: string }) {
  return <img src={p.src} width={p.w} height={p.h} style={{ position: "absolute", left: p.x, top: p.y, width: p.w, height: p.h, objectFit: "cover", borderRadius: p.radius ?? 0, ...(p.border ? { border: p.border } : {}) }} />;
}

function Handle(p: { kit: BrandKit; color: string; H: number; pill?: boolean }) {
  const label = p.kit.handle;
  if (p.pill) return <div style={{ position: "absolute", left: 50, top: p.H - 180 - 56, display: "flex", backgroundColor: "#111111", color: "#FFFFFF", borderRadius: 40, padding: "8px 22px", fontFamily: "Inter", fontSize: 26, fontWeight: 600 }}>{label}</div>;
  return <div style={{ position: "absolute", left: 50, top: p.H - 180 - 44, display: "flex", color: p.color, fontFamily: "Inter", fontSize: 26, fontWeight: 600, opacity: 0.85 }}>{label}</div>;
}

function Check(p: { badge: string; size: number }) {
  if (p.badge === "none") return null;
  const fill = p.badge === "gold" ? "#E8B21C" : "#1D9BF0";
  return (
    <svg width={p.size} height={p.size} viewBox="0 0 24 24" style={{ marginLeft: 8 }}>
      <circle cx="12" cy="12" r="11" fill={fill} />
      <path d="M7 12.5l3.2 3.2L17 9" stroke="#FFFFFF" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------- Creative (and Clone) ----------
function creative(ctx: Ctx, base: CreativeStyle): ReactElement {
  const { car, kit, slide, W, H } = ctx;
  const st = car.useBrandColors ? { ...base, bg: kit.colors.bg, text: kit.colors.text, accent: kit.colors.accent } : base;
  const box = safeBox(car.size);
  const upper = st.textCase === "upper";
  const scale = slide.textScale || 1;
  const img = dataUrl(slide.images[0]);
  const isCover = slide.kind === "cover";
  const hasDeco = (d: string) => st.deco.includes(d as never);
  const accentStyle = hasDeco("highlight") ? "highlight" : hasDeco("italic-accent") ? "italic" : hasDeco("script-accent") ? "script" : "color";
  const textH = box.h - (slide.showHandle ? HANDLE_ROOM : 0);
  const wantsImage = st.image === "below" && (img || ctx.preview);
  const headShare = isCover ? (wantsImage ? 0.42 : slide.body ? 0.78 : 1) : (wantsImage ? 0.22 : 0.34);
  const framePad = hasDeco("dashed-frame") ? 56 : 0;
  const headPx = fit(ctx, slide.headline, st.display, upper, { w: box.w - framePad, h: textH * headShare - framePad }, (isCover ? st.headlineMax : st.headlineMax * 0.6) * scale, MIN_HEAD * (isCover ? 1 : 0.75), lineHeightOf(st.display), "headline");
  const bodyBudget = isCover ? textH * (1 - headShare) * 0.9 : textH * (wantsImage ? 0.3 : 0.6);
  const bodyPx = slide.body ? fit(ctx, slide.body, st.body, false, { w: box.w - (hasDeco("dashed-body") || hasDeco("tape-card") ? 80 : 0), h: bodyBudget }, (isCover ? 40 : 46) * scale, MIN_BODY, 1.35, "body text") : 0;
  const headLines = fitText(plain(slide.headline), { box: { w: box.w - framePad, h: 99999 }, maxPx: headPx, minPx: headPx, lineHeight: lineHeightOf(st.display), charWidth: charW(st.display, upper) }).lines;
  const bodyLines = slide.body ? fitText(plain(slide.body), { box: { w: box.w, h: 99999 }, maxPx: bodyPx, minPx: bodyPx, lineHeight: 1.35, charWidth: charW(st.body, false) }).lines : 0;
  const usedH = headLines * headPx * lineHeightOf(st.display) + framePad + (bodyLines ? bodyLines * bodyPx * 1.35 + 40 + (hasDeco("dashed-body") || hasDeco("tape-card") ? 60 : 0) : 0);
  const full = st.image === "full" || st.image === "framed";
  const justify = full ? "flex-end" : st.image === "below" ? "flex-start" : "center";
  const imgTop = Math.round(box.y + Math.min(usedH, textH) + 40);
  const imgH = H - 120 - imgTop;

  let body: ReactNode = slide.body ? <Body text={slide.body} px={bodyPx} font={st.body} color={st.text} align={st.align} width={box.w - (hasDeco("dashed-body") || hasDeco("tape-card") ? 80 : 0)} /> : null;
  if (body && hasDeco("dashed-body")) body = <div style={{ display: "flex", border: `3px dashed ${st.accent}`, borderRadius: 12, padding: "24px 36px", marginTop: 32 }}>{body}</div>;
  else if (body && hasDeco("tape-card")) body = (
    <div style={{ display: "flex", position: "relative", backgroundColor: "#F6EEE1", padding: "44px 40px 36px", marginTop: 40, transform: "rotate(-1.5deg)", boxShadow: "0 6px 20px rgba(0,0,0,0.18)" }}>
      <div style={{ position: "absolute", top: -18, left: "40%", width: 160, height: 40, backgroundColor: "rgba(214,190,150,0.85)", display: "flex" }} />
      {body}
    </div>
  );
  else if (body) body = <div style={{ display: "flex", marginTop: 36 }}>{body}</div>;

  let headline: ReactNode = <Words text={slide.headline} px={headPx} font={st.display} color={st.text} accent={st.accent} align={st.align} textCase={st.textCase} style={accentStyle} width={box.w - framePad} weight={st.display === "inter" ? 800 : 400} />;
  if (hasDeco("dashed-frame")) headline = <div style={{ display: "flex", border: `4px dashed ${st.accent}`, borderRadius: 16, padding: 24 }}>{headline}</div>;

  return (
    <div style={{ width: W, height: H, display: "flex", position: "relative", backgroundColor: st.bg, overflow: "hidden" }}>
      {hasDeco("glow") && <div style={{ position: "absolute", right: -260, top: -260, width: 700, height: 700, display: "flex", backgroundImage: `radial-gradient(circle, ${st.accent} 0%, rgba(0,0,0,0) 65%)`, opacity: 0.75 }} />}
      {st.image === "full" && img && <Img src={img} x={0} y={0} w={W} h={H} />}
      {st.image === "framed" && img && <Img src={img} x={36} y={36} w={W - 72} h={H - 72} radius={40} />}
      {full && <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, display: "flex", backgroundImage: `linear-gradient(180deg, rgba(0,0,0,${(slide.dim / 300).toFixed(2)}) 0%, rgba(0,0,0,${(slide.dim / 100).toFixed(2)}) 100%)` }} />}
      {st.image === "framed" && <div style={{ position: "absolute", left: 36, top: 36, width: W - 72, height: H - 72, borderRadius: 40, border: `2px solid ${st.text}`, display: "flex" }} />}
      {full && !img && <Placeholder x={80} y={80} w={W - 160} h={H - 160} color={st.text} preview={ctx.preview} label="Add a background photo" />}
      {hasDeco("vignette") && <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, display: "flex", backgroundImage: "radial-gradient(circle at 50% 40%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.55) 100%)" }} />}
      {st.image === "below" && img && <Img src={img} x={50} y={imgTop} w={W - 100} h={Math.max(160, imgH)} radius={hasDeco("image-border") ? 0 : 20} border={hasDeco("image-border") ? `4px solid ${st.text}` : undefined} />}
      {st.image === "below" && !img && <Placeholder x={50} y={imgTop} w={W - 100} h={Math.max(160, imgH)} color={st.text} preview={ctx.preview} />}
      <div style={{ position: "absolute", left: box.x, top: box.y, width: box.w, height: textH, display: "flex", flexDirection: "column", justifyContent: justify, alignItems: st.align === "center" ? "center" : "flex-start" }}>
        {headline}
        {body}
      </div>
      {hasDeco("counter") && ctx.total > 1 && <div style={{ position: "absolute", right: 120, top: 120, display: "flex", backgroundColor: st.accent, color: st.bg, borderRadius: 30, padding: "6px 18px", fontFamily: "Inter", fontSize: 24, fontWeight: 600 }}>{`${ctx.index + 1}/${ctx.total}`}</div>}
      {hasDeco("mono-footer") && <div style={{ position: "absolute", left: 50, width: W - 170, top: H - 180 - 44, display: "flex", justifyContent: "flex-end", fontFamily: family("space-mono"), fontSize: 20, color: st.text, opacity: 0.7 }}>{applyCase(plain(car.title || ""), "upper").slice(0, 48)}</div>}
      {slide.showHandle && <Handle kit={kit} color={st.text} H={H} pill={hasDeco("handle-pill")} />}
    </div>
  );
}

// ---------- Screenshot (tweet card) ----------
function screenshot(ctx: Ctx): ReactElement {
  const { car, kit, slide, W, H } = ctx;
  const pal = car.theme === "light" ? { bg: "#FFFFFF", text: "#0F1419", sub: "#536471" } : car.theme === "dark" ? { bg: "#15202B", text: "#F7F9F9", sub: "#8B98A5" } : { bg: kit.colors.bg, text: kit.colors.text, sub: "#B0B0B0" };
  const box = safeBox(car.size);
  const img = dataUrl(slide.images[0]);
  const avatar = dataUrl(kit.avatar ?? undefined);
  const text = [slide.headline, slide.body].filter((s) => s.trim()).join("\n\n");
  const imgH = img || (ctx.preview && car.inputs.includeImages) ? Math.round(box.h * 0.38) : 0;
  const px = fit(ctx, text, "inter", false, { w: box.w, h: box.h - 150 - imgH - (imgH ? 40 : 0) }, (slide.kind === "cover" ? 84 : 62) * (slide.textScale || 1), MIN_BODY + 8, 1.3, "text");
  return (
    <div style={{ width: W, height: H, display: "flex", backgroundColor: pal.bg, position: "relative" }}>
      <div style={{ position: "absolute", left: box.x, top: box.y, width: box.w, height: box.h, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 36 }}>
          {avatar ? <img src={avatar} width={104} height={104} style={{ width: 104, height: 104, borderRadius: 52, objectFit: "cover" }} />
            : <div style={{ width: 104, height: 104, borderRadius: 52, backgroundColor: kit.colors.accent, color: "#121212", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter", fontWeight: 800, fontSize: 40 }}>{kit.displayName.split(" ").map((s) => s[0]).join("").slice(0, 2)}</div>}
          <div style={{ display: "flex", flexDirection: "column", marginLeft: 24 }}>
            <div style={{ display: "flex", alignItems: "center", fontFamily: "Inter", fontWeight: 800, fontSize: 40, color: pal.text }}>{kit.displayName}<Check badge={car.inputs.badge} size={38} /></div>
            <div style={{ display: "flex", fontFamily: "Inter", fontSize: 32, color: pal.sub }}>{kit.handle}</div>
          </div>
        </div>
        <div style={{ display: "flex", fontFamily: "Inter", fontSize: px, lineHeight: 1.3, color: pal.text, whiteSpace: "pre-wrap" }}>{plain(text)}</div>
        {img && <img src={img} width={box.w} height={imgH} style={{ width: box.w, height: imgH, objectFit: "cover", borderRadius: 28, marginTop: 40 }} />}
        {!img && imgH > 0 && <div style={{ display: "flex", width: box.w, height: imgH, marginTop: 40, border: `4px dashed ${pal.sub}`, borderRadius: 28, alignItems: "center", justifyContent: "center", color: pal.sub, fontFamily: "Inter", fontSize: 32 }}>Add an image</div>}
      </div>
    </div>
  );
}

// ---------- Photo layouts ----------
function photo(ctx: Ctx): ReactElement {
  const { car, kit, slide, W, H } = ctx;
  const box = safeBox(car.size);
  const a = dataUrl(slide.images[0]);
  const b = dataUrl(slide.images[1]);
  const scale = slide.textScale || 1;
  const dim = `rgba(0,0,0,${(slide.dim / 100).toFixed(2)})`;
  const white = "#FFFFFF";
  const disp = kit.fonts.display;
  const layout = slide.layout === "default" ? "single" : slide.layout;
  const shadow = "0 4px 24px rgba(0,0,0,0.45)";
  const half = Math.round(H / 2);
  const words = (t: string, max: number, h: number, label: string) => <Words text={t} px={fit(ctx, t, disp, true, { w: box.w, h }, max * scale, 40, 1.05, label)} font={disp} color={white} accent={kit.colors.accent} align="center" textCase="upper" width={box.w} />;
  const Fill = (p: { src: string | null; x: number; y: number; w: number; h: number; label: string }) => (p.src ? <Img src={p.src} x={p.x} y={p.y} w={p.w} h={p.h} /> : <Placeholder x={p.x + 30} y={p.y + 30} w={p.w - 60} h={p.h - 60} color="#888888" preview={ctx.preview} label={p.label} />);
  const Shade = (p: { x: number; y: number; w: number; h: number }) => <div style={{ position: "absolute", left: p.x, top: p.y, width: p.w, height: p.h, backgroundColor: dim, display: "flex" }} />;
  const Center = (p: { y: number; h: number; children: ReactNode }) => <div style={{ position: "absolute", left: box.x, top: p.y, width: box.w, height: p.h, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textShadow: shadow }}>{p.children}</div>;
  const Pill = (p: { text: string; x: number; y: number }) => <div style={{ position: "absolute", left: p.x, top: p.y, display: "flex", backgroundColor: kit.colors.accent, color: "#121212", borderRadius: 40, padding: "10px 28px", fontFamily: family(disp), fontSize: 44 * scale }}>{applyCase(plain(p.text), "upper")}</div>;

  let inner: ReactNode;
  if (layout === "split" || layout === "started-going") {
    inner = (
      <>
        <Fill src={a} x={0} y={0} w={W} h={half} label="Top photo" />
        <Fill src={b} x={0} y={half} w={W} h={H - half} label="Bottom photo" />
        <Shade x={0} y={0} w={W} h={H} />
        <div style={{ position: "absolute", left: 0, top: half - 3, width: W, height: 6, backgroundColor: white, display: "flex" }} />
        {layout === "split" ? (
          <>
            <Center y={box.y} h={half - box.y - 40}>{words(slide.headline, 92, half - box.y - 40, "top text")}</Center>
            <Center y={half + 40} h={H - 180 - half - 40 - (slide.showHandle ? HANDLE_ROOM : 0)}>{words(slide.body, 92, H - 180 - half - 40 - HANDLE_ROOM, "bottom text")}</Center>
          </>
        ) : (
          <>
            <Pill text={slide.headline || "Started"} x={box.x} y={box.y} />
            <Pill text={slide.body || "Going"} x={box.x} y={half + 40} />
          </>
        )}
      </>
    );
  } else if (layout === "before-after") {
    const colW = Math.round(W / 2);
    inner = (
      <>
        <Fill src={a} x={0} y={0} w={colW} h={H} label="Before" />
        <Fill src={b} x={colW} y={0} w={W - colW} h={H} label="After" />
        <Shade x={0} y={0} w={W} h={H} />
        <div style={{ position: "absolute", left: colW - 3, top: 0, width: 6, height: H, backgroundColor: white, display: "flex" }} />
        <div style={{ position: "absolute", left: colW - 36, top: half - 36, width: 72, height: 72, borderRadius: 36, backgroundColor: white, display: "flex" }} />
        <div style={{ position: "absolute", left: box.x, top: box.y, width: colW - box.x - 30, display: "flex", justifyContent: "center", color: white, fontFamily: family(disp), fontSize: 64 * scale, textShadow: shadow }}>{applyCase(plain(slide.headline || "Before"), "upper")}</div>
        <div style={{ position: "absolute", left: colW + 30, top: box.y, width: W - 120 - colW - 30, display: "flex", justifyContent: "center", color: white, fontFamily: family(disp), fontSize: 64 * scale, textShadow: shadow }}>{applyCase(plain(slide.body || "After"), "upper")}</div>
      </>
    );
  } else {
    const isHook = layout === "hook";
    const textH = box.h - (slide.showHandle ? HANDLE_ROOM : 0);
    inner = (
      <>
        <Fill src={a} x={0} y={0} w={W} h={H} label="Background photo" />
        <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, display: "flex", ...(isHook ? { backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0) 30%, ${dim} 100%)` } : { backgroundColor: dim }) }} />
        <div style={{ position: "absolute", left: box.x, top: box.y, width: box.w, height: textH, display: "flex", flexDirection: "column", justifyContent: isHook ? "flex-end" : "center", alignItems: "center", textShadow: shadow }}>
          {words(slide.headline, isHook ? 150 : 110, textH * (slide.body ? 0.6 : 0.9), "headline")}
          {slide.body && <div style={{ display: "flex", marginTop: 28 }}><Body text={slide.body} px={fit(ctx, slide.body, "inter", false, { w: box.w, h: textH * 0.3 }, 44 * scale, MIN_BODY, 1.35, "body text")} font="inter" color={white} align="center" width={box.w} /></div>}
        </div>
      </>
    );
  }
  return (
    <div style={{ width: W, height: H, display: "flex", position: "relative", backgroundColor: "#111111", overflow: "hidden" }}>
      {inner}
      {slide.showHandle && <Handle kit={kit} color={white} H={H} />}
    </div>
  );
}

// ---------- Editorial ----------
function editorial(ctx: Ctx): ReactElement {
  const { car, kit, slide, W, H } = ctx;
  const box = safeBox(car.size);
  const main = dataUrl(slide.images[0]);
  const inset = dataUrl(slide.images[1]);
  const scale = slide.textScale || 1;
  const textC = car.useBrandColors ? kit.colors.text : "#FFFFFF";
  const bg = car.useBrandColors ? kit.colors.bg : "#1B1E22";
  const accent = kit.colors.accent;
  const disp = kit.fonts.display;
  const textH = box.h - (slide.showHandle ? HANDLE_ROOM : 0);
  const badge = applyCase(kit.handle.replace(/^@/, "").replace(/([a-z])with([a-z])/i, "$1.with.$2"), "upper");
  if (slide.layout === "story") {
    const imgH = Math.round(H * 0.5);
    const headPx = fit(ctx, slide.headline, disp, true, { w: box.w, h: (H - 180 - imgH - 40 - (slide.showHandle ? HANDLE_ROOM : 0)) * 0.4 }, 86 * scale, 44, 1.05, "headline");
    const bodyPx = slide.body ? fit(ctx, slide.body, "inter", false, { w: box.w, h: (H - 180 - imgH - 40 - (slide.showHandle ? HANDLE_ROOM : 0)) * 0.5 }, 40 * scale, MIN_BODY, 1.35, "body text") : 0;
    return (
      <div style={{ width: W, height: H, display: "flex", position: "relative", backgroundColor: bg }}>
        {main ? <Img src={main} x={0} y={0} w={W} h={imgH} /> : <Placeholder x={50} y={60} w={W - 100} h={imgH - 120} color={textC} preview={ctx.preview} label="Story photo" />}
        <div style={{ position: "absolute", left: 0, top: imgH - 200, width: W, height: 200, display: "flex", backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0) 0%, ${bg} 100%)` }} />
        <div style={{ position: "absolute", left: box.x, top: imgH + 30, width: box.w, display: "flex", flexDirection: "column" }}>
          <Words text={slide.headline} px={headPx} font={disp} color={textC} accent={accent} align="left" textCase="upper" width={box.w} />
          {slide.body && <div style={{ display: "flex", marginTop: 24 }}><Body text={slide.body} px={bodyPx} font="inter" color={textC} align="left" width={box.w} /></div>}
        </div>
        {slide.showHandle && <Handle kit={kit} color={textC} H={H} />}
      </div>
    );
  }
  const insetSize = 300;
  const headPx = fit(ctx, slide.headline, disp, true, { w: box.w, h: textH * 0.32 }, 110 * scale, 52, 1.05, "headline");
  return (
    <div style={{ width: W, height: H, display: "flex", position: "relative", backgroundColor: bg, overflow: "hidden" }}>
      {main ? <Img src={main} x={0} y={0} w={W} h={H} /> : <Placeholder x={80} y={420} w={W - 160} h={360} color={textC} preview={ctx.preview} label="Main photo" />}
      <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, display: "flex", backgroundImage: `linear-gradient(180deg, rgba(0,0,0,${(slide.dim / 400).toFixed(2)}) 0%, rgba(0,0,0,${(slide.dim / 100).toFixed(2)}) 75%)` }} />
      {(inset || ctx.preview) && (inset
        ? <img src={inset} width={insetSize} height={insetSize} style={{ position: "absolute", left: box.x + 20, top: box.y, width: insetSize, height: insetSize, borderRadius: insetSize / 2, objectFit: "cover", border: "8px solid #FFFFFF" }} />
        : <div style={{ position: "absolute", left: box.x + 20, top: box.y, width: insetSize, height: insetSize, borderRadius: insetSize / 2, border: "8px solid #FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", color: "#FFFFFF", fontFamily: "Inter", fontSize: 28, opacity: 0.6 }}>Inset photo</div>)}
      <div style={{ position: "absolute", left: box.x, top: box.y, width: box.w, height: textH, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center" }}>
        <div style={{ display: "flex", width: 360, height: 3, backgroundColor: textC, marginBottom: 14 }} />
        <div style={{ display: "flex", fontFamily: "Inter", fontWeight: 600, fontSize: 30, letterSpacing: 6, color: textC, marginBottom: 40 }}>{badge}</div>
        <Words text={slide.headline} px={headPx} font={disp} color={textC} accent={accent} align="center" textCase="upper" width={box.w} />
        {slide.body && <div style={{ display: "flex", marginTop: 24 }}><Body text={slide.body} px={fit(ctx, slide.body, "inter", false, { w: box.w, h: textH * 0.18 }, 36 * scale, MIN_BODY, 1.35, "body text")} font="inter" color={textC} align="center" width={box.w} /></div>}
      </div>
    </div>
  );
}

function cloneStyle(car: Carousel, kit: BrandKit): CreativeStyle {
  const s = car.clone.spec;
  if (!s) return { bg: kit.colors.bg, text: kit.colors.text, accent: kit.colors.accent, display: kit.fonts.display, body: kit.fonts.body, textCase: "upper", align: "left", headlineMax: 120, image: "none", deco: [] };
  return { bg: s.bg, text: s.text, accent: s.accent, display: s.displayFont, body: s.bodyFont, textCase: s.headlineCase, align: s.align, headlineMax: 120, image: s.imagePlacement === "full" ? "full" : s.imagePlacement === "none" ? "none" : "below", deco: [] };
}

function fontIdsFor(car: Carousel, kit: BrandKit): string[] {
  const t = templateById(car.template);
  if (car.mode === "creative" && t.style) return [t.style.display, t.style.body, ...(t.style.deco.includes("script-accent") ? ["great-vibes"] : []), ...(t.style.deco.includes("mono-footer") ? ["space-mono"] : [])];
  if (car.mode === "clone") { const s = cloneStyle(car, kit); return [s.display, s.body]; }
  return [kit.fonts.display, kit.fonts.body];
}

export async function renderSlide(car: Carousel, index: number, opts: { preview?: boolean } = {}): Promise<{ png: Buffer; flags: string[] }> {
  const slide = car.slides[index];
  if (!slide) throw new Error("That slide doesn't exist.");
  const kit = getBrandKit(car.brandId);
  const { w: W, h: H } = canvas(car.size);
  const ctx: Ctx = { car, kit, slide, index, total: car.slides.length, preview: !!opts.preview, flags: [], W, H };
  const tpl = templateById(car.template);
  const el = car.mode === "screenshot" ? screenshot(ctx)
    : car.mode === "photo" ? photo(ctx)
    : car.mode === "editorial" ? editorial(ctx)
    : car.mode === "clone" ? creative(ctx, cloneStyle(car, kit))
    : creative(ctx, tpl.style ?? templateById("moola").style!);
  const ids = fontIdsFor(car, kit).filter((id) => FONTS.some((f) => f.id === id));
  const res = new ImageResponse(el, { width: W, height: H, fonts: fontsFor(ids) });
  return { png: Buffer.from(await res.arrayBuffer()), flags: ctx.flags };
}

export async function renderAll(car: Carousel) {
  const out: { png: Buffer; flags: string[] }[] = [];
  for (let i = 0; i < car.slides.length; i++) out.push(await renderSlide(car, i));
  return out;
}
