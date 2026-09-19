/* ============================================================
   像素大逃杀 Pixel Royale
   纯 Canvas 单文件游戏：跳伞 / 搜刮 / 战斗 / 缩圈 / AI
   ============================================================ */
'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
const W = canvas.width, H = canvas.height;

const WORLD = 3200;                 // 地图边长
const TILE = 40;
const GRID = WORLD / TILE;          // 80
const TOTAL_PLAYERS = 20;
const PLAYER_R = 13;
const PICKUP_RADIUS = 42;

/* ---------------- 武器定义 ---------------- */
const KNIFE = {
  id: 'knife', name: '近战刀', icon: 'knife', melee: true,
  damage: 34, range: 46, arc: 1.4, cd: 0.32, auto: true,
};
const WEAPONS = {
  knife: KNIFE,
  pistol:  { id: 'pistol',  name: 'P92手枪', icon: 'pistol', damage: 17, mag: 12, reserveMax: 60, cd: 0.17, reload: 1.1, spread: 0.05, recoil: 0.05, kick: 60,  auto: false, range: 560, speed: 1150, ammoType: '9mm',  sound: 0.5 },
  smg:     { id: 'smg',     name: '冲锋枪',  icon: 'smg',    damage: 13, mag: 30, reserveMax: 150,cd: 0.075,reload: 1.8, spread: 0.09, recoil: 0.045,kick: 45,  auto: true,  range: 520, speed: 1100, ammoType: '9mm',  sound: 0.55 },
  ak47:    { id: 'ak47',    name: 'AK47',    icon: 'rifle',  damage: 26, mag: 30, reserveMax: 120,cd: 0.105,reload: 2.3, spread: 0.055,recoil: 0.085,kick: 130, auto: true,  range: 760, speed: 1300, ammoType: '7.62',sound: 0.9 },
  m4:      { id: 'm4',      name: 'M4A1',    icon: 'rifle',  damage: 22, mag: 30, reserveMax: 120,cd: 0.092,reload: 2.0, spread: 0.04, recoil: 0.06, kick: 100, auto: true,  range: 760, speed: 1350, ammoType: '5.56',sound: 0.8 },
  sniper:  { id: 'sniper',  name: 'AWM狙击', icon: 'sniper', damage: 85, mag: 5,  reserveMax: 25, cd: 1.05, reload: 3.0, spread: 0.004,recoil: 0.22, kick: 300, auto: false, range: 1200,speed: 1750, ammoType: '.300',sound: 1.3 },
};
const GUN_IDS = ['pistol', 'smg', 'ak47', 'm4', 'sniper'];

const MEDS = {
  bandage: { id: 'bandage', name: '绷带', heal: 25, time: 1.6 },
  medkit:  { id: 'medkit',  name: '医疗箱', heal: 100, time: 4.0 },
};

const ZONE_PHASES = [
  // wait(开始缩圈等待), shrink(缩圈时长), r(目标半径)
  { wait: 18, shrink: 14, r: 1250, dps: 1.0 },
  { wait: 14, shrink: 12, r: 900,  dps: 1.8 },
  { wait: 12, shrink: 10, r: 600,  dps: 3.0 },
  { wait: 10, shrink: 9,  r: 360,  dps: 5.0 },
  { wait: 8,  shrink: 8,  r: 190,  dps: 8.0 },
  { wait: 6,  shrink: 7,  r: 80,   dps: 12.0 },
  { wait: 5,  shrink: 20, r: 30,   dps: 16.0 },
];

/* ---------------- 工具 ---------------- */
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
const lerp = (a, b, t) => a + (b - a) * t;
const angLerp = (a, b, t) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};
const angDiff = (a, b) => {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) ^ (x * y * 2246822519);
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const n00 = hash2(xi, yi), n10 = hash2(xi + 1, yi);
  const n01 = hash2(xi, yi + 1), n11 = hash2(xi + 1, yi + 1);
  return lerp(lerp(n00, n10, sx), lerp(n01, n11, sx), sy);
}

/* 射线 vs 线段，返回 t (0..1) 或 null */
function raySegment(ox, oy, dx, dy, ax, ay, bx, by) {
  const ex = bx - ax, ey = by - ay;
  const denom = dx * ey - dy * ex;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((ax - ox) * ey - (ay - oy) * ex) / denom;
  const u = ((ax - ox) * dy - (ay - oy) * dx) / denom;
  if (t >= 0 && u >= 0 && u <= 1) return t;
  return null;
}
/* 射线 vs 圆，返回最近交点 t 或 null */
function rayCircle(ox, oy, dx, dy, cx, cy, r) {
  const mx = ox - cx, my = oy - cy;
  const b = mx * dx + my * dy;
  const c = mx * mx + my * my - r * r;
  if (c > 0 && b > 0) return null;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : null;
}

/* ---------------- 全局状态 ---------------- */
let state = 'start';          // start | plane | drop | match | dead | win
let gameTime = 0;
let player = null;
let bots = [];
let bullets = [];
let loot = [];
let particles = [];
let decals = [];
let walls = [];               // {x1,y1,x2,y2} 阻挡移动+子弹
let blockers = [];            // 只挡子弹/视线的圆 {x,y,r,type}
let buildings = [];
let trees = [], rocks = [], waterBlobs = [];
let terrainCanvas = null;
let camX = 0, camY = 0, shake = 0;
let killCount = 0;
let notifications = [];
let feedItems = [];
let zone = null;
let plane = null;
let muted = false;
let lootMsgCd = 0;
function lootWarn(msg) {
  if (lootMsgCd > 0) return;
  lootMsgCd = 1.2;
  addBanner(msg, 'warn', 1.2);
}

const keys = {};
const pressedKeys = {};
let mouseX = W / 2, mouseY = H / 2;
let mouseDown = false, mousePressed = false;
let wheelDelta = 0;

/* ---------------- 输入 ---------------- */
const GAME_KEYS = new Set(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' ']);

window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (GAME_KEYS.has(k)) e.preventDefault();
  if (!keys[k]) {
    pressedKeys[k] = true;
    handleInstantKey(k);
  }
  keys[k] = true;
  if (k === 'm') toggleMute();
});

// 即时动作：在按键事件当帧处理，避免与帧轮询竞争
function handleInstantKey(k) {
  if (k === ' ') {
    if (state === 'plane') startJump();
    return;
  }
  if (state !== 'match' || !player.alive) return;
  if (k === 'k' || k === 'r') startReload(player);
  else if (k === 'h') startHeal(player);
  else if (k === 'u') toggleMap();
  else if (k === 'l') toggleBag();
  else if (k === 'escape') {
    if (!document.getElementById('map-screen').classList.contains('hidden')) toggleMap();
    if (!document.getElementById('bag-screen').classList.contains('hidden')) toggleBag();
  } else if (k >= '1' && k <= '4') {
    if (Number(k) <= player.guns.length) { player.slot = Number(k) - 1; player.reloadT = 0; player.healT = 0; }
    else if (k === '4') { player.slot = -1; player.reloadT = 0; player.healT = 0; }
  }
}
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  mouseX = (e.clientX - r.left) * (W / r.width);
  mouseY = (e.clientY - r.top) * (H / r.height);
});
canvas.addEventListener('mousedown', e => {
  if (e.button === 0) { mouseDown = true; mousePressed = true; initAudio(); }
});
window.addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => { wheelDelta += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });

