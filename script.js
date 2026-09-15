// ================================================================
// script.js
// Moving Player + NPC chase + search ulang setiap Player bergerak
// ================================================================

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const algorithmSelect = document.getElementById("algorithm");
const heuristicSelect = document.getElementById("heuristic");
const runBtn = document.getElementById("runBtn");
const startBtn = document.getElementById("startBtn");
const resetBtn = document.getElementById("resetBtn");
const compareBtn = document.getElementById("compareBtn");
const debugCheckbox = document.getElementById("debugCheckbox");
const randomBtn = document.getElementById("randomBtn");

const animPlayBtn = document.getElementById("animPlayBtn");
const animStepBtn = document.getElementById("animStepBtn");
const animResetBtn = document.getElementById("animResetBtn");
const animSpeedSelect = document.getElementById("animSpeed");
const animStatsContent = document.getElementById("animStatsContent");

const statsContent = document.getElementById("statsContent");
const historyContent = document.getElementById("historyContent");
const message = document.getElementById("message");
const compareResult = document.getElementById("compareResult");

const COLS = 20;
const ROWS = 15;
const CELL = 40;
const GRID_WIDTH = COLS * CELL;
const GRID_HEIGHT = ROWS * CELL;

// Diubah menjadi 'let' agar bisa diacak ulang
let MAP = [
  "....................",
  "...###..............",
  "...#................",
  "...#......RRR.......",
  "...#......R.........",
  "...........R........",
  "....#####..R..###...",
  "...........R........",
  "...........R........",
  "..RRR......R........",
  "....R...............",
  "....R....#####......",
  "....R...............",
  ".........##.........",
  "...................."
];

// ================================================================
// Aset gambar: npc, player, 3 varian grass, 2 varian tree, water
// Untuk terrain yang punya beberapa varian (grass, tree), variannya
// diacak sekali per sel saat map dibuat/diacak, lalu disimpan supaya
// tidak berubah-ubah setiap kali frame di-redraw.
// ================================================================
const GRASS_KEYS = ["grass1", "grass2", "grass3"];
const TREE_KEYS = ["tree1", "tree2"];

const IMAGES = {};
function preloadImage(assetKey, src) {
  const img = new Image();
  img.src = src;
  IMAGES[assetKey] = img;
  // Kalau gambar baru selesai load setelah frame pertama, redraw sekali
  img.addEventListener("load", () => draw());
}
preloadImage("grass1", "grass.png");
preloadImage("grass2", "grass2.png");
preloadImage("grass3", "grass3.png");
preloadImage("tree1", "tree.png");
preloadImage("tree2", "tree2.png");
preloadImage("water", "water.png");
preloadImage("npc", "npc.png");
preloadImage("player", "player.png");

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// tileVariantMap[y][x] = key aset yang dipakai untuk sel tsb ("grass1"/"grass2"/
// "grass3" untuk rumput, "tree1"/"tree2" untuk tembok/pohon, "water" untuk sungai)
let tileVariantMap = [];
function generateTileVariants() {
  const variants = [];
  for (let y = 0; y < ROWS; y++) {
    const row = [];
    for (let x = 0; x < COLS; x++) {
      const terrain = MAP[y][x];
      if (terrain === "#") {
        row.push(pickRandom(TREE_KEYS));
      } else if (terrain === "R") {
        row.push("water");
      } else {
        row.push(pickRandom(GRASS_KEYS));
      }
    }
    variants.push(row);
  }
  return variants;
}
tileVariantMap = generateTileVariants();

const grid = {
  cols: COLS,
  rows: ROWS,
  isInside(cell) {
    return cell.x >= 0 && cell.x < this.cols &&
      cell.y >= 0 && cell.y < this.rows;
  },
  getTerrain(cell) {
    return MAP[cell.y][cell.x];
  },
  isPassable(cell) {
    return this.isInside(cell) && this.getTerrain(cell) !== "#";
  },
  getStepCost(cell) {
    return this.getTerrain(cell) === "R" ? 3 : 1;
  },
  getNeighbors(cell) {
    const moves = [
      { x: 0, y: -1 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 1, y: 0 }
    ];
    const neighbors = [];
    for (const move of moves) {
      const next = {
        x: cell.x + move.x,
        y: cell.y + move.y
      };
      if (this.isPassable(next)) {
        neighbors.push(next);
      }
    }
    return neighbors;
  }
};

// Diubah menjadi 'let'
let initialNpc = { x: 1, y: 13 };
let initialPlayer = { x: 18, y: 1 };

let npcCell = { ...initialNpc };
let playerCell = { ...initialPlayer };
let currentResult = null;
let isChasing = false;

