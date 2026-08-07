/* ชั้นหนังสือ 3D บนหน้าแรกของ EbookMe
   หน้าตาและโครงฉาก fork มาจาก "The Complete Shelf" ของ MengTo
   https://github.com/MengTo/complete-shelf (repo เปิดให้ remix ผ่าน PROMPT.md ของเขา)
   ดัดแปลงให้ขับด้วย catalog จริง วาดปกสด และรองรับภาษาไทย — ดูรายละเอียดใน README */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";

/* หนังสือบนชั้นสร้างจาก catalog จริง ไม่ใช่รายการตายตัวเหมือนต้นฉบับ
   ปกทุกใบจึงต้องวาดสดด้วย canvas — ต้นฉบับฝังภาพปกมาเป็น atlas ซึ่งใช้กับ
   หนังสือที่เพิ่ม/ลบได้ตลอดเวลาไม่ได้ */

/* กระดาษกับหมึกต้องมาจากธีมที่ผู้ใช้เลือก ไม่ใช่จากสีปกหนังสือ
   เดิมหมึกคำนวณจากสีผ้าปก เล่มปกส้มเลยได้ตัวหนังสือสีส้มบนกระดาษครีม — อ่านแทบไม่ออก */
/* มือถือมี GPU กับหน่วยความจำจำกัด และโดนหรี่ความเร็วเมื่อร้อน
   เท็กซ์เจอร์ปกความละเอียดเต็มเล่มละ ~25MB คูณจำนวนหนังสือแล้วเกินที่เครื่องรับไหว
   จึงลดขนาดลงครึ่งหนึ่งบนจอสัมผัส/จอแคบ ตาเปล่าแทบไม่เห็นต่างเพราะปกอยู่ไกล */
const LOW_POWER = (() => {
  try {
    if (matchMedia("(pointer: coarse)").matches) return true;
    return Math.min(screen.width, screen.height) < 820;
  } catch {
    return false;
  }
})();

const TEX = {
  cover: LOW_POWER ? { w: 448, h: 672 } : { w: 768, h: 1152 },
  spine: LOW_POWER ? { w: 224, h: 896 } : { w: 384, h: 1536 },
  /* หน้ากระดาษต้องคมกว่านี้ — ของเดิมวาดที่ 0.56–0.75 เท่าของขนาดออกแบบแล้วยืดเต็มจอ
     ตัวหนังสือจึงเบลอ ตอนนี้มีแค่เล่มที่เปิดอยู่ที่ถือเท็กซ์เจอร์หน้าใน จึงจ่ายไหว */
  page: LOW_POWER ? { w: 640, h: 960 } : { w: 1024, h: 1536 },
  anisotropy: LOW_POWER ? 4 : 16
};

const READING_THEMES = {
  light: { paper: "#f7f2e8", wash: "255,255,255", grain: "92,76,55", ink: "#181513", exposure: 1.06, sheet: 0xffffff, room: 1.3 },
  sepia: { paper: "#f0e2c6", wash: "255,248,228", grain: "120,96,58", ink: "#2b2114", exposure: 0.92, sheet: 0xfffdf8, room: 1.0 },
  dark:  { paper: "#2b2823", wash: "180,172,158", grain: "12,10,8",  ink: "#f6f1e7", exposure: 0.58, sheet: 0xffffff, room: 0.16 }
};

function readingTheme() {
  return READING_THEMES[document.documentElement.dataset.theme] || READING_THEMES.sepia;
}

const SERIF = '"Noto Serif Thai", "Iowan Old Style", Baskerville, Georgia, serif';
const SANS = '"Noto Sans Thai", Inter, "Helvetica Neue", Arial, sans-serif';

/* ผ้าหุ้มปก 9 แบบ เลือกด้วย hash ของ book.id — เล่มเดิมได้สีเดิมทุกครั้งที่เปิด
   paper/ink คือสีฉากหลังกับสีตัวอักษรของ UI ตอนเล่มนั้นถูกเลือก จับคู่ให้อ่านออกเสมอ */
const BINDINGS = [
  {
    label: "เนวี · ทองแดง",
    color: "#1c3050", foil: "#d08a54",
    palette: {
      paper: "#141821", paperDeep: "#0d1017", paperPale: "#f1eadf",
      ink: "#f4eee6", inkSoft: "#b3aea7",
      wall: "#141821", shelf: "#3a2118", shelfDark: "#1c0e0a",
      light: "#f4d7b9", fill: "#9fb3c9"
    }
  },
  {
    label: "อิฐเผา · ทองเก่า",
    color: "#b8482a", foil: "#f0c473",
    palette: {
      paper: "#6d2d1a", paperDeep: "#4f2012", paperPale: "#ffe4c5",
      ink: "#fff0df", inkSoft: "#e0bda6",
      wall: "#6d2d1a", shelf: "#402015", shelfDark: "#1d0d08",
      light: "#ffd19a", fill: "#dc8c6b"
    }
  },
  {
    label: "เขียวมอส · ทองเหลือง",
    color: "#2f4b39", foil: "#d9bf7f",
    palette: {
      paper: "#16211a", paperDeep: "#0e1512", paperPale: "#e9f0e6",
      ink: "#eef3ea", inkSoft: "#adb8a8",
      wall: "#16211a", shelf: "#33251a", shelfDark: "#18100b",
      light: "#f0e6c4", fill: "#a6c0a4"
    }
  },
  {
    label: "เบอร์กันดี · ชมพูหม่น",
    color: "#6f1f2e", foil: "#e8a9ac",
    palette: {
      paper: "#2a1017", paperDeep: "#1a090e", paperPale: "#fbe9ea",
      ink: "#f8e9ea", inkSoft: "#c6a5a9",
      wall: "#2a1017", shelf: "#3b211a", shelfDark: "#1b0d09",
      light: "#f8cfc0", fill: "#c78e94"
    }
  },
  {
    label: "มัสตาร์ด · หมึกดำ",
    color: "#d0a12a", foil: "#241f16",
    palette: {
      paper: "#e8d7a8", paperDeep: "#cdb787", paperPale: "#fdf6e4",
      ink: "#241f16", inkSoft: "#61553c",
      wall: "#e8d7a8", shelf: "#4a3220", shelfDark: "#241709",
      light: "#fff4d2", fill: "#c9b98c"
    }
  },
  {
    label: "ฟ้าหม่น · หมึกน้ำเงิน",
    // ปกสีอ่อน ฟอยล์ต้องเข้มถึงจะอ่านชื่อออก แต่ปุ่มบน UI อยู่บนพื้นเข้ม จึงแยกสีกัน
    color: "#4c7c9b", foil: "#16323f", accent: "#a9d5ea",
    palette: {
      paper: "#223038", paperDeep: "#141d23", paperPale: "#eef3f5",
      ink: "#eef3f5", inkSoft: "#a9b8c0",
      wall: "#223038", shelf: "#37241a", shelfDark: "#1a100b",
      light: "#e6f0f5", fill: "#9fbccc"
    }
  },
  {
    label: "เทาหิน · เงิน",
    color: "#4a5058", foil: "#d5dade",
    palette: {
      paper: "#191c20", paperDeep: "#101214", paperPale: "#eef0f2",
      ink: "#eef0f2", inkSoft: "#a8adb3",
      wall: "#191c20", shelf: "#332a22", shelfDark: "#171310",
      light: "#e8ecef", fill: "#a3adb6"
    }
  },
  {
    label: "ม่วงพลัม · แชมเปญ",
    color: "#4a2c55", foil: "#e3cba0",
    palette: {
      paper: "#1e1425", paperDeep: "#130c18", paperPale: "#f4ecf5",
      ink: "#f2eaf3", inkSoft: "#b6a7bb",
      wall: "#1e1425", shelf: "#382318", shelfDark: "#1a100a",
      light: "#f0dcc0", fill: "#b49cc0"
    }
  },
  {
    label: "ส้มอิฐอ่อน · น้ำตาลเข้ม",
    color: "#d97a4e", foil: "#3a2318",
    palette: {
      paper: "#f0dccb", paperDeep: "#d5bda8", paperPale: "#fff7ee",
      ink: "#2a1c14", inkSoft: "#6c5646",
      wall: "#f0dccb", shelf: "#4d3021", shelfDark: "#251409",
      light: "#fff0dd", fill: "#d4b79c"
    }
  }
];

const MOTIF_KEYS = ["brackets", "paths", "caret", "orbits", "modules", "frames", "compass"];
const MOTIF_LABELS = {
  brackets: "วงเล็บซ้อนชั้น",
  paths: "เส้นทางสอดประสาน",
  caret: "หัวลูกศรพุ่ง",
  orbits: "วงโคจรลอยตัว",
  modules: "โมดูลเรียงตาราง",
  frames: "กรอบซ้อนลึก",
  compass: "วงเวียนกับหมุด"
};

const ROMAN_PAIRS = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
  [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]
];

function toRoman(value) {
  let rest = value;
  let out = "";
  ROMAN_PAIRS.forEach(([amount, numeral]) => {
    while (rest >= amount) {
      out += numeral;
      rest -= amount;
    }
  });
  return out || "I";
}

/* ---------- ความคืบหน้าการอ่าน (แหล่งเดียวกับ index/reader) ---------- */

function readDoneCount(bookId, total) {
  try {
    const list = JSON.parse(localStorage.getItem(`ebook:done:${bookId}`) || "[]");
    return list.filter((n) => n >= 1 && n <= total).length;
  } catch {
    return 0;
  }
}

function readLastChapter(bookId, total) {
  const last = parseInt(localStorage.getItem(`ebook:last:${bookId}`), 10);
  return last >= 1 && last <= total ? last : 0;
}

function readerUrl(book) {
  const start = book.lastChapter || 1;
  return `reader.html?book=${encodeURIComponent(book.id)}&ch=${start}`;
}

/* ---------- แปลง catalog ของ EbookMe เป็นเล่มบนชั้น ---------- */

let BOOKS = [];

function buildBooks(catalog) {
  return catalog.map((entry, index) => {
    const chapters = entry.chapters || [];
    const total = chapters.length;
    const seed = hashSeed(entry.id || `book-${index}`);
    const random = seededRandom(seed);
    const binding = BINDINGS[seed % BINDINGS.length];
    const motifKey = MOTIF_KEYS[(seed >>> 7) % MOTIF_KEYS.length];
    const markdown = chapters.some((c) => /\.md([?#].*)?$/i.test(c.path || ""));
    const format = markdown ? "Markdown" : "HTML";
    const done = readDoneCount(entry.id, total);
    const percent = total ? Math.round((done / total) * 100) : 0;
    const last = readLastChapter(entry.id, total);
    const description = (entry.description || "").trim();

    return {
      id: entry.id,
      index,
      title: entry.title || "ไม่มีชื่อเรื่อง",
      cover: entry.cover || "📘",
      cloud: !!entry.cloud,
      roman: toRoman(index + 1),
      // บรรทัดตัวพิมพ์เล็กบนปกและบนหัวแผงรายละเอียด
      discipline: `${format} · ${total} บท`,
      note: description || `${total} บท พร้อมอ่าน`,
      deck: description || "ยังไม่ได้ใส่คำโปรย เปิดอ่านได้เลย",
      binding: binding.label,
      format: total ? `อ่านแล้ว ${done}/${total} บท (${percent}%)` : "ยังไม่มีบท",
      theme: last ? `ค้างไว้ที่บทที่ ${last}` : "ยังไม่เคยเปิดอ่าน",
      motif: MOTIF_LABELS[motifKey],
      motifKey,
      paletteLabel: binding.label,
      color: binding.color,
      foil: binding.foil,
      accent: binding.accent || binding.foil,
      palette: binding.palette,
      // เล่มหนาตามจำนวนบท ชั้นหนังสือจึงดูเป็นของจริงแทนที่จะเท่ากันหมด
      width: 0.94 + random() * 0.16,
      height: 1.42 + random() * 0.22,
      depth: Math.min(0.36, 0.17 + total * 0.007 + random() * 0.03),
      chapterTitles: chapters.map((c, i) => c.title || `บทที่ ${i + 1}`),
      chapterPaths: chapters.map((c) => c.path),
      chapterCount: total,
      done,
      percent,
      lastChapter: last,
      seed: seed % 9973
    };
  });
}

const experience = document.querySelector("#experience");
const canvas = document.querySelector("#scene");
const loading = document.querySelector("#loading");
const loadingText = document.querySelector("#loading-text");
const fallbackStatus = document.querySelector("#fallback-status");
const browseUi = document.querySelector("#browse-ui");
const detailPanel = document.querySelector("#detail-panel");
const selectionTitle = document.querySelector("#selection-title");
const selectionNote = document.querySelector("#selection-note");
const counter = document.querySelector("#counter");
const paletteLabel = document.querySelector("#palette-label");
const shelfCount = document.querySelector("#shelf-count");
const markers = document.querySelector("#markers");
const previousButton = document.querySelector("#previous");
const nextButton = document.querySelector("#next");
const inspectButton = document.querySelector("#inspect");
const closeButton = document.querySelector("#close-detail");
const resetButton = document.querySelector("#reset-view");
const toggleBookButton = document.querySelector("#toggle-book");
const readButton = document.querySelector("#read-book");
const chapterPrevButton = document.querySelector("#chapter-prev");
const chapterNextButton = document.querySelector("#chapter-next");
const panelToggle = document.querySelector("#panel-toggle");
const chapterSelect = document.querySelector("#chapter-select");
const fontDownButton = document.querySelector("#font-down");
const fontUpButton = document.querySelector("#font-up");
const fontSizeLabel = document.querySelector("#font-size");
const spreadModeButton = document.querySelector("#spread-mode");
const previousPageButton = document.querySelector("#previous-page");
const nextPageButton = document.querySelector("#next-page");
const pageLabel = document.querySelector("#page-label");
const pageCounter = document.querySelector("#page-counter");
const detailMicrocopy = document.querySelector(".detail-controls .microcopy");
const detailEyebrow = document.querySelector("#detail-eyebrow");
const detailTitle = document.querySelector("#detail-title");
const detailDeck = document.querySelector("#detail-deck");
const detailBinding = document.querySelector("#detail-binding");
const detailFormat = document.querySelector("#detail-format");
const detailTheme = document.querySelector("#detail-theme");
const detailMotif = document.querySelector("#detail-motif");
const liveRegion = document.querySelector("#live-region");
const pointerLabel = document.querySelector("#pointer-label");
const pointerLabelIndex = document.querySelector("#pointer-label-index");
const pointerLabelTitle = document.querySelector("#pointer-label-title");
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

loading.hidden = false;

const clamp = THREE.MathUtils.clamp;
const damp = THREE.MathUtils.damp;
const lerp = THREE.MathUtils.lerp;
const smoothstep = (value) => value * value * (3 - 2 * value);
const smootherstep = (value) => (
  value * value * value * (value * (value * 6 - 15) + 10)
);
const mod = (value, length) => ((value % length) + length) % length;
const pad = (value) => String(value).padStart(2, "0");

let reducedMotion = reducedMotionQuery.matches;
let renderer;
let scene;
let camera;
let controls;
let environmentTarget;
let shelfStage;
let bookRigs = [];
let hitTargets = [];
let rafId = 0;
let lastTime = performance.now();
let mode = "hero";
let transitionTime = 0;
let position = 0;
let targetPosition = 0;
let selectedIndex = 0;
let hoveredIndex = -1;
let wheelIdle = 0;
let focusReturnTarget = inspectButton;
let activeBook = null;
let readingOpen = false;
let detailBookHovered = false;
let currentSpread = 0;
let snapPages = false;     // ตัดภาพหน้ากระดาษทันที ไม่ต้องพลิก (ตอนข้ามชุดหน้า)
let shadowDirty = true;    // สั่งวาดเงาใหม่รอบเดียว (เปลี่ยนธีม / ปรับขนาดจอ / หยิบเล่มใหม่)
/* หนังสือบนชั้นลอยขยับเบา ๆ ตลอดเวลาเป็นเสน่ห์ของฉาก แต่ถ้าเปิดหน้าค้างไว้
   มันคือการวาด 60fps ทั้งวัน — ให้ขยับเฉพาะช่วงที่ยังมีคนแตะหน้าจออยู่ */
let heroActiveUntil = 0;
let controlsActiveUntil = 0;

function pokeHero() {
  heroActiveUntil = performance.now() + 9000;
  requestFrame();
}
let readingBusy = false;   // กำลังดึงเนื้อหาบทมาวาดลงกระดาษ
let pendingReadChapter = 0; // มาจาก ?read3d= — เปิดอ่านทันทีเมื่อหนังสือถึงมือ
let pointerDirty = false;
let suspended = false;
let viewWidth = window.innerWidth;
let viewHeight = window.innerHeight;
let detailViewOffsetX = 0;
let currentViewOffsetX = 0;
let detailSafeWidth = viewWidth * 0.6;
let themeInitialized = false;
let themeMoving = false;

const roomMaterials = {
  floor: null,
  wall: null,
  shelf: null,
  shelfDark: null,
  shadow: null
};
const roomLights = {
  hemisphere: null,
  key: null,
  softKey: null,
  fill: null,
  rim: null,
  backFill: null,
  spineRake: null,
  pageRake: null
};
const themeTargets = {
  floor: new THREE.Color(0xd8c8aa),
  wall: new THREE.Color(0xe9dfcb),
  shelf: new THREE.Color(0x4a2b1d),
  shelfDark: new THREE.Color(0x2a170f),
  shadow: new THREE.Color(0x2f1d13),
  fog: new THREE.Color(0xe9dfcb),
  hemisphere: new THREE.Color(0xfff8e8),
  hemisphereGround: new THREE.Color(0x5b4030),
  key: new THREE.Color(0xffe8c2),
  fill: new THREE.Color(0xd8e3e7),
  rim: new THREE.Color(0xd5a45e)
};

const pointer = {
  ndc: new THREE.Vector2(3, 3),
  clientX: 0,
  clientY: 0
};
const pageDrag = {
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  progress: 0,
  peakProgress: 0,
  committed: false,
  progressVelocity: 0,
  verticalBias: 0,
  lastProgress: 0,
  lastTime: 0,
  direction: 0,
  kind: null
};
const detailPress = {
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  moved: false,
  allowClick: false
};

const raycaster = new THREE.Raycaster();
const shelfCameraPosition = new THREE.Vector3();
const shelfCameraTarget = new THREE.Vector3();
const inspectPosition = new THREE.Vector3();
const inspectCameraPosition = new THREE.Vector3();
const inspectCameraTarget = new THREE.Vector3();
const transitionCameraTarget = new THREE.Vector3();
const openingBookPosition = new THREE.Vector3();
const openingBookQuaternion = new THREE.Quaternion();
const openingBookScale = new THREE.Vector3();
const openingMotionPosition = new THREE.Vector3();
const openingMotionQuaternion = new THREE.Quaternion();
const restingMotionPosition = new THREE.Vector3();
const restingMotionQuaternion = new THREE.Quaternion();
const openingCameraPosition = new THREE.Vector3();
const openingCameraTarget = new THREE.Vector3();
const openingShelfPosition = new THREE.Vector3();
const inspectShelfPosition = new THREE.Vector3(0, -4.2, -3);
const inspectBookQuaternion = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(0.055, -0.14, 0)
);
const inspectBookScale = new THREE.Vector3();
const closingBookPosition = new THREE.Vector3();
const closingBookStartPosition = new THREE.Vector3();
const closingBookStartQuaternion = new THREE.Quaternion();
const closingBookStartScale = new THREE.Vector3();
const closingBookQuaternion = new THREE.Quaternion();
const closingBookScale = new THREE.Vector3(1.09, 1.09, 1.09);
const closingMotionPosition = new THREE.Vector3();
const closingMotionQuaternion = new THREE.Quaternion();
const closingCameraPosition = new THREE.Vector3();
const closingCameraTarget = new THREE.Vector3();
const closingShelfPosition = new THREE.Vector3();
const shelfRestPosition = new THREE.Vector3();
const scratchBox = new THREE.Box3();
const scratchVector = new THREE.Vector3();
const shelfBoardTop = 0.47;
const spacing = 1.5;
const PAGINATED_LEAF_COUNT = 4;
const SPREAD_COUNT = PAGINATED_LEAF_COUNT + 1;
const FLEXIBLE_PAGE_SEGMENTS = 18;
const FLEXIBLE_PAGE_VERTICAL_SEGMENTS = 8;
const PAGE_TURN_COMMIT_PROGRESS = 0.18;
const COVER_OPEN_COMMIT_PROGRESS = 0.16;
const COVER_CLOSE_COMMIT_PROGRESS = 0.2;
const DETAIL_TRANSITION_DURATION = 0.92;
const SHELF_TRANSITION_DURATION = 0.92;
let openingViewOffsetX = 0;
let closingViewOffsetX = 0;

const shared = {
  box: new THREE.BoxGeometry(1, 1, 1),
  plane: new THREE.PlaneGeometry(1, 1),
  page: new THREE.MeshPhysicalMaterial({
    color: 0xe7dfcf,
    roughness: 0.95,
    metalness: 0,
    sheen: 0.025,
    sheenRoughness: 1
  }),
  pageSheet: new THREE.MeshPhysicalMaterial({
    color: 0xeee6d7,
    roughness: 0.955,
    metalness: 0,
    sheen: 0.02,
    sheenRoughness: 1,
    side: THREE.DoubleSide
  }),
  headband: new THREE.MeshPhysicalMaterial({
    color: 0xc6a66d,
    roughness: 0.58,
    metalness: 0.16,
    sheen: 0.14,
    sheenRoughness: 0.76
  }),
  walnut: new THREE.MeshStandardMaterial({
    color: 0x4a2b1d,
    roughness: 0.58,
    metalness: 0
  }),
  walnutDark: new THREE.MeshStandardMaterial({
    color: 0x2a170f,
    roughness: 0.7,
    metalness: 0
  })
};

function createFadeMaterial(baseMaterial) {
  const material = baseMaterial.clone();
  material.transparent = true;
  material.opacity = 1;
  return material;
}

function hashSeed(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function drawMotif(ctx, book, width, height) {
  const foil = book.foil;
  ctx.save();
  ctx.strokeStyle = foil;
  ctx.fillStyle = foil;
  ctx.lineWidth = Math.max(3, width * 0.004);
  ctx.globalAlpha = 0.88;
  const centerX = width * 0.5;
  const centerY = height * 0.38;
  const size = Math.min(width, height) * 0.22;

  if (book.motifKey === "brackets") {
    for (let layer = 0; layer < 3; layer += 1) {
      const inset = layer * size * 0.22;
      const left = centerX - size + inset;
      const right = centerX + size - inset;
      const top = centerY - size * 0.72 + inset;
      const bottom = centerY + size * 0.72 - inset;
      ctx.beginPath();
      ctx.moveTo(left + size * 0.25, top);
      ctx.lineTo(left, top);
      ctx.lineTo(left, bottom);
      ctx.lineTo(left + size * 0.25, bottom);
      ctx.moveTo(right - size * 0.25, top);
      ctx.lineTo(right, top);
      ctx.lineTo(right, bottom);
      ctx.lineTo(right - size * 0.25, bottom);
      ctx.stroke();
    }
    ctx.fillRect(centerX - 3, centerY - 3, 6, 6);
  } else if (book.motifKey === "paths") {
    ctx.beginPath();
    ctx.moveTo(centerX - size, centerY + size * 0.35);
    ctx.bezierCurveTo(centerX - size * 0.2, centerY - size, centerX + size * 0.1, centerY + size, centerX + size, centerY - size * 0.25);
    ctx.stroke();
    ctx.globalAlpha = 0.52;
    ctx.beginPath();
    ctx.moveTo(centerX - size, centerY - size * 0.45);
    ctx.bezierCurveTo(centerX - size * 0.25, centerY + size, centerX + size * 0.3, centerY - size, centerX + size, centerY + size * 0.45);
    ctx.stroke();
    for (let point = -1; point <= 1; point += 1) {
      ctx.beginPath();
      ctx.arc(centerX + point * size, centerY - point * size * 0.25, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (book.motifKey === "caret") {
    ctx.beginPath();
    ctx.moveTo(centerX - size * 0.9, centerY + size * 0.6);
    ctx.lineTo(centerX, centerY - size * 0.65);
    ctx.lineTo(centerX + size * 0.9, centerY + size * 0.6);
    ctx.stroke();
    ctx.globalAlpha = 0.38;
    for (let line = -2; line <= 2; line += 1) {
      ctx.beginPath();
      ctx.moveTo(centerX - size, centerY + line * size * 0.28);
      ctx.lineTo(centerX + size, centerY + line * size * 0.28);
      ctx.stroke();
    }
  } else if (book.motifKey === "orbits") {
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, size, size * 0.42, -0.35, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.58;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, size * 0.72, size, 0.52, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(centerX + size * 0.64, centerY - size * 0.34, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(centerX - 6, centerY - 6, 12, 12);
  } else if (book.motifKey === "modules") {
    const moduleSize = size * 0.54;
    const positions = [
      [-0.55, -0.5, "circle"],
      [0.25, -0.5, "rect"],
      [-0.55, 0.3, "rect"],
      [0.25, 0.3, "circle"]
    ];
    positions.forEach(([x, y, shape], index) => {
      ctx.globalAlpha = 0.45 + index * 0.12;
      if (shape === "circle") {
        ctx.beginPath();
        ctx.arc(centerX + x * size, centerY + y * size, moduleSize * 0.48, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeRect(
          centerX + x * size - moduleSize * 0.5,
          centerY + y * size - moduleSize * 0.5,
          moduleSize,
          moduleSize
        );
      }
    });
  } else if (book.motifKey === "frames") {
    for (let layer = 0; layer < 4; layer += 1) {
      ctx.globalAlpha = 0.9 - layer * 0.17;
      const offset = layer * size * 0.18;
      ctx.strokeRect(
        centerX - size + offset,
        centerY - size * 0.7 + offset,
        size * 2 - offset * 2,
        size * 1.4 - offset * 2
      );
    }
    ctx.beginPath();
    ctx.moveTo(centerX - size, centerY - size * 0.7);
    ctx.lineTo(centerX + size, centerY + size * 0.7);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(centerX, centerY, size * 0.78, 0.15, Math.PI * 1.82);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centerX - size * 0.72, centerY + size * 0.88);
    ctx.lineTo(centerX, centerY - size * 0.92);
    ctx.lineTo(centerX + size * 0.72, centerY + size * 0.88);
    ctx.stroke();
    ctx.globalAlpha = 0.48;
    ctx.beginPath();
    ctx.moveTo(centerX - size, centerY);
    ctx.lineTo(centerX + size, centerY);
    ctx.stroke();
  }
  ctx.restore();
}

let sharedPaperFaceTexture = null;
let sharedPageEdgeTextures = null;
let sharedContactShadowTexture = null;

function configureCanvasTexture(texture, {
  color = true,
  anisotropy = TEX.anisotropy
} = {}) {
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(
    anisotropy,
    renderer.capabilities.getMaxAnisotropy()
  );
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function makeCoverTexture(book) {
  const canvasTexture = document.createElement("canvas");
  canvasTexture.width = TEX.cover.w;
  canvasTexture.height = TEX.cover.h;
  const ctx = canvasTexture.getContext("2d");
  // วาดในพิกัดออกแบบเดิมเสมอ แล้วย่อทั้งผืนตามโปรไฟล์เครื่อง เลย์เอาต์จะได้ไม่เพี้ยน
  ctx.scale(canvasTexture.width / 768, canvasTexture.height / 1152);

  const random = seededRandom(hashSeed(book.id) + book.seed);

  ctx.fillStyle = book.color;
  ctx.fillRect(0, 0, 768, 1152);

  const edge = ctx.createLinearGradient(0, 0, 768, 0);
  edge.addColorStop(0, "rgba(0,0,0,0.24)");
  edge.addColorStop(0.075, "rgba(255,255,255,0.035)");
  edge.addColorStop(0.5, "rgba(255,255,255,0.01)");
  edge.addColorStop(0.94, "rgba(0,0,0,0.06)");
  edge.addColorStop(1, "rgba(0,0,0,0.19)");
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, 768, 1152);

  for (let line = 0; line < 1250; line += 1) {
    const x = random() * 768;
    const y = random() * 1152;
    const length = 4 + random() * 22;
    ctx.strokeStyle = random() > 0.5 ? "rgba(255,255,255,0.024)" : "rgba(0,0,0,0.025)";
    ctx.lineWidth = 0.6 + random() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + length, y + (random() - 0.5) * 2);
    ctx.stroke();
  }

  ctx.strokeStyle = book.foil;
  ctx.globalAlpha = 0.72;
  ctx.lineWidth = 2;
  ctx.strokeRect(42, 42, 768 - 84, 1152 - 84);
  ctx.strokeRect(55, 55, 768 - 110, 1152 - 110);
  ctx.globalAlpha = 1;

  drawMotif(ctx, book, 768, 1152);

  // อีโมจิปกที่ผู้ใช้ตั้งไว้ ปั๊มเป็นลายน้ำจาง ๆ ให้จำเล่มได้จากระยะไกล
  if (book.cover) {
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = '300px "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    ctx.fillText(book.cover, 768 / 2, 1152 * 0.37);
    ctx.restore();
  }

  /* ตัวหนังสือบนปกอยู่ในชั้นฟอยล์ (makeFoilTexture) ที่วาดทับอีกที ไม่ใช่ในผ้าปก
     ถ้าวาดที่นี่ด้วยจะเห็นชื่อเรื่องซ้อนกันสองชุด */

  return configureCanvasTexture(new THREE.CanvasTexture(canvasTexture));
}

function makeFoilTexture(book) {
  const foilCanvas = document.createElement("canvas");
  foilCanvas.width = TEX.cover.w;
  foilCanvas.height = TEX.cover.h;
  const ctx = foilCanvas.getContext("2d");
  // วาดในพิกัดออกแบบเดิมเสมอ แล้วย่อทั้งผืนตามโปรไฟล์เครื่อง เลย์เอาต์จะได้ไม่เพี้ยน
  ctx.scale(foilCanvas.width / 768, foilCanvas.height / 1152);

  ctx.clearRect(0, 0, 768, 1152);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  ctx.font = `500 15px ${SANS}`;
  ctx.letterSpacing = "2.8px";
  ctx.fillText(`EBOOKME  /  ${pad(book.index + 1)}`, 58, 70);
  ctx.letterSpacing = "0px";
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(58, 86);
  ctx.lineTo(164, 86);
  ctx.stroke();
  ctx.globalAlpha = 1;

  const inner = foilCanvas.width - 116;
  const titleSize = fitFontSize(ctx, book.title, inner, 400, SERIF, 78, 40, 2);
  ctx.font = `400 ${titleSize}px ${SERIF}`;
  const titleLines = wrapToWidth(ctx, book.title, inner, 2);
  titleLines.forEach((line, i) => {
    ctx.fillText(line, 58, 1020 - (titleLines.length - 1 - i) * titleSize * 1.1);
  });
  ctx.font = `500 14px ${SANS}`;
  ctx.fillText(book.discipline, 60, 1066);

  return configureCanvasTexture(new THREE.CanvasTexture(foilCanvas));
}

function makeClothBumpTexture(book) {
  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = 256;
  bumpCanvas.height = 256;
  const ctx = bumpCanvas.getContext("2d");
  const random = seededRandom(hashSeed(`${book.id}-cloth`) + book.seed);

  ctx.fillStyle = "#7f7f7f";
  ctx.fillRect(0, 0, bumpCanvas.width, bumpCanvas.height);

  for (let line = 0; line < 256; line += 2) {
    const value = Math.round(98 + random() * 70);
    ctx.strokeStyle = `rgb(${value},${value},${value})`;
    ctx.globalAlpha = 0.34 + random() * 0.18;
    ctx.lineWidth = 0.65 + random() * 0.45;
    ctx.beginPath();
    ctx.moveTo(0, line + (random() - 0.5));
    ctx.lineTo(256, line + (random() - 0.5));
    ctx.stroke();
  }

  for (let line = 1; line < 256; line += 3) {
    const value = Math.round(105 + random() * 58);
    ctx.strokeStyle = `rgb(${value},${value},${value})`;
    ctx.globalAlpha = 0.25 + random() * 0.14;
    ctx.lineWidth = 0.55 + random() * 0.35;
    ctx.beginPath();
    ctx.moveTo(line + (random() - 0.5), 0);
    ctx.lineTo(line + (random() - 0.5), 256);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(bumpCanvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 8);
  return configureCanvasTexture(texture, {
    color: false,
    anisotropy: 12
  });
}

function makeClothSurfaceMaps(book) {
  const size = 256;
  const heightField = new Float32Array(size * size);
  const normalCanvas = document.createElement("canvas");
  const roughnessCanvas = document.createElement("canvas");
  normalCanvas.width = roughnessCanvas.width = size;
  normalCanvas.height = roughnessCanvas.height = size;
  const normalContext = normalCanvas.getContext("2d");
  const roughnessContext = roughnessCanvas.getContext("2d");
  const normalImage = normalContext.createImageData(size, size);
  const roughnessImage = roughnessContext.createImageData(size, size);
  const phase = (book.seed % 19) * 0.23;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const warp = Math.sin((x + phase) * Math.PI * 0.52);
      const weft = Math.sin((y - phase) * Math.PI * 0.41);
      const cross = Math.sin((x + y + phase) * Math.PI * 0.19);
      heightField[y * size + x] = 0.5 + warp * 0.18 + weft * 0.15 + cross * 0.045;
    }
  }

  const sampleHeight = (x, y) => {
    const wrappedX = (x + size) % size;
    const wrappedY = (y + size) % size;
    return heightField[wrappedY * size + wrappedX];
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x;
      const pixel = index * 4;
      const dx = (sampleHeight(x + 1, y) - sampleHeight(x - 1, y)) * 1.5;
      const dy = (sampleHeight(x, y + 1) - sampleHeight(x, y - 1)) * 1.5;
      const length = Math.hypot(dx, dy, 1);
      normalImage.data[pixel] = Math.round(((-dx / length) * 0.5 + 0.5) * 255);
      normalImage.data[pixel + 1] = Math.round(((-dy / length) * 0.5 + 0.5) * 255);
      normalImage.data[pixel + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255);
      normalImage.data[pixel + 3] = 255;

      const roughness = Math.round(188 + heightField[index] * 56);
      roughnessImage.data[pixel] = roughness;
      roughnessImage.data[pixel + 1] = roughness;
      roughnessImage.data[pixel + 2] = roughness;
      roughnessImage.data[pixel + 3] = 255;
    }
  }

  normalContext.putImageData(normalImage, 0, 0);
  roughnessContext.putImageData(roughnessImage, 0, 0);

  const configureWeaveMap = (canvas, suffix) => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.name = `${book.id}-${suffix}`;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(5, 8);
    return configureCanvasTexture(texture, {
      color: false,
      anisotropy: 12
    });
  };

  return {
    normal: configureWeaveMap(normalCanvas, "cloth-normal"),
    roughness: configureWeaveMap(roughnessCanvas, "cloth-roughness")
  };
}

function makeEmbossMap(sourceTexture, name) {
  const texture = new THREE.CanvasTexture(sourceTexture.image);
  texture.name = name;
  texture.wrapS = sourceTexture.wrapS;
  texture.wrapT = sourceTexture.wrapT;
  texture.repeat.copy(sourceTexture.repeat);
  texture.offset.copy(sourceTexture.offset);
  texture.center.copy(sourceTexture.center);
  texture.rotation = sourceTexture.rotation;
  return configureCanvasTexture(texture, {
    color: false,
    anisotropy: TEX.anisotropy
  });
}

function drawPaperSurface(ctx, width, height, random) {
  const theme = readingTheme();
  ctx.fillStyle = theme.paper;
  ctx.fillRect(0, 0, width, height);

  const paperWash = ctx.createLinearGradient(0, 0, width, height);
  paperWash.addColorStop(0, `rgba(${theme.wash},0.22)`);
  paperWash.addColorStop(0.42, `rgba(${theme.wash},0.035)`);
  paperWash.addColorStop(1, `rgba(${theme.grain},0.08)`);
  ctx.fillStyle = paperWash;
  ctx.fillRect(0, 0, width, height);

  for (let fiber = 0; fiber < 2400; fiber += 1) {
    const x = random() * width;
    const y = random() * height;
    const length = 5 + random() * 34;
    const lightFiber = random() > 0.44;
    ctx.strokeStyle = lightFiber
      ? `rgba(${theme.wash},${0.025 + random() * 0.045})`
      : `rgba(${theme.grain},${0.018 + random() * 0.035})`;
    ctx.lineWidth = 0.45 + random() * 0.65;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(
      Math.min(width, x + length),
      y + (random() - 0.5) * 2.2
    );
    ctx.stroke();
  }

  for (let fleck = 0; fleck < 1200; fleck += 1) {
    const tone = Math.round(112 + random() * 94);
    ctx.fillStyle = `rgba(${tone},${tone - 5},${tone - 13},${0.016 + random() * 0.025})`;
    const size = 0.5 + random() * 1.1;
    ctx.fillRect(random() * width, random() * height, size, size);
  }
}

function makePaperFaceTexture(book, printed = false) {
  if (!printed && sharedPaperFaceTexture) return sharedPaperFaceTexture;

  const paperCanvas = document.createElement("canvas");
  paperCanvas.width = LOW_POWER ? 448 : 768;
  paperCanvas.height = LOW_POWER ? 672 : 1152;
  const ctx = paperCanvas.getContext("2d");
  const random = seededRandom(printed
    ? hashSeed(`${book.id}-printed-page`) + book.seed
    : hashSeed("working-volumes-paper-stock"));

  drawPaperSurface(ctx, paperCanvas.width, paperCanvas.height, random);

  if (printed) {
    const ink = new THREE.Color(book.palette.ink);
    const red = Math.round(ink.r * 255);
    const green = Math.round(ink.g * 255);
    const blue = Math.round(ink.b * 255);
    ctx.fillStyle = `rgba(${red},${green},${blue},0.2)`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = '500 15px Inter, "Helvetica Neue", Arial, sans-serif';
    ctx.letterSpacing = "2px";
    ctx.fillText(book.title.toUpperCase(), 84, 98);
    ctx.fillRect(84, 121, 190, 2);

    for (let column = 0; column < 2; column += 1) {
      const left = 84 + column * 316;
      for (let line = 0; line < 34; line += 1) {
        const y = 184 + line * 23;
        const lastInParagraph = line % 7 === 6;
        const lineWidth = lastInParagraph
          ? 108 + random() * 86
          : 190 + random() * 72;
        ctx.globalAlpha = 0.22 + random() * 0.11;
        ctx.fillRect(left, y, lineWidth, 1.45);
      }
    }

    ctx.globalAlpha = 0.32;
    ctx.font = '400 17px "Iowan Old Style", Baskerville, Georgia, serif';
    ctx.fillText(book.roman, paperCanvas.width - 104, paperCanvas.height - 72);
    ctx.globalAlpha = 1;
  }

  const texture = configureCanvasTexture(new THREE.CanvasTexture(paperCanvas));
  if (!printed) sharedPaperFaceTexture = texture;
  return texture;
}

/* ต้นฉบับตัดบรรทัดด้วยการนับตัวอักษรแล้วแยกคำที่ช่องว่าง ซึ่งใช้กับไทยไม่ได้เลย
   (ทั้งประโยคกลายเป็นคำเดียว ล้นออกนอกปก) จึงวัดความกว้างจริงและตัดที่ขอบคำ
   ด้วย Intl.Segmenter — สระ/วรรณยุกต์จึงไม่หลุดจากพยัญชนะ */
const wordSegmenter = (() => {
  try {
    return new Intl.Segmenter("th", { granularity: "word" });
  } catch {
    return null;
  }
})();

function segmentText(text) {
  if (wordSegmenter) return [...wordSegmenter.segment(text)].map((s) => s.segment);
  return text.split(/(\s+)/).filter(Boolean);
}

function wrapToWidth(ctx, text, maxWidth, maxLines = 6) {
  const pieces = segmentText(String(text ?? "").trim());
  const lines = [];
  let line = "";

  pieces.forEach((piece) => {
    if (lines.length >= maxLines) return;
    const candidate = line + piece;
    if (line && ctx.measureText(candidate.trimEnd()).width > maxWidth) {
      lines.push(line.trimEnd());
      line = /^\s+$/.test(piece) ? "" : piece;
    } else {
      line = candidate;
    }
  });

  if (line.trim() && lines.length < maxLines) lines.push(line.trimEnd());
  if (lines.length === maxLines && pieces.length) {
    // ยังเหลือข้อความอยู่ไหม — ถ้าเหลือให้ปิดท้ายด้วยจุดไข่ปลา
    const shown = lines.join("");
    const full = pieces.join("");
    if (shown.replace(/\s/g, "").length < full.replace(/\s/g, "").length) {
      let last = lines[maxLines - 1];
      while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
      lines[maxLines - 1] = `${last}…`;
    }
  }
  return lines;
}

// ย่อขนาดตัวอักษรจนกว่าข้อความจะพอดีจำนวนบรรทัดที่ให้ — ชื่อหนังสือไทยยาวกว่าอังกฤษมาก
function fitFontSize(ctx, text, maxWidth, weight, family, maxSize, minSize, maxLines = 1) {
  for (let size = maxSize; size > minSize; size -= 2) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (wrapToWidth(ctx, text, maxWidth, maxLines + 1).length <= maxLines) return size;
  }
  return minSize;
}

function drawWrappedCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 6) {
  wrapToWidth(ctx, text, maxWidth, maxLines).forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight);
  });
}