/* ---------------- 音效（程序生成，无需资源） ---------------- */
let audioCtx = null;
function initAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}
function playShot(vol) {
  if (muted || !audioCtx) return;
  const t = audioCtx.currentTime;
  const dur = 0.12 + vol * 0.08;
  const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
  const src = audioCtx.createBufferSource(); src.buffer = buf;
  const g = audioCtx.createGain(); g.gain.value = 0.25 * vol;
  const f = audioCtx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
  src.connect(f); f.connect(g); g.connect(audioCtx.destination); src.start(t);
}
function playTone(freq, dur, type, vol) {
  if (muted || !audioCtx) return;
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type || 'square';
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(vol || 0.08, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(t); o.stop(t + dur);
}
function sfxReload() { playTone(420, .07, 'square', .05); setTimeout(() => playTone(300, .07, 'square', .05), 160); }
function sfxHit() { playTone(880, .05, 'square', .07); }
function sfxHurt() { playTone(140, .15, 'sawtooth', .1); }
function sfxPickup() { playTone(660, .06, 'square', .06); setTimeout(() => playTone(990, .08, 'square', .05), 70); }
function sfxKnife() { playTone(220, .08, 'sawtooth', .04); }
function toggleMute() {
  muted = !muted;
  document.getElementById('mute-state').textContent = '音效：' + (muted ? '关' : '开');
}

/* ---------------- 地图生成 ---------------- */
function generateWorld() {
  buildings = []; walls = []; blockers = []; trees = []; rocks = []; loot = [];
  waterBlobs = []; decals = [];

  // 湖泊
  const lakeCount = randInt(2, 3);
  for (let i = 0; i < lakeCount; i++) {
    waterBlobs.push({
      x: rand(350, WORLD - 350), y: rand(350, WORLD - 350),
      rx: rand(140, 260), ry: rand(110, 210),
    });
  }
  const isWater = (x, y) => waterBlobs.some(b =>
    ((x - b.x) / b.rx) ** 2 + ((y - b.y) / b.ry) ** 2 < 1);

  // 道路：十字主路 + 一条斜路
  const roads = [
    { type: 'h', y: WORLD / 2 + rand(-200, 200), w: 70 },
    { type: 'v', x: WORLD / 2 + rand(-200, 200), w: 70 },
  ];
  const onRoad = (x, y) => roads.some(r =>
    r.type === 'h' ? Math.abs(y - r.y) < r.w : Math.abs(x - r.x) < r.w);

  // 建筑
  const attempts = 60;
  for (let i = 0; i < attempts && buildings.length < 34; i++) {
    const w = randInt(2, 4) * 24 + rand(0, 12);
    const h = randInt(2, 4) * 24 + rand(0, 12);
    const bw = w + 32, bh = h + 32;
    const x = rand(150, WORLD - 150 - bw);
    const y = rand(150, WORLD - 150 - bh);
    if (isWater(x + bw / 2, y + bh / 2)) continue;
    if (buildings.some(b =>
      x < b.x + b.w + 60 && x + bw + 60 > b.x &&
      y < b.y + b.h + 60 && y + bh + 60 > b.y)) continue;
    addBuilding(x, y, bw, bh);
  }

  // 树
  for (let i = 0; i < 460; i++) {
    const x = rand(40, WORLD - 40), y = rand(40, WORLD - 40);
    if (isWater(x, y) || onRoad(x, y)) continue;
    if (buildings.some(b => x > b.x - 34 && x < b.x + b.w + 34 && y > b.y - 34 && y < b.y + b.h + 34)) continue;
    trees.push({ x, y, r: rand(13, 19) });
    blockers.push({ x, y, r: 11, type: 'tree' });
  }
  // 石头
  for (let i = 0; i < 90; i++) {
    const x = rand(40, WORLD - 40), y = rand(40, WORLD - 40);
    if (isWater(x, y)) continue;
    if (buildings.some(b => x > b.x - 30 && x < b.x + b.w + 30 && y > b.y - 30 && y < b.y + b.h + 30)) continue;
    const r = rand(16, 30);
    rocks.push({ x, y, r });
    blockers.push({ x, y, r: r * 0.85, type: 'rock' });
  }

  // 野外零散物资
  for (let i = 0; i < 40; i++) {
    const x = rand(120, WORLD - 120), y = rand(120, WORLD - 120);
    if (isWater(x, y)) continue;
    if (buildings.some(b => x > b.x - 20 && x < b.x + b.w + 20 && y > b.y - 20 && y < b.y + b.h + 20)) continue;
    spawnLoot(x, y, randomFieldLoot());
  }

  bakeTerrain(isWater, onRoad, roads);
}

function addBuilding(x, y, w, h) {
  const b = { x, y, w, h, hue: randInt(0, 3) };
  buildings.push(b);
  // 四面墙，随机开门洞（把墙拆成两段）
  const gap = 26;
  const sides = [
    { x1: x, y1: y, x2: x + w, y2: y, doorX: x + w / 2 + rand(-w * .25, w * .25), doorY: y },
    { x1: x + w, y1: y, x2: x + w, y2: y + h, doorX: x + w, doorY: y + h / 2 + rand(-h * .25, h * .25) },
    { x1: x + w, y1: y + h, x2: x, y2: y + h, doorX: x + w / 2 + rand(-w * .25, w * .25), doorY: y + h },
    { x1: x, y1: y + h, x2: x, y2: y, doorX: x, doorY: y + h / 2 + rand(-h * .25, h * .25) },
  ];
  for (const s of sides) {
    const horizontal = s.y1 === s.y2;
    if (horizontal) {
      walls.push({ x1: s.x1, y1: s.y1, x2: s.doorX - gap / 2, y2: s.y2 });
      walls.push({ x1: s.doorX + gap / 2, y1: s.y1, x2: s.x2, y2: s.y2 });
    } else {
      walls.push({ x1: s.x1, y1: s.y1, x2: s.x2, y2: s.doorY - gap / 2 });
      walls.push({ x1: s.x1, y1: s.doorY + gap / 2, x2: s.x2, y2: s.y2 });
    }
  }
  // 屋内物资
  const lootCount = randInt(3, 6);
  const weaponGuaranteed = Math.random() < 0.85;
  for (let i = 0; i < lootCount; i++) {
    const lx = rand(x + 24, x + w - 24);
    const ly = rand(y + 24, y + h - 24);
    const item = (i === 0 && weaponGuaranteed) ? randomWeaponLoot() : randomLoot();
    spawnLoot(lx, ly, item);
  }
}

/* ---------------- 物资 ---------------- */
function spawnLoot(x, y, item) {
  loot.push({ x, y, item, bob: rand(0, Math.PI * 2) });
}
function randomWeaponLoot() {
  const r = Math.random();
  const id = r < .28 ? 'ak47' : r < .56 ? 'm4' : r < .76 ? 'smg' : r < .9 ? 'sniper' : 'pistol';
  return { kind: 'weapon', wId: id };
}
function randomAmmoLoot() {
  const types = ['9mm', '9mm', '5.56', '7.62', '.300'];
  return { kind: 'ammo', ammo: pick(types) };
}
function randomFieldLoot() {
  const r = Math.random();
  if (r < .45) return randomAmmoLoot();
  if (r < .72) return { kind: 'med', medId: Math.random() < .7 ? 'bandage' : 'medkit' };
  return { kind: 'armor', value: pick([30, 50, 75, 100]) };
}
function randomLoot() {
  const r = Math.random();
  if (r < .34) return randomWeaponLoot();
  if (r < .62) return randomAmmoLoot();
  if (r < .85) return { kind: 'med', medId: Math.random() < .72 ? 'bandage' : 'medkit' };
  return { kind: 'armor', value: pick([30, 50, 75, 100]) };
}
function lootName(lo) {
  const it = lo.item || lo;
  if (it.kind === 'weapon') return WEAPONS[it.wId].name;
  if (it.kind === 'ammo') return (it.ammo || '弹药') + ' 子弹';
  if (it.kind === 'med') return MEDS[it.medId].name;
  return '防弹衣';
}

/* ---------------- 地形烘焙到离屏画布 ---------------- */
function bakeTerrain(isWater, onRoad, roads) {
  terrainCanvas = document.createElement('canvas');
  terrainCanvas.width = WORLD; terrainCanvas.height = WORLD;
  const t = terrainCanvas.getContext('2d');
  t.imageSmoothingEnabled = false;

  // 草地（按噪声分深浅块）
  for (let gx = 0; gx < GRID; gx++) {
    for (let gy = 0; gy < GRID; gy++) {
      const n = noise2(gx * 0.35 + 10, gy * 0.35 + 10);
      const colors = ['#4a7d3e', '#43733a', '#538a45', '#3f6e36'];
      t.fillStyle = colors[Math.floor(n * colors.length) % colors.length];
      t.fillRect(gx * TILE, gy * TILE, TILE, TILE);
      // 草斑
      if (hash2(gx, gy) > 0.82) {
        t.fillStyle = 'rgba(30,60,28,.35)';
        const sx = gx * TILE + hash2(gx + 7, gy) * 30;
        const sy = gy * TILE + hash2(gx, gy + 7) * 30;
        t.fillRect(sx, sy, 5, 5);
        t.fillRect(sx + 7, sy + 4, 4, 4);
      }
    }
  }

  // 湖
  for (const b of waterBlobs) {
    // 沙滩边
    t.fillStyle = '#c9b878';
    pixelEllipse(t, b.x, b.y, b.rx + 14, b.ry + 14, 10);
    t.fillStyle = '#d8c88c';
    pixelEllipse(t, b.x, b.y, b.rx + 6, b.ry + 6, 10);
    t.fillStyle = '#3f7ea6';
    pixelEllipse(t, b.x, b.y, b.rx, b.ry, 8);
    t.fillStyle = 'rgba(120,180,210,.5)';
    for (let i = 0; i < 12; i++) {
      const a = rand(0, Math.PI * 2), rr = rand(0, 1);
      const px = b.x + Math.cos(a) * b.rx * rr * .85;
      const py = b.y + Math.sin(a) * b.ry * rr * .85;
      t.fillRect(px, py, 12, 4);
    }
  }

  // 道路（像素边沿）
  for (const r of roads) {
    t.fillStyle = '#8a7a58';
    if (r.type === 'h') t.fillRect(0, r.y - r.w / 2 - 3, WORLD, r.w + 6);
    else t.fillRect(r.x - r.w / 2 - 3, 0, r.w + 6, WORLD);
    t.fillStyle = '#a08e68';
    if (r.type === 'h') t.fillRect(0, r.y - r.w / 2, WORLD, r.w);
    else t.fillRect(r.x - r.w / 2, 0, r.w, WORLD);
    t.fillStyle = 'rgba(230,210,150,.6)';
    if (r.type === 'h') { for (let x = 0; x < WORLD; x += 64) t.fillRect(x + 16, r.y - 2, 24, 4); }
    else { for (let y = 0; y < WORLD; y += 64) t.fillRect(r.x - 2, y + 16, 4, 24); }
  }

  // 地图边框
  t.strokeStyle = '#2c4a26';
  t.lineWidth = 16;
  t.strokeRect(8, 8, WORLD - 16, WORLD - 16);
}

function pixelEllipse(t, cx, cy, rx, ry, step) {
  t.beginPath();
  const pts = [];
  for (let a = 0; a < Math.PI * 2; a += Math.PI / step) {
    const px = Math.round(cx + Math.cos(a) * rx);
    const py = Math.round(cy + Math.sin(a) * ry);
    pts.push([px, py]);
    if (pts.length === 1) t.moveTo(px, py); else t.lineTo(px, py);
  }
  t.closePath(); t.fill();
}

/* ---------------- 实体 ---------------- */
function makeEntity(x, y, isPlayer) {
  return {
    x, y, alive: true, airborne: false, alt: 0,           // alt 跳伞高度
    vx: 0, vy: 0, aim: 0, radius: PLAYER_R,
    hp: 100, armor: 0,
    guns: [], mags: {}, reserve: {},                     // mags[wId] 弹夹当前量, reserve[ammoType]
    slot: 0,                                            // 当前武器索引 (guns) ; -1 表示刀
    cd: 0, reloadT: 0, reloadWId: null,
    healT: 0, healMed: null,
    bloom: 0, kick: 0, slash: 0, slashCd: 0,
    hop: 0, hopCd: 0, walk: 0,
    meds: { bandage: 0, medkit: 0 },
    isPlayer, name: isPlayer ? '你' : '敌人',
    kills: 0, zoneAccum: 0, hitFlash: 0,
    target: null, retargetT: 0, moveT: 0, strafe: 1, strafeT: 0,
    jumpX: 0, jumpY: 0, fallVx: 0, fallVy: 0,
  };
}

function giveWeapon(ent, wId, withAmmo) {
  const def = WEAPONS[wId];
  if (!ent.guns.includes(wId)) {
    ent.guns.push(wId);
    ent.mags[wId] = def.mag;
  }
  if (withAmmo) addReserve(ent, def.ammoType, Math.ceil(def.mag * 1.5));
}
function addReserve(ent, ammoType, amount) {
  const def = Object.values(WEAPONS).find(w => w.ammoType === ammoType);
  const cap = def ? def.reserveMax : 90;
  ent.reserve[ammoType] = Math.min(cap, (ent.reserve[ammoType] || 0) + amount);
}
function currentWeapon(ent) {
  return ent.slot < 0 || ent.slot >= ent.guns.length ? KNIFE : WEAPONS[ent.guns[ent.slot]];
}

/* ---------------- 开局 ---------------- */
function resetGame() {
  bullets = []; particles = []; notifications = []; feedItems = [];
  killCount = 0; shake = 0; lootMsgCd = 0;
  generateWorld();

  // 飞机沿横向或纵向穿越
  const horizontal = Math.random() < 0.5;
  plane = {
    horizontal,
    x: horizontal ? -120 : rand(500, WORLD - 500),
    y: horizontal ? rand(500, WORLD - 500) : -120,
    speed: 260,
    jumped: false,
  };

  player = makeEntity(0, 0, true);
  player.slot = -1;

  bots = [];
  for (let i = 0; i < TOTAL_PLAYERS - 1; i++) {
    const bot = makeEntity(0, 0, false);
    bot.name = '敌人' + (i + 1);
    const skin = i % 4;
    bot.skin = skin;
    // 20% 概率开局仍在降落
    bot.airborne = Math.random() < 0.2;
    bot.alt = bot.airborne ? rand(300, 500) : 0;
    bot.x = rand(200, WORLD - 200);
    bot.y = rand(200, WORLD - 200);
    // 初始装备
    const roll = Math.random();
    if (roll < .12) {
      // 只有刀
    } else if (roll < .4) {
      giveWeapon(bot, 'pistol');
    } else if (roll < .62) {
      giveWeapon(bot, 'smg');
    } else if (roll < .85) {
      giveWeapon(bot, pick(['ak47', 'm4']));
    } else {
      giveWeapon(bot, 'sniper');
    }
    if (bot.guns.length) bot.slot = 0; else bot.slot = -1;
    if (Math.random() < .35) bot.armor = pick([30, 50, 75]);
    if (Math.random() < .5) bot.meds.bandage = randInt(1, 3);
    bots.push(bot);
  }

  zone = null;
  gameTime = 0;
  state = 'plane';
  document.getElementById('jump-btn').classList.remove('hidden');
  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('end-screen').classList.add('hidden');
  addBanner('乘坐飞机中，点击右上角「跳伞」选择落点', 'warn', 3);
}

function startJump() {
  if (state !== 'plane' || plane.jumped) return;
  plane.jumped = true;
  player.airborne = true;
  player.alt = 520;
  player.x = clamp(plane.x, 60, WORLD - 60);
  player.y = clamp(plane.y, 60, WORLD - 60);
  player.jumpX = player.x; player.jumpY = player.y;
  player.fallVx = 0; player.fallVy = 0;
  state = 'drop';
  document.getElementById('jump-btn').classList.add('hidden');
  addBanner('跳伞中！用 WASD 微调落点', 'warn', 2.5);
}

/* ---------------- 移动碰撞 ---------------- */
function moveEntity(ent, dt) {
  const inWater = isInWater(ent.x, ent.y);
  const slow = inWater ? 0.55 : 1;
  const spd = (ent.isPlayer ? 185 : 165) * slow * (ent.hop > 0 ? 1.28 : 1);
  let mx = 0, my = 0;
  if (ent.isPlayer) {
    if (keys.w || keys.arrowup) my -= 1;
    if (keys.s || keys.arrowdown) my += 1;
    if (keys.a || keys.arrowleft) mx -= 1;
    if (keys.d || keys.arrowright) mx += 1;
  } else {
    mx = ent.vx; my = ent.vy;
    const ml = Math.hypot(mx, my) || 1;
    mx /= ml; my /= ml;
  }
  if (mx || my) {
    const l = Math.hypot(mx, my);
    mx /= l; my /= l;
    ent.walk += dt * (inWater ? 4 : 9);
  } else {
    ent.walk = 0;
  }
  const nx = ent.x + mx * spd * dt;
  if (!collides(nx, ent.y, ent.radius)) ent.x = nx;
  const ny = ent.y + my * spd * dt;
  if (!collides(ent.x, ny, ent.radius)) ent.y = ny;
  ent.x = clamp(ent.x, 30, WORLD - 30);
  ent.y = clamp(ent.y, 30, WORLD - 30);
  return inWater;
}

function collides(x, y, r) {
  // 墙体（线段 -> 膨胀圆）
  for (const wl of walls) {
    if (wl.x1 === wl.x2) {
      if (Math.abs(x - wl.x1) < r && y > Math.min(wl.y1, wl.y2) - r && y < Math.max(wl.y1, wl.y2) + r) return true;
    } else {
      if (Math.abs(y - wl.y1) < r && x > Math.min(wl.x1, wl.x2) - r && x < Math.max(wl.x1, wl.x2) + r) return true;
    }
  }
  // 树与石头
  for (const b of blockers) {
    if (dist2(x, y, b.x, b.y) < (r + b.r * 0.7) ** 2) return true;
  }
  return false;
}

function isInWater(x, y) {
  return waterBlobs.some(b =>
    ((x - b.x) / (b.rx + 4)) ** 2 + ((y - b.y) / (b.ry + 4)) ** 2 < 1);
}

/* 视线是否被墙/树/石头挡住 */
function lineBlocked(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1) return false;
  const ux = dx / len, uy = dy / len;
  for (const wl of walls) {
    if (raySegment(x1, y1, ux, uy, wl.x1, wl.y1, wl.x2, wl.y2) !== null) {
      const t = raySegment(x1, y1, ux, uy, wl.x1, wl.y1, wl.x2, wl.y2);
      if (t < len) return true;
    }
  }
  for (const b of blockers) {
    const t = rayCircle(x1, y1, ux, uy, b.x, b.y, b.r);
    if (t !== null && t < len) return true;
  }
  return false;
}