let totalSearches = 0;
let totalExpanded = 0;
let totalSearchTime = 0;
let searchHistory = [];

// ---- Wavefront expansion animation state ----
// Node-node hasil search dikelompokkan per "kontur" (level cost yang sama).
// Animasi mengungkap kontur demi kontur, mirip visualisasi UCS wave.
let animContours = [];
let animRevealedKeys = new Set();
let animStepIndex = 0;
let animTimer = null;
let animPlaying = false;

function cellToPixel(cell) {
  return {
    x: cell.x * CELL,
    y: cell.y * CELL
  };
}

function sameCell(a, b) {
  return a.x === b.x && a.y === b.y;
}

function drawSprite(assetKey, dx, dy, size) {
  const img = IMAGES[assetKey];
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, dx, dy, size, size);
    return true;
  }
  return false;
}

function drawGrid() {
  ctx.clearRect(0, 0, GRID_WIDTH, GRID_HEIGHT);
  ctx.imageSmoothingEnabled = false; // aset pixel-art tetap tajam saat diperbesar

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const terrain = MAP[y][x];
      const px = x * CELL;
      const py = y * CELL;
      const variantKey = tileVariantMap[y] ? tileVariantMap[y][x] : null;

      if (terrain === "#") {
        // Base rumput dulu (aset tree punya area transparan), baru pohonnya di atas
        if (!drawSprite("grass1", px, py, CELL)) {
          ctx.fillStyle = "#d9f99d";
          ctx.fillRect(px, py, CELL, CELL);
        }
        if (!drawSprite(variantKey, px, py, CELL)) {
          ctx.fillStyle = "#6b7280";
          ctx.fillRect(px + 4, py + 4, CELL - 8, CELL - 8);
        }
      } else if (terrain === "R") {
        if (!drawSprite("water", px, py, CELL)) {
          ctx.fillStyle = "#60a5fa";
          ctx.fillRect(px, py, CELL, CELL);
        }
      } else {
        if (!drawSprite(variantKey, px, py, CELL)) {
          ctx.fillStyle = "#d9f99d";
          ctx.fillRect(px, py, CELL, CELL);
        }
      }

      ctx.strokeStyle = "rgba(107, 114, 128, 0.35)";
      ctx.strokeRect(px, py, CELL, CELL);

      if (terrain === "R") {
        ctx.fillStyle = "rgba(29, 78, 216, 0.9)";
        ctx.font = "bold 11px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("3", px + CELL - 9, py + CELL - 9);
      }
    }
  }
}

function drawDebug() {
  if (!currentResult) return;

  // Wave animasi: node yang sudah "di-expand" sejauh animasi berjalan.
  // Ditampilkan selalu (bukan hanya saat debug checkbox aktif) karena ini
  // adalah visualisasi utama untuk memahami urutan ekspansi node.
  for (const cellKey of animRevealedKeys) {
    const [x, y] = cellKey.split(",").map(Number);
    ctx.fillStyle = "rgba(255, 215, 0, 0.55)";
    ctx.fillRect(x * CELL + 5, y * CELL + 5, CELL - 10, CELL - 10);
  }

  // Highlight kontur yang baru saja terungkap (wave-front) dengan cincin biru
  const lastContour = animContours[animStepIndex - 1];
  if (lastContour) {
    ctx.strokeStyle = "rgba(37, 99, 235, 0.9)";
    ctx.lineWidth = 2;
    for (const node of lastContour.nodes) {
      ctx.strokeRect(node.x * CELL + 3, node.y * CELL + 3, CELL - 6, CELL - 6);
    }
  }

  if (!debugCheckbox.checked) return;

  for (const cell of currentResult.frontierNodes) {
    ctx.fillStyle = "rgba(70, 130, 255, 0.35)";
    ctx.fillRect(cell.x * CELL + 9, cell.y * CELL + 9, CELL - 18, CELL - 18);
  }
  for (const cell of currentResult.path) {
    ctx.fillStyle = "rgba(50, 205, 50, 0.60)";
    ctx.fillRect(cell.x * CELL + 12, cell.y * CELL + 12, CELL - 24, CELL - 24);
  }
}

