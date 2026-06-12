/**
 * generate-readme-images.js
 *
 * Generates SVG images for README.md from the app's visual language.
 * Output: plans/images/readme/
 *
 * Usage: node scripts/generate-readme-images.js
 */

const fs   = require("fs");
const path = require("path");

const OUT_DIR = path.join(__dirname, "..", "images", "readme", "images");
fs.mkdirSync(OUT_DIR, { recursive: true });

// ─── Colour palette (matches app dark theme) ────────────────────────────────
const C = {
  bg:        "#0f0f1a",
  card:      "#1a1a2e",
  cardAlt:   "#16213e",
  border:    "#2d2d4a",
  purple:    "#7c3aed",
  purpleHi:  "#8b5cf6",
  purpleSoft:"#4c1d95",
  accent:    "#a78bfa",
  green:     "#10b981",
  greenBg:   "#064e3b",
  text:      "#e2e8f0",
  muted:     "#94a3b8",
  dimmed:    "#4a5568",
  white:     "#ffffff",
  badgeFree: "#065f46",
  badgePro:  "#4c1d95",
};

// ─── Helper: wrap in SVG root ────────────────────────────────────────────────
function svg(w, h, content, extraDefs = "") {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <style>text { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; }</style>
    ${extraDefs}
  </defs>
  ${content}
</svg>`;
}

// ─── Mini path icons (no emoji — reliable cross-platform SVG rendering) ───────
function iconClipboard(cx, cy, color) {
  return `<rect x="${cx-7}" y="${cy-9}" width="14" height="18" rx="2" fill="none" stroke="${color}" stroke-width="1.5"/>
  <rect x="${cx-4}" y="${cy-13}" width="8" height="6" rx="1" fill="${color}"/>
  <line x1="${cx-4}" y1="${cy-2}" x2="${cx+4}" y2="${cy-2}" stroke="${color}" stroke-width="1.2"/>
  <line x1="${cx-4}" y1="${cy+2}" x2="${cx+4}" y2="${cy+2}" stroke="${color}" stroke-width="1.2"/>
  <line x1="${cx-4}" y1="${cy+6}" x2="${cx+2}" y2="${cy+6}" stroke="${color}" stroke-width="1.2"/>`;
}
function iconKeyboard(cx, cy, color) {
  return `<rect x="${cx-11}" y="${cy-7}" width="22" height="14" rx="3" fill="none" stroke="${color}" stroke-width="1.5"/>
  <rect x="${cx-7}" y="${cy-4}" width="4" height="3" rx="1" fill="${color}"/>
  <rect x="${cx-1}" y="${cy-4}" width="4" height="3" rx="1" fill="${color}"/>
  <rect x="${cx+5}" y="${cy-4}" width="4" height="3" rx="1" fill="${color}"/>
  <rect x="${cx-4}" y="${cy+1}" width="10" height="3" rx="1" fill="${color}"/>`;
}
function iconDropdown(cx, cy, color) {
  return `<rect x="${cx-10}" y="${cy-8}" width="20" height="12" rx="3" fill="none" stroke="${color}" stroke-width="1.5"/>
  <path d="M${cx-4},${cy+7} L${cx},${cy+12} L${cx+4},${cy+7}" stroke="${color}" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
}
function iconCheckCircle(cx, cy, color) {
  return `<circle cx="${cx}" cy="${cy}" r="11" fill="none" stroke="${color}" stroke-width="1.5"/>
  <path d="M${cx-5},${cy} L${cx-1},${cy+4} L${cx+6},${cy-5}" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
}
function iconGear(cx, cy, color) {
  return `<circle cx="${cx}" cy="${cy}" r="4" fill="none" stroke="${color}" stroke-width="1.5"/>
  <circle cx="${cx}" cy="${cy}" r="8" fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="4 2.5"/>`;
}
function iconMenu(cx, cy, color) {
  return `<line x1="${cx-6}" y1="${cy-4}" x2="${cx+6}" y2="${cy-4}" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="${cx-6}" y1="${cy}" x2="${cx+6}" y2="${cy}" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="${cx-6}" y1="${cy+4}" x2="${cx+6}" y2="${cy+4}" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>`;
}

function rect(x, y, w, h, fill, opts = {}) {
  const r  = opts.r  ?? 8;
  const stroke = opts.stroke ? `stroke="${opts.stroke}" stroke-width="${opts.sw ?? 1}"` : "";
  const opacity = opts.opacity ? `opacity="${opts.opacity}"` : "";
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${stroke} ${opacity}/>`;
}

// Rectangle with only top corners rounded (for header bars inside cards)
function rectTop(x, y, w, h, fill, r = 10, opts = {}) {
  const stroke = opts.stroke ? `stroke="${opts.stroke}" stroke-width="${opts.sw ?? 1}"` : "";
  const d = `M${x+r},${y} H${x+w-r} A${r},${r} 0 0 1 ${x+w},${y+r} V${y+h} H${x} V${y+r} A${r},${r} 0 0 1 ${x+r},${y} Z`;
  return `<path d="${d}" fill="${fill}" ${stroke}/>`;
}

function text(x, y, content, fill, opts = {}) {
  const size   = opts.size   ?? 13;
  const weight = opts.weight ?? "normal";
  const anchor = opts.anchor ?? "start";
  const opacity = opts.opacity ? `opacity="${opts.opacity}"` : "";
  return `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" ${opacity}>${esc(content)}</text>`;
}

function esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function line(x1, y1, x2, y2, stroke, sw = 1, opts = {}) {
  const dash = opts.dash ? `stroke-dasharray="${opts.dash}"` : "";
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" ${dash}/>`;
}

function arrow(x1, y1, x2, y2, color) {
  const id = `arr_${x1}_${y1}`;
  return `
  <defs><marker id="${id}" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
    <path d="M0,0 L0,6 L8,3 z" fill="${color}"/>
  </marker></defs>
  <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1.5" marker-end="url(#${id})"/>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMAGE 1: how-it-works.svg  (900 × 160)
// ═══════════════════════════════════════════════════════════════════════════════
function makeHowItWorks() {
  const W = 900, H = 160;
  const steps = [
    { title: "Copy your text",     sub: "Ctrl+C",           num: "1", drawIcon: (cx,cy,c) => iconClipboard(cx,cy,c) },
    { title: "Open Thought Tidy",  sub: "Ctrl+Shift+Space", num: "2", drawIcon: (cx,cy,c) => iconKeyboard(cx,cy,c)  },
    { title: "Pick an action",     sub: "Brain Dump, Fix…", num: "3", drawIcon: (cx,cy,c) => iconDropdown(cx,cy,c)  },
    { title: "Copy the result",    sub: "Paste anywhere",   num: "4", drawIcon: (cx,cy,c) => iconCheckCircle(cx,cy,c) },
  ];

  const boxW   = 170;
  const boxH   = 100;
  const gapX   = 50;
  const startX = (W - (steps.length * boxW + (steps.length - 1) * gapX)) / 2;
  const boxY   = (H - boxH) / 2;

  // collect arrow marker defs first so we have one clean <defs> block
  const markerDefs = steps.slice(0, -1).map((_, i) => {
    const id = `arr${i}`;
    return `<marker id="${id}" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="${C.dimmed}"/></marker>`;
  }).join("\n    ");

  let els = [];
  els.push(rect(0, 0, W, H, C.bg, { r: 12 }));

  steps.forEach((s, i) => {
    const x = startX + i * (boxW + gapX);
    const isLast = i === steps.length - 1;
    const highlight = i === 2;

    const cardFill   = highlight ? C.purpleSoft : C.card;
    const cardStroke = highlight ? C.purple : C.border;
    const iconColor  = highlight ? C.accent : C.muted;

    els.push(rect(x, boxY, boxW, boxH, cardFill, { r: 10, stroke: cardStroke, sw: highlight ? 1.5 : 1 }));

    // step badge
    els.push(rect(x + 8, boxY + 8, 20, 20, highlight ? C.purple : C.dimmed, { r: 10 }));
    els.push(text(x + 18, boxY + 22, s.num, C.white, { size: 11, weight: "600", anchor: "middle" }));

    // path icon centred in card
    const icx = x + boxW / 2;
    const icy = boxY + 44;
    els.push(s.drawIcon(icx, icy, iconColor));

    // title + sub
    els.push(text(x + boxW / 2, boxY + 66, s.title, C.text, { size: 12, weight: "600", anchor: "middle" }));
    els.push(text(x + boxW / 2, boxY + 82, s.sub, highlight ? C.accent : C.muted, { size: 10, anchor: "middle" }));

    // arrow
    if (!isLast) {
      const ax1 = x + boxW + 6;
      const ax2 = x + boxW + gapX - 6;
      const ay  = boxY + boxH / 2;
      els.push(`<line x1="${ax1}" y1="${ay}" x2="${ax2}" y2="${ay}" stroke="${C.dimmed}" stroke-width="1.5" marker-end="url(#arr${i})"/>`);
    }
  });

  return svg(W, H, els.join("\n  "), markerDefs);
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMAGE 2: popup-demo.svg  (340 × 400)
// ═══════════════════════════════════════════════════════════════════════════════
function makePopupDemo() {
  const W = 340, H = 400;
  let els = [];

  // outer card / shadow
  els.push(rect(0, 0, W, H, "#08080f", { r: 14 }));
  els.push(rect(4, 4, W - 8, H - 8, C.bg, { r: 12 }));

  // ── header bar ──────────────────────────────────────────────────────────────
  els.push(rectTop(4, 4, W - 8, 46, C.card, 12));
  els.push(line(4, 50, W - 4, 50, C.border));
  // logo diamond (drawn as path, no emoji)
  els.push(`<path d="M20,19 L26,27 L20,35 L14,27 Z" fill="${C.purple}"/>`);
  // title
  els.push(text(36, 34, "Thought Tidy", C.text, { size: 14, weight: "600" }));
  // gear icon (path)
  els.push(iconGear(W - 46, 27, C.muted));
  // menu icon (path)
  els.push(iconMenu(W - 20, 27, C.muted));

  // ── process selected text button ────────────────────────────────────────────
  els.push(rect(14, 60, W - 28, 30, C.cardAlt, { r: 7, stroke: C.border, sw: 1 }));
  els.push(text(W / 2, 80, "▶  Process Selected Text", C.muted, { size: 11, anchor: "middle" }));

  // ── label ───────────────────────────────────────────────────────────────────
  els.push(text(14, 112, "PASTE OR TYPE TEXT", C.dimmed, { size: 9, weight: "600" }));

  // ── textarea ────────────────────────────────────────────────────────────────
  els.push(rect(14, 120, W - 28, 90, C.cardAlt, { r: 7, stroke: C.border, sw: 1 }));
  const inputLines = [
    "need to talk to client about the",
    "deadline moving it back 2 weeks",
    "cause the dev had a issue with the",
    "auth thing and scope changed…",
  ];
  inputLines.forEach((ln, i) => {
    els.push(text(22, 140 + i * 18, ln, C.muted, { size: 11 }));
  });

  // ── action row ──────────────────────────────────────────────────────────────
  els.push(text(14, 232, "ACTION", C.dimmed, { size: 9, weight: "600" }));
  els.push(rect(14, 240, W - 28, 32, C.cardAlt, { r: 7, stroke: C.border, sw: 1 }));
  els.push(text(24, 261, "Brain Dump → Clear Text", C.text, { size: 12 }));
  els.push(text(W - 24, 261, "▾", C.muted, { size: 12 }));

  // ── audience row ────────────────────────────────────────────────────────────
  els.push(text(14, 294, "AUDIENCE", C.dimmed, { size: 9, weight: "600" }));
  els.push(rect(14, 302, W - 28, 32, C.cardAlt, { r: 7, stroke: C.border, sw: 1 }));
  els.push(text(24, 323, "— their knowledge level —", C.dimmed, { size: 11 }));
  els.push(text(W - 24, 323, "▾", C.muted, { size: 12 }));

  // ── run button ──────────────────────────────────────────────────────────────
  els.push(rect(14, 348, W - 28, 38, C.purple, { r: 9 }));
  els.push(`<rect x="14" y="348" width="${W - 28}" height="38" rx="9" fill="url(#btnGrad)"/>`);
  // ▶ icon + "Run" text centered together (icon ends at W/2-12, text starts at W/2-4)
  els.push(`<path d="M${W/2 - 22},${373 - 7} L${W/2 - 22},${373 + 7} L${W/2 - 12},${373}" fill="${C.white}"/>`);
  els.push(text(W / 2 + 9, 376, "Run", C.white, { size: 14, weight: "600", anchor: "middle" }));

  const popupDefs = `<linearGradient id="btnGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#ffffff" stop-opacity="0.12"/>
    <stop offset="100%" stop-color="#000000" stop-opacity="0.08"/>
  </linearGradient>`;

  return svg(W, H, els.join("\n  "), popupDefs);
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMAGE 3: before-after.svg  (880 × 252)
// ═══════════════════════════════════════════════════════════════════════════════
function makeBeforeAfter() {
  const W = 880, H = 252;
  const panelW = 370;
  const leftX  = 20;
  const rightX = W - 20 - panelW;
  const panelH = 168;
  const panelY = 46;

  let els = [];
  els.push(rect(0, 0, W, H, C.bg, { r: 12 }));

  // ── labels ──────────────────────────────────────────────────────────────────
  els.push(text(leftX + panelW / 2, 28, "BEFORE  (your brain dump)", C.muted, { size: 11, weight: "600", anchor: "middle" }));
  els.push(text(rightX + panelW / 2, 28, "AFTER  (Brain Dump → Clear Text)", C.green, { size: 11, weight: "600", anchor: "middle" }));

  // ── left panel ──────────────────────────────────────────────────────────────
  els.push(rect(leftX, panelY, panelW, panelH, C.card, { r: 10, stroke: C.border, sw: 1 }));
  const beforeLines = [
    "need to talk to client about the deadline",
    "moving it back 2 weeks cause the dev had",
    "a issue with the auth thing and also the",
    "scope changed a bit and we want to make",
    "sure the testing is done properly before",
    "we push anything live",
  ];
  beforeLines.forEach((ln, i) => {
    els.push(text(leftX + 16, panelY + 26 + i * 22, ln, C.muted, { size: 12 }));
  });

  // ── arrow (drawn without marker so no inline defs needed) ───────────────────
  const midX  = (leftX + panelW + rightX) / 2;
  const midY  = H / 2;
  // arrow body
  els.push(`<line x1="${midX - 18}" y1="${midY}" x2="${midX + 10}" y2="${midY}" stroke="${C.purple}" stroke-width="2"/>`);
  // arrowhead as path
  els.push(`<path d="M${midX+8},${midY-6} L${midX+20},${midY} L${midX+8},${midY+6}" fill="${C.purple}"/>`);
  // label pill above arrow
  els.push(rect(midX - 22, midY - 28, 44, 17, C.purpleSoft, { r: 4 }));
  els.push(text(midX, midY - 17, "Brain Dump", C.accent, { size: 9, anchor: "middle" }));
  els.push(text(midX, midY - 4, "Run", C.accent, { size: 10, anchor: "middle" }));

  // ── right panel ─────────────────────────────────────────────────────────────
  els.push(rect(rightX, panelY, panelW, panelH, C.card, { r: 10, stroke: C.green, sw: 1.5 }));
  const afterLines = [
    "I wanted to flag a couple of updates",
    "on our timeline.",
    "",
    "Due to a technical issue with the auth",
    "component and scope adjustments, we'll",
    "need to move the deadline back 2 weeks.",
    "We want to ensure thorough testing is",
    "completed before anything goes live.",
  ];
  afterLines.forEach((ln, i) => {
    if (ln === "") return;
    els.push(text(rightX + 16, panelY + 26 + i * 19, ln, C.text, { size: 12 }));
  });

  // bottom caption
  els.push(text(W / 2, H - 10, "3 seconds · no ChatGPT tab · no copy-paste between windows", C.dimmed, { size: 10, anchor: "middle" }));

  return svg(W, H, els.join("\n  "), "");
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMAGE 4: features-grid.svg  (880 × 264)
// ═══════════════════════════════════════════════════════════════════════════════
function makeFeaturesGrid() {
  const W = 880, H = 264;
  let els = [];
  els.push(rect(0, 0, W, H, C.bg, { r: 12 }));

  const free = [
    ["✓", "Fix Spelling & Grammar"],
    ["✓", "Improve Writing"],
    ["✓", "Make Professional"],
    ["✓", "Brain Dump → Clear Text"],
    ["✓", "Idea → Prompt"],
    ["✓", "1 Custom Action"],
    ["✓", "Today's History"],
  ];

  const pro = [
    ["★", "Sound Like Me"],
    ["★", "Sound Human"],
    ["★", "Make Formal / Casual"],
    ["★", "Shorten / Expand"],
    ["★", "Unlimited Custom Actions"],
    ["★", "Multiple Suggestions (4×)"],
    ["★", "Full History + PIN Lock"],
    ["★", "Ollama (local AI, zero API cost)"],
  ];

  const colW  = 400;
  const leftX = 20;
  const rightX = W / 2 + 20;
  const rowH  = 24;
  const startY = 68;

  // ── FREE column ─────────────────────────────────────────────────────────────
  els.push(rect(leftX, 12, colW, H - 24, C.card, { r: 10, stroke: C.border, sw: 1 }));
  els.push(rectTop(leftX, 12, colW, 32, C.badgeFree, 10));
  els.push(text(leftX + colW / 2, 33, "FREE  —  always available", C.green, { size: 12, weight: "700", anchor: "middle" }));

  free.forEach(([icon, label], i) => {
    els.push(text(leftX + 18, startY + i * rowH, icon, C.green, { size: 13, weight: "700" }));
    els.push(text(leftX + 36, startY + i * rowH, label, C.text, { size: 12 }));
  });

  // ── PRO column ──────────────────────────────────────────────────────────────
  els.push(rect(rightX, 12, colW, H - 24, C.card, { r: 10, stroke: C.purple, sw: 1.5 }));
  els.push(rectTop(rightX, 12, colW, 32, C.badgePro, 10));
  els.push(text(rightX + colW / 2, 33, "PRO  —  $10 one time", C.accent, { size: 12, weight: "700", anchor: "middle" }));

  pro.forEach(([icon, label], i) => {
    els.push(text(rightX + 18, startY + i * rowH, icon, C.accent, { size: 13, weight: "700" }));
    els.push(text(rightX + 36, startY + i * rowH, label, C.text, { size: 12 }));
  });

  return svg(W, H, els.join("\n  "), "");
}

// ─── More path icons ─────────────────────────────────────────────────────────
function iconPerson(cx, cy, color) {
  return `<circle cx="${cx}" cy="${cy - 6}" r="5" fill="none" stroke="${color}" stroke-width="1.5"/>
  <path d="M${cx-9},${cy+12} C${cx-9},${cy+4} ${cx+9},${cy+4} ${cx+9},${cy+12}" fill="none" stroke="${color}" stroke-width="1.5"/>`;
}
function iconList(cx, cy, color) {
  return `<line x1="${cx-9}" y1="${cy-6}" x2="${cx+9}" y2="${cy-6}" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="${cx-9}" y1="${cy}" x2="${cx+9}" y2="${cy}" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="${cx-9}" y1="${cy+6}" x2="${cx+4}" y2="${cy+6}" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="${cx-13}" cy="${cy-6}" r="1.5" fill="${color}"/>
  <circle cx="${cx-13}" cy="${cy}" r="1.5" fill="${color}"/>
  <circle cx="${cx-13}" cy="${cy+6}" r="1.5" fill="${color}"/>`;
}
function iconClock(cx, cy, color) {
  return `<circle cx="${cx}" cy="${cy}" r="10" fill="none" stroke="${color}" stroke-width="1.5"/>
  <line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy-6}" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="${cx}" y1="${cy}" x2="${cx+5}" y2="${cy+3}" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>`;
}
function iconExport(cx, cy, color) {
  return `<rect x="${cx-9}" y="${cy-2}" width="18" height="12" rx="2" fill="none" stroke="${color}" stroke-width="1.5"/>
  <line x1="${cx}" y1="${cy-9}" x2="${cx}" y2="${cy-2}" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M${cx-4},${cy-8} L${cx},${cy-13} L${cx+4},${cy-8}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;
}
function iconImport(cx, cy, color) {
  return `<rect x="${cx-9}" y="${cy-2}" width="18" height="12" rx="2" fill="none" stroke="${color}" stroke-width="1.5"/>
  <line x1="${cx}" y1="${cy-10}" x2="${cx}" y2="${cy-2}" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M${cx-4},${cy-3} L${cx},${cy+2} L${cx+4},${cy-3}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;
}
function iconMoon(cx, cy, color) {
  return `<path d="M${cx},${cy-10} A10,10 0 1 0 ${cx+10},${cy} A7,7 0 1 1 ${cx},${cy-10} Z" fill="${color}"/>`;
}
function iconSync(cx, cy, color) {
  return `<path d="M${cx+8},${cy-4} A8,8 0 1 0 ${cx+8},${cy+4}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M${cx+5},${cy-8} L${cx+9},${cy-4} L${cx+13},${cy-7}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;
}
function iconKey(cx, cy, color) {
  return `<circle cx="${cx-3}" cy="${cy}" r="6" fill="none" stroke="${color}" stroke-width="1.5"/>
  <line x1="${cx+3}" y1="${cy}" x2="${cx+12}" y2="${cy}" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="${cx+9}" y1="${cy}" x2="${cx+9}" y2="${cy+4}" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="${cx+12}" y1="${cy}" x2="${cx+12}" y2="${cy+4}" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>`;
}
function iconChip(cx, cy, color) {
  return `<rect x="${cx-8}" y="${cy-8}" width="16" height="16" rx="3" fill="none" stroke="${color}" stroke-width="1.5"/>
  <rect x="${cx-4}" y="${cy-4}" width="8" height="8" rx="1" fill="${color}" opacity="0.6"/>
  <line x1="${cx-8}" y1="${cy-4}" x2="${cx-12}" y2="${cy-4}" stroke="${color}" stroke-width="1.2"/>
  <line x1="${cx-8}" y1="${cy+4}" x2="${cx-12}" y2="${cy+4}" stroke="${color}" stroke-width="1.2"/>
  <line x1="${cx+8}" y1="${cy-4}" x2="${cx+12}" y2="${cy-4}" stroke="${color}" stroke-width="1.2"/>
  <line x1="${cx+8}" y1="${cy+4}" x2="${cx+12}" y2="${cy+4}" stroke="${color}" stroke-width="1.2"/>`;
}

// Inline horizontal arrow without marker dep
function inlineArrow(x1, y, x2, color, sw = 2) {
  const hw = 7, hh = 5;
  return `<line x1="${x1}" y1="${y}" x2="${x2 - hw + 1}" y2="${y}" stroke="${color}" stroke-width="${sw}"/>
  <path d="M${x2 - hw},${y - hh} L${x2},${y} L${x2 - hw},${y + hh}" fill="${color}"/>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMAGE 5: setup-add-provider.svg  (880 × 330)
// ═══════════════════════════════════════════════════════════════════════════════
function makeSetupAddProvider() {
  const W = 880, H = 330;
  let els = [];
  els.push(rect(0, 0, W, H, C.bg, { r: 12 }));

  // ── Title bar ────────────────────────────────────────────────────────────────
  els.push(text(W / 2, 26, "First-time setup — add a provider in 60 seconds", C.muted, { size: 12, anchor: "middle" }));

  const panelY = 38, panelH = 280;
  const leftX = 20, rightX = 460, panelW = 400;

  // ── LEFT: Provider picker ────────────────────────────────────────────────────
  els.push(rect(leftX, panelY, panelW, panelH, C.card, { r: 10, stroke: C.border }));
  els.push(rectTop(leftX, panelY, panelW, 32, C.cardAlt, 10));
  els.push(text(leftX + 14, panelY + 21, "Step 1", C.muted, { size: 10, weight: "700" }));
  els.push(text(leftX + 54, panelY + 21, "Choose your provider", C.text, { size: 12, weight: "600" }));

  // Step badge
  els.push(rect(leftX + 14, panelY + 8, 32, 16, C.purple, { r: 8 }));
  els.push(text(leftX + 30, panelY + 20, "1", C.white, { size: 10, weight: "700", anchor: "middle" }));

  const providers = [
    { name: "Gemini", sub: "Google · Free quota available", selected: true,  color: C.green  },
    { name: "ChatGPT", sub: "OpenAI · GPT-4o and more",    selected: false, color: C.muted  },
    { name: "Claude",  sub: "Anthropic · Strong writing",   selected: false, color: C.muted  },
  ];

  providers.forEach((p, i) => {
    const py = panelY + 50 + i * 64;
    const bStroke = p.selected ? p.color : C.border;
    const bFill   = p.selected ? C.greenBg : C.cardAlt;
    els.push(rect(leftX + 14, py, panelW - 28, 52, bFill, { r: 8, stroke: bStroke, sw: p.selected ? 1.5 : 1 }));
    els.push(text(leftX + 30, py + 22, p.name, p.selected ? C.text : C.muted, { size: 13, weight: "600" }));
    els.push(text(leftX + 30, py + 38, p.sub, C.dimmed, { size: 10 }));
    if (p.selected) {
      // checkmark circle
      els.push(`<circle cx="${leftX + panelW - 30}" cy="${py + 26}" r="10" fill="${C.green}" opacity="0.2"/>`);
      els.push(`<path d="M${leftX+panelW-36},${py+26} L${leftX+panelW-30},${py+32} L${leftX+panelW-22},${py+20}" stroke="${C.green}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);
    }
  });

  // ── RIGHT: Key entry ─────────────────────────────────────────────────────────
  els.push(rect(rightX, panelY, panelW, panelH, C.card, { r: 10, stroke: C.border }));
  els.push(rectTop(rightX, panelY, panelW, 32, C.cardAlt, 10));
  els.push(rect(rightX + 14, panelY + 8, 32, 16, C.purple, { r: 8 }));
  els.push(text(rightX + 30, panelY + 20, "2", C.white, { size: 10, weight: "700", anchor: "middle" }));
  els.push(text(rightX + 54, panelY + 21, "Enter your API key", C.text, { size: 12, weight: "600" }));

  const ry = panelY + 44;

  // Provider badge
  els.push(rect(rightX + 14, ry, 68, 20, C.greenBg, { r: 10 }));
  els.push(text(rightX + 48, ry + 14, "Gemini", C.green, { size: 10, weight: "700", anchor: "middle" }));

  // API key label + field
  els.push(text(rightX + 14, ry + 38, "API Key", C.muted, { size: 10, weight: "600" }));
  els.push(rect(rightX + 14, ry + 44, panelW - 28, 32, C.cardAlt, { r: 7, stroke: C.border }));
  els.push(text(rightX + 26, ry + 65, "AIzaSy", C.muted, { size: 11 }));
  els.push(text(rightX + 72, ry + 65, "●●●●●●●●●●●●●●●●●●●", C.dimmed, { size: 11 }));

  // Test button
  els.push(rect(rightX + 14, ry + 86, panelW - 28, 30, C.purpleSoft, { r: 7, stroke: C.purple }));
  els.push(text(rightX + panelW / 2, ry + 106, "Test & Load Models", C.accent, { size: 11, weight: "600", anchor: "middle" }));

  // Success row
  els.push(`<circle cx="${rightX + 26}" cy="${ry + 132}" r="8" fill="${C.greenBg}" stroke="${C.green}" stroke-width="1.2"/>`);
  els.push(`<path d="M${rightX+22},${ry+132} L${rightX+26},${ry+136} L${rightX+32},${ry+128}" stroke="${C.green}" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);
  els.push(text(rightX + 40, ry + 137, "4 models loaded", C.green, { size: 11 }));

  // Model dropdown
  els.push(text(rightX + 14, ry + 158, "Default model", C.muted, { size: 10, weight: "600" }));
  els.push(rect(rightX + 14, ry + 164, panelW - 28, 30, C.cardAlt, { r: 7, stroke: C.border }));
  els.push(text(rightX + 26, ry + 184, "gemini-2.0-flash", C.text, { size: 11 }));
  els.push(text(rightX + panelW - 28, ry + 184, "▾", C.muted, { size: 11 }));

  // Save button
  els.push(rect(rightX + 14, ry + 204, panelW - 28, 32, C.purple, { r: 8 }));
  els.push(text(rightX + panelW / 2, ry + 225, "Save Provider", C.white, { size: 12, weight: "600", anchor: "middle" }));

  // Middle arrow
  const midArrowX = (leftX + panelW + rightX) / 2;
  els.push(inlineArrow(midArrowX - 14, H / 2, midArrowX + 14, C.dimmed, 1.5));

  return svg(W, H, els.join("\n  "), "");
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMAGE 6: settings-overview.svg  (880 × 290)
// ═══════════════════════════════════════════════════════════════════════════════
function makeSettingsOverview() {
  const W = 880, H = 290;
  let els = [];
  els.push(rect(0, 0, W, H, C.bg, { r: 12 }));
  els.push(text(W / 2, 26, "Settings — everything in one place", C.muted, { size: 12, anchor: "middle" }));

  const sections = [
    { icon: (x,y) => iconChip(x,y,C.accent),    title: "AI Providers",   sub: "Add OpenAI, Gemini, Claude or Ollama" },
    { icon: (x,y) => iconPerson(x,y,C.accent),  title: "Your Profile",   sub: "Sound Like Me — your name, role, style" },
    { icon: (x,y) => iconList(x,y,C.accent),    title: "My Actions",     sub: "Reorder, rename, add custom prompts" },
    { icon: (x,y) => iconClock(x,y,C.accent),   title: "History",        sub: "Full log — search, filter, PIN lock" },
    { icon: (x,y) => iconExport(x,y,C.accent),  title: "Export / Import",sub: "Back up or restore as .ttbackup file" },
    { icon: (x,y) => iconMoon(x,y,C.accent),    title: "Appearance",     sub: "Dark / light / follow system theme" },
    { icon: (x,y) => iconSync(x,y,C.accent),    title: "Desktop Sync",   sub: "Sync settings with browser extension" },
    { icon: (x,y) => iconKey(x,y,C.accent),     title: "Pro License",    sub: "Activate with email + license key" },
  ];

  const cols = 4, cardW = 196, cardH = 90, gapX = 16, gapY = 14;
  const startX = (W - (cols * cardW + (cols - 1) * gapX)) / 2;
  const startY = 38;

  sections.forEach((s, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = startX + col * (cardW + gapX);
    const y = startY + row * (cardH + gapY);

    els.push(rect(x, y, cardW, cardH, C.card, { r: 9, stroke: C.border }));
    // icon background circle
    els.push(`<circle cx="${x + 22}" cy="${y + 28}" r="14" fill="${C.purpleSoft}" opacity="0.5"/>`);
    els.push(s.icon(x + 22, y + 28));
    // title
    els.push(text(x + 44, y + 24, s.title, C.text, { size: 12, weight: "600" }));
    // sub (wrap at ~22 chars)
    const words = s.sub.split(" ");
    let line1 = "", line2 = "";
    for (const w of words) {
      if ((line1 + " " + w).trim().length <= 24) line1 = (line1 + " " + w).trim();
      else line2 = (line2 + " " + w).trim();
    }
    els.push(text(x + 44, y + 40, line1, C.muted, { size: 10 }));
    if (line2) els.push(text(x + 44, y + 53, line2, C.muted, { size: 10 }));
  });

  return svg(W, H, els.join("\n  "), "");
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMAGE 7: using-the-app.svg  (880 × 210)
// ═══════════════════════════════════════════════════════════════════════════════
function makeUsingTheApp() {
  const W = 880, H = 210;
  let els = [];
  els.push(rect(0, 0, W, H, C.bg, { r: 12 }));

  const panelW = 240, panelH = 162, panelY = 24;
  const gap = 40;
  const totalW = 3 * panelW + 2 * gap;
  const startX = (W - totalW) / 2;

  const panels = [
    {
      title: "Open from anywhere",
      draw(x) {
        // tray bar
        els.push(rect(x + 12, panelY + 44, panelW - 24, 36, C.cardAlt, { r: 6, stroke: C.border }));
        els.push(text(x + 24, panelY + 56, "Windows tray  /  Mac menu bar", C.dimmed, { size: 9 }));
        // diamond icon highlighted
        els.push(`<path d="M${x+panelW-40},${panelY+53} L${x+panelW-33},${panelY+62} L${x+panelW-40},${panelY+71} L${x+panelW-47},${panelY+62} Z" fill="${C.purple}"/>`);
        // keyboard shortcut pill
        els.push(rect(x + 12, panelY + 92, panelW - 24, 26, C.purpleSoft, { r: 6 }));
        els.push(text(x + panelW / 2, panelY + 110, "Ctrl+Shift+Space  from any app", C.accent, { size: 10, anchor: "middle" }));
        // sub caption
        els.push(text(x + panelW / 2, panelY + 138, "No need to switch windows", C.dimmed, { size: 10, anchor: "middle" }));
      }
    },
    {
      title: "Paste, pick, run",
      draw(x) {
        // mini popup mockup
        els.push(rect(x + 12, panelY + 40, panelW - 24, 26, C.cardAlt, { r: 5, stroke: C.border }));
        els.push(text(x + 24, panelY + 57, "Your text goes here...", C.dimmed, { size: 10 }));

        els.push(rect(x + 12, panelY + 74, panelW - 24, 24, C.cardAlt, { r: 5, stroke: C.border }));
        els.push(text(x + 24, panelY + 90, "Brain Dump → Clear Text  ▾", C.text, { size: 10 }));

        els.push(rect(x + 12, panelY + 106, panelW - 24, 28, C.purple, { r: 7 }));
        els.push(text(x + panelW / 2, panelY + 125, "Run", C.white, { size: 12, weight: "600", anchor: "middle" }));
      }
    },
    {
      title: "Get the result",
      draw(x) {
        // result card
        els.push(rect(x + 12, panelY + 40, panelW - 24, 76, C.cardAlt, { r: 7, stroke: C.green, sw: 1.5 }));
        const rlines = ["I wanted to flag a couple", "of updates on our timeline.", "", "Due to a technical issue..."];
        rlines.forEach((l, i) => {
          if (l) els.push(text(x + 22, panelY + 58 + i * 16, l, C.text, { size: 10 }));
        });
        // Replace / Copy buttons
        els.push(rect(x + 12, panelY + 124, (panelW - 36) / 2, 26, C.purple, { r: 6 }));
        els.push(text(x + 12 + (panelW - 36) / 4, panelY + 141, "Replace", C.white, { size: 10, weight: "600", anchor: "middle" }));
        els.push(rect(x + 18 + (panelW - 36) / 2, panelY + 124, (panelW - 36) / 2, 26, C.cardAlt, { r: 6, stroke: C.border }));
        els.push(text(x + 18 + (3 * (panelW - 36)) / 4, panelY + 141, "Copy", C.muted, { size: 10, anchor: "middle" }));
      }
    },
  ];

  panels.forEach((p, i) => {
    const x = startX + i * (panelW + gap);
    els.push(rect(x, panelY, panelW, panelH, C.card, { r: 10, stroke: i === 1 ? C.purple : C.border, sw: i === 1 ? 1.5 : 1 }));
    els.push(text(x + panelW / 2, panelY + 18, p.title, i === 1 ? C.accent : C.text, { size: 12, weight: "600", anchor: "middle" }));
    p.draw(x);
    // arrow to next panel
    if (i < panels.length - 1) {
      const ax = x + panelW + 4;
      const ay = panelY + panelH / 2;
      els.push(inlineArrow(ax, ay, ax + gap - 8, C.dimmed, 1.5));
    }
  });

  return svg(W, H, els.join("\n  "), "");
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMAGE 8: export-import.svg  (880 × 230)
// ═══════════════════════════════════════════════════════════════════════════════
function makeExportImport() {
  const W = 880, H = 230;
  let els = [];
  els.push(rect(0, 0, W, H, C.bg, { r: 12 }));
  els.push(text(W / 2, 24, "Export / Import — back up and restore your entire setup", C.muted, { size: 12, anchor: "middle" }));

  const panelW = 360, panelH = 180, panelY = 36;
  const leftX  = 30, rightX = W - 30 - panelW;

  // ── LEFT: Export ─────────────────────────────────────────────────────────────
  els.push(rect(leftX, panelY, panelW, panelH, C.card, { r: 10, stroke: C.border }));
  els.push(rectTop(leftX, panelY, panelW, 30, C.cardAlt, 10));
  els.push(text(leftX + panelW / 2, panelY + 20, "Export Settings", C.text, { size: 12, weight: "600", anchor: "middle" }));

  const exportItems = ["AI providers + API keys (encrypted)", "Your profile & writing style", "Custom prompts & actions", "Full history (Pro)"];
  exportItems.forEach((it, i) => {
    els.push(`<circle cx="${leftX + 22}" cy="${panelY + 48 + i * 24}" r="3" fill="${C.green}"/>`);
    els.push(text(leftX + 34, panelY + 53 + i * 24, it, C.muted, { size: 11 }));
  });

  els.push(rect(leftX + 14, panelY + 148, panelW - 28, 26, C.purpleSoft, { r: 6, stroke: C.purple }));
  els.push(text(leftX + panelW / 2, panelY + 166, "Export  .ttbackup", C.accent, { size: 11, weight: "600", anchor: "middle" }));

  // ── MIDDLE: file + arrow ─────────────────────────────────────────────────────
  const midX = (leftX + panelW + rightX) / 2;
  const midY = panelY + panelH / 2;

  // file icon
  els.push(rect(midX - 16, midY - 26, 32, 38, C.cardAlt, { r: 4, stroke: C.border }));
  els.push(`<path d="M${midX+2},${midY-26} L${midX+16},${midY-12}" stroke="${C.border}" stroke-width="1"/>`);
  els.push(`<path d="M${midX+2},${midY-26} V${midY-12} H${midX+16}" fill="${C.card}" stroke="${C.border}" stroke-width="1"/>`);
  els.push(text(midX, midY - 4, ".ttbackup", C.dimmed, { size: 8, anchor: "middle" }));
  els.push(text(midX, midY + 10, "encrypted", C.dimmed, { size: 8, anchor: "middle" }));

  // ── RIGHT: Import ─────────────────────────────────────────────────────────────
  els.push(rect(rightX, panelY, panelW, panelH, C.card, { r: 10, stroke: C.border }));
  els.push(rectTop(rightX, panelY, panelW, 30, C.cardAlt, 10));
  els.push(text(rightX + panelW / 2, panelY + 20, "Import & Restore", C.text, { size: 12, weight: "600", anchor: "middle" }));

  // drag/drop zone
  els.push(rect(rightX + 14, panelY + 38, panelW - 28, 68, C.cardAlt, { r: 8, stroke: C.border }));
  els.push(text(rightX + panelW / 2, panelY + 64, "Select .ttbackup file", C.muted, { size: 11, anchor: "middle" }));
  els.push(text(rightX + panelW / 2, panelY + 82, "Works on any computer with the same Pro key", C.dimmed, { size: 9, anchor: "middle" }));
  els.push(iconImport(rightX + panelW / 2 - 50, panelY + 70, C.dimmed));

  // Import button
  els.push(rect(rightX + 14, panelY + 114, panelW - 28, 22, C.purpleSoft, { r: 6, stroke: C.purple }));
  els.push(text(rightX + panelW / 2, panelY + 129, "Import .ttbackup", C.accent, { size: 11, weight: "600", anchor: "middle" }));

  // Success state
  els.push(`<circle cx="${rightX + 22}" cy="${panelY + 156}" r="8" fill="${C.greenBg}" stroke="${C.green}" stroke-width="1.2"/>`);
  els.push(`<path d="M${rightX+18},${panelY+156} L${rightX+22},${panelY+160} L${rightX+28},${panelY+152}" stroke="${C.green}" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);
  els.push(text(rightX + 36, panelY + 161, "All settings restored — ready to use", C.green, { size: 11 }));

  return svg(W, H, els.join("\n  "), "");
}

// ═══════════════════════════════════════════════════════════════════════════════
// Write all images
// ═══════════════════════════════════════════════════════════════════════════════
const images = {
  "how-it-works.svg":         makeHowItWorks(),
  "popup-demo.svg":           makePopupDemo(),
  "before-after.svg":         makeBeforeAfter(),
  "features-grid.svg":        makeFeaturesGrid(),
  "setup-add-provider.svg":   makeSetupAddProvider(),
  "settings-overview.svg":    makeSettingsOverview(),
  "using-the-app.svg":        makeUsingTheApp(),
  "export-import.svg":        makeExportImport(),
};

for (const [name, content] of Object.entries(images)) {
  const outPath = path.join(OUT_DIR, name);
  fs.writeFileSync(outPath, content, "utf8");
  console.log(`✓  ${outPath}`);
}

console.log(`\nDone — ${Object.keys(images).length} images written to images/readme/images/`);