/* ---------------- 安全区 ---------------- */
function initZone() {
  zone = {
    phase: 0,
    cx: WORLD / 2,
    cy: WORLD / 2,
    r: 1450,
    fromCx: 0, fromCy: 0, fromR: 1450,
    toCx: 0, toCy: 0, toR: 1450,
    timer: ZONE_PHASES[0].wait,
    shrinking: false,
  };
  startPhase(0);
}
function startPhase(i) {
  const p = ZONE_PHASES[i];
  zone.phase = i;
  zone.fromCx = zone.cx; zone.fromCy = zone.cy; zone.fromR = zone.r;
  // 新圆心在当前圆内，且保证完全包含
  const off = Math.max(0, zone.r - p.r);
  const a = rand(0, Math.PI * 2);
  const d = Math.sqrt(Math.random()) * off * 0.7;
  zone.toCx = clamp(zone.cx + Math.cos(a) * d, p.r + 40, WORLD - p.r - 40);
  zone.toCy = clamp(zone.cy + Math.sin(a) * d, p.r + 40, WORLD - p.r - 40);
  zone.toR = p.r;
  zone.timer = p.wait;
  zone.shrinking = false;
  addBanner('安全区已标注 · ' + Math.ceil(p.wait) + ' 秒后开始缩圈', '', 3);
}
function updateZone(dt) {
  if (!zone) return;
  const p = ZONE_PHASES[zone.phase];
  zone.timer -= dt;
  if (!zone.shrinking) {
    if (zone.timer <= 0) {
      zone.shrinking = true;
      zone.timer = p.shrink;
      zone.shrinkDur = p.shrink;
      addBanner('开始缩圈！前往安全区域', 'bad', 2.5);
    }
  } else {
    const t = 1 - zone.timer / zone.shrinkDur;
    zone.cx = lerp(zone.fromCx, zone.toCx, t);
    zone.cy = lerp(zone.fromCy, zone.toCy, t);
    zone.r = lerp(zone.fromR, zone.toR, t);
    if (zone.timer <= 0) {
      zone.cx = zone.toCx; zone.cy = zone.toCy; zone.r = zone.toR;
      if (zone.phase < ZONE_PHASES.length - 1) startPhase(zone.phase + 1);
      else { zone.timer = 999; zone.shrinking = false; }
    }
  }
}
function zoneDamage(ent, dt) {
  if (!zone || ent.airborne || !ent.alive) return 0;
  const d = dist(ent.x, ent.y, zone.cx, zone.cy);
  if (d > zone.r) {
    return ZONE_PHASES[Math.min(zone.phase, ZONE_PHASES.length - 1)].dps * dt;
  }
  return 0;
}

/* ---------------- 拾取 ---------------- */
function updatePickups() {
  for (let i = loot.length - 1; i >= 0; i--) {
    const lo = loot[i];
    if (dist2(player.x, player.y, lo.x, lo.y) > PICKUP_RADIUS * PICKUP_RADIUS) {
      // AI 也会拾取（简单逻辑，在 bot AI 里处理）
      continue;
    }
    if (tryPickup(player, lo.item)) {
      loot.splice(i, 1);
    }
  }
}
function tryPickup(ent, lo) {
  if (lo.kind === 'weapon') {
    const maxGuns = ent.isPlayer ? 3 : 2;
    if (!ent.guns.includes(lo.wId) && ent.guns.length >= maxGuns) {
      if (ent.isPlayer) lootWarn('武器栏已满（按 1-3 切换）');
      return false;
    }
    if (!ent.guns.includes(lo.wId)) {
      giveWeapon(ent, lo.wId, ent.isPlayer);
      ent.guns.sort((a, b) => GUN_IDS.indexOf(a) - GUN_IDS.indexOf(b));
      ent.slot = ent.guns.indexOf(lo.wId);
      ent.reloadT = 0;
    } else {
      // 已有则补充满弹夹
      const def = WEAPONS[lo.wId];
      if (ent.mags[lo.wId] < def.mag) ent.mags[lo.wId] = def.mag;
      else { addReserve(ent, def.ammoType, def.mag); }
    }
    if (ent.isPlayer) { sfxPickup(); addBanner('拾取 ' + WEAPONS[lo.wId].name, '', 1.4); }
    return true;
  }
  if (lo.kind === 'ammo') {
    const type = lo.ammo || '9mm';
    const amount = { '9mm': 30, '7.62': 20, '5.56': 20, '.300': 5 }[type] || 20;
    addReserve(ent, type, amount);
    if (ent.isPlayer) { sfxPickup(); addBanner('拾取 ' + lo.ammo + ' 子弹 x' + amount, '', 1.2); }
    return true;
  }
  if (lo.kind === 'med') {
    if (ent.meds[lo.medId] >= 5) { if (ent.isPlayer) lootWarn('该药品已满'); return false; }
    ent.meds[lo.medId]++;
    if (ent.isPlayer) { sfxPickup(); addBanner('拾取 ' + MEDS[lo.medId].name, '', 1.2); }
    return true;
  }
  if (lo.kind === 'armor') {
    if (ent.armor >= lo.value) { if (ent.isPlayer) lootWarn('当前护甲更好'); return false; }
    ent.armor = lo.value;
    if (ent.isPlayer) { sfxPickup(); addBanner('拾取 ' + lo.value + ' 点防弹衣', '', 1.2); }
    return true;
  }
  return false;
}