function makeEndpaperTexture(book) {
  const canvas = document.createElement("canvas");
  canvas.width = LOW_POWER ? 320 : 512;
  canvas.height = LOW_POWER ? 480 : 768;
  const ctx = canvas.getContext("2d");
  const random = seededRandom(hashSeed(`${book.id}-endpaper`) + book.seed);
  drawPaperSurface(ctx, canvas.width, canvas.height, random);

  ctx.save();
  ctx.fillStyle = book.color;
  ctx.globalAlpha = 0.14;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = book.foil;
  ctx.lineWidth = 1;
  for (let x = 28; x < canvas.width; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 24; y < canvas.height; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.42;
  drawMotif(ctx, { ...book, foil: book.palette.inkSoft }, canvas.width, canvas.height);
  ctx.restore();

  const texture = configureCanvasTexture(new THREE.CanvasTexture(canvas), {
    anisotropy: TEX.anisotropy
  });
  texture.name = `${book.id}-patterned-endpaper`;
  return texture;
}

/* หน้ากระดาษข้างในเล่ม
   ต้นฉบับวาดหน้าไว้ตายตัว 8 หน้าเป็นข้อความสมมติ ของเราวาดจาก "สเปก" ทีละหน้า
   เพราะโหมดอ่าน 3D ต้องเปลี่ยนเนื้อหาบนกระดาษใบเดิมไปเรื่อย ๆ ตามหน้าที่อ่านถึง */

const PAGE_W = 512;
const PAGE_H = 768;
const PAGE_M = 54;
const PAGE_COL = PAGE_W - PAGE_M * 2;
const TOC_PER_PAGE = 11;
const TEXT_LINE_H = 30;
const TEXT_TOP = 190;
const TEXT_BOTTOM = 704;

function makeInteriorPageTexture(book, spec, folio) {
  const canvas = document.createElement("canvas");
  canvas.width = TEX.page.w;
  canvas.height = TEX.page.h;
  const ctx = canvas.getContext("2d");
  ctx.scale(canvas.width / PAGE_W, canvas.height / PAGE_H);
  const random = seededRandom(hashSeed(`${book.id}-leaf-${spec.kind}-${folio}`) + book.seed);
  drawPaperSurface(ctx, PAGE_W, PAGE_H, random);

  const ink = readingTheme().ink;
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  const M = PAGE_M;
  const COL = PAGE_COL;
  const titles = book.chapterTitles;

  const drawEyebrow = (text, y) => {
    ctx.font = `500 11px ${SANS}`;
    ctx.letterSpacing = "2px";
    ctx.fillText(text, M, y);
    ctx.letterSpacing = "0px";
  };

  if (spec.kind !== "blank") {
    ctx.globalAlpha = 0.58;
    ctx.font = `500 10px ${SANS}`;
    ctx.letterSpacing = "1.8px";
    ctx.fillText(spec.runningHead || `EBOOKME  /  ${book.roman}`, 48, 48);
    ctx.textAlign = "right";
    ctx.fillText(pad(folio + 1), PAGE_W - 48, 48);
    ctx.textAlign = "left";
    ctx.letterSpacing = "0px";
    ctx.fillRect(48, 64, PAGE_W - 96, 1);
    ctx.globalAlpha = 1;
  }

  if (spec.kind === "title") {
    drawEyebrow(book.discipline, 174);
    const size = fitFontSize(ctx, book.title, COL, 400, SERIF, 58, 26, 2);
    ctx.font = `400 ${size}px ${SERIF}`;
    drawWrappedCanvasText(ctx, book.title, M - 2, 246, COL, size * 1.1, 2);
    ctx.globalAlpha = 0.55;
    ctx.font = `400 22px ${SERIF}`;
    drawWrappedCanvasText(ctx, book.deck, M, 462, COL, 32, 5);
    ctx.globalAlpha = 1;
  } else if (spec.kind === "toc") {
    const from = spec.from;
    drawEyebrow(from === 0 ? `ทั้งหมด ${book.chapterCount} บท` : "สารบัญ (ต่อ)", 138);
    ctx.font = `400 34px ${SERIF}`;
    if (from === 0) ctx.fillText("สารบัญ", M, 186);
    let y = from === 0 ? 246 : 190;
    titles.slice(from, from + TOC_PER_PAGE).forEach((title, i) => {
      const no = from + i + 1;
      const read = no <= book.done;
      ctx.globalAlpha = read ? 0.9 : 0.55;
      ctx.font = `500 13px ${SANS}`;
      ctx.fillText(pad(no), M, y);
      ctx.font = `400 18px ${SERIF}`;
      const line = wrapToWidth(ctx, title, COL - 46, 1)[0] || "";
      ctx.fillText(line, M + 40, y);
      if (read) {
        ctx.globalAlpha = 0.45;
        ctx.fillRect(M + 40, y + 5, ctx.measureText(line).width, 1);
      }
      y += 40;
    });
    ctx.globalAlpha = 1;
  } else if (spec.kind === "progress") {
    drawEyebrow("ความคืบหน้า", 146);
    ctx.font = `400 92px ${SERIF}`;
    ctx.fillText(`${book.percent}%`, M, 250);
    ctx.globalAlpha = 0.55;
    ctx.font = `400 20px ${SERIF}`;
    ctx.fillText(`อ่านแล้ว ${book.done} จาก ${book.chapterCount} บท`, M, 292);
    ctx.globalAlpha = 0.28;
    ctx.fillRect(M, 330, COL, 10);
    ctx.globalAlpha = 0.85;
    ctx.fillRect(M, 330, (COL * book.percent) / 100, 10);
    // ตารางบทแบบจุด — บทที่อ่านแล้วทึบ ที่เหลือโปร่ง
    const dot = 22;
    const perRow = Math.floor(COL / dot);
    titles.forEach((_, i) => {
      ctx.globalAlpha = i < book.done ? 0.85 : 0.2;
      ctx.beginPath();
      ctx.arc(M + 7 + (i % perRow) * dot, 400 + Math.floor(i / perRow) * dot, 6, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 0.48;
    ctx.font = `400 17px ${SERIF}`;
    ctx.fillText(book.theme, M, 700);
    ctx.globalAlpha = 1;
  } else if (spec.kind === "motif") {
    drawEyebrow("แผ่นลายประจำเล่ม", 146);
    ctx.save();
    ctx.globalAlpha = 0.58;
    drawMotif(ctx, { ...book, foil: ink }, PAGE_W, PAGE_H * 0.92);
    ctx.restore();
    ctx.globalAlpha = 0.48;
    ctx.font = `400 17px ${SERIF}`;
    drawWrappedCanvasText(ctx, spec.caption || book.theme, M, 650, COL, 24, 3);
    ctx.globalAlpha = 1;
  } else if (spec.kind === "notes") {
    drawEyebrow("บันทึกของผู้อ่าน", 138);
    ctx.globalAlpha = 0.44;
    for (let column = 0; column < 2; column += 1) {
      const left = M + column * 214;
      for (let line = 0; line < 24; line += 1) {
        const width = line % 7 === 6 ? 72 + random() * 54 : 138 + random() * 44;
        ctx.fillRect(left, 190 + line * 18, width, 1.25);
      }
    }
    ctx.globalAlpha = 0.78;
    ctx.strokeRect(M, 654, 404, 54);
    ctx.font = `500 12px ${SANS}`;
    ctx.fillText(book.motif, M + 16, 686);
    ctx.globalAlpha = 1;
  } else if (spec.kind === "text") {
    let y = TEXT_TOP;
    if (spec.heading) {
      ctx.font = `500 11px ${SANS}`;
      ctx.letterSpacing = "2px";
      ctx.fillText(`บทที่ ${spec.chapterNo}`, M, 132);
      ctx.letterSpacing = "0px";
      const size = fitFontSize(ctx, spec.heading, COL, 400, SERIF, 34, 17, 2);
      ctx.font = `400 ${size}px ${SERIF}`;
      drawWrappedCanvasText(ctx, spec.heading, M, 176, COL, size * 1.15, 2);
      y = 250;
    }
    drawPageRows(ctx, spec.rows || [], y - 21, ink);
  } else if (spec.kind === "end") {
    drawEyebrow("จบบท", 146);
    ctx.font = `400 30px ${SERIF}`;
    drawWrappedCanvasText(ctx, spec.heading || "จบบทนี้แล้ว", M, 210, COL, 38, 3);
    ctx.globalAlpha = 0.55;
    ctx.font = `400 19px ${SERIF}`;
    drawWrappedCanvasText(ctx, spec.note || "", M, 340, COL, 28, 4);
    ctx.globalAlpha = 1;
  } else if (spec.kind === "colophon") {
    drawEyebrow("ท้ายเล่ม", 164);
    ctx.font = `54px "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.fillText(book.cover, M, 236);
    const size = fitFontSize(ctx, book.title, COL - 90, 400, SERIF, 32, 18, 2);
    ctx.font = `400 ${size}px ${SERIF}`;
    drawWrappedCanvasText(ctx, book.title, M + 84, 230, COL - 90, size * 1.15, 2);
    ctx.globalAlpha = 0.58;
    ctx.font = `400 18px ${SERIF}`;
    drawWrappedCanvasText(
      ctx,
      `เข้าเล่ม ${book.binding} · ${book.discipline} · ${book.format}`,
      M,
      306,
      COL,
      28,
      5
    );
    ctx.globalAlpha = 0.74;
    ctx.font = `500 11px ${SANS}`;
    ctx.letterSpacing = "1.8px";
    ctx.fillText(`EBOOKME ${book.roman}  ·  ${book.cloud ? "คลาวด์" : "ในเครื่อง"}`, M, 676);
    ctx.letterSpacing = "0px";
    ctx.globalAlpha = 1;
  }

  if (spec.kind !== "blank") {
    ctx.globalAlpha = 0.62;
    ctx.fillRect(48, PAGE_H - 48, PAGE_W - 96, 1);
    ctx.globalAlpha = 1;
  }

  const texture = configureCanvasTexture(new THREE.CanvasTexture(canvas), { anisotropy: TEX.anisotropy });
  texture.name = `${book.id}-page-${folio + 1}-${spec.kind}`;
  return texture;
}

// หน้าตั้งต้นก่อนโหลดเนื้อหาจริง — เป็นสิ่งที่เห็นตอนแค่หยิบมาพลิกดูเฉย ๆ
function browsePageSpecs(book) {
  const hasSecondToc = book.chapterTitles.length > TOC_PER_PAGE;
  return [
    { kind: "title" },
    { kind: "toc", from: 0 },
    hasSecondToc ? { kind: "toc", from: TOC_PER_PAGE } : { kind: "motif", caption: book.theme },
    { kind: "progress" },
    { kind: "motif", caption: book.deck },
    { kind: "notes" },
    { kind: "motif", caption: book.theme },
    { kind: "colophon" }
  ];
}

function makeInteriorPageTextures(book) {
  return browsePageSpecs(book).map((spec, index) => makeInteriorPageTexture(book, spec, index));
}

function makeContactShadowTexture() {
  if (sharedContactShadowTexture) return sharedContactShadowTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(256, 64, 10, 256, 64, 254);
  gradient.addColorStop(0, "rgba(255,255,255,0.95)");
  gradient.addColorStop(0.38, "rgba(255,255,255,0.62)");
  gradient.addColorStop(0.72, "rgba(255,255,255,0.18)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  sharedContactShadowTexture = configureCanvasTexture(
    new THREE.CanvasTexture(canvas),
    { color: false, anisotropy: 8 }
  );
  sharedContactShadowTexture.name = "soft-contact-shadow";
  return sharedContactShadowTexture;
}

function makePageEdgeTextures(book) {
  if (sharedPageEdgeTextures) return sharedPageEdgeTextures;

  const makeEdgeTexture = (width, height, suffix) => {
    const edgeCanvas = document.createElement("canvas");
    edgeCanvas.width = width;
    edgeCanvas.height = height;
    const ctx = edgeCanvas.getContext("2d");
    const random = seededRandom(
      hashSeed(`${book.id}-${suffix}`) + book.seed
    );

    ctx.fillStyle = "#dcd5c7";
    ctx.fillRect(0, 0, width, height);

    const pageStep = suffix === "fore-edge" ? 2 : 1.35;
    for (let y = 0; y < height; y += pageStep) {
      const shade = Math.round(106 + random() * 74);
      const signature = random() > 0.965;
      ctx.strokeStyle = `rgba(${shade},${shade - 3},${shade - 9},${signature ? 0.34 : 0.13 + random() * 0.13})`;
      ctx.lineWidth = signature ? 1.05 : 0.42 + random() * 0.42;
      ctx.beginPath();
      ctx.moveTo(0, y + (random() - 0.5) * 0.5);
      ctx.bezierCurveTo(
        width * 0.3,
        y + (random() - 0.5) * 0.9,
        width * 0.72,
        y + (random() - 0.5) * 0.9,
        width,
        y + (random() - 0.5) * 0.5
      );
      ctx.stroke();
    }

    const edgeShade = ctx.createLinearGradient(0, 0, width, 0);
    edgeShade.addColorStop(0, "rgba(58,48,35,0.18)");
    edgeShade.addColorStop(0.035, "rgba(255,255,255,0.04)");
    edgeShade.addColorStop(0.86, "rgba(255,255,255,0)");
    edgeShade.addColorStop(1, "rgba(58,48,35,0.12)");
    ctx.fillStyle = edgeShade;
    ctx.fillRect(0, 0, width, height);

    return configureCanvasTexture(new THREE.CanvasTexture(edgeCanvas));
  };

  sharedPageEdgeTextures = {
    fore: makeEdgeTexture(512, 2048, "fore-edge"),
    headTail: makeEdgeTexture(2048, 384, "head-tail-edge")
  };
  return sharedPageEdgeTextures;
}

function createRoundedPlaneGeometry(width, height, radius) {
  const halfWidth = width * 0.5;
  const halfHeight = height * 0.5;
  const corner = Math.min(radius, halfWidth, halfHeight);
  const shape = new THREE.Shape();

  shape.moveTo(-halfWidth + corner, -halfHeight);
  shape.lineTo(halfWidth - corner, -halfHeight);
  shape.quadraticCurveTo(halfWidth, -halfHeight, halfWidth, -halfHeight + corner);
  shape.lineTo(halfWidth, halfHeight - corner);
  shape.quadraticCurveTo(halfWidth, halfHeight, halfWidth - corner, halfHeight);
  shape.lineTo(-halfWidth + corner, halfHeight);
  shape.quadraticCurveTo(-halfWidth, halfHeight, -halfWidth, halfHeight - corner);
  shape.lineTo(-halfWidth, -halfHeight + corner);
  shape.quadraticCurveTo(-halfWidth, -halfHeight, -halfWidth + corner, -halfHeight);

  const geometry = new THREE.ShapeGeometry(shape, 8);
  const position = geometry.getAttribute("position");
  const uv = new Float32Array(position.count * 2);
  for (let index = 0; index < position.count; index += 1) {
    uv[index * 2] = (position.getX(index) + halfWidth) / width;
    uv[index * 2 + 1] = (position.getY(index) + halfHeight) / height;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function createPageBlockGeometry(width, height, depth, radius) {
  const geometry = new RoundedBoxGeometry(width, height, depth, 4, radius);
  const position = geometry.getAttribute("position");
  const halfWidth = width * 0.5;

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const z = position.getZ(index);
    const normalizedX = clamp((x + halfWidth) / width, 0, 1);
    const gutterProgress = clamp(normalizedX / 0.16, 0, 1);
    const gutterEase = gutterProgress * gutterProgress * (3 - 2 * gutterProgress);
    const gutterCompression = (1 - gutterEase) * 0.012;
    const foreEdgeCharacter = Math.pow(normalizedX, 8) * Math.sin(position.getY(index) * 31) * 0.00055;
    const adjustedZ = Math.sign(z || 1) * Math.max(
      0,
      Math.abs(z) - gutterCompression + foreEdgeCharacter
    );
    position.setZ(index, adjustedZ);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.gutterCompression = 0.012;
  geometry.userData.pageSignatures = 6;
  return geometry;
}

function makeSpineTexture(book) {
  const spineCanvas = document.createElement("canvas");
  spineCanvas.width = TEX.spine.w;
  spineCanvas.height = TEX.spine.h;
  const ctx = spineCanvas.getContext("2d");
  const random = seededRandom(hashSeed(`${book.id}-spine-cloth`) + book.seed);
  ctx.fillStyle = book.color;
  ctx.fillRect(0, 0, spineCanvas.width, spineCanvas.height);

  const shade = ctx.createLinearGradient(0, 0, spineCanvas.width, 0);
  shade.addColorStop(0, "rgba(0,0,0,0.2)");
  shade.addColorStop(0.14, "rgba(255,255,255,0.055)");
  shade.addColorStop(0.62, "rgba(255,255,255,0.012)");
  shade.addColorStop(1, "rgba(0,0,0,0.16)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, spineCanvas.width, spineCanvas.height);

  for (let thread = 0; thread < 1900; thread += 1) {
    const x = random() * spineCanvas.width;
    const y = random() * spineCanvas.height;
    const vertical = random() > 0.42;
    ctx.strokeStyle = random() > 0.5
      ? `rgba(255,255,255,${0.018 + random() * 0.038})`
      : `rgba(0,0,0,${0.018 + random() * 0.032})`;
    ctx.lineWidth = 0.45 + random() * 0.7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(
      vertical ? x + (random() - 0.5) * 1.2 : x + 8 + random() * 28,
      vertical ? y + 8 + random() * 34 : y + (random() - 0.5) * 1.2
    );
    ctx.stroke();
  }

  const bottomShade = ctx.createLinearGradient(
    0,
    spineCanvas.height * 0.82,
    0,
    spineCanvas.height
  );
  bottomShade.addColorStop(0, "rgba(0,0,0,0)");
  bottomShade.addColorStop(1, "rgba(0,0,0,0.12)");
  ctx.fillStyle = bottomShade;
  ctx.fillRect(0, 0, spineCanvas.width, spineCanvas.height);

  return configureCanvasTexture(
    new THREE.CanvasTexture(spineCanvas),
    { anisotropy: TEX.anisotropy }
  );
}

function makeSpineFoilTexture(book) {
  const foilCanvas = document.createElement("canvas");
  foilCanvas.width = TEX.spine.w;
  foilCanvas.height = TEX.spine.h;
  const ctx = foilCanvas.getContext("2d");
  // วาดในพิกัดออกแบบเดิมเสมอ แล้วย่อทั้งผืนตามโปรไฟล์เครื่อง เลย์เอาต์จะได้ไม่เพี้ยน
  ctx.scale(foilCanvas.width / 384, foilCanvas.height / 1536);

  ctx.clearRect(0, 0, 384, 1536);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2.4;
  ctx.strokeRect(34, 38, 384 - 68, 1536 - 76);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `500 24px ${SANS}`;
  ctx.letterSpacing = "5px";
  ctx.fillText(book.roman, 384 * 0.5, 118);
  ctx.letterSpacing = "0px";

  ctx.save();
  ctx.translate(384 * 0.5, 1536 * 0.5);
  ctx.rotate(Math.PI / 2);
  // สันหนังสือมีที่จำกัด ชื่อไทยยาว ๆ ต้องย่อจนพอดีความสูงของสัน
  const spineSize = fitFontSize(ctx, book.title, 1536 - 320, 400, SERIF, 68, 26, 1);
  ctx.font = `400 ${spineSize}px ${SERIF}`;
  ctx.fillText(wrapToWidth(ctx, book.title, 1536 - 320, 1)[0] || "", 0, 0);
  ctx.restore();

  ctx.beginPath();
  ctx.arc(384 * 0.5, 1536 - 120, 24, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(384 * 0.5 - 24, 1536 - 120);
  ctx.lineTo(384 * 0.5 + 24, 1536 - 120);
  ctx.stroke();

  return configureCanvasTexture(new THREE.CanvasTexture(foilCanvas));
}

function makeBackCoverTexture(book) {
  const backCanvas = document.createElement("canvas");
  backCanvas.width = TEX.cover.w;
  backCanvas.height = TEX.cover.h;
  const ctx = backCanvas.getContext("2d");
  const random = seededRandom(hashSeed(`${book.id}-back-cloth`) + book.seed);

  ctx.fillStyle = book.color;
  ctx.fillRect(0, 0, backCanvas.width, backCanvas.height);

  const edgeShade = ctx.createLinearGradient(0, 0, backCanvas.width, 0);
  edgeShade.addColorStop(0, "rgba(0,0,0,0.15)");
  edgeShade.addColorStop(0.05, "rgba(255,255,255,0.028)");
  edgeShade.addColorStop(0.84, "rgba(255,255,255,0)");
  edgeShade.addColorStop(1, "rgba(0,0,0,0.11)");
  ctx.fillStyle = edgeShade;
  ctx.fillRect(0, 0, backCanvas.width, backCanvas.height);

  for (let thread = 0; thread < 2600; thread += 1) {
    const x = random() * backCanvas.width;
    const y = random() * backCanvas.height;
    const length = 5 + random() * 30;
    ctx.strokeStyle = random() > 0.5
      ? `rgba(255,255,255,${0.018 + random() * 0.03})`
      : `rgba(0,0,0,${0.016 + random() * 0.028})`;
    ctx.lineWidth = 0.45 + random() * 0.65;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + length, y + (random() - 0.5) * 1.5);
    ctx.stroke();
  }

  const vignette = ctx.createRadialGradient(
    backCanvas.width * 0.62,
    backCanvas.height * 0.38,
    20,
    backCanvas.width * 0.62,
    backCanvas.height * 0.38,
    backCanvas.width * 0.75
  );
  vignette.addColorStop(0, "rgba(255,255,255,0.03)");
  vignette.addColorStop(1, "rgba(0,0,0,0.09)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, backCanvas.width, backCanvas.height);

  return configureCanvasTexture(new THREE.CanvasTexture(backCanvas));
}

function makeBackFoilTexture(book) {
  const foilCanvas = document.createElement("canvas");
  foilCanvas.width = TEX.cover.w;
  foilCanvas.height = TEX.cover.h;
  const ctx = foilCanvas.getContext("2d");
  // วาดในพิกัดออกแบบเดิมเสมอ แล้วย่อทั้งผืนตามโปรไฟล์เครื่อง เลย์เอาต์จะได้ไม่เพี้ยน
  ctx.scale(foilCanvas.width / 768, foilCanvas.height / 1152);

  ctx.clearRect(0, 0, 768, 1152);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  ctx.font = `500 16px ${SANS}`;
  ctx.letterSpacing = "3px";
  ctx.fillText(`EBOOKME  /  ${book.roman}`, 68, 82);
  ctx.letterSpacing = "0px";
  ctx.globalAlpha = 0.72;
  ctx.fillRect(68, 108, 176, 2);
  ctx.globalAlpha = 1;

  ctx.lineWidth = 1.5;
  for (let ring = 0; ring < 5; ring += 1) {
    ctx.globalAlpha = 0.24 - ring * 0.032;
    ctx.beginPath();
    ctx.arc(548, 374, 74 + ring * 38, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.moveTo(348, 374);
  ctx.lineTo(704, 374);
  ctx.moveTo(548, 174);
  ctx.lineTo(548, 574);
  ctx.stroke();

  const backWidth = 632;
  const backSize = fitFontSize(ctx, book.title, backWidth, 400, SERIF, 62, 30, 2);
  ctx.font = `400 ${backSize}px ${SERIF}`;
  const backLines = wrapToWidth(ctx, book.title, backWidth, 2);
  backLines.forEach((line, i) => {
    ctx.fillText(line, 68, 956 - (backLines.length - 1 - i) * backSize * 1.1);
  });
  ctx.font = `500 15px ${SANS}`;
  ctx.letterSpacing = "2.6px";
  ctx.fillText(book.discipline, 70, 1004);
  ctx.letterSpacing = "0px";
  ctx.globalAlpha = 0.68;
  ctx.fillRect(68, 1040, backWidth, 1.5);
  ctx.globalAlpha = 1;
  ctx.textAlign = "right";
  ctx.font = `500 15px ${SANS}`;
  ctx.fillText(book.format, 700, 1080);

  return configureCanvasTexture(new THREE.CanvasTexture(foilCanvas));
}

function createMesh(geometry, material, name, cast = true, receive = true) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

function addTurnIns(pivot, book, side, width, height, insideZ, material) {
  const stripDepth = 0.002;
  const border = 0.018;
  const longWidth = width - border * 0.7;
  const longHeight = height - border * 2.2;
  const definitions = [
    ["head", width * 0.5, height * 0.5 - border * 0.56, longWidth, border, stripDepth],
    ["tail", width * 0.5, -height * 0.5 + border * 0.56, longWidth, border, stripDepth],
    ["spine", border * 0.56, 0, border, longHeight, stripDepth],
    ["fore", width - border * 0.56, 0, border, longHeight, stripDepth]
  ];

  definitions.forEach(([edge, x, y, stripWidth, stripHeight, depth]) => {
    const strip = createMesh(
      shared.box,
      material,
      `${book.id}-${side}-turn-in-${edge}`,
      false,
      true
    );
    strip.scale.set(stripWidth, stripHeight, depth);
    strip.position.set(x, y, insideZ);
    pivot.add(strip);
  });
}

function createBookRig(book, index) {
  const root = new THREE.Group();
  root.name = `book-${book.id}`;
  root.userData.index = index;

  const motion = new THREE.Group();
  motion.name = `${book.id}-motion`;
  root.add(motion);

  const width = book.width;
  const height = book.height;
  const depth = book.depth;
  const board = 0.032;
  const coverRadius = 0.0045;
  const pageRadius = 0.0025;
  const spineRadius = 0.0015;
  const spineBoardThickness = 0.014;
  const spineWidth = 0.082;
  const pageWidth = width - 0.074;
  const pageHeight = height - 0.068;
  const pageDepth = depth - 0.026;

  const coverTexture = makeCoverTexture(book);
  const foilTexture = makeFoilTexture(book);
  const clothBumpTexture = makeClothBumpTexture(book);
  const clothSurfaceMaps = makeClothSurfaceMaps(book);
  const paperFaceTexture = makePaperFaceTexture(book);
  const pageEdgeTextures = makePageEdgeTextures(book);
  const spineTexture = makeSpineTexture(book);
  const spineFoilTexture = makeSpineFoilTexture(book);
  const foilEmbossTexture = makeEmbossMap(foilTexture, `${book.id}-front-foil-emboss`);
  const spineEmbossTexture = makeEmbossMap(spineFoilTexture, `${book.id}-spine-foil-emboss`);
  /* ปกหลัง ใบรองปก และหน้าในมองไม่เห็นเลยตอนหนังสือยืนอยู่บนชั้น
     สร้างไว้ล่วงหน้าทุกเล่มกินหน่วยความจำ GPU เล่มละ ~25MB ฟรี ๆ
     รอสร้างตอนหยิบเล่มนั้นออกมาดูจริง (ดูที่ ensureInspectAssets) */
  const interiorPageTextures = [];
  const backCoverTexture = null;
  const backFoilTexture = null;
  const backEmbossTexture = null;
  const endpaperTexture = null;
  const cloth = new THREE.MeshPhysicalMaterial({
    color: book.color,
    normalMap: clothSurfaceMaps.normal,
    normalScale: new THREE.Vector2(0.34, 0.34),
    roughnessMap: clothSurfaceMaps.roughness,
    roughness: 0.98,
    metalness: 0.02,
    bumpMap: clothBumpTexture,
    bumpScale: 0.0045,
    sheen: 0.34,
    sheenRoughness: 0.76,
    sheenColor: new THREE.Color(book.foil),
    transparent: true
  });
  const coverArt = new THREE.MeshPhysicalMaterial({
    map: coverTexture,
    normalMap: clothSurfaceMaps.normal,
    normalScale: new THREE.Vector2(0.28, 0.28),
    roughnessMap: clothSurfaceMaps.roughness,
    bumpMap: clothBumpTexture,
    bumpScale: 0.0035,
    roughness: 0.92,
    metalness: 0.035,
    clearcoat: 0.06,
    clearcoatRoughness: 0.72,
    sheen: 0.26,
    sheenRoughness: 0.78,
    transparent: true
  });
  // ฟอยล์เป็นวัสดุโลหะ ถ้าแสงไม่เข้ามุมชื่อเรื่องจะจมหายไปกับผ้าปก
  // ใส่ค่าเรืองแสงอ่อน ๆ ให้อ่านออกทุกมุม โดยยังเห็นเป็นฟอยล์ปั๊มอยู่
  const foilGlow = new THREE.Color(book.foil).multiplyScalar(0.22);
  const foilArt = new THREE.MeshPhysicalMaterial({
    color: book.foil,
    map: foilTexture,
    alphaMap: foilTexture,
    bumpMap: foilEmbossTexture,
    bumpScale: 0.016,
    emissive: foilGlow,
    emissiveMap: foilTexture,
    roughness: 0.26,
    metalness: 0.82,
    clearcoat: 0.18,
    clearcoatRoughness: 0.12,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2
  });
  const spineArt = new THREE.MeshPhysicalMaterial({
    map: spineTexture,
    normalMap: clothSurfaceMaps.normal,
    normalScale: new THREE.Vector2(0.3, 0.3),
    roughnessMap: clothSurfaceMaps.roughness,
    bumpMap: clothBumpTexture,
    bumpScale: 0.004,
    roughness: 0.95,
    metalness: 0.025,
    sheen: 0.27,
    sheenRoughness: 0.78,
    transparent: true,
    side: THREE.DoubleSide
  });
  const spineFoilArt = new THREE.MeshPhysicalMaterial({
    color: book.foil,
    map: spineFoilTexture,
    alphaMap: spineFoilTexture,
    bumpMap: spineEmbossTexture,
    bumpScale: 0.017,
    roughness: 0.19,
    metalness: 0.92,
    clearcoat: 0.16,
    clearcoatRoughness: 0.13,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    side: THREE.DoubleSide
  });
  const backArt = new THREE.MeshPhysicalMaterial({
    color: book.color,
    map: backCoverTexture,
    normalMap: clothSurfaceMaps.normal,
    normalScale: new THREE.Vector2(0.28, 0.28),
    roughnessMap: clothSurfaceMaps.roughness,
    bumpMap: clothBumpTexture,
    bumpScale: 0.0035,
    roughness: 0.96,
    metalness: 0.025,
    sheen: 0.25,
    sheenRoughness: 0.8,
    transparent: true,
    side: THREE.DoubleSide
  });
  const backFoilArt = new THREE.MeshPhysicalMaterial({
    color: book.foil,
    map: backFoilTexture,
    alphaMap: backFoilTexture,
    bumpMap: backEmbossTexture,
    bumpScale: 0.016,
    roughness: 0.21,
    metalness: 0.9,
    clearcoat: 0.14,
    clearcoatRoughness: 0.14,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    side: THREE.DoubleSide
  });
  const endpaperMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(book.palette.paperPale).lerp(new THREE.Color(0xf2ead8), 0.5),
    map: endpaperTexture,
    bumpMap: paperFaceTexture,
    bumpScale: 0.0018,
    roughness: 0.94,
    metalness: 0,
    sheen: 0.025,
    sheenRoughness: 1,
    side: THREE.DoubleSide,
    transparent: true
  });
  const foreEdgeMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: pageEdgeTextures.fore,
    bumpMap: pageEdgeTextures.fore,
    bumpScale: 0.0022,
    roughness: 0.93,
    metalness: 0,
    sheen: 0.018,
    sheenRoughness: 1,
    side: THREE.DoubleSide,
    transparent: true
  });
  const headTailEdgeMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: pageEdgeTextures.headTail,
    bumpMap: pageEdgeTextures.headTail,
    bumpScale: 0.0015,
    roughness: 0.94,
    metalness: 0,
    sheen: 0.014,
    sheenRoughness: 1,
    side: THREE.DoubleSide,
    transparent: true
  });
  const grooveMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(book.color).multiplyScalar(0.42),
    roughness: 0.9,
    metalness: 0,
    bumpMap: clothBumpTexture,
    bumpScale: 0.006,
    side: THREE.DoubleSide,
    transparent: true
  });
  const pageMaterial = createFadeMaterial(shared.page);
  const headbandMaterial = createFadeMaterial(shared.headband);
  const interiorPageMaterials = Array.from({ length: PAGE_FACES }, () => {
    const material = createFadeMaterial(shared.pageSheet);
    material.map = paperFaceTexture;
    material.bumpMap = paperFaceTexture;
    material.bumpScale = 0.0012;
    material.roughness = 0.96;
    material.side = THREE.FrontSide;
    material.needsUpdate = true;
    return material;
  });
  const blankPageMaterial = createFadeMaterial(shared.pageSheet);
  blankPageMaterial.map = paperFaceTexture;
  blankPageMaterial.bumpMap = paperFaceTexture;
  blankPageMaterial.bumpScale = 0.0012;
  blankPageMaterial.roughness = 0.96;
  blankPageMaterial.side = THREE.FrontSide;
  blankPageMaterial.needsUpdate = true;
  const signatureMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0x8d816f).lerp(new THREE.Color(book.palette.paperPale), 0.34),
    roughness: 0.98,
    metalness: 0,
    transparent: true
  });
  const ribbonMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(book.foil).lerp(new THREE.Color(book.color), 0.28),
    roughness: 0.62,
    metalness: 0.08,
    sheen: 0.36,
    sheenRoughness: 0.68,
    side: THREE.DoubleSide,
    transparent: true
  });

  pageMaterial.map = paperFaceTexture;
  pageMaterial.bumpMap = paperFaceTexture;
  pageMaterial.bumpScale = 0.0014;
  pageMaterial.roughness = 0.95;
  pageMaterial.needsUpdate = true;

  const coverGeometry = new RoundedBoxGeometry(
    width,
    height,
    board,
    2,
    coverRadius
  );
  const pageGeometry = createPageBlockGeometry(
    pageWidth,
    pageHeight,
    pageDepth,
    pageRadius
  );
  const coverSurfaceGeometry = createRoundedPlaneGeometry(
    width - 0.007,
    height - 0.007,
    0.0035
  );
  const endpaperGeometry = createRoundedPlaneGeometry(
    width - 0.045,
    height - 0.045,
    0.003
  );

  root.userData.construction = {
    board,
    coverRadius,
    pageRadius,
    spineRadius,
    spineBoardThickness,
    spineProfile: "flat",
    spineFoilLayered: true,
    backSurfaceLayered: true,
    clothPbrMaps: true,
    foilEmbossed: true,
    interiorPageDesigns: PAGE_FACES,
    flexiblePageSegments: FLEXIBLE_PAGE_SEGMENTS,
    clothLikePageDeformation: true,
    turnInStrips: 8,
    ribbonBookmark: true,
    pageSignatures: pageGeometry.userData.pageSignatures,
    gutterCompression: pageGeometry.userData.gutterCompression,
    coverArtInset: 0.007,
    coverOverhangX: (width - pageWidth) * 0.5,
    coverOverhangY: (height - pageHeight) * 0.5
  };

  const pageBlock = createMesh(pageGeometry, pageMaterial, `${book.id}-page-block`);
  pageBlock.position.x = 0.018;
  motion.add(pageBlock);

  const backPivot = new THREE.Group();
  backPivot.name = `${book.id}-back-cover-pivot`;
  backPivot.position.set(-width * 0.5, 0, -depth * 0.5 - board * 0.5);
  const backCover = createMesh(coverGeometry, cloth, `${book.id}-back-cover`);
  backCover.position.x = width * 0.5;
  backPivot.add(backCover);

  const backPlane = createMesh(
    coverSurfaceGeometry,
    backArt,
    `${book.id}-back-cover-art`,
    false,
    false
  );
  backPlane.position.set(width * 0.5, 0, -board * 0.55);
  backPlane.rotation.y = Math.PI;
  backPivot.add(backPlane);

  const backFoilPlane = createMesh(
    coverSurfaceGeometry,
    backFoilArt,
    `${book.id}-back-foil-art`,
    false,
    false
  );
  backFoilPlane.position.set(width * 0.5, 0, -board * 0.605);
  backFoilPlane.rotation.y = Math.PI;
  backPivot.add(backFoilPlane);

  const backEndpaper = createMesh(
    endpaperGeometry,
    endpaperMaterial,
    `${book.id}-back-endpaper`,
    false,
    true
  );
  backEndpaper.position.set(width * 0.5, 0, board * 0.515);
  backPivot.add(backEndpaper);
  addTurnIns(
    backPivot,
    book,
    "back",
    width,
    height,
    board * 0.53,
    cloth
  );

  const backGroove = createMesh(
    shared.plane,
    grooveMaterial,
    `${book.id}-back-hinge-groove`,
    false,
    false
  );
  backGroove.scale.set(0.012, height * 0.94, 1);
  backGroove.position.set(0.038, 0, -board * 0.535);
  backGroove.rotation.y = Math.PI;
  backPivot.add(backGroove);
  motion.add(backPivot);

  const frontPivot = new THREE.Group();
  frontPivot.name = `${book.id}-front-cover-pivot`;
  frontPivot.position.set(-width * 0.5, 0, depth * 0.5 + board * 0.5);
  const frontCover = createMesh(coverGeometry, cloth, `${book.id}-front-cover`);
  frontCover.position.x = width * 0.5;
  frontPivot.add(frontCover);

  const coverPlane = createMesh(
    coverSurfaceGeometry,
    coverArt,
    `${book.id}-cover-art`,
    false,
    false
  );
  coverPlane.position.set(width * 0.5, 0, board * 0.55);
  frontPivot.add(coverPlane);

  const foilPlane = createMesh(
    coverSurfaceGeometry,
    foilArt,
    `${book.id}-foil-art`,
    false,
    false
  );
  foilPlane.position.set(width * 0.5, 0, board * 0.605);
  frontPivot.add(foilPlane);

  const frontEndpaper = createMesh(
    endpaperGeometry,
    endpaperMaterial,
    `${book.id}-front-endpaper`,
    false,
    true
  );
  frontEndpaper.position.set(width * 0.5, 0, -board * 0.515);
  frontEndpaper.rotation.y = Math.PI;
  frontPivot.add(frontEndpaper);
  addTurnIns(
    frontPivot,
    book,
    "front",
    width,
    height,
    -board * 0.53,
    cloth
  );

  const frontGroove = createMesh(
    shared.plane,
    grooveMaterial,
    `${book.id}-front-hinge-groove`,
    false,
    false
  );
  frontGroove.scale.set(0.012, height * 0.94, 1);
  frontGroove.position.set(0.038, 0, board * 0.655);
  frontPivot.add(frontGroove);
  motion.add(frontPivot);

  const pagePivots = [];
  const pageSurfaces = [];
  for (let pageIndex = 0; pageIndex < 6; pageIndex += 1) {
    const leafOrder = 5 - pageIndex;
    const frontPageMaterial = leafOrder < 4
      ? interiorPageMaterials[leafOrder * 2]
      : blankPageMaterial;
    const backPageMaterial = leafOrder < 4
      ? interiorPageMaterials[leafOrder * 2 + 1]
      : blankPageMaterial;
    const pagePivot = new THREE.Group();
    pagePivot.name = `${book.id}-page-${pageIndex}`;
    pagePivot.position.set(
      -width * 0.5 + spineWidth * 0.65,
      0,
      pageDepth * 0.5 + 0.0015 + pageIndex * 0.0015
    );
    pagePivot.userData.restZ = pagePivot.position.z;
    pagePivot.userData.turnedZ = depth * 0.5 + board + 0.004 + leafOrder * 0.0015;
    const frontPageGeometry = new THREE.PlaneGeometry(
      1,
      1,
      FLEXIBLE_PAGE_SEGMENTS,
      FLEXIBLE_PAGE_VERTICAL_SEGMENTS
    );
    const backPageGeometry = new THREE.PlaneGeometry(
      1,
      1,
      FLEXIBLE_PAGE_SEGMENTS,
      FLEXIBLE_PAGE_VERTICAL_SEGMENTS
    );
    const visiblePageWidth = pageWidth - spineWidth * 0.42;
    const frontPage = createMesh(
      frontPageGeometry,
      frontPageMaterial,
      `${book.id}-page-sheet-${pageIndex}-front`,
      false,
      true
    );
    frontPage.scale.set(visiblePageWidth, pageHeight - 0.014, 1);
    frontPage.position.set(visiblePageWidth * 0.5, 0, 0.00022);
    pagePivot.add(frontPage);
    pageSurfaces.push(frontPage);

    const backPage = createMesh(
      backPageGeometry,
      backPageMaterial,
      `${book.id}-page-sheet-${pageIndex}-back`,
      false,
      true
    );
    backPage.scale.set(visiblePageWidth, pageHeight - 0.014, 1);
    backPage.position.set(visiblePageWidth * 0.5, 0, -0.00022);
    backPage.rotation.y = Math.PI;
    pagePivot.add(backPage);
    pageSurfaces.push(backPage);
    pagePivot.userData.flex = {
      curve: 0,
      curveVelocity: 0,
      twist: 0,
      twistVelocity: 0,
      surfaces: [
        {
          geometry: frontPageGeometry,
          position: frontPageGeometry.attributes.position,
          base: Float32Array.from(frontPageGeometry.attributes.position.array),
          direction: 1
        },
        {
          geometry: backPageGeometry,
          position: backPageGeometry.attributes.position,
          base: Float32Array.from(backPageGeometry.attributes.position.array),
          direction: -1
        }
      ]
    };
    motion.add(pagePivot);
    pagePivots.push(pagePivot);
  }

  const spineGeometry = new RoundedBoxGeometry(
    spineBoardThickness,
    height - 0.012,
    depth + board * 1.88,
    1,
    spineRadius
  );
  const spine = createMesh(spineGeometry, spineArt, `${book.id}-flat-spine`);
  spine.position.x = -width * 0.5 - spineBoardThickness * 0.35;
  spine.userData.profile = "flat";
  motion.add(spine);

  const spineFoil = createMesh(
    shared.plane,
    spineFoilArt,
    `${book.id}-spine-foil`,
    false,
    false
  );
  spineFoil.scale.set(depth + board * 1.82, height - 0.018, 1);
  spineFoil.rotation.y = -Math.PI * 0.5;
  spineFoil.position.set(
    spine.position.x - spineBoardThickness * 0.505,
    0,
    0
  );
  motion.add(spineFoil);

  const spineLining = createMesh(
    new RoundedBoxGeometry(
      spineWidth * 0.68,
      height - 0.056,
      Math.max(0.045, pageDepth - 0.008),
      1,
      0.0015
    ),
    endpaperMaterial,
    `${book.id}-spine-lining`
  );
  spineLining.position.set(-width * 0.5 + spineWidth * 0.38, 0, 0);
  motion.add(spineLining);

  [-1, 1].forEach((direction) => {
    const headbandGeometry = new THREE.CylinderGeometry(
      0.012,
      0.012,
      pageDepth * 0.88,
      12,
      1,
      false
    );
    const headband = createMesh(
      headbandGeometry,
      headbandMaterial,
      `${book.id}-headband-${direction}`
    );
    headband.rotation.x = Math.PI * 0.5;
    headband.position.set(
      -pageWidth * 0.5 + 0.046,
      direction * (pageHeight * 0.5 - 0.004),
      0
    );
    motion.add(headband);
  });

  const ribbonGeometry = createRoundedPlaneGeometry(
    0.034,
    pageHeight * 0.76,
    0.002
  );
  const ribbon = createMesh(
    ribbonGeometry,
    ribbonMaterial,
    `${book.id}-ribbon-bookmark`,
    false,
    true
  );
  ribbon.position.set(
    -pageWidth * 0.5 + 0.09 + (book.seed % 3) * 0.018,
    -pageHeight * 0.17,
    pageDepth * 0.5 + 0.003
  );
  ribbon.rotation.z = (book.seed % 2 ? -1 : 1) * 0.014;
  motion.add(ribbon);

  for (let signatureIndex = 0; signatureIndex < 6; signatureIndex += 1) {
    const signature = createMesh(
      shared.box,
      signatureMaterial,
      `${book.id}-page-signature-${signatureIndex + 1}`,
      false,
      true
    );
    signature.scale.set(0.0035, 0.00135, pageDepth * 0.91);
    signature.position.set(
      0.018 + pageWidth * 0.5 + 0.001,
      -pageHeight * 0.5 + ((signatureIndex + 1) / 7) * pageHeight,
      0
    );
    motion.add(signature);
  }

  const foreEdge = createMesh(
    shared.plane,
    foreEdgeMaterial,
    `${book.id}-fore-edge`,
    false,
    true
  );
  foreEdge.scale.set(pageDepth * 0.94, pageHeight - 0.028, 1);
  foreEdge.rotation.y = Math.PI * 0.5;
  foreEdge.position.set(0.018 + pageWidth * 0.5 + 0.002, 0, 0);
  motion.add(foreEdge);

  [-1, 1].forEach((direction) => {
    const edge = createMesh(
      shared.plane,
      headTailEdgeMaterial,
      `${book.id}-${direction > 0 ? "head" : "tail"}-edge`,
      false,
      true
    );
    edge.scale.set(pageWidth - 0.035, pageDepth * 0.94, 1);
    edge.rotation.x = direction > 0 ? -Math.PI * 0.5 : Math.PI * 0.5;
    edge.position.set(
      0.018,
      direction * (pageHeight * 0.5 + 0.002),
      0
    );
    motion.add(edge);
  });

  const hitMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false
  });
  const hit = createMesh(shared.box, hitMaterial, `${book.id}-hit-target`, false, false);
  hit.scale.set(width * 1.34, height * 1.2, Math.max(depth * 4, 1));
  hit.position.set(-spineWidth * 0.18, 0, 0.12);
  hit.userData.index = index;
  motion.add(hit);
  hitTargets.push(hit);

  const contactShadowMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(book.palette.shelfDark),
    alphaMap: makeContactShadowTexture(),
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const contactShadow = createMesh(
    shared.plane,
    contactShadowMaterial,
    `${book.id}-contact-shadow`,
    false,
    false
  );
  contactShadow.scale.set(width * 1.22, depth * 2.05, 1);
  contactShadow.rotation.x = -Math.PI * 0.5;
  contactShadow.position.set(0, -height * 0.5 - 0.022, 0.025);
  root.add(contactShadow);

  return {
    data: book,
    root,
    motion,
    frontPivot,
    frontCover,
    pageBlock,
    pagePivots,
    pageSurfaces,
    pageGestureSurfaces: [...pageSurfaces, pageBlock],
    hit,
    coverTexture,
    foilTexture,
    clothBumpTexture,
    clothSurfaceMaps,
    paperFaceTexture,
    interiorPageTextures,
    interiorPageMaterials,
    blankPageMaterial,
    backArt,
    backFoilArt,
    endpaperMaterial,
    endpaperTexture,
    pageEdgeTextures,
    spineTexture,
    spineFoilTexture,
    backCoverTexture,
    backFoilTexture,
    foilEmbossTexture,
    spineEmbossTexture,
    backEmbossTexture,
    contactShadow,
    opacity: 1,
    lastOffset: null,
    fadeMaterials: [
      cloth,
      coverArt,
      foilArt,
      spineArt,
      spineFoilArt,
      backArt,
      backFoilArt,
      endpaperMaterial,
      foreEdgeMaterial,
      headTailEdgeMaterial,
      grooveMaterial,
      pageMaterial,
      ...interiorPageMaterials,
      blankPageMaterial,
      headbandMaterial,
      signatureMaterial,
      ribbonMaterial
    ],
    materials: [
      cloth,
      coverArt,
      foilArt,
      spineArt,
      spineFoilArt,
      backArt,
      backFoilArt,
      endpaperMaterial,
      foreEdgeMaterial,
      headTailEdgeMaterial,
      grooveMaterial,
      pageMaterial,
      ...interiorPageMaterials,
      blankPageMaterial,
      headbandMaterial,
      signatureMaterial,
      ribbonMaterial,
      contactShadowMaterial,
      hitMaterial
    ],
    base: {
      width,
      height,
      depth
    }
  };
}

// แนวตั้งคือ "แคบ" เสมอ แม้จอจะกว้าง 1200px — แผงรายละเอียดไปอยู่ด้านล่าง
// ไม่ใช่ด้านข้าง กรอบกล้องจึงต้องวางหนังสือไว้กลางจอ ไม่ใช่เยื้องซ้าย
function isPortraitLayout() {
  return viewHeight >= viewWidth;
}

function configureResponsiveTargets() {
  const narrow = viewWidth < 820 || isPortraitLayout();
  shelfCameraPosition.set(0, narrow ? 2.02 : 1.92, narrow ? 8.7 : 8.1);
  shelfCameraTarget.set(0, narrow ? 1.57 : 1.55, 0);
  inspectPosition.set(narrow ? 0 : -2.25, narrow ? 2.3 : 1.56, narrow ? 0.15 : 0);
  inspectCameraPosition.set(narrow ? 0 : -0.52, narrow ? 2.46 : 1.78, narrow ? 5.7 : 5.25);
  inspectCameraTarget.copy(inspectPosition);

  if (narrow) {
    detailViewOffsetX = 0;
    detailSafeWidth = viewWidth;
    return;
  }

  const panelBounds = detailPanel.getBoundingClientRect();
  const panelLeft = panelBounds.left > 0 ? panelBounds.left : viewWidth * 0.64;
  const gutter = clamp(viewWidth * 0.035, 32, 56);
  detailSafeWidth = Math.max(viewWidth * 0.42, panelLeft - gutter);
  const wideLayoutProgress = clamp((viewWidth - 820) / 620, 0, 1);
  const bookCenterRatio = THREE.MathUtils.lerp(0.55, 0.615, wideLayoutProgress);
  const desiredBookCenter = detailSafeWidth * bookCenterRatio;
  detailViewOffsetX = Math.max(0, viewWidth * 0.5 - desiredBookCenter);
}

function getInspectScale() {
  if (!activeBook || viewWidth < 820 || isPortraitLayout()) return 0.82;
  const distance = Math.abs(inspectCameraPosition.z - inspectPosition.z);
  const worldHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
  const pixelsPerWorld = viewHeight / Math.max(worldHeight, 0.001);
  const estimatedBookWidth = activeBook.base.width * pixelsPerWorld * 1.16;
  const scaleForSafeWidth = (detailSafeWidth * 0.72) / Math.max(estimatedBookWidth, 1);
  return clamp(scaleForSafeWidth, 0.9, 1.32);
}

function applyDetailViewOffset() {
  if (Math.abs(currentViewOffsetX) < 0.5) {
    camera.clearViewOffset();
    return;
  }
  camera.setViewOffset(
    viewWidth,
    viewHeight,
    currentViewOffsetX,
    0,
    viewWidth,
    viewHeight
  );
}

/* ลายไม้วาดเอง — ต้นฉบับฝังภาพไม้มาเป็น WebP ก้อนใหญ่ ซึ่งเป็นงานภาพของเขา
   และกินพื้นที่ ~120KB ทั้งที่วงปีไม้สร้างจาก noise ได้ในไม่กี่บรรทัด */
let woodCanvas = null;

function drawWoodGrain() {
  if (woodCanvas) return woodCanvas;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const random = seededRandom(20260807);

  ctx.fillStyle = "#6b4229";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // วงปี: เส้นตามยาวที่บิดเป็นคลื่นเล็กน้อย ความเข้มไม่เท่ากันเหมือนไม้จริง
  for (let ring = 0; ring < 190; ring += 1) {
    const y = random() * canvas.height;
    const amplitude = 2 + random() * 9;
    const period = 90 + random() * 220;
    const phase = random() * Math.PI * 2;
    const dark = random() > 0.45;
    ctx.strokeStyle = dark
      ? `rgba(38,20,10,${0.05 + random() * 0.16})`
      : `rgba(206,164,116,${0.03 + random() * 0.1})`;
    ctx.lineWidth = 0.7 + random() * 2.6;
    ctx.beginPath();
    for (let x = 0; x <= canvas.width; x += 8) {
      const wave = Math.sin((x / period) * Math.PI * 2 + phase) * amplitude;
      if (x === 0) ctx.moveTo(x, y + wave);
      else ctx.lineTo(x, y + wave);
    }
    ctx.stroke();
  }

  // เสี้ยนสั้น ๆ กระจายทั่วแผ่น กันไม่ให้พื้นผิวดูเรียบเป็นพลาสติก
  for (let fleck = 0; fleck < 2600; fleck += 1) {
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    ctx.strokeStyle = random() > 0.5
      ? `rgba(30,16,8,${0.04 + random() * 0.08})`
      : `rgba(214,176,132,${0.03 + random() * 0.06})`;
    ctx.lineWidth = 0.5 + random() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 4 + random() * 26, y + (random() - 0.5) * 1.6);
    ctx.stroke();
  }

  woodCanvas = canvas;
  return canvas;
}

function createWoodTexture(repeatX, repeatY, rotation = 0) {
  const texture = new THREE.CanvasTexture(drawWoodGrain());
  texture.name = "editorial-walnut";
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.center.set(0.5, 0.5);
  texture.rotation = rotation;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  texture.needsUpdate = true;
  return texture;
}

function applyWoodTexture() {
  if (!renderer) return;

  shared.walnut.map = createWoodTexture(6, 1.4);
  shared.walnut.needsUpdate = true;
  shared.walnutDark.map = createWoodTexture(6, 1.4);
  shared.walnutDark.needsUpdate = true;
  requestFrame();
}

function addRoom() {
  const floor = createMesh(shared.plane, new THREE.MeshStandardMaterial({
    color: 0xd8c8aa,
    roughness: 0.92,
    metalness: 0
  }), "paper-floor", false, true);
  floor.scale.set(30, 20, 1);
  floor.rotation.x = -Math.PI * 0.5;
  floor.position.y = -0.02;
  scene.add(floor);

  const back = createMesh(shared.plane, new THREE.MeshStandardMaterial({
    color: 0xe9dfcb,
    roughness: 1,
    metalness: 0
  }), "paper-backdrop", false, true);
  back.scale.set(28, 14, 1);
  back.position.set(0, 5.5, -3.3);
  scene.add(back);

  const shelf = createMesh(shared.box, shared.walnut, "walnut-shelf");
  shelf.scale.set(17, 0.28, 1.08);
  shelf.position.set(0, 0.33, -0.03);
  shelfStage.add(shelf);

  const shelfLip = createMesh(shared.box, shared.walnutDark, "walnut-shelf-lip");
  shelfLip.scale.set(17.05, 0.075, 1.14);
  shelfLip.position.set(0, 0.205, 0.02);
  shelfStage.add(shelfLip);

  const backRail = createMesh(shared.box, shared.walnut, "walnut-back-rail");
  backRail.scale.set(17, 0.17, 0.2);
  backRail.position.set(0, 0.68, -0.52);
  shelfStage.add(backRail);

  [-7.65, 7.65].forEach((x, index) => {
    const upright = createMesh(shared.box, shared.walnutDark, `shelf-upright-${index}`);
    upright.scale.set(0.2, 3.8, 0.72);
    upright.position.set(x, 2.05, -0.28);
    shelfStage.add(upright);
  });

  const shadowStrip = createMesh(shared.plane, new THREE.MeshBasicMaterial({
    color: 0x2f1d13,
    alphaMap: makeContactShadowTexture(),
    transparent: true,
    opacity: 0.22,
    depthWrite: false
  }), "shelf-contact-shadow", false, false);
  shadowStrip.scale.set(16, 0.85, 1);
  shadowStrip.rotation.x = -Math.PI * 0.5;
  shadowStrip.position.set(0, 0.49, 0.06);
  shelfStage.add(shadowStrip);

  roomMaterials.floor = floor.material;
  roomMaterials.wall = back.material;
  roomMaterials.shelf = shared.walnut;
  roomMaterials.shelfDark = shared.walnutDark;
  roomMaterials.shadow = shadowStrip.material;
}

function addLights() {
  roomLights.hemisphere = new THREE.HemisphereLight(0xfff8e8, 0x5b4030, 0.56);
  scene.add(roomLights.hemisphere);

  const key = new THREE.DirectionalLight(0xffe8c2, 1.42);
  key.name = "shadow-key";
  key.position.set(-4.6, 7.4, 5.8);
  key.castShadow = true;
  key.shadow.mapSize.set(LOW_POWER ? 1024 : 2048, LOW_POWER ? 1024 : 2048);
  key.shadow.camera.left = -6;
  key.shadow.camera.right = 6;
  key.shadow.camera.top = 6;
  key.shadow.camera.bottom = -1.5;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 18;
  key.shadow.bias = -0.00018;
  key.shadow.normalBias = 0.018;
  key.shadow.radius = 3.5;
  scene.add(key);
  roomLights.key = key;

  const softKey = new THREE.RectAreaLight(0xffe8c2, 5.4, 4.8, 5.6);
  softKey.name = "cloth-softbox";
  softKey.position.set(-3.2, 5.5, 4.6);
  softKey.lookAt(0, 1.45, 0);
  scene.add(softKey);
  roomLights.softKey = softKey;

  const fill = new THREE.DirectionalLight(0xd8e3e7, 0.3);
  fill.name = "cool-fill";
  fill.position.set(5.5, 3.6, 4.2);
  scene.add(fill);
  roomLights.fill = fill;

  const rim = new THREE.RectAreaLight(0xd5a45e, 3.45, 1.6, 4.8);
  rim.name = "foil-rake";
  rim.position.set(3.8, 3.6, -2.1);
  rim.lookAt(-0.2, 1.5, 0);
  scene.add(rim);
  roomLights.rim = rim;

  if (LOW_POWER) return; // ไฟเสริมอีกสามดวงเป็นงานคำนวณต่อพิกเซลที่มือถือไม่ไหว

  const backFill = new THREE.RectAreaLight(0xd8e3e7, 2.7, 3.8, 4.8);
  backFill.name = "back-cover-softbox";
  backFill.position.set(-1.8, 2.9, -4.5);
  backFill.lookAt(-0.1, 1.45, 0);
  scene.add(backFill);
  roomLights.backFill = backFill;

  const spineRake = new THREE.RectAreaLight(0xffe8c2, 1.9, 0.9, 4.6);
  spineRake.name = "spine-rake";
  spineRake.position.set(-4.6, 3.2, 1.1);
  spineRake.lookAt(-0.55, 1.5, 0);
  scene.add(spineRake);
  roomLights.spineRake = spineRake;

  const pageRake = new THREE.RectAreaLight(0xfff7e7, 2.15, 1.15, 3.8);
  pageRake.name = "page-edge-rake";
  pageRake.position.set(4.2, 4.8, 3.1);
  pageRake.lookAt(0.65, 1.55, 0);
  scene.add(pageRake);
  roomLights.pageRake = pageRake;
}

function addDust() {
  const dustCount = 110;
  const positions = new Float32Array(dustCount * 3);
  const random = seededRandom(20260728);
  for (let index = 0; index < dustCount; index += 1) {
    positions[index * 3] = (random() - 0.5) * 14;
    positions[index * 3 + 1] = 0.7 + random() * 4.7;
    positions[index * 3 + 2] = -1.7 + random() * 4;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xc3a97b,
    size: 0.014,
    transparent: true,
    opacity: 0.3,
    depthWrite: false
  });
  const dust = new THREE.Points(geometry, material);
  dust.name = "paper-dust";
  dust.userData.isDust = true;
  scene.add(dust);
}

function buildMarkers() {
  BOOKS.forEach((book, index) => {
    const button = document.createElement("button");
    button.className = "marker";
    button.type = "button";
    button.role = "tab";
    button.setAttribute("aria-label", `เลือกเล่มที่ ${index + 1}: ${book.title}`);
    button.setAttribute("aria-current", index === 0 ? "true" : "false");
    button.setAttribute("aria-selected", index === 0 ? "true" : "false");
    button.addEventListener("click", () => selectMarker(index, button));
    markers.append(button);
  });
}

function setThemeColorsImmediately() {
  roomMaterials.floor?.color.copy(themeTargets.floor);
  roomMaterials.wall?.color.copy(themeTargets.wall);
  roomMaterials.shelf?.color.copy(themeTargets.shelf);
  roomMaterials.shelfDark?.color.copy(themeTargets.shelfDark);
  roomMaterials.shadow?.color.copy(themeTargets.shadow);
  scene?.fog?.color.copy(themeTargets.fog);
  roomLights.hemisphere?.color.copy(themeTargets.hemisphere);
  roomLights.hemisphere?.groundColor.copy(themeTargets.hemisphereGround);
  roomLights.key?.color.copy(themeTargets.key);
  roomLights.softKey?.color.copy(themeTargets.key);
  roomLights.fill?.color.copy(themeTargets.fill);
  roomLights.rim?.color.copy(themeTargets.rim);
  roomLights.backFill?.color.copy(themeTargets.fill);
  roomLights.spineRake?.color.copy(themeTargets.key);
  roomLights.pageRake?.color.copy(themeTargets.hemisphere);
  themeMoving = false;
}

/* เปลี่ยนธีมแล้วต้องเห็นผลในฉาก 3D ด้วย ไม่ใช่เปลี่ยนแค่มุมมองตาราง
   กระดาษถูกอบเป็นภาพไว้แล้ว จึงต้องวาดใหม่ทั้งชุด ไม่ใช่แค่เปลี่ยนค่าสีวัสดุ */
function applyReadingTheme() {
  const theme = readingTheme();
  if (renderer) {
    renderer.toneMappingExposure = theme.exposure;
    renderer.shadowMap.needsUpdate = true;
  }
  shared.page.color.setHex(theme.sheet);
  shared.pageSheet.color.setHex(theme.sheet);
  shared.page.needsUpdate = true;
  shared.pageSheet.needsUpdate = true;

  /* พื้นกระดาษเปล่ามีสีของธีมอบอยู่ในเท็กซ์เจอร์ ต้องสร้างใหม่แล้ว "ผูกกลับ" ให้วัสดุ
     ที่ยังใช้อยู่ ของเดิม dispose ทิ้งเฉย ๆ วัสดุจึงค้างอยู่กับเท็กซ์เจอร์ที่ถูกทำลายไปแล้ว */
  const previousFace = sharedPaperFaceTexture;
  sharedPaperFaceTexture = null;
  const nextFace = makePaperFaceTexture(BOOKS[selectedIndex] || BOOKS[0]);
  bookRigs.forEach((rig) => {
    rig.interiorPageMaterials.forEach((material) => {
      if (material.map === previousFace) material.map = nextFace;
      material.bumpMap = nextFace;
      material.needsUpdate = true;
    });
    if (rig.blankPageMaterial) {
      rig.blankPageMaterial.map = nextFace;
      rig.blankPageMaterial.bumpMap = nextFace;
      rig.blankPageMaterial.needsUpdate = true;
    }
    // ใบรองปกก็มีสีธีมอยู่ในภาพ ให้สร้างใหม่ตอนหยิบเล่มออกมาครั้งถัดไป
    if (rig !== activeBook) rig.inspectReady = false;
  });
  previousFace?.dispose();

  shadowDirty = true;
  if (BOOKS[selectedIndex]) applyBookTheme(BOOKS[selectedIndex]);

  if (activeBook) {
    // ใบรองปกของเล่มที่เปิดอยู่ต้องเปลี่ยนทันที ไม่ใช่รอเปิดใหม่
    activeBook.endpaperMaterial.map?.dispose();
    activeBook.endpaperMaterial.map = makeEndpaperTexture(activeBook.data);
    activeBook.endpaperMaterial.needsUpdate = true;
    // หน้าที่เห็นอยู่ตอนนี้ต้องวาดใหม่ ไม่ว่ากำลังอ่านหรือแค่เปิดดู
    if (activeBook.reading) renderReadingBatch(activeBook, activeBook.reading.batch);
    else if (activeBook.readingTextures?.length) renderBrowsePages(activeBook);
  }
  requestFrame();
}

function applyBookTheme(book) {
  const palette = book.palette;
  const theme = readingTheme();

  /* ธีมหรี่/เร่งความสว่างของห้องทั้งห้อง สีผ้าปกยังเป็นของเล่มนั้นเหมือนเดิม
     พอผนังเปลี่ยนความสว่าง สีตัวอักษรบน UI ต้องพลิกตาม ไม่งั้นธีมมืดจะได้
     ตัวหนังสือเข้มบนพื้นเข้ม (เล่มปกมัสตาร์ดมีผนังสีอ่อนกับหมึกสีเข้ม) */
  const roomPaper = new THREE.Color(palette.paper).multiplyScalar(theme.room);
  const roomDeep = new THREE.Color(palette.paperDeep).multiplyScalar(theme.room);
  const luminance = roomPaper.r * 0.299 + roomPaper.g * 0.587 + roomPaper.b * 0.114;
  const uiInk = luminance > 0.42 ? "#1b1915" : "#f3ede3";
  const uiInkSoft = luminance > 0.42 ? "#5b544a" : "#b3aea7";

  /* ตั้งเป็นตัวแปร --sh-* ไม่ใช่ --accent/--ink ตรง ๆ เพราะ inline style บน :root
     ชนะกฎธีมใน app.css เสมอ มุมมองตารางกับหน้าอ่านจะเพี้ยนสีตามเล่มที่เลือกอยู่ */
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty("--sh-paper", `#${roomPaper.getHexString()}`);
  rootStyle.setProperty("--sh-paper-deep", `#${roomDeep.getHexString()}`);
  rootStyle.setProperty("--sh-paper-pale", palette.paperPale);
  rootStyle.setProperty("--sh-ink", uiInk);
  rootStyle.setProperty("--sh-ink-soft", uiInkSoft);
  rootStyle.setProperty("--sh-rule", `color-mix(in srgb, ${uiInk} 24%, transparent)`);
  rootStyle.setProperty("--sh-accent", book.accent || book.foil);

  const dim = theme.room;
  themeTargets.floor.set(palette.paperDeep).multiplyScalar(dim);
  themeTargets.wall.set(palette.wall).multiplyScalar(dim);
  themeTargets.shelf.set(palette.shelf).multiplyScalar(dim);
  themeTargets.shelfDark.set(palette.shelfDark).multiplyScalar(dim);
  themeTargets.shadow.set(palette.shelfDark).multiplyScalar(dim);
  themeTargets.fog.set(palette.wall).multiplyScalar(dim);
  // ไฟหรี่ตามธีมด้วย แต่ไม่ถึงกับมืดสนิทจนมองหนังสือไม่เห็น
  const lightDim = clamp(dim, 0.5, 1.15);
  themeTargets.hemisphere.set(palette.paperPale).multiplyScalar(lightDim);
  themeTargets.hemisphereGround.set(palette.shelf).multiplyScalar(dim);
  themeTargets.key.set(palette.light).multiplyScalar(lightDim);
  themeTargets.fill.set(palette.fill).multiplyScalar(lightDim);
  themeTargets.rim.set(book.accent || book.foil);

  if (!themeInitialized || reducedMotion) {
    themeInitialized = true;
    setThemeColorsImmediately();
  } else {
    themeMoving = true;
    requestFrame();
  }
}

function updateTheme(delta) {
  if (!themeMoving) return false;
  const amount = 1 - Math.exp(-delta * 5.5);
  let largestGap = 0;
  const easeColor = (current, target) => {
    if (!current) return;
    const redGap = current.r - target.r;
    const greenGap = current.g - target.g;
    const blueGap = current.b - target.b;
    largestGap = Math.max(
      largestGap,
      redGap * redGap + greenGap * greenGap + blueGap * blueGap
    );
    current.lerp(target, amount);
  };

  easeColor(roomMaterials.floor?.color, themeTargets.floor);
  easeColor(roomMaterials.wall?.color, themeTargets.wall);
  easeColor(roomMaterials.shelf?.color, themeTargets.shelf);
  easeColor(roomMaterials.shelfDark?.color, themeTargets.shelfDark);
  easeColor(roomMaterials.shadow?.color, themeTargets.shadow);
  easeColor(scene?.fog?.color, themeTargets.fog);
  easeColor(roomLights.hemisphere?.color, themeTargets.hemisphere);
  easeColor(roomLights.hemisphere?.groundColor, themeTargets.hemisphereGround);
  easeColor(roomLights.key?.color, themeTargets.key);
  easeColor(roomLights.softKey?.color, themeTargets.key);
  easeColor(roomLights.fill?.color, themeTargets.fill);
  easeColor(roomLights.rim?.color, themeTargets.rim);
  easeColor(roomLights.backFill?.color, themeTargets.fill);
  easeColor(roomLights.spineRake?.color, themeTargets.key);
  easeColor(roomLights.pageRake?.color, themeTargets.hemisphere);

  if (largestGap < 0.0000025) {
    setThemeColorsImmediately();
  }
  return themeMoving;
}

function updateSelection(index, announce = false) {
  const nextIndex = mod(index, BOOKS.length);
  if (nextIndex === selectedIndex && !announce) return;
  selectedIndex = nextIndex;
  const book = BOOKS[selectedIndex];
  selectionTitle.textContent = book.title;
  selectionNote.textContent = book.note;
  counter.textContent = `${pad(selectedIndex + 1)} / ${pad(BOOKS.length)}`;
  if (paletteLabel) paletteLabel.textContent = book.paletteLabel;
  inspectButton.setAttribute("aria-label", `ดูรายละเอียด ${book.title}`);
  if (shelfCount) shelfCount.textContent = `${BOOKS.length} เล่มบนชั้น`;
  applyBookTheme(book);

  [...markers.children].forEach((marker, markerIndex) => {
    const current = markerIndex === selectedIndex;
    marker.setAttribute("aria-current", current ? "true" : "false");
    marker.setAttribute("aria-selected", current ? "true" : "false");
    marker.tabIndex = current ? 0 : -1;
    // จอแคบแถบดัชนีเลื่อนแนวนอน ขีดของเล่มที่เลือกต้องไม่หลุดออกนอกสายตา
    if (current && markers.scrollWidth > markers.clientWidth + 4) {
      marker.scrollIntoView({ block: "nearest", inline: "center" });
    }
  });

  if (announce) {
    liveRegion.textContent = `เลือกเล่มที่ ${selectedIndex + 1} จาก ${BOOKS.length}: ${book.title}. ${book.note}`;
  }
}

function refreshProgress(book) {
  const total = book.chapterCount;
  book.done = readDoneCount(book.id, total);
  book.percent = total ? Math.round((book.done / total) * 100) : 0;
  book.lastChapter = readLastChapter(book.id, total);
  book.format = total ? `อ่านแล้ว ${book.done}/${total} บท (${book.percent}%)` : "ยังไม่มีบท";
  book.theme = book.lastChapter ? `ค้างไว้ที่บทที่ ${book.lastChapter}` : "ยังไม่เคยเปิดอ่าน";
}

function populateDetail(book) {
  detailEyebrow.textContent = `เล่มที่ ${book.roman} · ${book.discipline}`;
  detailTitle.textContent = book.title;
  detailDeck.textContent = book.deck;
  detailBinding.textContent = book.format;
  detailFormat.textContent = book.theme;
  detailTheme.textContent = book.cloud ? "คลาวด์ ☁️" : "ในเครื่อง";
  detailMotif.textContent = book.binding;
  // ปุ่มนี้เป็น "สลับไปอ่านอีกแบบ" ไม่ใช่ "เริ่มอ่าน" — ชื่อจึงต้องบอกปลายทางให้ชัด
  if (readButton) readButton.href = readerUrl(book);
  syncChapterList(book);
}

function getSpreadLabels(book) {
  const reading = activeBook?.data === book ? activeBook.reading : null;
  if (reading) {
    const specs = reading.specs;
    const base = reading.batch * PAGE_FACES;
    return Array.from({ length: SPREAD_COUNT }, (_, spread) => {
      const face = spread === 0
        ? 0
        : spread === SPREAD_COUNT - 1
          ? PAGE_FACES - 1
          : spread * 2;
      const spec = specs[base + face];
      if (!spec || spec.kind === "blank") return reading.title;
      if (spec.kind === "toc") return "สารบัญ";
      if (spec.kind === "title") return "ปกใน";
      if (spec.kind === "progress") return "ความคืบหน้า";
      if (spec.kind === "end") return `จบบทที่ ${reading.chapterNo}`;
      if (spec.kind === "colophon") return "ท้ายเล่ม";
      return reading.title;
    });
  }
  const toc = book.chapterTitles.length > TOC_PER_PAGE ? "สารบัญ (ต่อ)" : "แผ่นลาย";
  return ["ปกใน", `สารบัญ · ${toc}`, "ความคืบหน้า", "แผ่นลาย · บันทึก", "ท้ายเล่ม"];
}

/* แผงรายละเอียดมีสองทรง: แปะข้างหนังสือ (จอกว้างตอนแค่หยิบมาดู)
   กับแผ่นล่างจอ (จอแคบ จอแนวตั้ง หรือ "กำลังอ่าน" ไม่ว่าจอใหญ่แค่ไหน)
   ตอนอ่านจริงบนจอใหญ่ ถ้าปล่อยแผงไว้ข้าง ๆ หนังสือจะได้พื้นที่แค่ครึ่งจอ */
function shouldUseSheet() {
  return readingOpen || viewWidth <= 900 || isPortraitLayout();
}

function syncPanelLayout() {
  const sheet = shouldUseSheet();
  if (detailPanel.classList.contains("as-sheet") === sheet) return;
  detailPanel.classList.toggle("as-sheet", sheet);
  // ทรงแผงเปลี่ยน = พื้นที่ว่างเปลี่ยน กล้องต้องวัดกรอบใหม่
  requestAnimationFrame(() => {
    if (!frameOpenSpread(true)) resetInspectionView();
  });
}

function updatePageControls(announce = false) {
  const rig = activeBook;
  const book = rig?.data || BOOKS[selectedIndex];
  const reading = rig?.reading;
  syncChapterList(book);
  const labels = getSpreadLabels(book);
  const interactionLocked = mode !== "detail" || !readingOpen;
  const onePageNow = wantsOnePage();
  const face = currentFace();
  const atFirst = reading
    ? readingFolioRange()[0] <= 0
    : (onePageNow ? face === 0 : currentSpread === 0);
  const atLast = reading
    ? readingFolioRange()[1] >= reading.count - 1
    : (onePageNow ? face === PAGE_FACES - 1 : currentSpread === SPREAD_COUNT - 1);
  const previousDisabled = interactionLocked || atFirst;
  const nextDisabled = interactionLocked || atLast;

  const hasNextChapter = !!reading && reading.chapterNo < book.chapterCount;
  const hasPrevChapter = !!reading && reading.chapterNo > 1;
  previousPageButton.disabled = previousDisabled && !hasPrevChapter;
  nextPageButton.disabled = nextDisabled && !hasNextChapter;

  if (chapterPrevButton && chapterNextButton) {
    const chapterNo = reading?.chapterNo || 0;
    chapterPrevButton.disabled = !reading || chapterNo <= 1;
    chapterNextButton.disabled = !reading || chapterNo >= book.chapterCount;
  }
  // บอกให้รู้ว่าพลิกต่อจากหน้าสุดท้ายแล้วจะข้ามบทให้เอง
  if (nextPageButton) {
    nextPageButton.title = atLast && reading && reading.chapterNo < book.chapterCount
      ? `ไปบทที่ ${reading.chapterNo + 1}`
      : "หน้าถัดไป";
  }

  pageLabel.textContent = readingOpen
    ? (readingBusy ? "กำลังดึงเนื้อหา…" : labels[currentSpread])
    : "ปิดอยู่";
  if (readingOpen && reading) {
    const [from, to] = readingFolioRange();
    const total = reading.count || reading.specs.length;
    pageCounter.textContent = from === to
      ? `หน้า ${from + 1} / ${total}`
      : `หน้า ${from + 1}–${to + 1} / ${total}`;
  } else {
    pageCounter.textContent = readingOpen
      ? `${pad(currentSpread + 1)} / ${pad(SPREAD_COUNT)}`
      : "แตะที่หนังสือเพื่อเปิด";
  }
  /* ปุ่มหลักต้อง "เริ่มอ่านตรงนี้" ไม่ใช่พาไปหน้าอื่น
     ของเดิมปุ่มชื่อ "อ่านต่อ บทที่ N" แต่กดแล้วเด้งไปหน้า 2D ซึ่งขัดความคาดหวัง */
  toggleBookButton.textContent = readingOpen
    ? "ปิดเล่ม"
    : (book.lastChapter ? `อ่านต่อ บทที่ ${book.lastChapter}` : "เริ่มอ่าน");
  toggleBookButton.setAttribute("aria-pressed", String(readingOpen));
  const onePageView = readingOpen && wantsOnePage();
  // ปุ่มสลับมีความหมายเฉพาะตอนที่ไม่ใช่จอกว้างแนวนอน (ซึ่งกางสองหน้าอยู่แล้ว)
  detailMicrocopy.textContent = !readingOpen
    ? "ลากปกหรือแตะหนึ่งครั้งเพื่อเปิด · ลากพื้นหลังเพื่อหมุนดู"
    : onePageView
      ? "กำลังอ่านทีละหน้าให้ตัวหนังสือใหญ่พอ · ลากหน้ากระดาษเพื่อพลิก"
      : "ลากหน้ากระดาษเพื่อพลิก · ลากปกเพื่อปิด · ลากพื้นหลังเพื่อหมุนดู";
  detailPanel.classList.toggle("is-reading", readingOpen);
  syncPanelLayout();
  if (spreadModeButton) {
    spreadModeButton.hidden = !readingOpen;
    spreadModeButton.textContent = onePageView ? "▭ หน้าเดียว" : "▭▭ หน้าคู่";
    spreadModeButton.title = onePageView
      ? "กำลังแสดงทีละหน้า — แตะเพื่อดูสองหน้าคู่"
      : "กำลังแสดงสองหน้าคู่ — แตะเพื่ออ่านทีละหน้าให้ตัวใหญ่ขึ้น";
  }
  previousPageButton.setAttribute(
    "aria-label",
    previousDisabled ? "หน้าก่อนหน้า" : `หน้าก่อนหน้า: ${labels[currentSpread - 1]}`
  );
  nextPageButton.setAttribute(
    "aria-label",
    nextDisabled ? "หน้าถัดไป" : `หน้าถัดไป: ${labels[currentSpread + 1]}`
  );

  if (announce && activeBook && readingOpen) {
    liveRegion.textContent = `หน้า ${currentSpread + 1} จาก ${SPREAD_COUNT}: ${labels[currentSpread]}`;
  }
}

function setReadingOpen(open, announce = true) {
  if (mode !== "detail" || readingOpen === open) return;
  cancelPageDrag();
  readingOpen = open;
  if (!readingOpen) {
    currentSpread = 0;
    detailPanel.classList.remove("is-minimal"); // ปิดเล่มแล้วกลับไปดูข้อมูลเล่มตามปกติ
  }
  // เปิดเล่มเมื่อไหร่ค่อยไปดึงเนื้อหาบทมาวาด ไม่ต้องโหลดตั้งแต่ตอนเลื่อนดูบนชั้น
  if (readingOpen && activeBook) {
    /* เปิดอ่านคือมาอ่าน ไม่ได้มาดูข้อมูลเล่ม — ยุบเหลือปุ่มลอยไว้ก่อน
       ผู้ใช้เคยตั้งไว้แบบไหนก็จำไว้ */
    const saved = localStorage.getItem("ebook:readPanel") || "minimal";
    detailPanel.classList.toggle("is-minimal", saved === "minimal");
    detailPanel.classList.toggle("is-collapsed", saved !== "open");
    panelToggle?.setAttribute("aria-expanded", String(saved === "open"));
    enterReading(activeBook, activeBook.data.lastChapter || 1);
    setTimeout(() => frameOpenSpread(true), 700); // รอปกกางสุดก่อนค่อยวัดขนาด
  } else {
    camera.position.copy(inspectCameraPosition);
    controls.target.copy(inspectCameraTarget);
    controls.update();
  }
  canvas.classList.remove("has-page-hover", "has-closed-book-hover");
  updatePageControls(false);
  pointerDirty = true;

  if (announce && activeBook) {
    liveRegion.textContent = readingOpen
      ? `เปิด ${activeBook.data.title} ที่หน้าปกใน ลากหน้ากระดาษหรือกดปุ่มลูกศรเพื่อพลิกดู`
      : `ปิด ${activeBook.data.title} แล้ว ลากปกหรือแตะที่หนังสือเพื่อเปิดอีกครั้ง`;
  }
  requestFrame();
}

function turnPage(direction) {
  if (mode !== "detail" || !readingOpen) return;
  const reading = activeBook?.reading;
  if (!reading) return;

  // โหมดหน้าคู่ขยับทีละสเปรด (2 หน้า) โหมดหน้าเดียวขยับทีละหน้า
  const step = wantsOnePage() ? 1 : 2;
  const target = currentFolio() + direction * step;
  if (target < 0 || target > reading.count - 1) {
    goToChapter(direction);   // สุดบทแล้ว พลิกต่อ = ไปบทถัดไป
    return;
  }
  goToFolio(target, false);
}

function updateFlexiblePage(
  pagePivot,
  targetCurve,
  delta,
  immediate = false,
  targetTwist = 0
) {
  const flex = pagePivot.userData.flex;
  if (!flex) return;
  const settleImmediately = immediate || reducedMotion;
  const step = Math.min(delta, 0.033);
  let nextCurve = targetCurve;
  let nextTwist = targetTwist;

  if (settleImmediately) {
    flex.curveVelocity = 0;
    flex.twistVelocity = 0;
  } else {
    const curveAcceleration = (
      (targetCurve - flex.curve) * 178
      - flex.curveVelocity * 19
    );
    const twistAcceleration = (
      (targetTwist - flex.twist) * 210
      - flex.twistVelocity * 21
    );
    flex.curveVelocity = clamp(
      flex.curveVelocity + curveAcceleration * step,
      -1.8,
      1.8
    );
    flex.twistVelocity = clamp(
      flex.twistVelocity + twistAcceleration * step,
      -1.6,
      1.6
    );
    nextCurve = clamp(
      flex.curve + flex.curveVelocity * step,
      -0.025,
      0.19
    );
    nextTwist = clamp(
      flex.twist + flex.twistVelocity * step,
      -0.12,
      0.12
    );

    if (
      Math.abs(targetCurve - nextCurve) < 0.00002
      && Math.abs(flex.curveVelocity) < 0.0008
    ) {
      nextCurve = targetCurve;
      flex.curveVelocity = 0;
    }
    if (
      Math.abs(targetTwist - nextTwist) < 0.00002
      && Math.abs(flex.twistVelocity) < 0.0008
    ) {
      nextTwist = targetTwist;
      flex.twistVelocity = 0;
    }
  }

  if (
    !settleImmediately
    && Math.abs(nextCurve - flex.curve) < 0.00001
    && Math.abs(targetCurve - nextCurve) < 0.00001
    && Math.abs(nextTwist - flex.twist) < 0.00001
    && Math.abs(targetTwist - nextTwist) < 0.00001
  ) return;

  flex.curve = nextCurve;
  flex.twist = nextTwist;
  flex.surfaces.forEach((surface) => {
    const { position, base, direction, geometry } = surface;
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      const offset = vertex * 3;
      const x = base[offset];
      const y = base[offset + 1];
      const u = x + 0.5;
      const mappedU = direction > 0 ? u : 1 - u;
      const arch = Math.sin(Math.PI * mappedU);
      const freeEdgeLift = mappedU * mappedU * 0.16;
      const shape = arch * 0.84 + freeEdgeLift;
      const diagonalTwist = (
        nextTwist
        * y
        * Math.pow(mappedU, 1.35)
      );
      const softRipple = (
        nextTwist
        * Math.sin(mappedU * Math.PI * 2)
        * (1 - Math.min(1, Math.abs(y) * 1.65))
        * 0.09
      );
      const z = (
        nextCurve * shape * (1 + y * 0.14)
        + diagonalTwist
        + softRipple
      ) * direction;
      position.setXYZ(vertex, x, y, z);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
  });
}

// กระดาษยังพลิกไม่สุดหรือปกยังกางไม่สุด = ต้องวาดต่อ
function pageSettling(rig) {
  if (!rig) return false;
  const coverTarget = readingOpen ? -Math.PI + 0.055 : 0;
  if (Math.abs(rig.frontPivot.rotation.y - coverTarget) > 0.002) return true;
  return rig.pagePivots.some((pivot, index) => {
    const leafOrder = rig.pagePivots.length - 1 - index;
    if (leafOrder >= PAGINATED_LEAF_COUNT) return false;
    const turned = leafOrder < currentSpread;
    const target = turned
      ? -Math.PI + 0.085 + leafOrder * 0.014
      : -0.038 + leafOrder * 0.008;
    return Math.abs(pivot.rotation.y - target) > 0.002;
  });
}

function updatePaginatedBook(rig, delta, openAmount = 1) {
  const amount = clamp(openAmount, 0, 1);
  const speed = (reducedMotion || snapPages) ? 1000 : 10.5;
  const hoverCrack = (
    mode === "detail"
    && !readingOpen
    && detailBookHovered
    && !reducedMotion
  ) ? -0.16 : 0;
  const coverTarget = amount > 0
    ? (-Math.PI + 0.055) * amount
    : hoverCrack;

  rig.frontPivot.rotation.y = damp(
    rig.frontPivot.rotation.y,
    coverTarget,
    speed,
    delta
  );

  rig.pagePivots.forEach((pagePivot, pageIndex) => {
    const leafOrder = rig.pagePivots.length - 1 - pageIndex;
    let pageTarget = 0;
    let positionTarget = pagePivot.userData.restZ;
    let pageTwistTarget = 0;
    let dragCurveBoost = 0;
    let flexTwistTarget = 0;

    if (leafOrder < PAGINATED_LEAF_COUNT) {
      const isTurned = leafOrder < currentSpread;
      const unturnedTarget = -0.038 + leafOrder * 0.008;
      const turnedTarget = -Math.PI + 0.085 + leafOrder * 0.014;
      pageTarget = isTurned ? turnedTarget : unturnedTarget;
      positionTarget = isTurned
        ? pagePivot.userData.turnedZ
        : pagePivot.userData.restZ;

      if (pageDrag.active && pageDrag.direction !== 0) {
        const dragLeafOrder = pageDrag.direction > 0
          ? currentSpread
          : currentSpread - 1;
        if (leafOrder === dragLeafOrder) {
          const dragProgress = smoothstep(pageDrag.progress);
          const dragEnvelope = Math.sin(Math.PI * dragProgress);
          const speedResponse = clamp(
            Math.abs(pageDrag.progressVelocity) / 5.5,
            0,
            1
          );
          const signedSpeed = clamp(
            pageDrag.progressVelocity / 5.5,
            -1,
            1
          );
          pageTarget = pageDrag.direction > 0
            ? lerp(unturnedTarget, turnedTarget, dragProgress)
            : lerp(turnedTarget, unturnedTarget, dragProgress);
          positionTarget = pageDrag.direction > 0
            ? lerp(pagePivot.userData.restZ, pagePivot.userData.turnedZ, dragProgress)
            : lerp(pagePivot.userData.turnedZ, pagePivot.userData.restZ, dragProgress);
          pageTwistTarget = pageDrag.direction
            * dragEnvelope
            * (0.014 + pageDrag.verticalBias * 0.026);
          dragCurveBoost = dragEnvelope * (
            0.032
            + speedResponse * 0.064
          );
          flexTwistTarget = dragEnvelope * (
            pageDrag.verticalBias * 0.08
            + signedSpeed * pageDrag.direction * 0.03
          );
        }
      }

      pagePivot.position.z = damp(
        pagePivot.position.z,
        pagePivot.userData.restZ
          + (positionTarget - pagePivot.userData.restZ) * amount,
        speed,
        delta
      );
    } else {
      pageTarget = -0.006 + (leafOrder - PAGINATED_LEAF_COUNT) * 0.003;
      pagePivot.position.z = damp(
        pagePivot.position.z,
        pagePivot.userData.restZ,
        speed,
        delta
      );
    }

    pagePivot.rotation.y = damp(
      pagePivot.rotation.y,
      pageTarget * amount,
      speed,
      delta
    );
    pagePivot.rotation.z = damp(
      pagePivot.rotation.z,
      pageTwistTarget * amount,
      speed,
      delta
    );
    const turnProgress = clamp(
      Math.abs(pagePivot.rotation.y) / Math.PI,
      0,
      1
    );
    const curveTarget = amount > 0
      ? amount * (
          0.004
          + Math.sin(Math.PI * turnProgress) * 0.082
          + dragCurveBoost
        )
      : 0;
    updateFlexiblePage(
      pagePivot,
      curveTarget,
      delta,
      false,
      flexTwistTarget * amount
    );
  });
}

function selectMarker(index, origin) {
  if (mode !== "hero") return;
  const rounded = Math.round(targetPosition);
  const current = mod(rounded, BOOKS.length);
  let delta = index - current;
  if (delta > BOOKS.length / 2) delta -= BOOKS.length;
  if (delta < -BOOKS.length / 2) delta += BOOKS.length;
  targetPosition = rounded + delta;
  focusReturnTarget = origin;
  updateSelection(index, true);
  requestFrame();
}

function navigate(direction, origin) {
  if (mode !== "hero") return;
  targetPosition = Math.round(targetPosition) + direction;
  focusReturnTarget = origin;
  updateSelection(mod(Math.round(targetPosition), BOOKS.length), true);
  requestFrame();
}

function alignShelfToSelection() {
  const rounded = Math.round(targetPosition);
  const current = mod(rounded, BOOKS.length);
  let delta = selectedIndex - current;
  if (delta > BOOKS.length / 2) delta -= BOOKS.length;
  if (delta < -BOOKS.length / 2) delta += BOOKS.length;
  targetPosition = rounded + delta;
  position = targetPosition;
}

function snapRigToShelfSlot(rig, index) {
  let offset = index - position;
  offset -= Math.round(offset / BOOKS.length) * BOOKS.length;
  const distance = Math.abs(offset);
  const focus = 1 - clamp(distance, 0, 1);
  const fadeProgress = clamp((distance - 2.55) / 0.7, 0, 1);
  const opacity = 1 - smoothstep(fadeProgress);

  rig.root.position.set(
    offset * spacing,
    shelfBoardTop + rig.base.height * 0.5 + focus * 0.15,
    0.13 + focus * 0.24 - Math.min(distance, 2.8) * 0.07
  );
  rig.root.rotation.set(0, -offset * 0.105, -offset * 0.018);
  rig.root.scale.setScalar(1 + focus * 0.09);
  rig.motion.position.y = 0;
  rig.motion.rotation.set(0, 0, 0);
  rig.frontPivot.rotation.y = 0;
  rig.pagePivots.forEach((pagePivot) => {
    pagePivot.rotation.y = 0;
    pagePivot.rotation.z = 0;
    pagePivot.position.z = pagePivot.userData.restZ;
    updateFlexiblePage(pagePivot, 0, 0, true);
  });
  rig.opacity = opacity;
  rig.fadeMaterials.forEach((material) => {
    material.opacity = opacity;
  });
  rig.contactShadow.visible = true;
  rig.contactShadow.material.opacity = opacity * 0.24;
  rig.hit.visible = opacity > 0.12;
  rig.lastOffset = offset;
}

function setPointerFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.clientX = event.clientX;
  pointer.clientY = event.clientY;
  pointer.ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  pointerDirty = true;
}

function updateHover() {
  pointerDirty = false;
  if (mode === "detail" && activeBook) {
    setHovered(-1);
    if (readingOpen) {
      detailBookHovered = false;
      canvas.classList.remove("has-closed-book-hover");
      canvas.classList.toggle(
        "has-page-hover",
        pageDrag.active
          || Boolean(pageSurfaceAtPointer())
          || Boolean(coverSurfaceAtPointer())
      );
    } else {
      detailBookHovered = Boolean(coverSurfaceAtPointer());
      canvas.classList.remove("has-page-hover");
      canvas.classList.toggle(
        "has-closed-book-hover",
        detailBookHovered
      );
    }
    return;
  }
  detailBookHovered = false;
  canvas.classList.remove("has-page-hover", "has-closed-book-hover");
  if (mode !== "hero") {
    setHovered(-1);
    return;
  }
  setHovered(bookIndexAtPointer());
}

function bookIndexAtPointer() {
  raycaster.setFromCamera(pointer.ndc, camera);
  const hits = raycaster.intersectObjects(hitTargets, false);
  return hits.length ? hits[0].object.userData.index : -1;
}

function activeBookAtPointer() {
  if (mode !== "detail" || !activeBook) return false;
  activeBook.root.updateWorldMatrix(true, true);
  raycaster.setFromCamera(pointer.ndc, camera);
  return raycaster.intersectObject(activeBook.hit, false).length > 0;
}

function pageSurfaceAtPointer() {
  if (mode !== "detail" || !activeBook || !readingOpen) return null;
  activeBook.root.updateWorldMatrix(true, true);
  raycaster.setFromCamera(pointer.ndc, camera);
  const hits = raycaster.intersectObjects(
    activeBook.pageGestureSurfaces,
    false
  );
  return hits.length ? hits[0].object : null;
}

function coverSurfaceAtPointer() {
  if (
    mode !== "detail"
    || !activeBook
    || currentSpread !== 0
  ) return null;
  activeBook.root.updateWorldMatrix(true, true);
  raycaster.setFromCamera(pointer.ndc, camera);
  const hits = raycaster.intersectObject(activeBook.frontCover, false);
  return hits.length ? hits[0].object : null;
}

function resetPageDrag() {
  const capturedPointerId = pageDrag.pointerId;
  pageDrag.active = false;
  pageDrag.pointerId = null;
  pageDrag.progress = 0;
  pageDrag.peakProgress = 0;
  pageDrag.committed = false;
  pageDrag.progressVelocity = 0;
  pageDrag.verticalBias = 0;
  pageDrag.lastProgress = 0;
  pageDrag.lastTime = 0;
  pageDrag.direction = 0;
  pageDrag.kind = null;
  canvas.classList.remove("is-page-dragging");
  controls.enabled = mode === "detail";
  if (
    capturedPointerId !== null
    && canvas.hasPointerCapture?.(capturedPointerId)
  ) {
    canvas.releasePointerCapture(capturedPointerId);
  }
}

function applyPageReleaseImpulse(turnDirection) {
  if (!activeBook || turnDirection === 0) return;
  const leafOrder = turnDirection > 0
    ? currentSpread
    : currentSpread - 1;
  const pageIndex = activeBook.pagePivots.length - 1 - leafOrder;
  const pagePivot = activeBook.pagePivots[pageIndex];
  const flex = pagePivot?.userData.flex;
  if (!flex) return;

  const speedResponse = clamp(
    Math.abs(pageDrag.progressVelocity) / 5.5,
    0.12,
    1
  );
  flex.curveVelocity = clamp(
    flex.curveVelocity + speedResponse * 0.46,
    -1.8,
    1.8
  );
  flex.twistVelocity = clamp(
    flex.twistVelocity
      + pageDrag.verticalBias * 0.38
      + clamp(
          pageDrag.progressVelocity / 5.5,
          -1,
          1
        ) * turnDirection * 0.14,
    -1.6,
    1.6
  );
}

function settlePageDrag(commitLatchedGesture = false) {
  if (!pageDrag.active) return false;
  const turnDirection = pageDrag.direction;
  const shouldCloseCover = commitLatchedGesture
    && pageDrag.kind === "cover-close"
    && pageDrag.committed;
  const shouldOpenCover = commitLatchedGesture
    && pageDrag.kind === "cover-open"
    && pageDrag.committed;
  const shouldTurnPage = commitLatchedGesture
    && pageDrag.kind === "page"
    && pageDrag.committed
    && turnDirection !== 0;
  if (shouldTurnPage) {
    applyPageReleaseImpulse(turnDirection);
  }
  resetPageDrag();
  if (shouldCloseCover) {
    setReadingOpen(false);
  } else if (shouldOpenCover) {
    setReadingOpen(true);
  } else if (shouldTurnPage) {
    turnPage(turnDirection);
  } else {
    requestFrame();
  }
  return shouldCloseCover || shouldOpenCover || shouldTurnPage;
}

function cancelPageDrag() {
  settlePageDrag(false);
}

function resetDetailPress() {
  detailPress.active = false;
  detailPress.pointerId = null;
  detailPress.moved = false;
  detailPress.allowClick = false;
}

function onDetailBookPointerDown(event) {
  if (
    mode !== "detail"
    || readingOpen
    || event.button !== 0
    || event.isPrimary === false
  ) return;

  setPointerFromEvent(event);
  detailPress.allowClick = false;
  if (!activeBookAtPointer()) return;
  detailPress.active = true;
  detailPress.pointerId = event.pointerId;
  detailPress.startX = event.clientX;
  detailPress.startY = event.clientY;
  detailPress.moved = false;
}

function onDetailBookPointerMove(event) {
  if (!detailPress.active || event.pointerId !== detailPress.pointerId) return;
  if (
    Math.hypot(
      event.clientX - detailPress.startX,
      event.clientY - detailPress.startY
    ) > 16
  ) {
    detailPress.moved = true;
  }
}

function onDetailBookPointerEnd(event) {
  if (!detailPress.active || event.pointerId !== detailPress.pointerId) return;
  detailPress.allowClick = event.type === "pointerup" && !detailPress.moved;
  detailPress.active = false;
  detailPress.pointerId = null;
}

function onPagePointerDown(event) {
  if (
    mode !== "detail"
    || !activeBook
    || event.button !== 0
    || event.isPrimary === false
  ) return;

  setPointerFromEvent(event);
  const coverSurface = coverSurfaceAtPointer();
  const pageSurface = readingOpen ? pageSurfaceAtPointer() : null;
  if (!coverSurface && !pageSurface) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  pageDrag.active = true;
  pageDrag.pointerId = event.pointerId;
  pageDrag.startX = event.clientX;
  pageDrag.startY = event.clientY;
  pageDrag.progress = 0;
  pageDrag.peakProgress = 0;
  pageDrag.committed = false;
  pageDrag.progressVelocity = 0;
  pageDrag.verticalBias = 0;
  pageDrag.lastProgress = 0;
  pageDrag.lastTime = event.timeStamp || performance.now();
  pageDrag.direction = 0;
  pageDrag.kind = coverSurface
    ? readingOpen
      ? "cover-close"
      : "cover-open"
    : "page";
  controls.enabled = false;
  canvas.classList.add("has-page-hover", "is-page-dragging");
  canvas.setPointerCapture?.(event.pointerId);
  requestFrame();
}

function updatePageDragMotion(event, deltaY) {
  const eventTime = event.timeStamp || performance.now();
  const elapsed = clamp(
    (eventTime - pageDrag.lastTime) / 1000,
    0.008,
    0.08
  );
  const instantVelocity = clamp(
    (pageDrag.progress - pageDrag.lastProgress) / elapsed,
    -8,
    8
  );
  pageDrag.progressVelocity = lerp(
    pageDrag.progressVelocity,
    instantVelocity,
    0.42
  );
  pageDrag.verticalBias = lerp(
    pageDrag.verticalBias,
    clamp(deltaY / 180, -1, 1),
    0.36
  );
  pageDrag.lastProgress = pageDrag.progress;
  pageDrag.lastTime = eventTime;
}

function updatePageDragFromEvent(event) {
  setPointerFromEvent(event);

  const deltaX = event.clientX - pageDrag.startX;
  const deltaY = event.clientY - pageDrag.startY;
  const horizontalDistance = Math.abs(deltaX);

  if (
    pageDrag.kind === "cover-open"
    || pageDrag.kind === "cover-close"
  ) {
    const openingCover = pageDrag.kind === "cover-open";
    const signedDistance = openingCover ? -deltaX : deltaX;
    const commitProgress = openingCover
      ? COVER_OPEN_COMMIT_PROGRESS
      : COVER_CLOSE_COMMIT_PROGRESS;
    pageDrag.direction = 0;
    pageDrag.progress = (
      horizontalDistance >= 3
      && horizontalDistance >= Math.abs(deltaY) * 0.72
    )
      ? clamp(Math.max(0, signedDistance) / 140, 0, 1)
      : 0;
    pageDrag.peakProgress = Math.max(
      pageDrag.peakProgress,
      pageDrag.progress
    );
    if (pageDrag.peakProgress >= commitProgress) {
      pageDrag.committed = true;
    }
    updatePageDragMotion(event, deltaY);
    return;
  }

  if (
    horizontalDistance < 3
    || horizontalDistance < Math.abs(deltaY) * 0.72
  ) {
    pageDrag.progress = 0;
  } else {
    if (pageDrag.direction === 0 && horizontalDistance >= 6) {
      const direction = deltaX < 0 ? 1 : -1;
      const directionAvailable = direction > 0
        ? currentSpread < SPREAD_COUNT - 1
        : currentSpread > 0;
      pageDrag.direction = directionAvailable ? direction : 0;
    }

    const signedDistance = pageDrag.direction > 0 ? -deltaX : deltaX;
    pageDrag.progress = pageDrag.direction !== 0
      ? clamp(Math.max(0, signedDistance) / 150, 0, 1)
      : 0;
    pageDrag.peakProgress = Math.max(
      pageDrag.peakProgress,
      pageDrag.progress
    );
    if (pageDrag.peakProgress >= PAGE_TURN_COMMIT_PROGRESS) {
      pageDrag.committed = true;
    }
  }
  updatePageDragMotion(event, deltaY);
}

function onPagePointerMove(event) {
  if (!pageDrag.active || event.pointerId !== pageDrag.pointerId) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  updatePageDragFromEvent(event);

  requestFrame();
}

function onPagePointerEnd(event) {
  if (!pageDrag.active || event.pointerId !== pageDrag.pointerId) return;
  if (event.cancelable) event.preventDefault();
  event.stopImmediatePropagation();
  if (event.type === "pointerup") updatePageDragFromEvent(event);
  const dragKind = pageDrag.kind;
  const releaseDistance = Math.hypot(
    event.clientX - pageDrag.startX,
    event.clientY - pageDrag.startY
  );
  const shouldClickOpen = event.type === "pointerup"
    && dragKind === "cover-open"
    && !pageDrag.committed
    && releaseDistance <= 12;
  if (pageDrag.committed) {
    settlePageDrag(true);
  } else if (shouldClickOpen) {
    resetPageDrag();
    detailPress.allowClick = false;
    setReadingOpen(true);
  } else {
    if (dragKind === "cover-open") {
      detailPress.allowClick = false;
    }
    cancelPageDrag();
  }
}

function onWindowPagePointerEnd(event) {
  if (!pageDrag.active || event.pointerId !== pageDrag.pointerId) return;
  if (event.type === "pointerup") updatePageDragFromEvent(event);
  settlePageDrag(true);
}

function setHovered(index) {
  if (hoveredIndex === index) return;
  hoveredIndex = index;
  canvas.classList.toggle("has-book-hover", index >= 0);
  if (index >= 0) {
    const book = BOOKS[index];
    pointerLabelIndex.textContent = `เล่มที่ ${pad(index + 1)}`;
    pointerLabelTitle.textContent = book.title;
    pointerLabel.setAttribute("aria-hidden", "false");
  } else {
    pointerLabel.setAttribute("aria-hidden", "true");
  }
  requestFrame();
}

function positionPointerLabel() {
  pointerLabel.style.left = `${pointer.clientX}px`;
  pointerLabel.style.top = `${pointer.clientY}px`;
}

function onPointerMove(event) {
  pokeHero();
  setPointerFromEvent(event);
  positionPointerLabel();
  requestFrame();
}

function onPointerLeave() {
  pointer.ndc.set(3, 3);
  pointerDirty = false;
  detailBookHovered = false;
  setHovered(-1);
  if (!pageDrag.active) {
    canvas.classList.remove("has-page-hover", "has-closed-book-hover");
  }
}

/* ปัดนิ้วเลื่อนชั้นหนังสือ
   ต้นฉบับใช้ล้อเมาส์กับปุ่มลูกศรเป็นหลัก ซึ่งมือถือไม่มีล้อ และหนังสือ 20 เล่ม
   หมายถึงกดปุ่มถัดไป 20 ครั้ง — ปัดได้จึงจำเป็น ไม่ใช่ของแถม */
const shelfDrag = { active: false, pointerId: null, startX: 0, startY: 0, startPosition: 0, moved: false };
const SHELF_DRAG_SLOP = 10;

function onShelfPointerDown(event) {
  pokeHero();
  if (mode !== "hero" || event.button !== 0 || shelfDrag.active) return;
  shelfDrag.active = true;
  shelfDrag.pointerId = event.pointerId;
  shelfDrag.startX = event.clientX;
  shelfDrag.startY = event.clientY;
  shelfDrag.startPosition = targetPosition;
  shelfDrag.moved = false;
}

function onShelfPointerMove(event) {
  if (!shelfDrag.active || event.pointerId !== shelfDrag.pointerId) return;
  const dx = event.clientX - shelfDrag.startX;
  const dy = event.clientY - shelfDrag.startY;
  if (!shelfDrag.moved) {
    // ปัดขึ้นลงปล่อยให้เป็นการเลื่อนหน้าเว็บตามปกติ จับเฉพาะแนวนอน
    if (Math.abs(dx) < SHELF_DRAG_SLOP || Math.abs(dx) < Math.abs(dy)) return;
    shelfDrag.moved = true;
    canvas.setPointerCapture?.(event.pointerId);
  }
  // หนึ่งช่วงเล่มกินระยะประมาณ 1 ใน 4 ของความกว้างจอ
  const perBook = Math.max(90, viewWidth * 0.26);
  targetPosition = shelfDrag.startPosition - dx / perBook;
  wheelIdle = 0.14;
  requestFrame();
}

function onShelfPointerEnd(event) {
  if (!shelfDrag.active || (event && event.pointerId !== shelfDrag.pointerId)) return;
  const moved = shelfDrag.moved;
  shelfDrag.active = false;
  shelfDrag.pointerId = null;
  shelfDrag.moved = false;
  if (moved) {
    targetPosition = Math.round(targetPosition);
    wheelIdle = 0;
    // กันไม่ให้การปล่อยนิ้วหลังปัด กลายเป็นการแตะเปิดเล่ม
    suppressShelfClick = true;
    setTimeout(() => { suppressShelfClick = false; }, 60);
    requestFrame();
  }
}

let suppressShelfClick = false;

function onCanvasClick(event) {
  if (mode === "detail" && !readingOpen && event.button === 0) {
    if (!detailPress.allowClick) return;
    detailPress.allowClick = false;
    setPointerFromEvent(event);
    if (!activeBookAtPointer()) return;
    event.preventDefault();
    setReadingOpen(true);
    return;
  }
  if (mode !== "hero" || event.button !== 0 || suppressShelfClick) return;
  setPointerFromEvent(event);
  const clickedBookIndex = bookIndexAtPointer();
  if (clickedBookIndex < 0) return;
  event.preventDefault();
  selectMarker(clickedBookIndex, canvas);
  openDetail(canvas);
}

function onWheel(event) {
  pokeHero();
  if (mode !== "hero") return;
  event.preventDefault();
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  targetPosition += clamp(delta * 0.0022, -0.72, 0.72);
  wheelIdle = 0.14;
  requestFrame();
}

/* ---------- โหมดอ่านแบบ 3D ----------
   หนังสือมีกระดาษจริงแค่ 4 ใบ (8 หน้า) แต่บทหนึ่งยาวหลายสิบหน้า
   จึงทำเป็น "ชุดละ 8 หน้า" แล้วเปลี่ยนภาพบนกระดาษใบเดิมเมื่ออ่านข้ามชุด
   ภายในชุดเดียวกันพลิกได้ลื่นเหมือนหนังสือจริง ข้ามชุดถึงจะตัดภาพทีเดียว

   ข้อจำกัดที่ควรรู้: ตัวหนังสือถูกอบเป็นภาพลงกระดาษ จึงเลือก/คัดลอก/ค้นหาไม่ได้
   และโค้ด สูตรคณิต แผนภาพ mermaid จะไม่ถูกวาด — งานพวกนี้ต้องใช้หน้าอ่าน 2D */

const PAGE_FACES = PAGINATED_LEAF_COUNT * 2;
const readingCache = new Map();

/* ---------- เนื้อหาบท → บล็อกที่มีรูปแบบ ----------
   ต้นฉบับยัดทุกอย่างเป็นข้อความล้วนก้อนเดียว หัวข้อ ลิสต์ ตาราง โค้ด และกล่องหมายเหตุ
   จึงกลายเป็นย่อหน้าเหมือนกันหมด หรือหายไปเลย ที่นี่แยกเป็นบล็อกแล้ววาดตามชนิด */

const MONO = 'ui-monospace, "SF Mono", "JetBrains Mono", Consolas, "Noto Sans Thai", monospace';
const FIGURE_MAX_H = 430;
const FIGURE_GAP = 18;

const CALLOUT_LABEL = {
  note: "หมายเหตุ",
  tip: "เคล็ดลับ",
  important: "สำคัญ",
  warning: "ข้อควรระวัง",
  caution: "ระวัง"
};

function loadImageElement(src, crossOrigin) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/* รูปข้ามโดเมนที่ไม่มีหัว CORS ทำให้ canvas "เปื้อน" แล้ว WebGL ปฏิเสธเท็กซ์เจอร์ทั้งใบ
   ผลคือทั้งหน้ากลายเป็นหน้าว่าง ไม่ใช่แค่รูปหาย จึงต้องขอแบบ anonymous ก่อน */
async function loadFigureImage(src) {
  const sameOrigin = new URL(src, location.href).origin === location.origin;
  return loadImageElement(src, !sameOrigin);
}

let mermaidReady = null;

function ensureMermaid() {
  if (mermaidReady) return mermaidReady;
  mermaidReady = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "assets/mermaid.min.js";
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  }).then(() => {
    window.mermaid.initialize({
      startOnLoad: false,
      theme: "neutral",
      securityLevel: "loose",
      // ป้ายแบบ HTML อยู่ใน foreignObject ซึ่ง rasterize ลง canvas ไม่ได้
      flowchart: { htmlLabels: false },
      fontFamily: SANS
    });
    return window.mermaid;
  });
  return mermaidReady;
}

let mermaidSeq = 0;
let mermaidQueue = Promise.resolve();

/* mermaid.render ใช้สถานะภายในร่วมกัน เรียกพร้อมกันหลายอันจะชนกันเองแล้วพังเงียบ ๆ
   บทที่มีแผนภาพอันเดียวจึงดูปกติ แต่บทที่มีหลายอันจะหายไปเกือบหมด — ต้องต่อคิวทีละอัน */
function renderMermaidFigure(code) {
  const job = mermaidQueue.then(async () => {
    try {
      const mermaid = await ensureMermaid();
      mermaidSeq += 1;
      const { svg } = await mermaid.render(`shelf-mermaid-${mermaidSeq}`, code);
      return await loadImageElement(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, false);
    } catch {
      return null;
    }
  });
  mermaidQueue = job.then(() => undefined, () => undefined);
  return job;
}

function absoluteUrl(src, baseUrl) {
  try {
    return new URL(src, baseUrl || location.href).href;
  } catch {
    return src;
  }
}

/* ---------- ข้อความในบรรทัด ----------
   คืนค่าเป็น "run" ที่มีสไตล์ติดมาด้วย เพื่อให้ตัวหนากับโค้ดในบรรทัดยังเห็นต่างกัน
   (ของเดิม regex กิน `inline code` หายไปทั้งคำ) */
/* แยกข้อความหนึ่งย่อหน้าออกเป็น run ตามสไตล์
   ของเดิมใช้ regex ที่มีทางเลือกสุดท้ายเป็น [^]* ซึ่ง match ได้ตั้งแต่ตำแหน่ง 0
   ทั้งย่อหน้าจึงถูกกลืนเป็นก้อนเดียวและติดสไตล์ผิด แถมวนไม่รู้จบเมื่อสตริงว่าง
   คราวนี้สแกนด้วย regex แบบ global แล้วเก็บช่วงระหว่าง match เป็นข้อความธรรมดา */
function parseInline(src) {
  const text = String(src ?? "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\$\$([\s\S]*?)\$\$/g, (_, m) => m.trim())
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => m.trim())
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => m.trim())
    .replace(/\$(?!\d)([^$\n]{1,200})\$/g, (_, m) => m.trim())
    .replace(/<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]{0,300})?\/?>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

  const runs = [];
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\n]+)\*/g;
  let last = 0;
  let m = re.exec(text);
  while (m) {
    if (m.index > last) runs.push({ s: text.slice(last, m.index), style: "" });
    if (m[1] !== undefined) runs.push({ s: m[1], style: "code" });
    else if (m[2] !== undefined) runs.push({ s: m[2], style: "bold" });
    else if (m[3] !== undefined) runs.push({ s: m[3], style: "bold" });
    else runs.push({ s: m[4], style: "italic" });
    last = re.lastIndex;
    m = re.exec(text);
  }
  if (last < text.length) runs.push({ s: text.slice(last), style: "" });
  return runs.filter((run) => run.s !== "");
}