function drawEntities() {
  const spriteSize = CELL - 4;
  const inset = 2;

  const player = cellToPixel(playerCell);
  if (!drawSprite("player", player.x + inset, player.y + inset, spriteSize)) {
    ctx.fillStyle = "#8b5cf6";
    ctx.beginPath();
    ctx.arc(player.x + CELL / 2, player.y + CELL / 2, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "white";
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("P", player.x + CELL / 2, player.y + CELL / 2);
  }

  const npc = cellToPixel(npcCell);
  if (!drawSprite("npc", npc.x + inset, npc.y + inset, spriteSize)) {
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(npc.x + CELL / 2, npc.y + CELL / 2, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "white";
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("N", npc.x + CELL / 2, npc.y + CELL / 2);
  }

  if (isChasing) {
    ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(npc.x + CELL / 2, npc.y + CELL / 2);
    ctx.lineTo(player.x + CELL / 2, player.y + CELL / 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function draw() {
  drawGrid();
  drawDebug();
  drawEntities();
}

function getSelectedHeuristic() {
  return getHeuristic(heuristicSelect.value);
}

function getAlgorithmName() {
  return algorithmSelect.value === "ucs" ? "UCS" : "A*";
}

function getHeuristicName() {
  if (algorithmSelect.value === "ucs") return "Zero";
  return heuristicSelect.options[heuristicSelect.selectedIndex].text;
}

function updateStats(result) {
  if (!result) {
    statsContent.innerHTML = "Belum ada perhitungan.";
    return;
  }
  const averageExpanded = totalSearches > 0 ? (totalExpanded / totalSearches).toFixed(2) : "0";
  const averageTime = totalSearches > 0 ? (totalSearchTime / totalSearches).toFixed(3) : "0";
  statsContent.innerHTML = `
    <table>
      <tr><td>Algorithm</td><td>${getAlgorithmName()}</td></tr>
      <tr><td>Heuristic</td><td>${getHeuristicName()}</td></tr>
      <tr><td>Current goal</td><td>(${playerCell.x}, ${playerCell.y})</td></tr>
      <tr><td>Current expanded</td><td>${result.expandedNodes}</td></tr>
      <tr><td>Current path cost</td><td>${result.pathCost ?? "No path"}</td></tr>
      <tr><td>Current path length</td><td>${result.pathLength}</td></tr>
      <tr><td>Current search time</td><td>${result.searchTimeMs.toFixed(3)} ms</td></tr>
      <tr><td>Total searches</td><td>${totalSearches}</td></tr>
      <tr><td>Total expanded</td><td>${totalExpanded}</td></tr>
      <tr><td>Average expanded</td><td>${averageExpanded}</td></tr>
      <tr><td>Average time</td><td>${averageTime} ms</td></tr>
    </table>
  `;
}

function updateHistory() {
  if (searchHistory.length === 0) {
    historyContent.innerHTML = "Belum ada perhitungan.";
    return;
  }
  const recent = searchHistory.slice(-12).reverse();
  historyContent.innerHTML = `
    <div class="history-box">
      <table>
        <tr><th>#</th><th>Goal</th><th>Expanded</th><th>Cost</th></tr>
        ${recent.map(item => `
          <tr>
            <td>${item.number}</td>
            <td>${item.goal}</td>
            <td>${item.expanded}</td>
            <td>${item.cost}</td>
          </tr>
        `).join("")}
      </table>
    </div>
  `;
}

// ================================================================
// Animasi wavefront ekspansi node (mirip UCS wave demo)
// ================================================================

function getAnimSpeedMs() {
  const value = animSpeedSelect ? animSpeedSelect.value : "normal";
  if (value === "slow") return 700;
  if (value === "fast") return 120;
  return 320;
}

function buildContours(expansionOrder) {
  const contours = [];
  let currentLevel = null;
  let currentGroup = null;
  for (const node of expansionOrder) {
    // Dibulatkan supaya heuristic euclidean (desimal) tetap terkelompok rapi
    const levelKey = Math.round(node.level * 1000) / 1000;
    if (currentGroup && levelKey === currentLevel) {
      currentGroup.push(node);
    } else {
      currentGroup = [node];
      currentLevel = levelKey;
      contours.push({ level: levelKey, nodes: currentGroup });
    }
  }
  return contours;
}

function stopAnimTimer() {
  if (animTimer) {
    clearInterval(animTimer);
    animTimer = null;
  }
  animPlaying = false;
  if (animPlayBtn) animPlayBtn.textContent = "▶ Play";
}

function prepareAnimation(result) {
  stopAnimTimer();
  animContours = result && result.expansionOrder ? buildContours(result.expansionOrder) : [];
  animRevealedKeys = new Set();
  animStepIndex = 0;
  updateAnimStats();
}

function updateAnimStats() {
  if (!animStatsContent) return;
  if (!currentResult || animContours.length === 0) {
    animStatsContent.innerHTML = "Belum ada data ekspansi.";
    return;
  }
  const totalNodes = currentResult.expandedNodes;
  const lastContour = animContours[animStepIndex - 1];
  const currentLevel = lastContour ? lastContour.level : "-";
  const nodesInContour = lastContour ? lastContour.nodes.length : 0;
  const done = animStepIndex >= animContours.length;
  animStatsContent.innerHTML = `
    <table>
      <tr><td>Kontur ke-</td><td>${animStepIndex} / ${animContours.length}</td></tr>
      <tr><td>Level kontur (g${getAlgorithmName() === "A*" ? "+h" : ""})</td><td>${currentLevel}</td></tr>
      <tr><td>Node pada kontur ini</td><td>${nodesInContour}</td></tr>
      <tr><td>Node ter-expand</td><td>${animRevealedKeys.size} / ${totalNodes}</td></tr>
      <tr><td>Status</td><td>${done ? "Selesai" : "Berjalan"}</td></tr>
    </table>
  `;
}

function stepAnimationOnce() {
  if (animStepIndex >= animContours.length) {
    stopAnimTimer();
    return;
  }
  const contour = animContours[animStepIndex];
  for (const node of contour.nodes) {
    animRevealedKeys.add(`${node.x},${node.y}`);
  }
  animStepIndex++;
  updateAnimStats();
  draw();
  if (animStepIndex >= animContours.length) {
    stopAnimTimer();
  }
}

function playAnimation() {
  if (!currentResult || animContours.length === 0) return;
  if (animPlaying) {
    stopAnimTimer();
    return;
  }
  // Kalau animasi sudah selesai, mulai ulang dari awal
  if (animStepIndex >= animContours.length) {
    animRevealedKeys = new Set();
    animStepIndex = 0;
  }
  animPlaying = true;
  animPlayBtn.textContent = "⏸ Pause";
  animTimer = setInterval(stepAnimationOnce, getAnimSpeedMs());
}

function resetAnimationView() {
  stopAnimTimer();
  animRevealedKeys = new Set();
  animStepIndex = 0;
  updateAnimStats();
  draw();
}

function calculateChasePath(showMessage = true) {
  const algorithm = algorithmSelect.value;
  const heuristic = algorithm === "ucs" ? zeroHeuristic : getSelectedHeuristic();

  const result = searchPath(grid, npcCell, playerCell, { algorithm, heuristic });
  currentResult = result;
  prepareAnimation(result);

  totalSearches++;
  totalExpanded += result.expandedNodes;
  totalSearchTime += result.searchTimeMs;

  searchHistory.push({
    number: totalSearches,
    goal: `(${playerCell.x}, ${playerCell.y})`,
    expanded: result.expandedNodes,
    cost: result.pathCost ?? "No path"
  });

  updateStats(result);
  updateHistory();

  if (showMessage) {
    if (result.found) {
      message.className = "message status-success";
      message.textContent = `Path ditemukan ke Player. Search #${totalSearches}.`;
    } else {
      message.className = "message status-error";
      message.textContent = "No path found.";
    }
  }
  draw();
  return result;
}

function moveNpcOneStep() {
  if (!isChasing) return;
  if (!currentResult || !currentResult.found) return;

  if (sameCell(npcCell, playerCell)) {
    message.className = "message status-success";
    message.textContent = "NPC sudah berada di posisi Player. Mengacak map baru...";
    setTimeout(randomizeMap, 1200);
    return;
  }

  const path = currentResult.path;
  const npcIndex = path.findIndex(cell => sameCell(cell, npcCell));
  if (npcIndex < 0 || npcIndex + 1 >= path.length) return;

  npcCell = { ...path[npcIndex + 1] };
  calculateChasePath(false);

  if (sameCell(npcCell, playerCell)) {
    message.className = "message status-success";
    message.textContent = "Tertangkap! NPC berhasil menangkap Player. Auto-reset dalam 1.5 detik...";
    isChasing = false; // Matikan gerakan player sementara
    setTimeout(randomizeMap, 1500);
  }
}

function movePlayer(dx, dy) {
  if (!isChasing && sameCell(npcCell, playerCell)) return; // Jangan gerak jika tertangkap

  const next = { x: playerCell.x + dx, y: playerCell.y + dy };
  if (!grid.isPassable(next)) {
    message.className = "message status-error";
    message.textContent = "Player tidak bisa bergerak ke cell tersebut.";
    return;
  }
  if (sameCell(next, playerCell)) return;

  playerCell = next;
  calculateChasePath(false);

  if (isChasing) {
    moveNpcOneStep();
    if (!sameCell(npcCell, playerCell)) {
      message.className = "message status-success";
      message.textContent = `Player bergerak 1 blok -> NPC bergerak 1 blok.`;
    }
  } else {
    message.className = "message status-success";
    message.textContent = `Player bergerak ke (${playerCell.x}, ${playerCell.y}). Tekan Start NPC Chase agar NPC ikut bergerak.`;
  }
  draw();
}

function runPathfinding() {
  calculateChasePath(true);
}

function startChase() {
  isChasing = true;
  calculateChasePath(false);
  message.className = "message status-success";
  message.textContent = "Mode chase aktif: setiap Player bergerak 1 blok, NPC bergerak 1 blok.";
}

function resetGame() {
  isChasing = false;
  npcCell = { ...initialNpc };
  playerCell = { ...initialPlayer };
  currentResult = null;
  totalSearches = 0;
  totalExpanded = 0;
  totalSearchTime = 0;
  searchHistory = [];
  stopAnimTimer();
  animContours = [];
  animRevealedKeys = new Set();
  animStepIndex = 0;
  statsContent.innerHTML = "Tekan Run atau gerakkan Player.";
  historyContent.innerHTML = "Belum ada perhitungan.";
  if (animStatsContent) animStatsContent.innerHTML = "Belum ada data ekspansi.";
  compareResult.innerHTML = "";
  message.className = "message";
  message.textContent = "";
  draw();
}

function randomizeMap() {
  MAP = [];
  for (let y = 0; y < ROWS; y++) {
    let row = "";
    for (let x = 0; x < COLS; x++) {
      const rand = Math.random();
      if (rand < 0.20) row += "#";
      else if (rand < 0.35) row += "R";
      else row += ".";
    }
    MAP.push(row);
  }

  tileVariantMap = generateTileVariants();

  function getRandomEmptyCell() {
    let cell;
    while (true) {
      const rx = Math.floor(Math.random() * COLS);
      const ry = Math.floor(Math.random() * ROWS);
      if (MAP[ry][rx] === ".") {
        cell = { x: rx, y: ry };
        break;
      }
    }
    return cell;
  }

  initialNpc = getRandomEmptyCell();
  do {
    initialPlayer = getRandomEmptyCell();
  } while (sameCell(initialNpc, initialPlayer));

  resetGame();
}

function compareAlgorithms() {
  const configs = [
    { name: "UCS", algorithm: "ucs", heuristic: zeroHeuristic },
    { name: "A* Manhattan", algorithm: "astar", heuristic: manhattanHeuristic },
    { name: "A* Euclidean", algorithm: "astar", heuristic: euclideanHeuristic }
  ];
  const results = configs.map(config => {
    const result = searchPath(grid, npcCell, playerCell, {
      algorithm: config.algorithm,
      heuristic: config.heuristic
    });
    return { ...config, result };
  });

  compareResult.innerHTML = `
    <h3>Comparison at current positions</h3>
    <table>
      <tr><th>Algorithm</th><th>Expanded</th><th>Cost</th><th>Length</th></tr>
      ${results.map(item => `
        <tr>
          <td>${item.name}</td>
          <td>${item.result.expandedNodes}</td>
          <td>${item.result.pathCost ?? "No path"}</td>
          <td>${item.result.pathLength}</td>
        </tr>
      `).join("")}
    </table>
  `;
  draw();
}

function handleKeydown(event) {
  const keyName = event.key.toLowerCase();
  const moves = {
    w: { x: 0, y: -1 }, arrowup: { x: 0, y: -1 },
    s: { x: 0, y: 1 }, arrowdown: { x: 0, y: 1 },
    a: { x: -1, y: 0 }, arrowleft: { x: -1, y: 0 },
    d: { x: 1, y: 0 }, arrowright: { x: 1, y: 0 }
  };
  if (!moves[keyName]) return;
  event.preventDefault();
  movePlayer(moves[keyName].x, moves[keyName].y);
}

algorithmSelect.addEventListener("change", () => {
  heuristicSelect.disabled = algorithmSelect.value === "ucs";
  calculateChasePath(true);
});
heuristicSelect.addEventListener("change", () => {
  if (algorithmSelect.value === "astar") calculateChasePath(true);
});

runBtn.addEventListener("click", runPathfinding);
startBtn.addEventListener("click", startChase);
resetBtn.addEventListener("click", resetGame);
randomBtn.addEventListener("click", randomizeMap);
compareBtn.addEventListener("click", compareAlgorithms);
debugCheckbox.addEventListener("change", draw);
window.addEventListener("keydown", handleKeydown);

if (animPlayBtn) animPlayBtn.addEventListener("click", playAnimation);
if (animStepBtn) animStepBtn.addEventListener("click", stepAnimationOnce);
if (animResetBtn) animResetBtn.addEventListener("click", resetAnimationView);

heuristicSelect.disabled = false;
resetGame();