/* ---------------- 射击 ---------------- */
function tryFire(ent, dt) {
  const w = currentWeapon(ent);
  if (ent.cd > 0 || ent.reloadT > 0 || ent.healT > 0) return;
  const wantFire = w.auto ? mouseDown : mousePressed;
  if (ent.isPlayer && !wantFire) return;
  if (!ent.isPlayer && !ent.botFireQueued) return;
  ent.botFireQueued = false;

  if (w.melee) {
    if (ent.slashCd <= 0) doMelee(ent);
    ent.cd = w.cd;
    return;
  }
  const mag = ent.mags[w.id] ?? 0;
  if (mag <= 0) {
    if (ent.isPlayer) {
      addBanner('弹夹已空，按 K 换弹', 'warn', 0.8);
      playTone(180, .05, 'square', .04);
    }
    ent.cd = 0.2;
    return;
  }
  ent.mags[w.id] = mag - 1;
  ent.cd = w.cd;
  // 后坐力：瞄准角上扬 + 开花散布 + 镜头抖动
  const kickAng = -w.recoil * rand(0.7, 1.25);
  ent.kick = Math.min(1, ent.kick + w.recoil * 1.6);
  ent.bloom = Math.min(1.4, ent.bloom + w.spread * 2.2);
  if (ent.isPlayer) {
    shake = Math.min(10, shake + w.kick * 0.02);
  }
  const spread = w.spread * (1 + ent.bloom) * (ent.hop > 0 ? 1.6 : 1);
  const a = ent.aim + kickAng * 0.35 + rand(-spread, spread);
  const mx = ent.x + Math.cos(ent.aim) * 20;
  const my = ent.y + Math.sin(ent.aim) * 20;
  bullets.push({
    x: mx, y: my,
    vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed,
    life: w.range / w.speed, range: w.range, traveled: 0,
    dmg: w.damage, owner: ent, trail: 0,
  });
  // 枪口火光粒子
  for (let i = 0; i < 4; i++) {
    particles.push({
      x: mx, y: my, vx: Math.cos(a) * rand(40, 120) + rand(-30, 30),
      vy: Math.sin(a) * rand(40, 120) + rand(-30, 30),
      life: rand(.08, .18), maxLife: .18, kind: 'spark', size: rand(2, 4),
    });
  }
  if (ent.isPlayer || nearPlayer(mx, my, 900)) playShot(w.sound);
}

function doMelee(ent) {
  const w = KNIFE;
  ent.slash = 0.18; ent.slashCd = 0.3;
  sfxKnife();
  for (const other of allAlive()) {
    if (other === ent) continue;
    const d = dist(ent.x, ent.y, other.x, other.y);
    if (d > w.range + other.radius) continue;
    if (Math.abs(angDiff(Math.atan2(other.y - ent.y, other.x - ent.x), ent.aim)) > w.arc / 2) continue;
    if (lineBlocked(ent.x, ent.y, other.x, other.y)) continue;
    applyDamage(other, w.damage, ent, '刀');
  }
}

function startReload(ent) {
  const w = currentWeapon(ent);
  if (w.melee || ent.reloadT > 0) return;
  const mag = ent.mags[w.id] ?? 0;
  if (mag >= w.mag) return;
  const reserve = ent.reserve[w.ammoType] || 0;
  if (!ent.isPlayer || reserve > 0) {
    ent.reloadT = w.reload;
    ent.reloadWId = w.id;
    if (ent.isPlayer) sfxReload();
  } else if (ent.isPlayer) {
    addBanner('没有备用弹药', 'warn', 1);
  }
  if (!ent.isPlayer) ent.botReloading = true;
}
function finishReload(ent) {
  const w = WEAPONS[ent.reloadWId];
  if (!w) { ent.reloadT = 0; return; }
  if (!ent.isPlayer) {
    // AI 备弹无限
    ent.mags[w.id] = w.mag;
  } else {
    const need = w.mag - (ent.mags[w.id] ?? 0);
    const take = Math.min(need, ent.reserve[w.ammoType] || 0);
    ent.mags[w.id] = (ent.mags[w.id] ?? 0) + take;
    ent.reserve[w.ammoType] -= take;
  }
  ent.reloadT = 0; ent.reloadWId = null; ent.botReloading = false;
}

function startHeal(ent) {
  if (ent.healT > 0 || ent.hp >= 100) return;
  const id = ent.meds.bandage > 0 ? 'bandage' : (ent.meds.medkit > 0 ? 'medkit' : null);
  if (!id) { if (ent.isPlayer) addBanner('没有药品', 'warn', 1); return; }
  ent.healT = MEDS[id].time; ent.healMed = id;
  if (ent.isPlayer) addBanner('正在使用' + MEDS[id].name + '…', '', MEDS[id].time);
}
function finishHeal(ent) {
  const med = MEDS[ent.healMed];
  ent.meds[ent.healMed]--;
  ent.hp = Math.min(100, ent.hp + med.heal);
  ent.healT = 0; ent.healMed = null;
  if (ent.isPlayer) { sfxPickup(); addBanner('恢复生命', '', 1); }
}

/* ---------------- 子弹 ---------------- */
function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.life -= dt;
    const stepX = b.vx * dt, stepY = b.vy * dt;
    let hit = false;

    // 墙与遮挡物
    const len = Math.hypot(stepX, stepY);
    const ux = stepX / (len || 1), uy = stepY / (len || 1);
    let wallT = Infinity;
    for (const wl of walls) {
      const t = raySegment(b.x, b.y, ux, uy, wl.x1, wl.y1, wl.x2, wl.y2);
      if (t !== null && t <= len) wallT = Math.min(wallT, t);
    }
    for (const bl of blockers) {
      const t = rayCircle(b.x, b.y, ux, uy, bl.x, bl.y, bl.r);
      if (t !== null && t <= len) wallT = Math.min(wallT, t);
    }
    if (wallT !== Infinity) {
      b.x += ux * wallT; b.y += uy * wallT;
      spawnImpact(b.x, b.y, 'spark');
      hit = true;
    }

    if (!hit) {
      b.x += stepX; b.y += stepY; b.traveled += len;
      for (const target of allAlive()) {
        if (target === b.owner) continue;
        if (dist2(b.x, b.y, target.x, target.y) < (target.radius + 3) ** 2) {
          applyDamage(target, b.dmg, b.owner, WEAPONS_KILLNAME(b.owner, b));
          spawnImpact(b.x, b.y, 'blood');
          hit = true;
          break;
        }
      }
    }

    if (hit || b.life <= 0 || b.traveled >= b.range ||
        b.x < 0 || b.y < 0 || b.x > WORLD || b.y > WORLD) {
      bullets.splice(i, 1);
    }
  }
}
function WEAPONS_KILLNAME(owner, b) {
  if (owner === player) {
    const w = currentWeapon(player);
    return w.melee ? '刀' : w.name;
  }
  const w = currentWeapon(owner);
  return w.melee ? '刀' : w.name;
}
function spawnImpact(x, y, kind) {
  const n = kind === 'blood' ? 8 : 5;
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), sp = rand(30, 140);
    particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: rand(.2, .45), maxLife: .45, kind, size: rand(2, 4),
    });
  }
}

/* ---------------- 伤害 / 死亡 ---------------- */
function applyDamage(ent, amount, attacker, weaponName) {
  if (!ent.alive || ent.airborne) return;
  let dmg = amount;
  // 护甲先吸收 60%
  if (ent.armor > 0) {
    const absorbed = Math.min(ent.armor, dmg * 0.6);
    ent.armor -= absorbed;
    dmg -= absorbed;
  }
  ent.hp -= dmg;
  ent.hitFlash = 0.25;
  if (ent === player) { sfxHurt(); shake = Math.min(12, shake + 4); }
  else sfxHit();

  if (ent.hp <= 0) {
    ent.hp = 0; ent.alive = false;
    if (attacker) attacker.kills++;
    onKill(attacker, ent, weaponName || '未知');
    dropLoot(ent);
  }
}

function onKill(killer, victim, weaponName) {
  const kname = killer ? killer.name : '安全区';
  const msg = kname + ' 淘汰了 ' + victim.name + (weaponName ? ' [' + weaponName + ']' : '');
  addFeed(msg, killer === player);
  if (killer === player) {
    killCount++;
    addBanner('淘汰 +1', '', 1.5);
  }
  if (victim === player) {
    setTimeout(() => endGame(false), 900);
  } else {
    checkWin();
  }
}

function checkWin() {
  if (state !== 'match') return;
  const aliveBots = bots.filter(b => b.alive).length;
  if (aliveBots === 0 && player.alive) endGame(true);
}

function dropLoot(ent) {
  // 武器
  for (const wId of ent.guns) {
    spawnLoot(ent.x + rand(-20, 20), ent.y + rand(-20, 20), { kind: 'weapon', wId });
  }
  // 弹药
  for (const [ammo, n] of Object.entries(ent.reserve)) {
    if (n > 0) spawnLoot(ent.x + rand(-24, 24), ent.y + rand(-24, 24), { kind: 'ammo', ammo });
  }
  // 药品
  if (ent.meds.bandage > 0) for (let i = 0; i < Math.min(ent.meds.bandage, 2); i++)
    spawnLoot(ent.x + rand(-24, 24), ent.y + rand(-24, 24), { kind: 'med', medId: 'bandage' });
  if (ent.meds.medkit > 0)
    spawnLoot(ent.x + rand(-24, 24), ent.y + rand(-24, 24), { kind: 'med', medId: 'medkit' });
  // 护甲
  if (ent.armor > 15)
    spawnLoot(ent.x + rand(-24, 24), ent.y + rand(-24, 24), { kind: 'armor', value: Math.floor(ent.armor / 10) * 10 });
  // 尸体标记
  decals.push({ x: ent.x, y: ent.y, kind: 'corpse', life: 30 });
}

function allAlive() {
  const arr = [];
  if (player.alive) arr.push(player);
  for (const b of bots) if (b.alive) arr.push(b);
  return arr;
}
function nearPlayer(x, y, d) {
  return player.alive && dist2(x, y, player.x, player.y) < d * d;
}

/* ---------------- 玩家 ---------------- */
function playerAim() {
  const sx = player.x - camX, sy = player.y - camY;
  return Math.atan2(mouseY - sy, mouseX - sx);
}

function updatePlayer(dt) {
  if (!player.alive) return;
  player.aim = playerAim();

  // 切枪
  if (wheelDelta !== 0 || pressedKeys.q || pressedKeys.e) {
    const dir = wheelDelta > 0 || pressedKeys.e ? 1 : -1;
    const choices = player.guns.length;                 // 0..guns-1 枪，最后一个索引表示刀
    let cur = player.slot < 0 ? choices : player.slot;
    cur = (cur + dir + (choices + 1)) % (choices + 1);
    player.slot = cur === choices ? -1 : cur;
    player.reloadT = 0; player.healT = 0;
    playTone(500, .04, 'square', .04);
  }
  wheelDelta = 0;
  for (let n = 1; n <= 4; n++) {
    if (pressedKeys[String(n)]) {
      if (n <= player.guns.length) player.slot = n - 1;
      else if (n === 4) player.slot = -1;
      player.reloadT = 0; player.healT = 0;
    }
  }

  if (pressedKeys.k || pressedKeys.r) startReload(player);
  if (pressedKeys.h) startHeal(player);
  if (pressedKeys[' ']) {
    if (state === 'plane') startJump();
    else if (player.hopCd <= 0 && player.healT === 0) {
      player.hop = 0.28; player.hopCd = 1.1;
    }
  }
  // 移动会打断治疗
  if (player.healT > 0 && (keys.w || keys.a || keys.s || keys.d || mouseDown)) {
    player.healT = 0; player.healMed = null;
  }

  moveEntity(player, dt);
  updateEntityTimers(player, dt);

  // 射击
  if (state === 'match') tryFire(player, dt);

  // 弹尽自动提示换弹
  const w = currentWeapon(player);
  if (!w.melee && (player.mags[w.id] ?? 0) === 0 && (player.reserve[w.ammoType] || 0) > 0 && player.reloadT === 0) {
    if (player.emptyHintT === undefined) player.emptyHintT = 0;
    player.emptyHintT -= dt;
    if (!mouseDown && player.emptyHintT <= 0) {
      startReload(player);
    }
  }
}