function runsText(runs) {
  return runs.map((r) => r.s).join("");
}

/* ---------- markdown → บล็อก ---------- */

function markdownToBlocks(src, baseUrl) {
  const lines = src.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").split(/\r?\n/);
  const blocks = [];
  let para = [];

  const flushPara = () => {
    const text = para.join(" ").replace(/\s+/g, " ").trim();
    if (text) blocks.push({ kind: "para", runs: parseInline(text) });
    para = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    const fence = line.match(/^\s*```+\s*([a-zA-Z0-9_-]*)/);
    if (fence) {
      flushPara();
      const body = [];
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i])) { body.push(lines[i]); i += 1; }
      const lang = (fence[1] || "").toLowerCase();
      if (lang === "mermaid") blocks.push({ kind: "mermaid", code: body.join("\n") });
      else blocks.push({ kind: "code", lang, lines: body });
      continue;
    }

    /* บรรทัดขีดใต้ย่อหน้าคือ "หัวข้อแบบ setext" ตามสเปก markdown ไม่ใช่เส้นคั่น
       (หน้าอ่าน 2D ใช้ marked ซึ่งตีความแบบนี้อยู่แล้ว 3D จึงต้องตรงกัน)
       และเส้นคั่นยาวกว่าสามขีดก็ยังเป็นเส้นคั่น ของเดิมจับได้เฉพาะสามขีดพอดี */
    const underline = line.match(/^\s{0,3}(=+|-{2,})\s*$/);
    if (underline && para.length) {
      const text = para.join(" ").replace(/\s+/g, " ").trim();
      para = [];
      if (text) blocks.push({ kind: "heading", level: underline[1][0] === "=" ? 1 : 2, runs: parseInline(text) });
      continue;
    }
    if (/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flushPara(); blocks.push({ kind: "rule" }); continue; }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
    if (heading) {
      flushPara();
      blocks.push({ kind: "heading", level: Math.min(3, heading[1].length), runs: parseInline(heading[2]) });
      continue;
    }

    const solo = line.match(/^\s*!\[([^\]]*)\]\(([^)\s]+)[^)]*\)\s*$/);
    if (solo) {
      flushPara();
      blocks.push({ kind: "image", src: absoluteUrl(solo[2], baseUrl), alt: solo[1] });
      continue;
    }

    // ตาราง: หัวตาราง + เส้นคั่น + แถวข้อมูล
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || "")) {
      flushPara();
      const cells = (row) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(line);
      const rows = [];
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(cells(lines[i])); i += 1; }
      i -= 1;
      blocks.push({ kind: "table", head, rows });
      continue;
    }

    if (/^\s*>/.test(line)) {
      flushPara();
      const quoted = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) { quoted.push(lines[i].replace(/^\s*>\s?/, "")); i += 1; }
      i -= 1;
      let tone = null;
      const tag = quoted[0]?.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i);
      if (tag) { tone = tag[1].toLowerCase(); quoted.shift(); }
      const text = quoted.join(" ").replace(/\s+/g, " ").trim();
      if (text || tone) blocks.push({ kind: "quote", tone, runs: parseInline(text) });
      continue;
    }

    const item = line.match(/^(\s*)(?:([-*+])|(\d+)[.)])\s+(.*)$/);
    if (item) {
      flushPara();
      const depth = Math.min(2, Math.floor(item[1].length / 2));
      const marker = item[2] ? "·" : `${item[3]}.`;
      blocks.push({ kind: "item", depth, marker, runs: parseInline(item[4]) });
      continue;
    }

    if (!line.trim()) { flushPara(); continue; }
    para.push(line);
  }
  flushPara();
  return blocks;
}

/* ---------- HTML → บล็อก ---------- */

const CALLOUT_CLASS = /(^|\s)(note|tip|warning|important|caution)(\s|$)/;

function htmlToBlocks(raw, baseUrl) {
  const doc = new DOMParser().parseFromString(raw, "text/html");
  doc.querySelectorAll("script, style, head, nav, template").forEach((el) => el.remove());
  const blocks = [];

  const pushText = (el, kind, extra) => {
    const runs = parseInline((el.textContent || "").replace(/\s+/g, " ").trim());
    if (runs.length) blocks.push({ kind, runs, ...extra });
  };

  const walk = (node, depth) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const t = child.textContent.replace(/\s+/g, " ").trim();
        if (t) blocks.push({ kind: "para", runs: parseInline(t) });
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const tag = child.tagName.toLowerCase();
      const cls = child.getAttribute("class") || "";

      if (tag === "img") {
        const src = child.getAttribute("src");
        if (src) blocks.push({ kind: "image", src: absoluteUrl(src, baseUrl), alt: child.getAttribute("alt") || "" });
        return;
      }
      if (tag === "hr") { blocks.push({ kind: "rule" }); return; }
      if (/^h[1-6]$/.test(tag)) {
        pushText(child, "heading", { level: Math.min(3, Number(tag[1])) });
        return;
      }
      if (tag === "pre") {
        if (/(^|\s)(mermaid|language-mermaid)(\s|$)/.test(cls) || /(^|\s)language-mermaid(\s|$)/.test(child.querySelector("code")?.getAttribute("class") || "")) {
          blocks.push({ kind: "mermaid", code: child.textContent || "" });
        } else {
          blocks.push({ kind: "code", lang: "", lines: (child.textContent || "").replace(/\n$/, "").split("\n") });
        }
        return;
      }
      if (tag === "table") {
        const rowCells = (tr) => [...tr.children].map((td) => (td.textContent || "").replace(/\s+/g, " ").trim());
        const rows = [...child.querySelectorAll("tr")].map(rowCells).filter((r) => r.length);
        if (rows.length) blocks.push({ kind: "table", head: rows[0], rows: rows.slice(1) });
        return;
      }
      if (tag === "li") { pushText(child, "item", { depth, marker: "·" }); return; }
      if (tag === "ul" || tag === "ol") { walk(child, Math.min(2, depth + 1)); return; }
      if (tag === "blockquote" || (tag === "div" && CALLOUT_CLASS.test(cls))) {
        const tone = (cls.match(CALLOUT_CLASS) || [])[2] || null;
        pushText(child, "quote", { tone });
        return;
      }
      if (/^(p|div|section|article|figure|figcaption|main|header|footer|td|th|tr|span|em|strong|code|a|b|i|small)$/.test(tag)) {
        if (/^(span|em|strong|code|a|b|i|small)$/.test(tag)) {
          const t = (child.textContent || "").replace(/\s+/g, " ").trim();
          if (t) blocks.push({ kind: "para", runs: parseInline(t) });
          return;
        }
        walk(child, depth);
        return;
      }
      walk(child, depth);
    });
  };

  walk(doc.body || doc, 0);

  // ย่อหน้าสั้น ๆ ที่ติดกันจาก inline element ให้รวมกลับเป็นย่อหน้าเดียว
  const merged = [];
  blocks.forEach((b) => {
    const last = merged[merged.length - 1];
    if (b.kind === "para" && last && last.kind === "para" && runsText(last.runs).length < 90) {
      last.runs = [...last.runs, { s: " ", style: "" }, ...b.runs];
    } else merged.push(b);
  });
  return merged;
}

function looksLikeHtml(raw) {
  return /^\s*(<!doctype html|<html[\s>])/i.test(raw.slice(0, 400));
}

async function loadChapterText(book, chapterNo) {
  const key = `${book.id}#${chapterNo}`;
  if (readingCache.has(key)) return readingCache.get(key);
  const job = (async () => {
    const path = book.chapterPaths[chapterNo - 1];
    if (!path) return null;
    const res = await fetch(path);
    if (!res.ok) return null;
    const raw = await res.text();
    const baseUrl = new URL(path, location.href).href;
    const isMarkdown = /\.md([?#].*)?$/i.test(path);
    const blocks = isMarkdown && !looksLikeHtml(raw)
      ? markdownToBlocks(raw, baseUrl)
      : htmlToBlocks(raw, baseUrl);

    /* โหลดรูปและ render mermaid ให้เสร็จก่อนจัดหน้า
       ถ้าปล่อยเป็น async ระหว่างวาด จะไม่รู้ว่าต้องกันที่ให้รูปสูงเท่าไร */
    await Promise.all(blocks.map(async (block) => {
      if (block.kind === "image") block.img = await loadFigureImage(block.src);
      else if (block.kind === "mermaid") { block.img = await renderMermaidFigure(block.code); block.vector = true; }
      if ((block.kind === "image" || block.kind === "mermaid") && !block.img) {
        const wasMermaid = block.kind === "mermaid";
        block.kind = "quote";
        block.tone = "note";
        block.runs = parseInline(wasMermaid
          ? "แผนภาพนี้วาดในหนังสือไม่ได้ — เปิดในหน้าอ่าน 2D"
          : `รูปนี้โหลดมาวาดไม่ได้${block.alt ? ` (${block.alt})` : ""} — เปิดในหน้าอ่าน 2D`);
      }
    }));

    return blocks.length ? blocks : null;
  })().catch(() => null);
  readingCache.set(key, job);
  return job;
}

/* ---------- จัดหน้า ----------
   ทุกบล็อกถูกแปลงเป็น "แถว" ที่รู้ความสูงและวาดตัวเองได้ การจัดหน้าจึงเป็นแค่การหยิบแถว
   ใส่หน้าจนเต็ม แถวที่มีกรอบ (โค้ด/กล่องหมายเหตุ) จะจำกลุ่มไว้ เพื่อวาดพื้นหลังคลุมเฉพาะ
   ส่วนที่ตกอยู่บนหน้านั้น — โค้ดยาวข้ามหน้าจึงยังมีกรอบต่อเนื่องทั้งสองหน้า */

/* ขนาดตัวอักษรใช้ค่าเดียวกับหน้าอ่าน 2D (ebook:fontSize) จะได้ไม่ต้องตั้งสองที่
   17 คือค่ากลาง ปรับได้ 14–26 แล้วสเกลทั้งชุดตามกัน */
const BASE_READER_FONT = 17;

function readerFontSize() {
  const value = parseInt(localStorage.getItem("ebook:fontSize"), 10);
  return value >= 14 && value <= 26 ? value : BASE_READER_FONT;
}

function fontScale() {
  return readerFontSize() / BASE_READER_FONT;
}

const STYLE_BASE = {
  body: { size: 19, lh: 27 },
  h1: { size: 28, lh: 36, before: 20, after: 10 },
  h2: { size: 24, lh: 31, before: 18, after: 8 },
  h3: { size: 20, lh: 27, before: 14, after: 6 },
  code: { size: 14, lh: 20, pad: 12 },
  table: { size: 14, lh: 19, pad: 8 },
  gap: 14
};

let STYLE = STYLE_BASE;

function applyFontScale() {
  const k = fontScale();
  const scale = (group, keys) => {
    const out = { ...STYLE_BASE[group] };
    keys.forEach((key) => { out[key] = Math.round(STYLE_BASE[group][key] * k); });
    return out;
  };
  STYLE = {
    body: scale("body", ["size", "lh"]),
    h1: scale("h1", ["size", "lh"]),
    h2: scale("h2", ["size", "lh"]),
    h3: scale("h3", ["size", "lh"]),
    code: scale("code", ["size", "lh"]),
    table: scale("table", ["size", "lh"]),
    gap: STYLE_BASE.gap
  };
}

applyFontScale();

let measureCanvas = null;

function measureContext() {
  if (!measureCanvas) measureCanvas = document.createElement("canvas").getContext("2d");
  return measureCanvas;
}

function fontFor(style, size, weight) {
  if (style === "code") return `${size - 3}px ${MONO}`;
  if (style === "bold") return `700 ${size}px ${SERIF}`;
  if (style === "italic") return `italic ${size}px ${SERIF}`;
  return `${weight || 400} ${size}px ${SERIF}`;
}

// ตัดบรรทัดโดยยังคงสไตล์ของแต่ละชิ้นไว้ (ต่างจาก wrapToWidth ที่รับข้อความล้วน)
function wrapRuns(runs, maxWidth, size, weight) {
  const ctx = measureContext();
  const lines = [];
  let line = [];
  let width = 0;

  runs.forEach((run) => {
    const font = fontFor(run.style, size, weight);
    ctx.font = font;
    segmentText(run.s).forEach((piece) => {
      const w = ctx.measureText(piece).width;
      if (width + w > maxWidth && line.length && piece.trim()) {
        lines.push(line);
        line = [];
        width = 0;
      }
      if (!line.length && !piece.trim()) return;
      line.push({ s: piece, font, w });
      width += w;
    });
  });
  if (line.length) lines.push(line);
  return lines.length ? lines : [[]];
}

function drawRunLine(ctx, pieces, x, y) {
  let cursor = x;
  pieces.forEach((piece) => {
    ctx.font = piece.font;
    ctx.fillText(piece.s, cursor, y);
    cursor += piece.w;
  });
}

function figureBox(img, vector) {
  const maxWidth = PAGE_W - 36;
  const limit = vector ? 4 : 1;
  const scale = Math.min(maxWidth / img.naturalWidth, FIGURE_MAX_H / img.naturalHeight, limit);
  return { w: Math.round(img.naturalWidth * scale), h: Math.round(img.naturalHeight * scale) };
}

let groupSeq = 0;

// บล็อกหนึ่งอัน → แถวหลายแถว
function blockRows(block) {
  const M = PAGE_M;
  const COL = PAGE_COL;
  const rows = [];
  // keepNext = ต้องมีแถวที่วาดได้ตามหลังอยู่หน้าเดียวกันอย่างน้อยกี่แถว
  const push = (h, draw, group, keepNext, text) => rows.push({ h, draw, group, keepNext, text });

  // ย่อหน้าที่ยาวหลายบรรทัด: ห้ามทิ้งบรรทัดแรกไว้ท้ายหน้า และห้ามให้บรรทัดสุดท้ายไปโดดหน้าใหม่
  const pushLines = (lines, h, drawLine, group) => {
    lines.forEach((pieces, index) => {
      const keep = lines.length > 1 && (index === 0 || index === lines.length - 2) ? 1 : 0;
      const chars = pieces.reduce((n, piece) => n + piece.s.length, 0);
      push(h, (ctx, y) => drawLine(pieces, index, ctx, y), group, keep, chars);
    });
  };

  if (block.kind === "heading") {
    const st = block.level === 1 ? STYLE.h1 : block.level === 2 ? STYLE.h2 : STYLE.h3;
    push(st.before, null);
    wrapRuns(block.runs, COL, st.size, 600).forEach((pieces) => {
      push(st.lh, (ctx, y) => { ctx.globalAlpha = 1; drawRunLine(ctx, pieces, M, y + st.size * 0.78); }, null, 2,
        pieces.reduce((n, piece) => n + piece.s.length, 0));
    });
    push(st.after, null);
    return rows;
  }

  if (block.kind === "para") {
    pushLines(wrapRuns(block.runs, COL, STYLE.body.size), STYLE.body.lh, (pieces, _i, ctx, y) => {
      ctx.globalAlpha = 1;
      drawRunLine(ctx, pieces, M, y + STYLE.body.size);
    });
    push(STYLE.gap, null);
    return rows;
  }

  if (block.kind === "item") {
    const indent = 24 + block.depth * 22;
    // จุดนำห้ามอยู่คนละหน้ากับข้อความของข้อนั้น
    pushLines(wrapRuns(block.runs, COL - indent, STYLE.body.size), STYLE.body.lh, (pieces, index, ctx, y) => {
      ctx.globalAlpha = 1;
      if (index === 0) {
        ctx.font = `500 ${Math.round(15 * fontScale())}px ${SANS}`;
        ctx.fillText(block.marker, M + block.depth * 22, y + STYLE.body.size - 1);
      }
      drawRunLine(ctx, pieces, M + indent, y + STYLE.body.size);
    });
    push(6, null);
    return rows;
  }

  if (block.kind === "quote") {
    groupSeq += 1;
    const group = { id: groupSeq, deco: "quote", tone: block.tone };
    const indent = 22;
    push(STYLE.code.pad, null, group);
    if (block.tone) {
      push(24, (ctx, y) => {
        ctx.globalAlpha = 0.95;
        ctx.font = `600 13px ${SANS}`;
        ctx.fillText(CALLOUT_LABEL[block.tone] || block.tone, M + indent, y + 15);
      }, group, 1);
    }
    pushLines(wrapRuns(block.runs, COL - indent - 12, STYLE.body.size - 2), STYLE.body.lh - 3, (pieces, _i, ctx, y) => {
      ctx.globalAlpha = 0.96;
      drawRunLine(ctx, pieces, M + indent, y + STYLE.body.size - 2);
    }, group);
    push(STYLE.code.pad, null, group);
    push(STYLE.gap, null);
    return rows;
  }

  if (block.kind === "code") {
    groupSeq += 1;
    const group = { id: groupSeq, deco: "code" };
    const ctx = measureContext();
    ctx.font = `${STYLE.code.size}px ${MONO}`;
    const inner = COL - 24;
    const wrapped = [];
    block.lines.forEach((line) => {
      let rest = line.replace(/\t/g, "  ");
      if (!rest.trim()) { wrapped.push(""); return; }
      while (rest.length) {
        let cut = rest.length;
        while (cut > 1 && ctx.measureText(rest.slice(0, cut)).width > inner) cut -= 1;
        wrapped.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
    });
    push(STYLE.code.pad, null, group);
    wrapped.forEach((text, index) => {
      push(STYLE.code.lh, (c, y) => {
        c.globalAlpha = 0.96;
        c.font = `${STYLE.code.size}px ${MONO}`;
        c.fillText(text, M + 12, y + STYLE.code.size + 1);
      }, group, index === 0 && wrapped.length > 1 ? 1 : 0, text.length);
    });
    push(STYLE.code.pad, null, group);
    push(STYLE.gap, null);
    return rows;
  }

  if (block.kind === "table") {
    groupSeq += 1;
    const group = { id: groupSeq, deco: "table" };
    const ctx = measureContext();
    const all = [block.head, ...block.rows];
    const columns = block.head.length || 1;

    /* ความกว้างคอลัมน์คิดตามสัดส่วนของเนื้อหา แต่หน้ากระดาษกว้างเท่าเดิมเสมอ
       พอผู้อ่านเร่งขนาดตัวอักษร คำเดียวอาจกว้างเกินช่องแล้วล้นไปทับคอลัมน์ข้าง ๆ
       (wrapToWidth ตัดได้แค่ระหว่างคำ) จึงย่อเฉพาะตารางนั้นลงจนทุกคำพอดีช่อง */
    const layoutAt = (size) => {
      ctx.font = `${size}px ${SANS}`;
      const raw = block.head.map((_, index) =>
        Math.max(...all.map((row) => ctx.measureText(row[index] || "").width)));
      const total = raw.reduce((sum, w) => sum + w, 0) || 1;
      const widths = raw.map((w) => Math.max(56, (w / total) * (PAGE_COL - columns * 12)));
      const scale = PAGE_COL / (widths.reduce((s, w) => s + w, 0) + columns * 12);
      const finalWidths = widths.map((w) => w * scale);
      const fits = all.every((row) => {
        ctx.font = `${row === block.head ? 600 : 400} ${size}px ${SANS}`;
        return block.head.every((_, index) => segmentText(String(row[index] ?? "").trim())
          .every((piece) => ctx.measureText(piece.trim()).width <= finalWidths[index] - 6));
      });
      return { finalWidths, fits };
    };

    let size = STYLE.table.size;
    let layout = layoutAt(size);
    while (!layout.fits && size > 11) {
      size -= 1;
      layout = layoutAt(size);
    }
    const finalWidths = layout.finalWidths;
    const lh = Math.max(size + 5, Math.round(STYLE.table.lh * (size / STYLE.table.size)));

    const drawRow = (row, head) => {
      const cells = row.map((text, index) =>
        wrapToWidth(Object.assign(ctx, { font: `${head ? 600 : 400} ${size}px ${SANS}` }), text, finalWidths[index] - 6, 3));
      const height = Math.max(...cells.map((c) => c.length)) * lh + STYLE.table.pad * 2;
      push(height, (c, y) => {
        c.globalAlpha = head ? 0.14 : 0.05;
        c.fillRect(PAGE_M, y, PAGE_COL, height);
        c.globalAlpha = 1;
        c.font = `${head ? 600 : 400} ${size}px ${SANS}`;
        let x = PAGE_M + 6;
        cells.forEach((lines, index) => {
          lines.forEach((line, li) => c.fillText(line, x, y + STYLE.table.pad + size + 1 + li * lh));
          x += finalWidths[index];
        });
        c.globalAlpha = 0.25;
        c.fillRect(PAGE_M, y + height - 1, PAGE_COL, 1);
      }, group, head ? 1 : 0, row.join("").length);
    };
    drawRow(block.head, true);
    // หน้าที่ตารางไหลต่อ ต้องมีหัวตารางซ้ำ ไม่งั้นดูไม่ออกว่าคอลัมน์ไหนคืออะไร
    group.headRow = rows[rows.length - 1];
    block.rows.forEach((row) => drawRow(row, false));
    push(STYLE.gap, null);
    return rows;
  }

  if (block.kind === "rule") {
    push(28, (ctx, y) => {
      ctx.globalAlpha = 0.28;
      ctx.fillRect(PAGE_M + PAGE_COL * 0.3, y + 14, PAGE_COL * 0.4, 1);
    });
    return rows;
  }

  if (block.kind === "image" || block.kind === "mermaid") {
    const box = figureBox(block.img, block.vector);
    push(box.h + FIGURE_GAP, (ctx, y) => {
      ctx.globalAlpha = 1;
      try {
        ctx.drawImage(block.img, (PAGE_W - box.w) / 2, y + FIGURE_GAP / 2, box.w, box.h);
      } catch {
        ctx.globalAlpha = 0.6;
        ctx.fillText("[ รูปภาพ — ดูในหน้าอ่าน 2D ]", PAGE_M, y + 20);
      }
    });
    push(STYLE.gap, null);
    return rows;
  }

  return rows;
}

// วาดกรอบของกลุ่ม (โค้ด/กล่องหมายเหตุ) เฉพาะช่วงที่อยู่บนหน้านี้
function drawGroupDecor(ctx, group, top, bottom, ink) {
  ctx.save();
  if (group.deco === "code") {
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = ink;
    ctx.fillRect(PAGE_M, top, PAGE_COL, bottom - top);
    ctx.globalAlpha = 0.3;
    ctx.fillRect(PAGE_M, top, 3, bottom - top);
  } else if (group.deco === "quote") {
    ctx.globalAlpha = group.tone ? 0.06 : 0.04;
    ctx.fillStyle = ink;
    ctx.fillRect(PAGE_M, top, PAGE_COL, bottom - top);
    ctx.globalAlpha = group.tone === "warning" || group.tone === "caution" ? 0.55 : 0.35;
    ctx.fillRect(PAGE_M, top, 4, bottom - top);
  }
  ctx.restore();
}

/* จุดตัดหน้าที่ "ไม่ควรตัด" — เช่นหัวตารางค้างท้ายหน้าแล้วข้อมูลไปเริ่มหน้าถัดไป
   หรือหัวข้อโดดอยู่บรรทัดสุดท้าย หรือย่อหน้าเหลือบรรทัดเดียวข้ามหน้า
   ไล่ย้อนจากจุดตัดกลับมาหาแถวที่สั่ง keepNext ไว้ แล้วนับว่ามีแถวตามหลังพออยู่หน้าเดียวกันไหม */
function badBreak(rows, from, at) {
  for (let i = at - 1; i >= from; i -= 1) {
    const row = rows[i];
    if (!row.draw) continue;              // ช่องว่างไม่นับ
    const need = row.keepNext || 0;
    if (!need) return false;
    let have = 0;
    for (let j = i + 1; j < at; j += 1) if (rows[j].draw) have += 1;
    return have < need;
  }
  return false;
}

function paginateChapter(blocks, chapterNo, chapterTitle) {
  const rows = [];
  blocks.forEach((block) => {
    const made = blockRows(block);
    /* รูปกับแผนภาพต้องอยู่หน้าเดียวกับประโยคที่เกริ่นถึงมัน
       ("...แล้วระบบจะวาดเป็นแผนภาพให้:" แล้วแผนภาพไปโผล่หน้าถัดไป อ่านแล้วสะดุด) */
    if ((block.kind === "image" || block.kind === "mermaid") && rows.length) {
      for (let i = rows.length - 1; i >= 0; i -= 1) {
        if (rows[i].draw) { rows[i].keepNext = Math.max(rows[i].keepNext || 0, 1); break; }
      }
    }
    rows.push(...made);
  });

  const firstBudget = TEXT_BOTTOM - 250;
  const fullBudget = TEXT_BOTTOM - TEXT_TOP;
  const pages = [];
  let cursor = 0;

  while (cursor < rows.length) {
    const first = pages.length === 0;
    const budget = first ? firstBudget : fullBudget;
    const start = cursor;
    let used = 0;
    while (cursor < rows.length) {
      const row = rows[cursor];
      if (used + row.h > budget) {
        if (cursor === start) cursor += 1;   // แถวเดียวสูงเกินหน้า ยอมให้ล้น
        break;
      }
      used += row.h;
      cursor += 1;
    }

    /* เลื่อนจุดตัดขึ้นมาจนกว่าจะไม่ผ่ากลางของที่ต้องอยู่ด้วยกัน
       แต่ถ้าถอยจนหน้านี้แทบไม่เหลืออะไร ให้ยอมตัดตามเดิมดีกว่าได้หน้าโล่ง ๆ */
    const filled = cursor;
    let guard = rows.length;
    while (cursor > start + 1 && badBreak(rows, start, cursor) && guard > 0) {
      cursor -= 1;
      guard -= 1;
    }
    const drawableLeft = rows.slice(start, cursor).filter((row) => row.draw).length;
    if (drawableLeft < 2 && filled > cursor) cursor = filled;

    const slice = rows.slice(start, cursor);
    // อย่าให้หน้าขึ้นต้นด้วยช่องว่างเปล่า ๆ
    while (slice.length && !slice[0].draw && !slice[0].group) slice.shift();

    /* ขึ้นหน้าใหม่กลางตาราง = เติมหัวตารางซ้ำให้ แล้วถอยแถวท้ายออกเท่าที่จำเป็น
       ไม่งั้นหน้านั้นจะเป็นตัวเลขลอย ๆ ไม่รู้ว่าคอลัมน์ไหนคืออะไร */
    const firstRow = slice[0];
    if (firstRow?.group?.deco === "table" && firstRow.group.headRow && firstRow !== firstRow.group.headRow) {
      const head = firstRow.group.headRow;
      slice.unshift(head);
      let total = slice.reduce((sum, row) => sum + row.h, 0);
      while (total > budget && slice.length > 2) {
        total -= slice[slice.length - 1].h;
        slice.pop();
        cursor -= 1;
      }
    }
    pages.push({
      kind: "text",
      chapterNo,
      heading: first ? chapterTitle : null,
      runningHead: `บทที่ ${pad(chapterNo)}`,
      rows: slice
    });
  }
  return pages.length ? pages : [{ kind: "text", chapterNo, heading: chapterTitle, rows: [] }];
}

// วาดแถวทั้งหมดของหน้า พร้อมกรอบของกลุ่มที่คร่อมอยู่
function drawPageRows(ctx, rows, startY, ink) {
  let y = startY;
  let run = null;
  const flushRun = () => {
    if (run) drawGroupDecor(ctx, run.group, run.top, run.bottom, ink);
    run = null;
  };
  // วาดพื้นหลังกลุ่มก่อน แล้วค่อยวาดตัวหนังสือทับ
  let probe = startY;
  rows.forEach((row) => {
    if (row.group) {
      if (run && run.group.id === row.group.id) run.bottom = probe + row.h;
      else { flushRun(); run = { group: row.group, top: probe, bottom: probe + row.h }; }
    } else flushRun();
    probe += row.h;
  });
  flushRun();

  rows.forEach((row) => {
    if (row.draw) row.draw(ctx, y);
    y += row.h;
  });
  ctx.globalAlpha = 1;
}

function buildReadingSpecs(book, chapterNo, pages) {
  const hasSecondToc = book.chapterTitles.length > TOC_PER_PAGE;
  const nextTitle = book.chapterTitles[chapterNo];
  const specs = [
    { kind: "title" },
    { kind: "toc", from: 0 },
    hasSecondToc ? { kind: "toc", from: TOC_PER_PAGE } : { kind: "progress" },
    ...pages,
    {
      kind: "end",
      heading: `จบบทที่ ${chapterNo}`,
      note: nextTitle
        ? `บทถัดไป — ${nextTitle}\nกด "บทถัดไป" เพื่ออ่านต่อในเล่ม หรือกด "อ่านแบบ 2D" เพื่อค้นหาและคัดลอกข้อความ`
        : 'บทสุดท้ายของเล่มแล้ว กด "อ่านแบบ 2D" เพื่อกลับไปหน้าอ่านปกติ'
    },
    { kind: "colophon" }
  ];
  /* กระดาษมีแปดหน้าเสมอ ชุดสุดท้ายจึงต้องเติมหน้าเปล่าไม่ให้ค้างภาพหน้าเก่า
     แต่หน้าเติมพวกนี้ไม่ใช่หน้าของบท — count คือจำนวนหน้าจริงที่พลิกไปถึงได้
     ของเดิมนับรวมเข้าไปด้วย ผู้ใช้จึงพลิกไปเจอหน้าโล่ง ๆ ท้ายบท */
  specs.count = specs.length;
  while (specs.length % PAGE_FACES !== 0) specs.push({ kind: "blank" });
  return specs;
}

function disposeReadingTextures(rig) {
  (rig.readingTextures || []).forEach((texture) => texture?.dispose());
  rig.readingTextures = [];
}

function disposeLazyTextures(rig) {
  (rig.lazyTextures || []).forEach((texture) => texture?.dispose());
  rig.lazyTextures = [];
}

function renderReadingBatch(rig, batch) {
  const book = rig.data;
  const specs = rig.reading.specs;
  const total = Math.ceil((rig.reading.count || specs.length) / facesPerBatch());
  const next = clamp(batch, 0, total - 1);
  disposeReadingTextures(rig);
  rig.readingTextures = [];

  const onePage = wantsOnePage();
  for (let face = 0; face < PAGE_FACES; face += 1) {
    const material = rig.interiorPageMaterials[face];
    if (!material) continue;
    // โหมดหน้าคู่ไม่ใช้หน้าแรก/หน้าสุดท้ายของกระดาษชุดนี้
    const used = onePage || (face > 0 && face < PAGE_FACES - 1);
    const folio = used ? folioAt(next, face) : -1;
    const spec = (folio >= 0 && specs[folio]) || { kind: "blank" };
    const texture = makeInteriorPageTexture(book, spec, folio);
    rig.readingTextures.push(texture);
    material.map = texture;
    material.needsUpdate = true;
  }

  rig.reading.batch = next;
  rig.reading.batches = total;
  requestFrame();
}

/* สร้างภาพที่ใช้เฉพาะตอนหยิบเล่มออกมาดู — เรียกครั้งเดียวต่อเล่ม
   นี่คือส่วนที่ทำให้หน่วยความจำ GPU ไม่บวมตามจำนวนหนังสือบนชั้น */
function ensureInspectAssets(rig) {
  if (rig.inspectReady) return;
  rig.inspectReady = true;
  const book = rig.data;

  const back = makeBackCoverTexture(book);
  const backFoil = makeBackFoilTexture(book);
  const backEmboss = makeEmbossMap(backFoil, `${book.id}-back-foil-emboss`);
  const endpaper = makeEndpaperTexture(book);

  rig.backArt.map = back;
  rig.backArt.color.setHex(0xffffff);
  rig.backArt.needsUpdate = true;
  rig.backFoilArt.map = backFoil;
  rig.backFoilArt.alphaMap = backFoil;
  rig.backFoilArt.bumpMap = backEmboss;
  rig.backFoilArt.needsUpdate = true;
  rig.endpaperMaterial.map = endpaper;
  rig.endpaperMaterial.needsUpdate = true;

  rig.lazyTextures = [back, backFoil, backEmboss, endpaper];
  requestFrame();
}

// หน้าในแบบ "เปิดดูเฉย ๆ" ใช้ตอนดึงเนื้อหาบทไม่สำเร็จ
function renderBrowsePages(rig) {
  const specs = browsePageSpecs(rig.data);
  disposeReadingTextures(rig);
  rig.readingTextures = [];
  specs.forEach((spec, face) => {
    const material = rig.interiorPageMaterials[face];
    if (!material) return;
    const texture = makeInteriorPageTexture(rig.data, spec, face);
    rig.readingTextures.push(texture);
    material.map = texture;
    material.needsUpdate = true;
  });
  requestFrame();
}

async function enterReading(rig, chapterNo) {
  const book = rig.data;
  const no = clamp(chapterNo, 1, Math.max(1, book.chapterPaths.length));
  /* เปิดเล่มเดิมซ้ำ: เนื้อหาโหลดไว้แล้วก็จริง แต่ openDetail รีเซ็ต currentSpread เป็น 0
     ซึ่งเป็นสเปรดที่โหมดหน้าคู่ไม่ได้ใช้ (หน้าซ้ายเป็นใบรองปก หน้าขวาเป็นกระดาษเปล่า)
     จึงต้องพากลับไปหน้าที่ค้างไว้ทุกครั้ง ไม่ใช่ return เฉย ๆ */
  if (rig.reading && rig.reading.chapterNo === no) {
    renderReadingBatch(rig, Math.floor((rig.reading.folio || 0) / facesPerBatch()));
    goToFolio(rig.reading.folio || 0, true);
    window.dispatchEvent(new CustomEvent("shelf:reading", { detail: { chapter: no } }));
    return true;
  }

  readingBusy = true;
  updatePageControls(false);
  if (loadingText && !loading.hidden) loadingText.textContent = "กำลังดึงเนื้อหาบท…";
  const blocks = await loadChapterText(book, no);
  readingBusy = false;
  if (loadingText && !loading.hidden) loadingText.textContent = "กำลังจัดหน้ากระดาษ…";
  // ระหว่างรอโหลด ผู้ใช้อาจปิดเล่มหรือเปลี่ยนไปเล่มอื่นแล้ว
  if (activeBook !== rig) return false;
  if (!blocks) {
    /* ดึงเนื้อหาไม่ได้ (ไฟล์หาย/รูปแบบอ่านไม่ออก) ก็ยังต้องมีสถานะการอ่านอยู่
       ไม่งั้น rig.reading = null ค้าง แล้วปุ่มพลิกหน้ากับเปลี่ยนบทตายทั้งหมด */
    const fallback = browsePageSpecs(book);
    fallback.count = fallback.length;
    while (fallback.length % PAGE_FACES !== 0) fallback.push({ kind: "blank" });
    rig.reading = {
      chapterNo: no,
      title: book.chapterTitles[no - 1] || `บทที่ ${no}`,
      specs: fallback,
      count: fallback.count,
      batch: 0,
      batches: 1,
      folio: 0,
      failed: true
    };
    renderReadingBatch(rig, 0);
    goToFolio(0, true);
    updatePageControls(false);
    window.dispatchEvent(new CustomEvent("shelf:reading", { detail: { chapter: no, failed: true } }));
    return true;
  }

  const pages = paginateChapter(blocks, no, book.chapterTitles[no - 1] || `บทที่ ${no}`);
  const specs = buildReadingSpecs(book, no, pages);
  rig.reading = {
    chapterNo: no,
    title: book.chapterTitles[no - 1] || `บทที่ ${no}`,
    specs,
    count: specs.count || specs.length,   // ไม่รวมหน้าเติมท้ายชุด
    batch: 0,
    batches: 1,
    folio: 0
  };
  /* หน้าแรกสุด (ปกใน) เป็นสเปรดหน้าเดียวโดยโครงสร้างของเล่ม — กระดาษยังไม่ถูกพลิกสักใบ
     เปิดมาแล้วจึงพาไปที่สเปรดแรกที่มีเนื้อหาจริงเลย จะได้เห็นสองหน้าคู่ทันที
     ปกใน/สารบัญยังพลิกย้อนกลับไปดูได้ */
  const firstText = rig.reading.specs.findIndex((spec) => spec.kind === "text");
  const landing = firstText > 0 ? firstText : 1;
  renderReadingBatch(rig, 0);
  goToFolio(landing, true);
  updatePageControls(false);
  window.dispatchEvent(new CustomEvent("shelf:reading", { detail: { chapter: no } }));
  return true;
}

/* หน้าที่ f ของชุด อยู่ในสเปรดไหน ฝั่งไหน
   สเปรดแรกมีแต่หน้าขวา สเปรดสุดท้ายมีแต่หน้าซ้าย ที่เหลือมีสองหน้า */
function faceToPosition(face) {
  if (face <= 0) return { spread: 0, side: 1 };
  if (face >= PAGE_FACES - 1) return { spread: SPREAD_COUNT - 1, side: -1 };
  return { spread: Math.ceil(face / 2), side: face % 2 === 1 ? -1 : 1 };
}

// หน้าที่กำลังหงายอยู่ตรงหน้าผู้อ่านตอนนี้
function currentFace() {
  if (currentSpread <= 0) return 0;
  if (currentSpread >= SPREAD_COUNT - 1) return PAGE_FACES - 1;
  return readingFocus > 0 ? currentSpread * 2 : currentSpread * 2 - 1;
}

// โหมดหน้าคู่ยังลงที่สเปรดที่มีสองหน้าเหมือนเดิม
function spreadForFace(face) {
  if (face <= 0) return 1;
  if (face >= PAGE_FACES - 1) return SPREAD_COUNT - 1;
  return Math.floor((face + 1) / 2);
}

/* ---------- เดินหน้าอ่านด้วย "เลขหน้า" ไม่ใช่ "สเปรด" ----------
   กระดาษมี 8 หน้า แต่หน้าแรกกับหน้าสุดท้ายของชุดจะเห็นตอนสเปรดแรก/สุดท้ายเท่านั้น
   ซึ่งเป็นสเปรดที่มีหน้าเดียว (อีกฝั่งเป็นใบรองปก) โหมดหน้าคู่จึงใช้แค่ 6 หน้ากลาง
   เพื่อไม่ให้เจอหน้าขวาว่างเปล่าทุก ๆ 8 หน้า ส่วนโหมดหน้าเดียวใช้ครบทั้ง 8 */
function facesPerBatch() {
  return wantsOnePage() ? PAGE_FACES : 6;
}

function folioAt(batch, face) {
  return wantsOnePage()
    ? batch * PAGE_FACES + face
    : batch * 6 + (face - 1);
}

// หน้าซ้ายสุดที่กำลังมองอยู่
function currentFolio() {
  const rig = activeBook;
  const batch = rig?.reading?.batch || 0;
  if (wantsOnePage()) return folioAt(batch, currentFace());
  // โหมดหน้าคู่ใช้สเปรด 1–3 เท่านั้น ค่าที่หลุดออกไปแปลว่าสถานะค้างจากโหมดอื่น
  const spread = clamp(currentSpread, 1, SPREAD_COUNT - 2);
  return folioAt(batch, spread * 2 - 1);
}

function positionForFolio(folio) {
  const per = facesPerBatch();
  const batch = Math.max(0, Math.floor(folio / per));
  const offset = folio - batch * per;
  if (wantsOnePage()) {
    const at = faceToPosition(offset);
    return { batch, spread: at.spread, side: at.side };
  }
  const face = offset + 1;                       // 1..6
  return { batch, spread: Math.ceil(face / 2), side: face % 2 === 1 ? -1 : 1 };
}

function goToFolio(folio, snap) {
  const rig = activeBook;
  if (!rig?.reading) return false;
  const target = clamp(folio, 0, rig.reading.count - 1);
  const at = positionForFolio(target);
  if (at.batch >= rig.reading.batches) return false;
  if (at.batch !== rig.reading.batch) {
    renderReadingBatch(rig, at.batch);
    snap = true;
  }
  currentSpread = at.spread;
  readingFocus = at.side;
  rig.reading.folio = target;
  if (snap) snapPages = true;
  updatePageControls(true);
  requestFrame();
  /* กรอบกล้องวัดจากตำแหน่งจริงของกระดาษ ถ้าวัดตอนใบยังขยับไม่เสร็จจะได้กล่องผิดใบ
     (เคยเล็งไปโดนใบรองปกเต็มจอ) — วัดซ้ำอีกรอบหลังทุกอย่างเข้าที่ */
  setTimeout(() => frameOpenSpread(!!snap), snap ? 90 : 380);
  setTimeout(() => frameOpenSpread(true), 460);
  return true;
}

function readingFolioRange() {
  const rig = activeBook;
  const reading = rig?.reading;
  if (!reading) {
    const base = 0;
    if (currentSpread === 0) return [base, base];
    if (currentSpread === SPREAD_COUNT - 1) return [base + PAGE_FACES - 1, base + PAGE_FACES - 1];
    return [base + currentSpread * 2 - 1, base + currentSpread * 2];
  }
  const last = reading.count - 1;
  const left = Math.min(currentFolio(), last);
  if (wantsOnePage()) return [left, left];
  const right = Math.min(left + 1, last);
  return [left, right];
}

/* เปลี่ยนขนาดตัวอักษร = จำนวนบรรทัดต่อหน้าเปลี่ยน ต้องจัดหน้าใหม่ทั้งบท
   เนื้อหาถูกแคชไว้แล้วจึงไม่ต้องโหลดซ้ำ และคงตำแหน่งที่อ่านค้างไว้ตามสัดส่วน */
async function relayoutReading() {
  const rig = activeBook;
  if (!rig?.reading || rig.reading.failed) return;
  const no = rig.reading.chapterNo;
  const ratio = rig.reading.count > 1 ? rig.reading.folio / (rig.reading.count - 1) : 0;
  const blocks = await loadChapterText(rig.data, no);
  if (!blocks || activeBook !== rig) return;

  const pages = paginateChapter(blocks, no, rig.reading.title);
  const specs = buildReadingSpecs(rig.data, no, pages);
  rig.reading.specs = specs;
  rig.reading.count = specs.count || specs.length;
  rig.reading.batches = Math.ceil(rig.reading.count / facesPerBatch());
  const folio = clamp(Math.round(ratio * (rig.reading.count - 1)), 0, rig.reading.count - 1);
  renderReadingBatch(rig, Math.floor(folio / facesPerBatch()));
  goToFolio(folio, true);
  updatePageControls(false);
}

function setReaderFontSize(next) {
  const size = clamp(next, 14, 26);
  if (size === readerFontSize()) return;
  localStorage.setItem("ebook:fontSize", String(size));
  applyFontScale();
  if (fontSizeLabel) fontSizeLabel.textContent = `${size}`;
  if (activeBook?.reading) relayoutReading();
  else if (activeBook) renderBrowsePages(activeBook);
}

let switchingChapter = false;

async function switchChapter(target, landOnLastPage) {
  const rig = activeBook;
  // กดรัว ๆ ตอนบทกำลังโหลด จะทำให้สองรอบชนกันแล้วสถานะพัง
  if (!rig?.reading || switchingChapter) return false;
  if (target < 1 || target > rig.data.chapterPaths.length) return false;
  if (target === rig.reading.chapterNo) return false;

  switchingChapter = true;
  syncChapterList(rig.data);
  const previous = rig.reading;
  rig.reading = null;
  try {
    const ok = await enterReading(rig, target);
    if (!ok || activeBook !== rig) {
      rig.reading = rig.reading || previous;   // เข้าบทใหม่ไม่ได้ ให้กลับไปสถานะเดิม
      updatePageControls(false);
      return false;
    }
    // ถอยกลับ = ควรไปโผล่ที่หน้าสุดท้ายของบทก่อนหน้า ไม่ใช่หน้าแรก
    if (landOnLastPage) goToFolio(rig.reading.count - 1, true);
    rig.data.lastChapter = target;
    populateDetail(rig.data);
    updatePageControls(true);
    return true;
  } finally {
    switchingChapter = false;
    syncChapterList(rig.data);
  }
}

async function goToChapter(direction) {
  const rig = activeBook;
  if (!rig?.reading) return;
  await switchChapter(rig.reading.chapterNo + direction, direction < 0);
}

/* เลือกบทจากสารบัญได้ตรง ๆ — จากบทที่ 1 ไปบทที่ 4 ไม่ต้องกด "บทถัดไป" สามครั้ง
   ถ้ายังไม่ได้เปิดอ่าน ให้ถือว่าเลือกบทแล้วเปิดเล่มไปที่บทนั้นเลย */
async function jumpToChapter(no) {
  const rig = activeBook;
  if (!rig || switchingChapter) return;
  const target = clamp(Math.round(no), 1, rig.data.chapterPaths.length);
  if (!readingOpen || !rig.reading) {
    rig.data.lastChapter = target;
    setReadingOpen(true);
    return;
  }
  await switchChapter(target, false);
}

function syncChapterList(book) {
  if (!chapterSelect || !book) return;
  const titles = book.chapterTitles || [];
  const signature = `${book.id}:${titles.length}`;
  if (chapterSelect.dataset.book !== signature) {
    chapterSelect.textContent = "";
    titles.forEach((title, index) => {
      const option = document.createElement("option");
      option.value = String(index + 1);
      option.textContent = `บทที่ ${index + 1} — ${title}`;
      chapterSelect.append(option);
    });
    chapterSelect.dataset.book = signature;
  }
  const current = (activeBook?.data === book && activeBook.reading?.chapterNo)
    || book.lastChapter
    || 1;
  const value = String(clamp(current, 1, titles.length || 1));
  if (chapterSelect.value !== value) chapterSelect.value = value;
  chapterSelect.disabled = titles.length < 2 || switchingChapter;
}

function openDetail(origin = inspectButton) {
  if (mode !== "hero") return;
  mode = "opening";
  transitionTime = 0;
  readingOpen = false;
  detailBookHovered = false;
  currentSpread = 0;
  resetDetailPress();
  focusReturnTarget = origin === canvas
    ? markers.children[selectedIndex] || inspectButton
    : origin instanceof HTMLElement
      ? origin
      : inspectButton;
  activeBook = bookRigs[selectedIndex];
  ensureInspectAssets(activeBook);
  shadowDirty = true;
  activeBook.contactShadow.visible = false;
  refreshProgress(activeBook.data);
  populateDetail(activeBook.data);
  updatePageControls(false);
  detailPanel.inert = false;
  detailPanel.setAttribute("aria-hidden", "false");
  browseUi.inert = true;
  experience.classList.add("mode-detail", "is-opening");
  pointerLabel.setAttribute("aria-hidden", "true");
  setHovered(-1);

  activeBook.root.updateWorldMatrix(true, true);
  activeBook.root.matrixWorld.decompose(
    openingBookPosition,
    openingBookQuaternion,
    openingBookScale
  );
  openingCameraPosition.copy(camera.position);
  openingCameraTarget.copy(transitionCameraTarget);
  openingShelfPosition.copy(shelfStage.position);
  openingMotionPosition.copy(activeBook.motion.position);
  openingMotionQuaternion.copy(activeBook.motion.quaternion);
  openingViewOffsetX = currentViewOffsetX;
  scene.add(activeBook.root);
  activeBook.root.position.copy(openingBookPosition);
  activeBook.root.quaternion.copy(openingBookQuaternion);
  activeBook.root.scale.copy(openingBookScale);
  applyDetailViewOffset();
  controls.enabled = false;
  liveRegion.textContent = `กำลังหยิบ ${activeBook.data.title} ออกมาดู ลากปกหรือแตะที่หนังสือเพื่อเปิด`;

  if (reducedMotion) {
    finishOpening();
  }
  requestFrame();
}

function applyOpeningPose(progress) {
  const eased = smootherstep(clamp(progress, 0, 1));
  const shelfClearEased = smootherstep(clamp(progress / 0.68, 0, 1));
  inspectBookScale.setScalar(getInspectScale());
  shelfStage.position.lerpVectors(
    openingShelfPosition,
    inspectShelfPosition,
    shelfClearEased
  );
  activeBook.root.position.lerpVectors(
    openingBookPosition,
    inspectPosition,
    eased
  );
  activeBook.root.quaternion.slerpQuaternions(
    openingBookQuaternion,
    inspectBookQuaternion,
    eased
  );
  activeBook.root.scale.lerpVectors(
    openingBookScale,
    inspectBookScale,
    eased
  );
  activeBook.motion.position.lerpVectors(
    openingMotionPosition,
    restingMotionPosition,
    eased
  );
  activeBook.motion.quaternion.slerpQuaternions(
    openingMotionQuaternion,
    restingMotionQuaternion,
    eased
  );
  camera.position.lerpVectors(
    openingCameraPosition,
    inspectCameraPosition,
    eased
  );
  transitionCameraTarget.lerpVectors(
    openingCameraTarget,
    inspectCameraTarget,
    eased
  );
  currentViewOffsetX = lerp(openingViewOffsetX, detailViewOffsetX, eased);
  applyDetailViewOffset();
  camera.lookAt(transitionCameraTarget);
}

function finishOpening() {
  if (!activeBook) return;
  applyOpeningPose(1);
  mode = "detail";
  transitionTime = 1;
  controls.target.copy(inspectCameraTarget);
  controls.enabled = true;
  controls.enableDamping = !reducedMotion;
  controls.update();
  updatePageControls(false);
  experience.classList.remove("is-opening");
  // เล่มที่หยิบออกมาถูกย้ายออกจาก shelfStage แล้ว ที่เหลือไม่มีใครเห็น
  shelfStage.visible = false;
  if (pendingReadChapter) {
    const chapter = pendingReadChapter;
    pendingReadChapter = 0;
    activeBook.data.lastChapter = clamp(chapter, 1, activeBook.data.chapterCount || 1);
    setReadingOpen(true, false);
  } else {
    closeButton.focus({ preventScroll: true });
  }
}

function closeDetail() {
  shelfStage.visible = true;
  if (mode !== "detail") return;
  cancelPageDrag();
  resetDetailPress();
  mode = "closing";
  transitionTime = 0;
  readingOpen = false;
  detailBookHovered = false;
  currentSpread = 0;
  canvas.classList.remove("has-page-hover", "has-closed-book-hover");
  updatePageControls(false);
  controls.enabled = false;
  closingBookStartPosition.copy(activeBook.root.position);
  closingBookStartQuaternion.copy(activeBook.root.quaternion);
  closingBookStartScale.copy(activeBook.root.scale);
  closingMotionPosition.copy(activeBook.motion.position);
  closingMotionQuaternion.copy(activeBook.motion.quaternion);
  closingCameraPosition.copy(camera.position);
  closingCameraTarget.copy(controls.target);
  closingShelfPosition.copy(shelfStage.position);
  closingViewOffsetX = currentViewOffsetX;
  transitionCameraTarget.copy(closingCameraTarget);
  experience.classList.remove("is-opening");
  alignShelfToSelection();
  closingBookPosition.set(
    0,
    shelfBoardTop + activeBook.base.height * 0.5 + 0.15,
    0.37
  );
  bookRigs.forEach((rig, index) => {
    if (rig !== activeBook && rig.root.parent === shelfStage) {
      snapRigToShelfSlot(rig, index);
    }
  });
  experience.classList.remove("mode-detail");
  detailPanel.setAttribute("aria-hidden", "true");
  detailPanel.inert = true;
  liveRegion.textContent = `กำลังเก็บ ${activeBook.data.title} กลับขึ้นชั้น`;
  if (reducedMotion) {
    finishClosing();
  }
  requestFrame();
}

function applyClosingPose(progress) {
  const eased = smootherstep(clamp(progress, 0, 1));
  const shelfReturnEased = smootherstep(
    clamp((progress - 0.24) / 0.76, 0, 1)
  );
  shelfStage.position.lerpVectors(
    closingShelfPosition,
    shelfRestPosition,
    shelfReturnEased
  );
  activeBook.root.position.lerpVectors(
    closingBookStartPosition,
    closingBookPosition,
    eased
  );
  activeBook.root.quaternion.slerpQuaternions(
    closingBookStartQuaternion,
    closingBookQuaternion,
    eased
  );
  activeBook.root.scale.lerpVectors(
    closingBookStartScale,
    closingBookScale,
    eased
  );
  activeBook.motion.position.lerpVectors(
    closingMotionPosition,
    restingMotionPosition,
    eased
  );
  activeBook.motion.quaternion.slerpQuaternions(
    closingMotionQuaternion,
    restingMotionQuaternion,
    eased
  );
  camera.position.lerpVectors(
    closingCameraPosition,
    shelfCameraPosition,
    eased
  );
  transitionCameraTarget.lerpVectors(
    closingCameraTarget,
    shelfCameraTarget,
    eased
  );
  currentViewOffsetX = lerp(closingViewOffsetX, 0, eased);
  applyDetailViewOffset();
  camera.lookAt(transitionCameraTarget);
}

function finishClosing() {
  if (!activeBook) return;
  applyClosingPose(1);
  shelfStage.attach(activeBook.root);
  snapRigToShelfSlot(activeBook, selectedIndex);
  activeBook.contactShadow.visible = true;
  controls.target.copy(shelfCameraTarget);
  browseUi.inert = false;
  mode = "hero";
  transitionTime = 0;
  activeBook = null;
  liveRegion.textContent = `${BOOKS[selectedIndex].title} กลับขึ้นชั้นแล้ว`;
  requestAnimationFrame(() => focusReturnTarget?.focus?.({ preventScroll: true }));
}

/* จอแนวตั้ง: หนังสือที่กางออกกว้างกว่าจอ ขอบซ้ายเลยโดนตัดหาย
   วัดขอบเขตจริงของเล่มแล้วถอยกล้องให้พอดีทั้งสเปรด (ยังซูมเองต่อได้) */
const readingBox = new THREE.Box3();
const readingSize = new THREE.Vector3();
const readingCenter = new THREE.Vector3();
const framingPosition = new THREE.Vector3();
const framingTarget = new THREE.Vector3();
let framingActive = false;
const pageBox = new THREE.Box3();
const pageSize = new THREE.Vector3();
const pageCenter = new THREE.Vector3();

// แผ่นกระดาษที่หงายอยู่ฝั่งที่กำลังอ่าน: ฝั่งขวาคือใบแรกที่ยังไม่ถูกพลิก ฝั่งซ้ายคือใบบนสุดที่พลิกไปแล้ว
function visiblePageBox(rig) {
  const leaves = rig.pagePivots.length;
  let leafOrder = readingFocus > 0 ? currentSpread : currentSpread - 1;
  if (leafOrder >= PAGINATED_LEAF_COUNT) leafOrder = currentSpread - 1;
  if (leafOrder < 0) leafOrder = 0;
  const pivot = rig.pagePivots[leaves - 1 - leafOrder];
  if (!pivot) return null;
  pageBox.setFromObject(pivot);
  return pageBox.isEmpty() ? null : pageBox;
}

let readingFocus = 1; // 1 = เล็งหน้าขวา, -1 = หน้าซ้าย — ตามทิศที่เพิ่งพลิก

// "auto" = ตัดสินจากขนาดจอ, "one"/"two" = ผู้ใช้สั่งเอง
let spreadPreference = localStorage.getItem("ebook:shelf3dSpread") || "auto";

function wantsOnePage() {
  if (spreadPreference === "one") return true;
  if (spreadPreference === "two") return false;
  /* จอแนวตั้งกางสองหน้าคู่แล้วเสียความสูงไปครึ่งจอเสมอ เพราะสเปรดกว้างกว่าสูง
     กรอบจึงถูกจำกัดด้วยความกว้าง ตัวหนังสือเล็กทั้งที่ยังมีที่เหลืออีกเยอะ
     — แนวตั้งอ่านทีละหน้าคุ้มกว่า (กดปุ่ม "หน้าคู่" บังคับได้ถ้าไม่ชอบ) */
  return isPortraitLayout();
}

function setSpreadPreference(value) {
  // จำหน้าที่อ่านค้างไว้ก่อน เพราะการแบ่งหน้าต่อชุดของสองโหมดไม่เท่ากัน
  const folio = activeBook?.reading ? currentFolio() : -1;
  spreadPreference = value;
  localStorage.setItem("ebook:shelf3dSpread", value);
  if (folio >= 0) {
    const rig = activeBook;
    rig.reading.batches = Math.ceil(rig.reading.count / facesPerBatch());
    renderReadingBatch(rig, Math.floor(folio / facesPerBatch()));
    goToFolio(folio, true);   // จัดกรอบกล้องให้เองแล้ว
    updatePageControls(false);
    return;
  }
  updatePageControls(false);
  if (!frameOpenSpread(true)) resetInspectionView();
}

function frameOpenSpread(instant = false) {
  if (mode !== "detail" || !activeBook || !readingOpen) return false;
  const onePage = wantsOnePage();

  /* เดิมจอกว้างแนวนอนใช้กรอบมาตรฐานที่เยื้องหนังสือไปทางซ้ายให้พ้นแผง
     แต่ตอนอ่านแผงย้ายไปอยู่ล่างจอแล้ว หนังสือจึงควรได้ความกว้างทั้งหมด
     กรอบที่วัดจากขนาดจริงของเล่มใช้ได้กับทุกขนาดจอ */
  if (currentViewOffsetX !== 0) {
    currentViewOffsetX = 0;
    applyDetailViewOffset();
  }

  readingBox.setFromObject(activeBook.root);
  if (readingBox.isEmpty()) return false;
  readingBox.getSize(readingSize);
  readingBox.getCenter(readingCenter);

  /* มือถือแนวตั้ง: สเปรดสองหน้าเล็กจนอ่านไม่ออก เล็งทีละหน้าตามทิศที่พลิกไป
     วัดจากแผ่นกระดาษที่กำลังหงายอยู่จริง ไม่ใช่ครึ่งหนึ่งของกล่องทั้งเล่ม
     เพราะปกแข็งยื่นเลยขอบกระดาษ ครึ่งกล่องจึงไม่เท่ากับหนึ่งหน้า */
  let frameWidth = readingSize.x;
  let centerX = readingCenter.x;
  if (onePage) {
    const page = visiblePageBox(activeBook);
    if (page) {
      page.getSize(pageSize);
      page.getCenter(pageCenter);
      frameWidth = pageSize.x;
      centerX = pageCenter.x;
    } else {
      frameWidth = readingSize.x * 0.6;
      centerX = readingCenter.x + readingFocus * readingSize.x * 0.21;
    }
  }

  /* แผงรายละเอียดกินพื้นที่ล่างจอ ถ้าจัดหนังสือกลางจอเต็ม ๆ หน้ากระดาษจะไปกองอยู่
     หลังแผงครึ่งหนึ่ง — วัดพื้นที่ว่างจริงแล้ววางหนังสือกลางพื้นที่นั้นแทน */
  const panelTop = detailPanel.getBoundingClientRect().top;
  const freeBottom = panelTop > 80 ? Math.min(panelTop - 8, viewHeight) : viewHeight;
  // ใต้แถบเครื่องมือด้านบน — จอสัมผัสปุ่มสูง 44px จอเมาส์เตี้ยกว่า
  const freeTop = LOW_POWER ? 78 : 58;
  const freeHeight = Math.max(160, freeBottom - freeTop);

  const fovY = THREE.MathUtils.degToRad(camera.fov);
  const fovX = 2 * Math.atan(Math.tan(fovY * 0.5) * camera.aspect);
  const distance = Math.max(
    (frameWidth * 1.1) / (2 * Math.tan(fovX * 0.5)),
    // สูงเท่าพื้นที่ว่าง ไม่ใช่เท่าความสูงจอ จึงต้องถอยกล้องเพิ่มตามสัดส่วน
    (((onePage ? pageSize.y || readingSize.y : readingSize.y) * 1.03) / (2 * Math.tan(fovY * 0.5)))
      * (viewHeight / freeHeight)
  );

  const worldPerPixel = (2 * distance * Math.tan(fovY * 0.5)) / viewHeight;
  const centerY = (onePage && pageSize.y ? pageCenter.y : readingCenter.y)
    - worldPerPixel * (viewHeight * 0.5 - (freeTop + freeBottom) * 0.5);

  framingPosition.set(centerX, centerY, inspectPosition.z + distance);
  framingTarget.set(centerX, centerY, inspectPosition.z);

  if (instant || reducedMotion) {
    camera.position.copy(framingPosition);
    controls.target.copy(framingTarget);
    controls.enabled = true;
    controls.update();
    framingActive = false;
  } else {
    framingActive = true;
  }
  requestFrame();
  return true;
}

/* กล้องต้องไถลไปหาปลายทาง ไม่ใช่กระโดดไปทันที
   ตอนสลับจากหน้าขวาไปหน้าซ้ายของสเปรดเดียวกัน กระดาษไม่ได้พลิก
   ถ้ากล้องตัดภาพเลยจะเห็นเป็นการกระพริบ ไม่รู้ว่าย้ายไปทางไหน */
function updateFraming(delta) {
  if (!framingActive) return false;
  /* ระหว่างไถลต้องปิด OrbitControls ไว้ก่อน มันคำนวณตำแหน่งกล้องใหม่จาก target ทุกเฟรม
     แล้วบีบระยะ/มุมตาม min-maxDistance ของมันเอง กล้องเลยไปไม่ถึงปลายทาง
     หน้ากระดาษจึงเลื่อนมาแค่บางส่วนแล้วค้าง */
  controls.enabled = false;
  const speed = 7.5;
  camera.position.x = damp(camera.position.x, framingPosition.x, speed, delta);
  camera.position.y = damp(camera.position.y, framingPosition.y, speed, delta);
  camera.position.z = damp(camera.position.z, framingPosition.z, speed, delta);
  controls.target.x = damp(controls.target.x, framingTarget.x, speed, delta);
  controls.target.y = damp(controls.target.y, framingTarget.y, speed, delta);
  controls.target.z = damp(controls.target.z, framingTarget.z, speed, delta);

  // หางของ exponential ยาวมาก ตัดจบตอนที่ขยับต่อไม่ถึงหนึ่งพิกเซลแล้ว
  if (
    camera.position.distanceToSquared(framingPosition) < 0.00002
    && controls.target.distanceToSquared(framingTarget) < 0.00002
  ) {
    camera.position.copy(framingPosition);
    controls.target.copy(framingTarget);
    framingActive = false;
    controls.enabled = true;
  }
  camera.lookAt(controls.target);
  return true;
}

function resetInspectionView() {
  if (mode !== "detail") return;
  if (frameOpenSpread()) {
    liveRegion.textContent = `รีเซ็ตมุมมองของ ${BOOKS[selectedIndex].title} แล้ว`;
    return;
  }
  camera.position.copy(inspectCameraPosition);
  controls.target.copy(inspectCameraTarget);
  controls.update();
  liveRegion.textContent = `รีเซ็ตมุมมองของ ${BOOKS[selectedIndex].title} แล้ว`;
  requestFrame();
}

function updateShelfLayout(delta, elapsed) {
  if (mode === "hero") {
    position = reducedMotion
      ? targetPosition
      : damp(position, targetPosition, 9.5, delta);
    if (Math.abs(position - targetPosition) < 0.0005) position = targetPosition;

    if (wheelIdle > 0) {
      wheelIdle -= delta;
      if (wheelIdle <= 0) targetPosition = Math.round(targetPosition);
    }

    const nearest = mod(Math.round(position), BOOKS.length);
    if (nearest !== selectedIndex) updateSelection(nearest, false);
  }

  bookRigs.forEach((rig, index) => {
    if (rig.root.parent !== shelfStage) return;

    let offset = index - position;
    offset -= Math.round(offset / BOOKS.length) * BOOKS.length;
    const distance = Math.abs(offset);
    const wrappedAcrossSeam = rig.lastOffset !== null
      && Math.abs(offset - rig.lastOffset) > BOOKS.length * 0.5;
    const focus = 1 - clamp(distance, 0, 1);
    const targetX = offset * spacing;
    const targetY = shelfBoardTop + rig.base.height * 0.5 + focus * 0.15;
    const targetZ = 0.13 + focus * 0.24 - Math.min(distance, 2.8) * 0.07;
    const targetRotationY = -offset * 0.105;
    const targetRotationZ = -offset * 0.018;
    const targetScale = 1 + focus * 0.09;
    const speed = reducedMotion ? 1000 : 12;

    if (wrappedAcrossSeam) {
      rig.root.position.x = targetX;
      rig.opacity = 0;
    }
    rig.lastOffset = offset;

    rig.root.position.x = damp(rig.root.position.x, targetX, speed, delta);
    rig.root.position.y = damp(rig.root.position.y, targetY, speed, delta);
    rig.root.position.z = damp(rig.root.position.z, targetZ, speed, delta);
    rig.root.rotation.y = damp(rig.root.rotation.y, targetRotationY, speed, delta);
    rig.root.rotation.z = damp(rig.root.rotation.z, targetRotationZ, speed, delta);
    const nextScale = damp(rig.root.scale.x, targetScale, speed, delta);
    rig.root.scale.setScalar(nextScale);

    const fadeProgress = clamp((distance - 2.55) / 0.7, 0, 1);
    const targetOpacity = 1 - smoothstep(fadeProgress);
    rig.opacity = reducedMotion
      ? targetOpacity
      : damp(rig.opacity, targetOpacity, 18, delta);
    rig.fadeMaterials.forEach((material) => {
      material.opacity = rig.opacity;
    });
    rig.contactShadow.visible = true;
    rig.contactShadow.material.opacity = rig.opacity * 0.24;
    rig.hit.visible = rig.opacity > 0.12;

    const isHovered = hoveredIndex === index && mode === "hero";
    const hoverPreview = isHovered && !reducedMotion;
    const hoverAngle = hoverPreview ? -0.085 : 0;
    rig.frontPivot.rotation.y = damp(
      rig.frontPivot.rotation.y,
      hoverAngle,
      reducedMotion ? 1000 : 13,
      delta
    );
    rig.pagePivots.forEach((pagePivot) => {
      pagePivot.rotation.y = damp(
        pagePivot.rotation.y,
        0,
        reducedMotion ? 1000 : 13,
        delta
      );
      pagePivot.rotation.z = damp(
        pagePivot.rotation.z,
        0,
        reducedMotion ? 1000 : 13,
        delta
      );
      updateFlexiblePage(pagePivot, 0, delta);
    });

    const idle = (reducedMotion || performance.now() > heroActiveUntil)
      ? 0
      : Math.sin(elapsed * 0.72 + index * 0.8) * 0.012 * focus;
    rig.motion.position.y = damp(rig.motion.position.y, idle + (hoverPreview ? 0.035 : 0), 9, delta);
    rig.motion.rotation.x = damp(
      rig.motion.rotation.x,
      hoverPreview ? pointer.ndc.y * 0.035 : 0,
      10,
      delta
    );
    rig.motion.rotation.y = damp(
      rig.motion.rotation.y,
      hoverPreview ? -pointer.ndc.x * 0.035 : 0,
      10,
      delta
    );
  });
}

function updateTransition(delta) {
  if (mode === "opening") {
    transitionTime = Math.min(
      1,
      transitionTime + delta / DETAIL_TRANSITION_DURATION
    );
    applyOpeningPose(transitionTime);
    updatePaginatedBook(activeBook, delta, 0);
    if (transitionTime >= 1) finishOpening();
  } else if (mode === "closing") {
    transitionTime = Math.min(
      1,
      transitionTime + delta / SHELF_TRANSITION_DURATION
    );
    applyClosingPose(transitionTime);
    updatePaginatedBook(activeBook, delta, 0);
    if (transitionTime >= 1) finishClosing();
  } else if (mode === "hero") {
    shelfStage.position.y = damp(shelfStage.position.y, 0, 10, delta);
    shelfStage.position.z = damp(shelfStage.position.z, 0, 10, delta);
    camera.position.x = damp(camera.position.x, shelfCameraPosition.x, 8, delta);
    camera.position.y = damp(camera.position.y, shelfCameraPosition.y, 8, delta);
    camera.position.z = damp(camera.position.z, shelfCameraPosition.z, 8, delta);
    transitionCameraTarget.copy(shelfCameraTarget);
    currentViewOffsetX = 0;
    applyDetailViewOffset();
    camera.lookAt(shelfCameraTarget);
  }
}

function updateDust(elapsed) {
  if (reducedMotion) return;
  const dust = scene.getObjectByName("paper-dust");
  if (dust) {
    dust.rotation.y = elapsed * 0.012;
    dust.position.y = Math.sin(elapsed * 0.17) * 0.025;
  }
}

function requestFrame() {
  if (!rafId && !suspended) {
    renderer.shadowMap.needsUpdate = true;
    rafId = requestAnimationFrame(frame);
  }
}

function getDetailOpenAmount() {
  if (pageDrag.active && pageDrag.kind === "cover-open") {
    return smoothstep(pageDrag.progress);
  }
  if (!readingOpen) return 0;
  if (pageDrag.active && pageDrag.kind === "cover-close") {
    return 1 - smoothstep(pageDrag.progress);
  }
  return 1;
}

function frame(time) {
  rafId = 0;
  const delta = Math.min((time - lastTime) / 1000, 0.05);
  const elapsed = time / 1000;
  lastTime = time;

  if (pointerDirty) updateHover();
  updateShelfLayout(delta, elapsed);
  updateTransition(delta);
  updateDust(elapsed);
  const themeIsMoving = updateTheme(delta);

  if (mode === "detail") {
    if (pageDrag.active) {
      pageDrag.progressVelocity = damp(
        pageDrag.progressVelocity,
        0,
        9,
        delta
      );
    }
    // ไถลกล้องอยู่ = อย่าให้ controls.update() มาแก้ตำแหน่งซ้อน
    if (!updateFraming(delta)) controls.update();
    updatePaginatedBook(activeBook, delta, getDetailOpenAmount());
  }

  /* ต้นฉบับวาดต่อเนื่อง 60fps ตลอดเวลา เพราะมีหนังสือลอยขยับกับฝุ่นในอากาศ
     บนมือถือแปลว่า GPU ทำงานเต็มที่ตลอดที่เปิดหน้าไว้ เครื่องร้อนแล้วโดนหรี่ความเร็ว
     — นั่นคืออาการ "กระตุก" ที่แท้จริง ตอนอ่านหนังสือฉากนิ่งสนิทอยู่แล้ว จึงหยุดวาดได้ */
  const shelfMoving = Math.abs(position - targetPosition) > 0.0005 || wheelIdle > 0;
  const pagesSettling = mode === "detail" && (pageDrag.active || pageSettling(activeBook));
  const idleAnimation = mode === "hero" && !reducedMotion && time < heroActiveUntil + 1500;
  const geometryMoving = idleAnimation
    || mode === "opening"
    || mode === "closing"
    || shelfMoving
    || pagesSettling
    || themeIsMoving;

  // เงาเปลี่ยนก็ต่อเมื่อวัตถุขยับ กล้องไถลอย่างเดียวไม่ต้องคำนวณเงาใหม่
  renderer.shadowMap.needsUpdate = geometryMoving || shadowDirty;
  shadowDirty = false;
  renderer.render(scene, camera);
  snapPages = false;

  const cameraSettling = mode === "detail" && time < controlsActiveUntil;
  const shouldContinue = geometryMoving || framingActive || cameraSettling;
  if (shouldContinue && !suspended) requestFrame();
}

function resize() {
  viewWidth = window.innerWidth;
  viewHeight = window.innerHeight;
  configureResponsiveTargets();
  renderer.setSize(viewWidth, viewHeight, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, viewWidth < 820 ? 1.5 : 2));
  camera.aspect = viewWidth / viewHeight;
  camera.updateProjectionMatrix();
  shadowDirty = true;

  if (mode === "hero") {
    camera.position.copy(shelfCameraPosition);
    transitionCameraTarget.copy(shelfCameraTarget);
    currentViewOffsetX = 0;
    applyDetailViewOffset();
    camera.lookAt(shelfCameraTarget);
  } else if (mode === "detail" && activeBook) {
    activeBook.root.position.copy(inspectPosition);
    activeBook.root.scale.setScalar(getInspectScale());
    transitionCameraTarget.copy(inspectCameraTarget);
    currentViewOffsetX = detailViewOffsetX;
    applyDetailViewOffset();
    if (!frameOpenSpread(true)) resetInspectionView();
    updatePageControls(false); // คำแนะนำใต้ปุ่มเปลี่ยนตามแนวตั้ง/แนวนอน
  }
  requestFrame();
}

function onKeyDown(event) {
  if (event.key === "Escape" && mode === "detail") {
    event.preventDefault();
    closeDetail();
    return;
  }

  if (
    mode === "detail"
    && !event.metaKey
    && !event.ctrlKey
    && !event.altKey
    && (event.key === "ArrowLeft" || event.key === "ArrowRight")
  ) {
    event.preventDefault();
    turnPage(event.key === "ArrowLeft" ? -1 : 1);
    return;
  }

  if (mode === "detail" && event.key === "Tab") {
    const focusables = [
      closeButton,
      toggleBookButton,
      previousPageButton,
      nextPageButton,
      resetButton
    ].filter((element) => !element.disabled);
    const current = focusables.indexOf(document.activeElement);
    const next = event.shiftKey
      ? (current <= 0 ? focusables.length - 1 : current - 1)
      : (current >= focusables.length - 1 ? 0 : current + 1);
    event.preventDefault();
    focusables[next].focus();
    return;
  }

  if (mode !== "hero" || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    navigate(-1, document.activeElement);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    navigate(1, document.activeElement);
  } else if ((event.key === "Enter" || event.key === " ") && document.activeElement === inspectButton) {
    event.preventDefault();
    openDetail(inspectButton);
  }
}

/* ฉากวาดต่อเนื่องตลอดเวลาเพราะมีหนังสือลอยขยับกับฝุ่นในอากาศ
   พอสลับไปมุมมองตาราง canvas ถูกซ่อนแต่ยังวาดอยู่ — กินแบตฟรี ๆ จึงต้องหยุด */
let viewInactive = false;

function syncSuspended() {
  const next = document.hidden || viewInactive;
  if (next === suspended) return;
  suspended = next;
  if (suspended) {
    settlePageDrag(true);
    resetDetailPress();
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  } else {
    lastTime = performance.now();
    requestFrame();
  }
}

function onVisibilityChange() {
  syncSuspended();
}

function onWindowBlur() {
  settlePageDrag(true);
  resetDetailPress();
}

function onReducedMotionChange(event) {
  cancelPageDrag();
  resetDetailPress();
  reducedMotion = event.matches;
  controls.enableDamping = !reducedMotion;
  if (reducedMotion) {
    position = targetPosition;
  }
  requestFrame();
}

/* ตกลงมาที่ชั้นหนังสือแบบตาราง — หน้าแรกต้องใช้งานได้แม้เครื่องไม่มี WebGL
   ไม่ใช่ขึ้นจอเปล่า */
function showFallback(message) {
  loading.hidden = true;
  experience.classList.remove("webgl-ready");
  document.body.classList.add("no-webgl");
  if (fallbackStatus) fallbackStatus.textContent = message;
  window.dispatchEvent(new CustomEvent("shelf:fallback"));
}

function handleContextLost(event) {
  event.preventDefault();
  cancelPageDrag();
  resetDetailPress();
  suspended = true;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  showFallback("การ์ดจอหยุดวาดฉาก 3D ชั่วคราว — โหลดหน้าใหม่เพื่อกลับไปดูชั้นหนังสือ");
}

function disposeExperience() {
  suspended = true;
  cancelPageDrag();
  resetDetailPress();
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;

  canvas.removeEventListener("pointermove", onPointerMove);
  canvas.removeEventListener("pointerleave", onPointerLeave);
  canvas.removeEventListener("click", onCanvasClick);
  canvas.removeEventListener("pointerdown", onDetailBookPointerDown, true);
  canvas.removeEventListener("pointermove", onDetailBookPointerMove, true);
  canvas.removeEventListener("pointerup", onDetailBookPointerEnd, true);
  canvas.removeEventListener("pointercancel", onDetailBookPointerEnd, true);
  canvas.removeEventListener("lostpointercapture", onDetailBookPointerEnd, true);
  canvas.removeEventListener("pointerdown", onPagePointerDown, true);
  canvas.removeEventListener("pointermove", onPagePointerMove, true);
  canvas.removeEventListener("pointerup", onPagePointerEnd, true);
  canvas.removeEventListener("pointercancel", onPagePointerEnd, true);
  canvas.removeEventListener("lostpointercapture", onPagePointerEnd, true);
  window.removeEventListener("pointerup", onWindowPagePointerEnd);
  window.removeEventListener("pointercancel", onWindowPagePointerEnd);
  experience.removeEventListener("wheel", onWheel);
  canvas.removeEventListener("webglcontextlost", handleContextLost);
  window.removeEventListener("resize", resize);
  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("blur", onWindowBlur);
  document.removeEventListener("visibilitychange", onVisibilityChange);
  reducedMotionQuery.removeEventListener("change", onReducedMotionChange);

  controls?.dispose();
  scene?.traverse((object) => {
    object.geometry?.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.filter(Boolean).forEach((material) => {
      Object.values(material).forEach((value) => {
        if (value?.isTexture) value.dispose();
      });
      material.dispose();
    });
  });
  environmentTarget?.dispose();
  renderer?.dispose();
}

async function initialize() {
  BOOKS = buildBooks(await window.loadCatalog());
  if (!BOOKS.length) {
    loading.hidden = true;
    document.body.classList.add("no-webgl", "shelf-empty");
    window.dispatchEvent(new CustomEvent("shelf:fallback"));
    return;
  }

  /* ปกวาดด้วย canvas ถ้าฟอนต์ไทยยังไม่มาถึงตอนวาด ตัวอักษรจะกลายเป็นฟอนต์สำรอง
     ค้างอยู่ในเท็กซ์เจอร์ตลอดอายุหน้า — ต้องรอให้โหลดเสร็จก่อนเสมอ */
  try {
    await Promise.all([
      document.fonts.load('400 88px "Noto Serif Thai"'),
      document.fonts.load('500 18px "Noto Sans Thai"')
    ]);
  } catch (error) {
    // ไม่มีเน็ตก็ยังวาดได้ด้วยฟอนต์ระบบ
  }

  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !LOW_POWER,
      alpha: true,
      powerPreference: "high-performance"
    });
  } catch (error) {
    showFallback("เบราว์เซอร์นี้ใช้ WebGL ไม่ได้ จึงแสดงชั้นหนังสือแบบตารางแทน");
    return;
  }

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = LOW_POWER ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  // เงาไม่ได้เปลี่ยนทุกเฟรม วาดใหม่เฉพาะตอนที่มีอะไรขยับจริง
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.setClearColor(0x000000, 0);

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xe9dfcb, 0.027);
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  environmentTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = environmentTarget.texture;
  scene.environmentIntensity = 0.72;
  pmremGenerator.dispose();

  camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
  shelfStage = new THREE.Group();
  shelfStage.name = "continuous-shelf-stage";
  scene.add(shelfStage);

  configureResponsiveTargets();
  camera.position.copy(shelfCameraPosition);
  camera.lookAt(shelfCameraTarget);

  controls = new OrbitControls(camera, canvas);
  controls.enabled = false;
  controls.enableDamping = !reducedMotion;
  controls.dampingFactor = 0.075;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.minDistance = 2.8;
  controls.maxDistance = 7.2;
  controls.minPolarAngle = Math.PI * 0.24;
  controls.maxPolarAngle = Math.PI * 0.76;
  controls.target.copy(shelfCameraTarget);
  /* OrbitControls มี damping — หลังปล่อยนิ้วกล้องยังไหลต่ออีกหลายเฟรม
     ถ้าหยุดวาดทันทีที่ปล่อย การหมุนจะค้างกลางทาง จึงวาดต่ออีกช่วงสั้น ๆ */
  controls.addEventListener("change", () => {
    controlsActiveUntil = performance.now() + 350;
    requestFrame();
  });
  controls.addEventListener("start", () => {
    framingActive = false;
    controls.enabled = true;
  });

  RectAreaLightUniformsLib.init();
  addRoom();
  addLights();
  buildMarkers();

  bookRigs = BOOKS.map((book, index) => {
    const rig = createBookRig(book, index);
    shelfStage.add(rig.root);
    return rig;
  });

  updateSelection(0, true);
  resize();

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("click", onCanvasClick);
  canvas.addEventListener("pointerdown", onShelfPointerDown);
  canvas.addEventListener("pointermove", onShelfPointerMove);
  canvas.addEventListener("pointerup", onShelfPointerEnd);
  canvas.addEventListener("pointercancel", onShelfPointerEnd);
  canvas.addEventListener("lostpointercapture", onShelfPointerEnd);
  canvas.addEventListener("pointerdown", onDetailBookPointerDown, { capture: true });
  canvas.addEventListener("pointermove", onDetailBookPointerMove, { capture: true });
  canvas.addEventListener("pointerup", onDetailBookPointerEnd, { capture: true });
  canvas.addEventListener("pointercancel", onDetailBookPointerEnd, { capture: true });
  canvas.addEventListener("lostpointercapture", onDetailBookPointerEnd, { capture: true });
  canvas.addEventListener("pointerdown", onPagePointerDown, { capture: true });
  canvas.addEventListener("pointermove", onPagePointerMove, { capture: true });
  canvas.addEventListener("pointerup", onPagePointerEnd, { capture: true });
  canvas.addEventListener("pointercancel", onPagePointerEnd, { capture: true });
  canvas.addEventListener("lostpointercapture", onPagePointerEnd, { capture: true });
  window.addEventListener("pointerup", onWindowPagePointerEnd);
  window.addEventListener("pointercancel", onWindowPagePointerEnd);
  experience.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("webglcontextlost", handleContextLost);
  window.addEventListener("resize", resize);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("blur", onWindowBlur);
  document.addEventListener("visibilitychange", onVisibilityChange);
  reducedMotionQuery.addEventListener("change", onReducedMotionChange);

  window.addEventListener("keydown", pokeHero);
  previousButton.addEventListener("click", () => navigate(-1, previousButton));
  nextButton.addEventListener("click", () => navigate(1, nextButton));
  inspectButton.addEventListener("click", () => openDetail(inspectButton));
  closeButton.addEventListener("click", closeDetail);
  toggleBookButton.addEventListener("click", () => setReadingOpen(!readingOpen));
  previousPageButton.addEventListener("click", () => turnPage(-1));
  nextPageButton.addEventListener("click", () => turnPage(1));
  resetButton.addEventListener("click", resetInspectionView);
  spreadModeButton?.addEventListener("click", () => {
    setSpreadPreference(wantsOnePage() ? "two" : "one");
  });
  chapterSelect?.addEventListener("change", () => {
    const no = parseInt(chapterSelect.value, 10);
    if (Number.isFinite(no)) jumpToChapter(no);
  });
  fontDownButton?.addEventListener("click", () => setReaderFontSize(readerFontSize() - 1));
  fontUpButton?.addEventListener("click", () => setReaderFontSize(readerFontSize() + 1));
  if (fontSizeLabel) fontSizeLabel.textContent = `${readerFontSize()}`;
  chapterPrevButton?.addEventListener("click", () => goToChapter(-1));
  chapterNextButton?.addEventListener("click", () => goToChapter(1));

  applyWoodTexture();
  applyReadingTheme();
  window.addEventListener("ebook:theme", applyReadingTheme);
  renderer.render(scene, camera);
  loading.hidden = true;
  experience.classList.add("webgl-ready");
  document.body.classList.add("shelf-ready");
  pokeHero();
  requestFrame();

  // ให้หน้าอื่น (ปุ่มสลับมุมมอง/ค้นหา) สั่งชั้นหนังสือได้โดยไม่ต้องรู้ภายใน
  window.ebookShelf = {
    select: (index) => selectMarker(index, null),
    openBook: (bookId, chapterNo, startReading) => {
      const index = BOOKS.findIndex((entry) => entry.id === bookId);
      if (index < 0 || mode !== "hero") return false;
      updateSelection(index, false);
      alignShelfToSelection();
      bookRigs.forEach((rig, slot) => snapRigToShelfSlot(rig, slot));
      pendingReadChapter = startReading ? Math.max(1, chapterNo || 1) : 0;
      openDetail(inspectButton);
      return true;
    },
    turnPage,
    goToChapter,
    jumpToChapter,
    fontSize: () => readerFontSize(),
    setFontSize: (size) => setReaderFontSize(size),
    toggleReading: (open) => setReadingOpen(open),
    isReading: () => mode === "detail" && readingOpen,
    // ขนาดแผงเปลี่ยน = พื้นที่ว่างเปลี่ยน กล้องต้องวัดกรอบใหม่
    refit: () => requestAnimationFrame(() => { if (!frameOpenSpread(false)) resetInspectionView(); }),
    close: () => {
      if (mode === "detail") closeDetail();
    },
    setActive: (active) => {
      viewInactive = !active;
      syncSuspended();
      // canvas ถูกซ่อนตอนอยู่มุมมองตาราง ขนาดที่จำไว้จึงผิด ต้องวัดใหม่ตอนกลับมา
      if (active) resize();
    }
  };
  window.dispatchEvent(new CustomEvent("shelf:ready", { detail: { count: BOOKS.length } }));
}

initialize().catch((error) => {
  console.error(error);
  showFallback("เตรียมชั้นหนังสือ 3D ไม่สำเร็จ จึงแสดงแบบตารางแทน");
});
window.addEventListener("beforeunload", disposeExperience, { once: true });