function updateEntityTimers(ent, dt) {
  ent.cd = Math.max(0, ent.cd - dt);
  ent.bloom = Math.max(0, ent.bloom - dt * 3.5);
  ent.kick = Math.max(0, ent.kick - dt * 2.4);
  ent.slash = Math.max(0, ent.slash - dt);
  ent.slashCd = Math.max(0, ent.slashCd - dt);
  ent.hop = Math.max(0, ent.hop - dt);
  ent.hopCd = Math.max(0, ent.hopCd - dt);
  ent.hitFlash = Math.max(0, ent.hitFlash - dt);
  if (ent.reloadT > 0) {
    ent.reloadT -= dt;
    if (ent.reloadT <= 0) finishReload(ent);
  }
  if (ent.healT > 0) {
    ent.healT -= dt;
    if (ent.healT <= 0) finishHeal(ent);
  }
}

/* ---------------- 跳伞阶段 ---------------- */
function updatePlanePhase(dt) {
  if (plane.horizontal) {
    plane.x += plane.speed * dt;
    if (plane.x > WORLD + 140 && !plane.jumped) startJump();
  } else {
    plane.y += plane.speed * dt;
    if (plane.y > WORLD + 140 && !plane.jumped) startJump();
  }
  if (!plane.jumped) {
    player.x = clamp(plane.x, 60, WORLD - 60);
    player.y = clamp(plane.y, 60, WORLD - 60);
  }
}

function updateDrop(ent, dt, isPlayer) {
  // WASD / bot 微漂移
  let dx = 0, dy = 0;
  if (isPlayer) {
    if (keys.w || keys.arrowup) dy -= 1;
    if (keys.s || keys.arrowdown) dy += 1;
    if (keys.a || keys.arrowleft) dx -= 1;
    if (keys.d || keys.arrowright) dx += 1;
  } else {
    dx = ent.fallVx; dy = ent.fallVy;
  }
  const l = Math.hypot(dx, dy);
  if (l > 0) { dx /= l; dy /= l; }
  ent.x = clamp(ent.x + dx * 130 * dt, 40, WORLD - 40);
  ent.y = clamp(ent.y + dy * 130 * dt, 40, WORLD - 40);
  ent.alt -= 150 * dt;
  if (ent.alt <= 0) {
    ent.alt = 0; ent.airborne = false;
    if (isPlayer) {
      state = 'match';
      if (!zone) initZone();
      addBanner('落地！开始搜刮，注意敌人', 'warn', 2.5);
    }
  }
}

/* ---------------- AI 敌人 ---------------- */
function updateBot(bot, dt) {
  if (!bot.alive) return;
  updateEntityTimers(bot, dt);
  if (bot.airborne) { updateDrop(bot, dt, false); return; }
  if (state !== 'match') { // 玩家还没落地，AI 游荡但不开枪
    botWander(bot, dt);
    return;
  }

  const others = [];
  for (const o of allAlive()) {
    if (o === bot) continue;
    others.push(o);
  }

  // 寻找目标：玩家优先
  let target = null;
  const canSee = (o, range) =>
    dist2(bot.x, bot.y, o.x, o.y) < range * range &&
    !lineBlocked(bot.x, bot.y, o.x, o.y);

  const playerVisible = player.alive && canSee(player, 560);
  if (playerVisible) target = player;
  else {
    // 最近的可见敌人
    let best = null, bestD = 360;
    for (const o of others) {
      const d = dist(bot.x, bot.y, o.x, o.y);
      if (d < bestD && canSee(o, 360)) { best = o; bestD = d; }
    }
    target = best;
  }

  // 残血打药
  if (bot.hp < 38 && (bot.meds.medkit > 0 || bot.meds.bandage > 0) && bot.healT === 0 &&
      (!target || dist(bot.x, bot.y, target.x, target.y) > 180)) {
    if (bot.meds.medkit > 0) { bot.meds.medkit--; bot.hp = Math.min(100, bot.hp + 100); }
    else { bot.meds.bandage--; bot.hp = Math.min(100, bot.hp + 25); }
    spawnImpact(bot.x, bot.y, 'heal');
  }

  // 安全区外 → 向圆心移动
  const outsideZone = zone && dist(bot.x, bot.y, zone.cx, zone.cy) > zone.r - 60;

  if (target) {
    botCombat(bot, target, dt, outsideZone);
  } else if (outsideZone) {
    moveToward(bot, zone.cx + rand(-40, 40), zone.cy + rand(-40, 40), dt, 1);
  } else {
    // 搜刮 / 游荡
    botWander(bot, dt);
  }

  // 拾取脚下物资
  for (let i = loot.length - 1; i >= 0; i--) {
    const lo = loot[i];
    if (dist2(bot.x, bot.y, lo.x, lo.y) > 30 * 30) continue;
    // AI 偏好：武器比当前好 / 弹药药品
    const item = lo.item;
    if (item.kind === 'weapon') {
      const cur = bot.guns.length ? WEAPONS[bot.guns[0]] : null;
      const rank = { pistol: 1, smg: 2, ak47: 3, m4: 4, sniper: 5 };
      if (cur && rank[item.wId] <= rank[cur.id]) continue;
    }
    if (tryPickup(bot, item)) loot.splice(i, 1);
  }
}

function botCombat(bot, target, dt, outsideZone) {
  const w = currentWeapon(bot);
  const d = dist(bot.x, bot.y, target.x, target.y);
  const desiredAim = Math.atan2(target.y - bot.y, target.x - bot.x);
  // 平滑瞄准（玩家是优先目标，瞄得更准）
  const aimSpeed = target === player ? 7.5 : 4.5;
  bot.aim = angLerp(bot.aim, desiredAim, clamp(aimSpeed * dt, 0, 1));

  // 距离管理
  let mvx = 0, mvy = 0;
  const idealMin = w.melee ? 0 : (w.id === 'sniper' ? 300 : 90);
  const idealMax = w.melee ? 40 : (w.id === 'sniper' ? 620 : 420);
  if (d < idealMin) { mvx = bot.x - target.x; mvy = bot.y - target.y; }
  else if (d > idealMax) { mvx = target.x - bot.x; mvy = target.y - bot.y; }

  // 横向走位
  bot.strafeT -= dt;
  if (bot.strafeT <= 0) { bot.strafe *= -1; bot.strafeT = rand(.7, 1.8); }
  const sx = -Math.sin(desiredAim) * bot.strafe;
  const sy = Math.cos(desiredAim) * bot.strafe;

  let nx = mvx + sx * 0.9, ny = mvy + sy * 0.9;
  if (outsideZone) {
    nx += zone.cx - bot.x; ny += zone.cy - bot.y;
  }
  const nl = Math.hypot(nx, ny) || 1;
  bot.vx = nx / nl; bot.vy = ny / nl;
  moveEntity(bot, dt);

  // 换弹
  if (!w.melee && bot.reloadT === 0 && (bot.mags[w.id] ?? 0) === 0) {
    // AI 有无限备弹
    bot.mags[w.id] = 0;
    bot.reloadT = w.reload; bot.reloadWId = w.id;
  }

  // 射击：瞄准偏差足够小再开火
  if (bot.cd <= 0 && bot.reloadT <= 0) {
    if (Math.abs(angDiff(bot.aim, desiredAim)) < 0.22) {
      if (w.melee) {
        if (d < w.range + bot.radius) bot.botFireQueued = true;
      } else {
        // 命中率：对玩家稍低，避免过强
        const acc = target === player ? 0.52 : 0.72;
        bot.botFireQueued = Math.random() < acc;
      }
    }
  }
  tryFire(bot, dt);
}

function botWander(bot, dt) {
  bot.moveT -= dt;
  if (bot.moveT <= 0) {
    // 40% 找附近物资，其余随机
    let goal = null;
    if (Math.random() < 0.5) {
      let best = null, bd = 500 * 500;
      for (const lo of loot) {
        const d = dist2(bot.x, bot.y, lo.x, lo.y);
        if (d < bd) { bd = d; best = lo; }
      }
      goal = best;
    }
    if (goal) { bot.tx = goal.x; bot.ty = goal.y; }
    else {
      bot.tx = clamp(bot.x + rand(-500, 500), 120, WORLD - 120);
      bot.ty = clamp(bot.y + rand(-500, 500), 120, WORLD - 120);
    }
    bot.moveT = rand(2.5, 6);
  }
  moveToward(bot, bot.tx || bot.x, bot.ty || bot.y, dt, .7);
}

function moveToward(ent, tx, ty, dt, factor) {
  const dx = tx - ent.x, dy = ty - ent.y;
  const l = Math.hypot(dx, dy);
  if (l < 14) { ent.vx = 0; ent.vy = 0; }
  else { ent.vx = (dx / l) * factor; ent.vy = (dy / l) * factor; }
  if (l > 6) ent.aim = angLerp(ent.aim, Math.atan2(dy, dx), 6 * dt);
  moveEntity(ent, dt);
}

/* 实体间分离，防止重叠 */
function separateEntities() {
  const list = allAlive().filter(e => !e.airborne);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const min = a.radius + b.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0.01 && d2 < min * min) {
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        const px = dx / d * push, py = dy / d * push;
        a.x -= px; a.y -= py; b.x += px; b.y += py;
      }
    }
  }
}

/* ---------------- 横幅 / 击杀信息 ---------------- */
function addBanner(text, cls, dur) {
  notifications.push({ text, cls: cls || '', life: dur || 2, maxLife: dur || 2 });
}
function addFeed(text, mine) {
  feedItems.push({ text, mine, life: 5 });
  if (feedItems.length > 6) feedItems.shift();
  renderFeed();
}
function renderFeed() {
  const box = document.getElementById('kill-feed');
  box.innerHTML = '';
  for (const f of feedItems) {
    const d = document.createElement('div');
    if (f.mine) d.className = 'me';
    d.textContent = f.text;
    box.appendChild(d);
  }
}

/* ---------------- 粒子 ---------------- */
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.92; p.vy *= 0.92;
    if (p.life <= 0) particles.splice(i, 1);
  }
  for (let i = decals.length - 1; i >= 0; i--) {
    decals[i].life -= dt;
    if (decals[i].life <= 0) decals.splice(i, 1);
  }
  for (let i = notifications.length - 1; i >= 0; i--) {
    notifications[i].life -= dt;
    if (notifications[i].life <= 0) notifications.splice(i, 1);
  }
  for (let i = feedItems.length - 1; i >= 0; i--) {
    feedItems[i].life -= dt;
    if (feedItems[i].life <= 0) { feedItems.splice(i, 1); renderFeed(); }
  }
}

/* ---------------- 结束 ---------------- */
function endGame(win) {
  if (state === 'dead' || state === 'win') return;
  state = win ? 'win' : 'dead';
  document.getElementById('jump-btn').classList.add('hidden');
  const rank = bots.filter(b => b.alive).length + (player.alive ? 1 : 0);
  document.getElementById('end-title').textContent = win ? '大吉大利，今晚吃鸡！' : '你被淘汰了';
  document.getElementById('end-title').style.color = win ? '#ffcc33' : '#e2483d';
  document.getElementById('end-stats').textContent =
    win ? `第一名 · 击杀 ${killCount} 人` : `本局排名第 ${rank} / ${TOTAL_PLAYERS} · 击杀 ${killCount} 人`;
  document.getElementById('end-screen').classList.remove('hidden');
  playTone(win ? 660 : 200, .4, 'square', .1);
}

/* ---------------- 主循环 ---------------- */
let lastTime = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  const mapOpen = !document.getElementById('map-screen').classList.contains('hidden');
  const bagOpen = !document.getElementById('bag-screen').classList.contains('hidden');
  const paused = mapOpen || bagOpen;

  // 全局功能键
  if (pressedKeys.u) toggleMap();
  if (pressedKeys.l) toggleBag();
  if (pressedKeys.escape) {
    if (mapOpen) toggleMap();
    if (bagOpen) toggleBag();
  }

  if (!paused) update(dt);
  render();

  Object.keys(pressedKeys).forEach(k => { pressedKeys[k] = false; });
  mousePressed = false;
  requestAnimationFrame(loop);
}

function update(dt) {
  gameTime += dt;

  if (state === 'plane') {
    updatePlanePhase(dt);
  } else if (state === 'drop') {
    updateDrop(player, dt, true);
    for (const b of bots) updateBot(b, dt);
  } else if (state === 'match') {
    updateZone(dt);
    updatePlayer(dt);
    for (const b of bots) updateBot(b, dt);
    if (player.alive) { updatePickups(); lootMsgCd = Math.max(0, lootMsgCd - dt); }
    separateEntities();
    updateBullets(dt);

    // 缩圈伤害
    if (player.alive) {
      const dmg = zoneDamage(player, dt);
      if (dmg > 0) {
        applyDamage(player, dmg, null, null);
      }
    }
    for (const b of bots) {
      if (!b.alive) continue;
      const dmg = zoneDamage(b, dt);
      if (dmg > 0) applyDamage(b, dmg, null, null);
    }
    checkWin();
  }

  updateParticles(dt);
  // 摄像机
  if (state !== 'start') {
    const tx = clamp(player.x - W / 2, 0, WORLD - W);
    const ty = clamp(player.y - H / 2, 0, WORLD - H);
    camX += (tx - camX) * Math.min(1, dt * 8);
    camY += (ty - camY) * Math.min(1, dt * 8);
    shake = Math.max(0, shake - dt * 30);
  }
}

/* ---------------- 背包 / 地图界面 ---------------- */
function toggleBag() {
  if (state !== 'match' && state !== 'drop') return;
  const el = document.getElementById('bag-screen');
  const open = el.classList.toggle('hidden') === false;
  if (open) {
    const list = document.getElementById('bag-list');
    list.innerHTML = '';
    const addRow = (name, qty) => {
      const row = document.createElement('div');
      row.className = 'bag-row';
      row.innerHTML = `<span>${name}</span><span class="qty">${qty}</span>`;
      list.appendChild(row);
    };
    for (const wId of player.guns) {
      const w = WEAPONS[wId];
      addRow(w.name, (player.mags[wId] ?? 0) + ' / ' + w.mag + ' · 备弹 ' + (player.reserve[w.ammoType] || 0));
    }
    addRow('近战刀', 'x1');
    addRow('绷带', 'x' + player.meds.bandage);
    addRow('医疗箱', 'x' + player.meds.medkit);
    addRow('防弹衣', Math.round(player.armor) + ' / 100');
  }
}

let mapOpenFlag = false;
function toggleMap() {
  if (state !== 'match' && state !== 'drop' && state !== 'plane') return;
  const el = document.getElementById('map-screen');
  const open = el.classList.toggle('hidden') === false;
  mapOpenFlag = open;
  if (open) drawBigMap();
}

document.getElementById('start-btn').addEventListener('click', () => { initAudio(); resetGame(); document.activeElement.blur(); });
document.getElementById('restart-btn').addEventListener('click', () => { initAudio(); resetGame(); document.activeElement.blur(); });
document.getElementById('jump-btn').addEventListener('click', () => { initAudio(); startJump(); });

requestAnimationFrame(loop);

/* ============================================================
   渲染
   ============================================================ */
function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);

  if (state === 'start') {
    drawMenuBackdrop();
    return;
  }

  const sx = (Math.random() - .5) * shake;
  const sy = (Math.random() - .5) * shake;
  ctx.save();
  ctx.translate(-Math.round(camX) + sx, -Math.round(camY) + sy);

  // 地形
  ctx.drawImage(terrainCanvas, 0, 0);

  drawBuildings();
  drawDecals();
  drawLoot();

  // 收集可排序实体
  const drawList = [];
  for (const t of trees) drawList.push({ y: t.y, fn: () => drawTree(t) });
  for (const r of rocks) drawList.push({ y: r.y, fn: () => drawRock(r) });
  for (const b of bots) if (b.alive) drawList.push({ y: b.y, fn: () => drawSoldier(b, false) });
  if (player.alive && state !== 'plane') drawList.push({ y: player.y, fn: () => drawSoldier(player, true) });
  if (plane && state === 'plane' && !plane.jumped) drawList.push({ y: plane.y + 9999, fn: () => drawPlane(plane) });
  drawList.sort((a, b) => a.y - b.y);
  for (const d of drawList) d.fn();

  drawBullets();
  drawParticles();
  drawZone();

  ctx.restore();

  // 屏幕层
  drawCrosshair();
  drawMinimap();
  drawBanners();
  drawVignette();
  syncHUD();
}

function drawMenuBackdrop() {
  ctx.fillStyle = '#2f5a32';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 220; i++) {
    const x = hash2(i, 1) * W, y = hash2(i, 2) * H;
    ctx.fillStyle = ['#3a6e3c', '#477d44', '#28502c'][i % 3];
    ctx.fillRect(x, y, 24, 24);
  }
  // 装饰角色
  ctx.save();
  ctx.translate(W / 2, H / 2 - 150);
  drawSoldier({ x: 0, y: 0, aim: -0.6, walk: 0, hop: 0, hitFlash: 0, airborne: false, guns: ['ak47'], slot: 0, isPlayer: true }, true);
  ctx.restore();
}

/* ---------------- 建筑 ---------------- */
const WALL_COLORS = ['#9b8462', '#8c6f55', '#a0896a', '#7d7468'];
function drawBuildings() {
  for (const b of buildings) {
    // 地板
    ctx.fillStyle = '#5d4e3c';
    ctx.fillRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6);
    ctx.fillStyle = '#6e5c47';
    for (let fx = b.x + 10; fx < b.x + b.w - 8; fx += 20) {
      for (let fy = b.y + 10; fy < b.y + b.h - 8; fy += 20) {
        if (hash2(fx, fy) > .5) ctx.fillRect(fx, fy, 14, 14);
      }
    }
    // 墙（加粗线段表现像素墙体）
    ctx.strokeStyle = WALL_COLORS[b.hue];
    ctx.lineWidth = 10;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    // 外墙直接按矩形描边即可（门洞用深色地板覆盖，墙线在门洞处被视觉断开：改为按 walls 画）
    ctx.stroke();
    // 按墙段画
    for (const wl of walls) {
      if (wl.x1 === wl.x2 && (wl.y1 < b.y - 20 || wl.y1 > b.y + b.h + 20)) continue;
      if (wl.y1 === wl.y2 && (wl.x1 < b.x - 20 || wl.x1 > b.x + b.w + 20)) continue;
      if (wl.x1 === wl.x2 ? Math.abs(wl.x1 - b.x) > 1 && Math.abs(wl.x1 - (b.x + b.w)) > 1
                          : Math.abs(wl.y1 - b.y) > 1 && Math.abs(wl.y1 - (b.y + b.h)) > 1) continue;
      ctx.beginPath();
      ctx.moveTo(wl.x1, wl.y1); ctx.lineTo(wl.x2, wl.y2);
      ctx.stroke();
    }
    // 墙顶高光 + 底边阴影
    ctx.strokeStyle = 'rgba(255,240,200,.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 5, b.y + 5, b.w - 10, 1);
    ctx.strokeRect(b.x + 5, b.y + 5, 1, b.h - 10);
    ctx.strokeStyle = 'rgba(0,0,0,.3)';
    ctx.strokeRect(b.x + 5, b.y + b.h - 6, b.w - 10, 1);
  }
}

function drawDecals() {
  for (const d of decals) {
    if (d.kind === 'corpse') {
      ctx.fillStyle = 'rgba(60,20,20,.7)';
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, 14, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5a3330';
      ctx.fillRect(d.x - 8, d.y - 3, 16, 6);
    }
  }
}

/* ---------------- 物资光团 ---------------- */
const GLOW_COLORS = {
  weapon: { core: '#ffe066', glow: 'rgba(255,200,40,' },
  ammo:   { core: '#c9b8a0', glow: 'rgba(220,180,90,' },
  med:    { core: '#ff7a8a', glow: 'rgba(255,90,110,' },
  armor:  { core: '#7ec8ff', glow: 'rgba(80,170,255,' },
};
function drawLoot() {
  for (const lo of loot) {
    if (!lo.item || !GLOW_COLORS[lo.item.kind]) continue;
    lo.bob += 0.05;
    const kind = lo.item.kind;
    const pulse = 0.55 + Math.sin(lo.bob) * 0.25;
    const cg = GLOW_COLORS[kind];
    const yy = lo.y - 4 - Math.sin(lo.bob) * 3;
    ctx.fillStyle = cg.glow + (0.10 * pulse) + ")";
    ctx.fillRect(lo.x - 14, yy - 14, 28, 28);
    ctx.fillStyle = cg.glow + (0.18 * pulse) + ")";
    ctx.fillRect(lo.x - 9, yy - 9, 18, 18);
    ctx.fillStyle = cg.core;
    ctx.fillRect(lo.x - 5, yy - 5, 10, 10);
    ctx.fillStyle = "#2a2620";
    if (kind === "weapon") {
      ctx.fillRect(lo.x - 4, yy - 1, 8, 2);
      ctx.fillRect(lo.x + 1, yy + 1, 2, 3);
    } else if (kind === "ammo") {
      ctx.fillRect(lo.x - 3, yy - 3, 2, 6); ctx.fillRect(lo.x, yy - 3, 2, 6); ctx.fillRect(lo.x + 3, yy - 3, 1, 6);
    } else if (kind === "med") {
      ctx.fillRect(lo.x - 1, yy - 4, 2, 8); ctx.fillRect(lo.x - 4, yy - 1, 8, 2);
    } else {
      ctx.fillRect(lo.x - 4, yy - 3, 8, 6);
    }
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.fillRect(lo.x - 6, lo.y + 8, 12, 3);
  }
}

/* ---------------- 树 / 石头 ---------------- */
function drawTree(t) {
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath(); ctx.ellipse(t.x, t.y + 4, t.r, t.r * .5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5b3e24';
  ctx.fillRect(t.x - 3, t.y - 3, 6, 8);
  const greens = ['#2f5e2c', '#387033', '#438a3c'];
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = greens[i];
    const r = t.r - i * 4;
    ctx.fillRect(t.x - r, t.y - r - 3 + i * 3, r * 2, r * 2);
  }
  ctx.fillStyle = 'rgba(180,230,150,.35)';
  ctx.fillRect(t.x - t.r + 3, t.y - t.r, 5, 5);
}
function drawRock(r) {
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath(); ctx.ellipse(r.x, r.y + 6, r.r, r.r * .45, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#7d8089';
  ctx.fillRect(r.x - r.r, r.y - r.r * .7, r.r * 2, r.r * 1.4);
  ctx.fillStyle = '#9498a3';
  ctx.fillRect(r.x - r.r + 3, r.y - r.r * .6, r.r * .8, r.r * .5);
  ctx.fillStyle = '#5e6168';
  ctx.fillRect(r.x - r.r, r.y + r.r * .25, r.r * 2, r.r * .4);
}

/* ---------------- 像素士兵 ---------------- */
const SKIN_COLORS = [
  { body: '#3f7d45', dark: '#2f5e33', head: '#e0b08c', helm: '#35603a' },
  { body: '#5b5b8a', dark: '#44446a', head: '#d9a77f', helm: '#42426e' },
  { body: '#8a5b3a', dark: '#6e452c', head: '#e0b08c', helm: '#6e452c' },
  { body: '#6b6f72', dark: '#505457', head: '#d0a07a', helm: '#505457' },
];
function drawSoldier(ent, isPlayer) {
  const skin = isPlayer ? SKIN_COLORS[0] : SKIN_COLORS[(ent.skin || 0) + 1 > 3 ? 1 : (ent.skin || 0) + 1] || SKIN_COLORS[1];
  const lift = ent.hop > 0 ? -6 : 0;
  const x = Math.round(ent.x), y = Math.round(ent.y) + lift;

  // 影子
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.beginPath(); ctx.ellipse(ent.x, ent.y + 12, 12 - lift, 5, 0, 0, Math.PI * 2); ctx.fill();

  // 跳伞中：先画伞，人物画小一点
  if (ent.airborne) {
    drawParachute(x, y - 34, isPlayer);
  }

  const walkSwing = Math.sin(ent.walk) * 4;
  ctx.save();
  ctx.translate(x, y);

  // 腿
  ctx.fillStyle = skin.dark;
  if (ent.hop > 0) {
    ctx.fillRect(-6, 4, 5, 7); ctx.fillRect(2, 4, 5, 7);
  } else {
    ctx.fillRect(-6, 4, 5, 8 + Math.max(0, walkSwing));
    ctx.fillRect(2, 4, 5, 8 + Math.max(0, -walkSwing));
  }
  // 背包
  ctx.fillStyle = '#3a3528';
  ctx.fillRect(-10, -6, 5, 10);
  // 身体
  ctx.fillStyle = ent.hitFlash > 0 ? '#ff8a80' : skin.body;
  ctx.fillRect(-8, -7, 16, 13);
  ctx.fillStyle = skin.dark;
  ctx.fillRect(-8, 2, 16, 4);
  // 护甲
  if (ent.armor > 0) {
    ctx.fillStyle = isPlayer ? 'rgba(110,193,245,.85)' : 'rgba(160,170,180,.8)';
    ctx.fillRect(-7, -6, 14, 6);
  }
  // 头
  ctx.fillStyle = skin.head;
  ctx.fillRect(-5, -14, 10, 8);
  // 头盔
  ctx.fillStyle = skin.helm;
  ctx.fillRect(-6, -15, 12, 5);
  ctx.fillRect(-6, -12, 3, 3);

  // 朝向指示 / 武器
  ctx.rotate(ent.aim);
  const w = currentWeapon(ent);
  if (w.melee) {
    ctx.fillStyle = skin.head;
    ctx.fillRect(4, -2, 6, 4);
    ctx.fillStyle = '#cfd4db';
    ctx.fillRect(10, -2, 7, 2);
    ctx.fillStyle = '#6e5433';
    ctx.fillRect(8, -1, 3, 3);
  } else {
    ctx.fillStyle = skin.head;
    ctx.fillRect(4, -2, 7, 4);
    drawGunSprite(w, isPlayer);
  }
  ctx.restore();

  // 刀光
  if (ent.slash > 0 && isPlayer) {
    ctx.strokeStyle = 'rgba(255,255,255,.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, KNIFE.range, ent.aim - KNIFE.arc / 2, ent.aim + KNIFE.arc / 2);
    ctx.stroke();
  }

  // AI 血条（玩家不显示）
  if (!isPlayer && !ent.airborne) {
    const hpw = 26;
    ctx.fillStyle = 'rgba(0,0,0,.6)';
    ctx.fillRect(x - hpw / 2 - 1, y - 26, hpw + 2, 5);
    ctx.fillStyle = ent.hp > 40 ? '#7ec850' : '#e2483d';
    ctx.fillRect(x - hpw / 2, y - 25, hpw * clamp(ent.hp / 100, 0, 1), 3);
    if (ent.armor > 0) {
      ctx.fillStyle = '#6ec1f5';
      ctx.fillRect(x - hpw / 2, y - 29, hpw * clamp(ent.armor / 100, 0, 1), 2);
    }
  }
}

function drawGunSprite(w, isPlayer) {
  // 统一朝右绘制（已旋转到 aim）
  ctx.save();
  if (w.icon === 'pistol') {
    ctx.fillStyle = '#2c2f36'; ctx.fillRect(8, -2, 9, 4);
    ctx.fillStyle = '#5a4a33'; ctx.fillRect(9, 1, 4, 5);
  } else if (w.icon === 'smg') {
    ctx.fillStyle = '#22252b'; ctx.fillRect(6, -2, 17, 4);
    ctx.fillRect(12, 1, 3, 6);
    ctx.fillStyle = '#444a55'; ctx.fillRect(20, -1, 4, 2);
  } else if (w.icon === 'rifle') {
    ctx.fillStyle = '#22252b'; ctx.fillRect(4, -2, 24, 4);
    ctx.fillStyle = '#3c3f47'; ctx.fillRect(24, -1, 7, 2);
    ctx.fillStyle = '#5a4a33'; ctx.fillRect(8, 1, 5, 6);
    ctx.fillStyle = '#15171b'; ctx.fillRect(15, 2, 3, 4);
  } else if (w.icon === 'sniper') {
    ctx.fillStyle = '#22252b'; ctx.fillRect(4, -2, 30, 4);
    ctx.fillStyle = '#3c3f47'; ctx.fillRect(30, -1, 6, 2);
    ctx.fillStyle = '#11141a'; ctx.fillRect(10, -5, 10, 3); // 瞄准镜
    ctx.fillStyle = '#5a4a33'; ctx.fillRect(7, 1, 5, 6);
  }
  ctx.restore();
}

function drawParachute(x, y, isPlayer) {
  ctx.fillStyle = 'rgba(0,0,0,.2)';
  ctx.fillRect(x - 14, y + 2, 28, 4);
  // 伞绳
  ctx.strokeStyle = '#d8dce2';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - 14, y + 2); ctx.lineTo(x - 4, y + 30);
  ctx.moveTo(x + 14, y + 2); ctx.lineTo(x + 4, y + 30);
  ctx.moveTo(x, y + 2); ctx.lineTo(x, y + 30);
  ctx.stroke();
  // 伞面
  const c1 = isPlayer ? '#ffcc33' : '#c96a5a';
  const c2 = isPlayer ? '#e0a020' : '#a04a3c';
  ctx.fillStyle = c1;
  ctx.fillRect(x - 16, y - 8, 32, 10);
  ctx.fillRect(x - 12, y - 13, 24, 6);
  ctx.fillRect(x - 6, y - 17, 12, 5);
  ctx.fillStyle = c2;
  ctx.fillRect(x - 16, y, 8, 2);
  ctx.fillRect(x + 8, y, 8, 2);
}

/* ---------------- 飞机 ---------------- */
function drawPlane(p) {
  const x = Math.round(p.x), y = Math.round(p.y) - 120;
  ctx.fillStyle = 'rgba(0,0,0,.2)';
  ctx.beginPath(); ctx.ellipse(x, y + 130, 30, 8, 0, 0, Math.PI * 2); ctx.fill();
  if (p.horizontal) {
    ctx.fillStyle = '#b8c0cc';
    ctx.fillRect(x - 34, y - 8, 68, 16);
    ctx.fillStyle = '#8c95a3';
    ctx.fillRect(x + 20, y - 4, 18, 8);   // 机头
    ctx.fillStyle = '#d9dee6';
    ctx.fillRect(x - 26, y - 5, 16, 6);   // 窗
    ctx.fillRect(x - 6, y - 5, 12, 6);
    ctx.fillStyle = '#7c8593';
    ctx.fillRect(x - 8, y - 22, 16, 8);   // 机翼
    ctx.fillRect(x - 24, y + 8, 12, 7);   // 尾翼
  } else {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(Math.PI / 2);
    ctx.fillStyle = '#b8c0cc';
    ctx.fillRect(-34, -8, 68, 16);
    ctx.fillStyle = '#8c95a3';
    ctx.fillRect(20, -4, 18, 8);
    ctx.fillStyle = '#d9dee6';
    ctx.fillRect(-26, -5, 16, 6);
    ctx.fillRect(-6, -5, 12, 6);
    ctx.fillStyle = '#7c8593';
    ctx.fillRect(-8, -22, 16, 8);
    ctx.fillRect(-24, 8, 12, 7);
    ctx.restore();
  }
}

/* ---------------- 安全区 ---------------- */
function drawZone() {
  if (!zone) return;
  ctx.save();
  // 圈外压暗（用反向路径挖洞）
  ctx.fillStyle = 'rgba(30,70,170,.16)';
  ctx.beginPath();
  ctx.rect(camX - 20, camY - 20, W + 40, H + 40);
  ctx.moveTo(zone.cx + zone.r, zone.cy);
  ctx.arc(zone.cx, zone.cy, zone.r, 0, Math.PI * 2, true);
  ctx.fill();
  // 当前白圈
  ctx.strokeStyle = 'rgba(255,255,255,.9)';
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 10]);
  ctx.beginPath(); ctx.arc(zone.cx, zone.cy, zone.r, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  // 下一个目标圈
  if (!zone.shrinking && zone.phase < ZONE_PHASES.length) {
    ctx.strokeStyle = 'rgba(120,200,255,.7)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(zone.toCx, zone.toCy, zone.toR, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

/* ---------------- 子弹 / 粒子 ---------------- */
function drawBullets() {
  for (const b of bullets) {
    const tail = 12;
    const l = Math.hypot(b.vx, b.vy) || 1;
    const ux = b.vx / l, uy = b.vy / l;
    ctx.strokeStyle = b.owner === player ? 'rgba(255,235,150,.9)' : 'rgba(255,150,120,.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(b.x - ux * tail, b.y - uy * tail);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.fillStyle = '#fff8d0';
    ctx.fillRect(b.x - 1, b.y - 1, 2, 2);
  }
}
function drawParticles() {
  for (const p of particles) {
    const a = clamp(p.life / p.maxLife, 0, 1);
    if (p.kind === 'blood') ctx.fillStyle = 'rgba(190,40,40,' + a + ')';
    else if (p.kind === 'heal') ctx.fillStyle = 'rgba(120,255,150,' + a + ')';
    else ctx.fillStyle = 'rgba(255,210,110,' + a + ')';
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
}

/* ---------------- 屏幕 UI ---------------- */
function drawCrosshair() {
  if (state !== 'match' || !player.alive) return;
  const w = currentWeapon(player);
  // 后坐力：准星上扬 + 开花
  const spreadPx = 8 + player.bloom * 14 + (w.melee ? 0 : 4);
  const kickUp = player.kick * 16;
  const cx = mouseX, cy = mouseY - kickUp * 0.25;
  ctx.strokeStyle = 'rgba(255,255,255,.9)';
  ctx.lineWidth = 2;
  const gap = spreadPx, len = 8;
  ctx.beginPath();
  ctx.moveTo(cx, cy - gap); ctx.lineTo(cx, cy - gap - len);
  ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + gap + len);
  ctx.moveTo(cx - gap, cy); ctx.lineTo(cx - gap - len, cy);
  ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + gap + len, cy);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,80,80,.9)';
  ctx.fillRect(cx - 1, cy - 1, 2, 2);
  // 换弹进度圈
  if (player.reloadT > 0 && player.reloadWId) {
    const def = WEAPONS[player.reloadWId];
    const t = 1 - player.reloadT / def.reload;
    ctx.strokeStyle = 'rgba(255,204,51,.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy + 22, 8, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2);
    ctx.stroke();
  }
}

function drawBanners() {
  const box = document.getElementById('status-banner');
  let html = '';
  for (const n of notifications) {
    html += '<div class="banner-item ' + n.cls + '" style="opacity:' + clamp(n.life / .5, 0, 1) + '">' + n.text + '</div>';
  }
  if (box.innerHTML !== html) box.innerHTML = html;
}

function drawVignette() {
  if (player.alive && player.hp < 35) {
    const a = (1 - player.hp / 35) * 0.35 + Math.sin(gameTime * 6) * 0.05;
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.7);
    g.addColorStop(0, 'rgba(180,0,0,0)');
    g.addColorStop(1, 'rgba(180,0,0,' + clamp(a, 0, .5) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  if (player.hitFlash > 0) {
    ctx.fillStyle = 'rgba(220,40,40,' + player.hitFlash * 0.6 + ')';
    ctx.fillRect(0, 0, W, H);
  }
}

/* ---------------- 小地图 ---------------- */
function drawMinimap() {
  const size = 150, pad = 12;
  const mx = W - size - pad, my = H - size - pad - 30;
  ctx.save();
  // 顶部按钮区已占右上，小地图放右下
  ctx.fillStyle = 'rgba(10,14,18,.8)';
  ctx.fillRect(mx - 3, my - 3, size + 6, size + 6);
  ctx.beginPath();
  ctx.rect(mx, my, size, size);
  ctx.clip();
  const scale = size / WORLD;
  ctx.fillStyle = '#43733a';
  ctx.fillRect(mx, my, size, size);
  for (const b of waterBlobs) {
    ctx.fillStyle = '#3f7ea6';
    ctx.beginPath();
    ctx.ellipse(mx + b.x * scale, my + b.y * scale, b.rx * scale, b.ry * scale, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(170,150,110,.9)';
  for (const bd of buildings) ctx.fillRect(mx + bd.x * scale, my + bd.y * scale, Math.max(2, bd.w * scale), Math.max(2, bd.h * scale));
  if (zone) {
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(mx + zone.cx * scale, my + zone.cy * scale, zone.r * scale, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(120,200,255,.8)';
    if (!zone.shrinking) { ctx.beginPath(); ctx.arc(mx + zone.toCx * scale, my + zone.toCy * scale, zone.toR * scale, 0, Math.PI * 2); ctx.stroke(); }
  }
  // 敌人（只显示很近的）
  for (const b of bots) {
    if (!b.alive) continue;
    if (dist2(player.x, player.y, b.x, b.y) < 260 * 260) {
      ctx.fillStyle = '#e2483d';
      ctx.fillRect(mx + b.x * scale - 1.5, my + b.y * scale - 1.5, 3, 3);
    }
  }
  // 玩家
  ctx.fillStyle = '#ffcc33';
  ctx.fillRect(mx + player.x * scale - 2, my + player.y * scale - 2, 4, 4);
  ctx.restore();
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.strokeRect(mx - 3, my - 3, size + 6, size + 6);
  ctx.fillStyle = 'rgba(255,255,255,.7)';
  ctx.font = '10px "Courier New"';
  ctx.fillText('U 大地图', mx, my - 6);
}

/* ---------------- 大地图 ---------------- */
function drawBigMap() {
  const mc = document.getElementById('map-canvas');
  const m = mc.getContext('2d');
  m.imageSmoothingEnabled = false;
  const S = mc.width, scale = S / WORLD;
  m.fillStyle = '#43733a';
  m.fillRect(0, 0, S, S);
  m.drawImage(terrainCanvas, 0, 0, S, S);
  m.fillStyle = 'rgba(90,75,50,.9)';
  for (const bd of buildings) m.fillRect(bd.x * scale, bd.y * scale, Math.max(3, bd.w * scale), Math.max(3, bd.h * scale));
  if (zone) {
    m.fillStyle = 'rgba(30,70,170,.15)';
    m.beginPath();
    m.rect(0, 0, S, S);
    m.moveTo((zone.cx + zone.r) * scale, zone.cy * scale);
    m.arc(zone.cx * scale, zone.cy * scale, zone.r * scale, 0, Math.PI * 2, true);
    m.fill();
    m.strokeStyle = '#fff'; m.lineWidth = 2;
    m.beginPath(); m.arc(zone.cx * scale, zone.cy * scale, zone.r * scale, 0, Math.PI * 2); m.stroke();
    if (!zone.shrinking) {
      m.strokeStyle = '#7cc8ff';
      m.beginPath(); m.arc(zone.toCx * scale, zone.toCy * scale, zone.toR * scale, 0, Math.PI * 2); m.stroke();
    }
  }
  m.fillStyle = '#ffcc33';
  m.fillRect(player.x * scale - 3, player.y * scale - 3, 6, 6);
  if (state === 'plane' && plane && !plane.jumped) {
    m.fillStyle = '#fff';
    m.fillRect(plane.x * scale - 4, plane.y * scale - 4, 8, 8);
  }
}

/* ---------------- HUD 同步 ---------------- */
let hudCache = '';
function syncHUD() {
  const hp = Math.max(0, Math.round(player.hp));
  const armor = Math.max(0, Math.round(player.armor));
  document.getElementById('hp-bar').style.width = clamp(hp, 0, 100) + '%';
  document.getElementById('armor-bar').style.width = clamp(armor, 0, 100) + '%';
  document.getElementById('hp-text').textContent = hp;
  document.getElementById('armor-text').textContent = armor;
  const alive = bots.filter(b => b.alive).length + (player.alive ? 1 : 0);
  document.getElementById('alive-count').textContent = alive;
  document.getElementById('kill-count').textContent = killCount;

  const phaseEl = document.getElementById('phase-text');
  const timerEl = document.getElementById('zone-timer');
  const stateEl = document.getElementById('zone-state');
  if (state === 'plane') {
    phaseEl.textContent = '飞机巡航中';
    timerEl.textContent = '--:--';
  } else if (state === 'drop') {
    phaseEl.textContent = '跳伞降落中';
    timerEl.textContent = Math.ceil(player.alt / 150) + ' 秒';
  } else if (zone) {
    phaseEl.textContent = zone.shrinking ? ('第 ' + (zone.phase + 1) + ' 阶段 · 缩圈中')
                                         : ('第 ' + (zone.phase + 1) + ' 阶段 · 等待缩圈');
    const t = Math.max(0, Math.ceil(zone.timer));
    timerEl.textContent = Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
  }
  const outside = zone && player.alive && dist(player.x, player.y, zone.cx, zone.cy) > zone.r;
  stateEl.textContent = outside ? '在圈外！掉血' : (zone && zone.shrinking ? '正在缩圈' : '安全区');
  stateEl.className = outside ? 'danger' : (zone && zone.shrinking ? '' : 'safe');

  syncHotbar();
}

function syncHotbar() {
  const bar = document.getElementById('hotbar');
  const slots = [];
  for (let i = 0; i < player.guns.length && i < 3; i++) {
    const w = WEAPONS[player.guns[i]];
    const mag = player.mags[w.id] ?? 0;
    const reserve = player.reserve[w.ammoType] || 0;
    slots.push({ key: i + 1, name: w.name, active: player.slot === i,
      ammo: '<b>' + mag + '</b> / ' + w.mag + ' ｜ 备弹 ' + reserve });
  }
  while (slots.length < 3) {
    slots.push({ key: slots.length + 1, name: '— 空 —', active: false, ammo: '' });
  }
  slots.push({ key: 4, name: '近战刀', active: player.slot === -1, ammo: '伤害 34 · 近战' });
  // 药品附在第 5 格提示
  slots.push({ key: 'H', name: (player.meds.bandage > 0 || player.meds.medkit > 0)
    ? '绷带 x' + player.meds.bandage + ' / 医疗箱 x' + player.meds.medkit
    : '无药品', active: player.healT > 0, ammo: player.healT > 0 ? ('使用中 ' + Math.ceil(player.healT) + 's') : '按 H 使用' });

  const html = slots.map(s =>
    '<div class="slot' + (s.active ? ' active' : '') + '">' +
    '<span class="slot-key">[' + s.key + ']</span>' +
    '<span class="slot-name">' + s.name + '</span>' +
    '<span class="slot-ammo">' + s.ammo + '</span></div>').join('');
  if (hudCache !== html) { bar.innerHTML = html; hudCache = html; }
}
