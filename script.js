// ================================================================
// script.js
// Moving Player + NPC chase (Otomatis) + Wavefront Red + Always-On Overlay
// Mengelola rendering canvas, logika pergerakan entity, interaksi event, dan UI.
// ================================================================

// Inisialisasi referensi elemen HTML DOM
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const algorithmSelect = document.getElementById("algorithm");
const heuristicSelect = document.getElementById("heuristic");
const resetBtn = document.getElementById("resetBtn");
const randomBtn = document.getElementById("randomBtn");

const statsContent = document.getElementById("statsContent");
const historyContent = document.getElementById("historyContent");
const message = document.getElementById("message");
const compareResult = document.getElementById("compareResult");

const gameOverModal = document.getElementById("gameOverModal");
const restartBtn = document.getElementById("restartBtn");

// Konstanta Dimensi Grid Dunia Game
const COLS = 20;            // Jumlah kolom grid
const ROWS = 15;            // Jumlah baris grid
const CELL = 40;            // Ukuran per petak dalam piksel (40x40 px)
const GRID_WIDTH = COLS * CELL;   // Total lebar canvas = 800px
const GRID_HEIGHT = ROWS * CELL;  // Total tinggi canvas = 600px

let MAP = []; // Array 2D menyimpan tipe terrain peta: '.' = Rumput, '#' = Tembok/Pohon, 'R' = Sungai/Air

// Kunci aset gambar sprite
const GRASS_KEYS = ["grass1", "grass2", "grass3"];
const TREE_KEYS = ["tree1", "tree2"];

// Objek penampung memori aset gambar (Image Preloader)
const IMAGES = {};
function preloadImage(assetKey, src) {
  const img = new Image();
  img.src = src;
  IMAGES[assetKey] = img;
  img.addEventListener("load", () => draw()); // Gambar ulang canvas ketika gambar selesai dimuat
}

// Memuat seluruh sprite gambar permainan
preloadImage("grass1", "grass.png");
preloadImage("grass2", "grass2.png");
preloadImage("grass3", "grass3.png");
preloadImage("tree1", "tree.png");
preloadImage("tree2", "tree2.png");
preloadImage("water", "water.png");
preloadImage("npc", "npc.png");
preloadImage("player", "player.png");

/**
 * Mengambil satu elemen secara acak dari sebuah array.
 */
function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// Menyimpan pemetaan variasi tekstur visual per tile agar acak namun konsisten saat digambar ulang
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

/**
 * Objek Grid API yang dilewatkan ke fungsi searchPath pada pathfinding.js
 */
const grid = {
  cols: COLS,
  rows: ROWS,
  // Memeriksa batas area map
  isInside(cell) {
    return cell.x >= 0 && cell.x < this.cols &&
      cell.y >= 0 && cell.y < this.rows;
  },
  // Mengambil tipe terrain pada koordinat tertentu
  getTerrain(cell) {
    return MAP[cell.y][cell.x];
  },
  // Memeriksa apakah cell bisa dilewati (bukan tembok '#')
  isPassable(cell) {
    return this.isInside(cell) && this.getTerrain(cell) !== "#";
  },
  // Mendapatkan biaya masuk per petak: Sungai ('R') berbiaya 7, Rumput biasa berbiaya 1
  getStepCost(cell) {
    return this.getTerrain(cell) === "R" ? 7 : 1;
  },
  // Mengambil tetangga (4-connected: Atas, Bawah, Kiri, Kanan)
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

// State posisi awal dan posisi aktif Entity Game
let initialNpc = { x: 0, y: 0 };
let initialPlayer = { x: 0, y: 0 };

let npcCell = { ...initialNpc };
let playerCell = { ...initialPlayer };
let currentResult = null; // Menyimpan objek hasil return dari searchPath()
let isChasing = true;
let isGameOver = false;

// Variabel Metrik Statistik Kumulatif
let totalSearches = 0;
let totalExpanded = 0;
let totalSearchTime = 0;
let searchHistory = [];

// ---- State Animasi Gelombang Ekspansi Node (Wavefront Animation) ----
let animContours = [];
let animRevealedKeys = new Set();
let animStepIndex = 0;
let animTimer = null;
let animPlaying = false;

/**
 * Konversi koordinat grid {x, y} ke koordinat piksel canvas.
 */
function cellToPixel(cell) {
  return {
    x: cell.x * CELL,
    y: cell.y * CELL
  };
}

/**
 * Memeriksa kesamaan koordinat dua sel.
 */
function sameCell(a, b) {
  return a.x === b.x && a.y === b.y;
}

/**
 * Menggambar sprite gambar ke canvas jika dimuat, dengan pengamanan fallback.
 */
function drawSprite(assetKey, dx, dy, size) {
  const img = IMAGES[assetKey];
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, dx, dy, size, size);
    return true;
  }
  return false;
}

/**
 * Menggambar seluruh lingkungan peta (Terrain, Gridlines, dan Label Biaya Sungai)
 */
function drawGrid() {
  ctx.clearRect(0, 0, GRID_WIDTH, GRID_HEIGHT);
  ctx.imageSmoothingEnabled = false;

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const terrain = MAP[y][x];
      const px = x * CELL;
      const py = y * CELL;
      const variantKey = tileVariantMap[y] ? tileVariantMap[y][x] : null;

      if (terrain === "#") { // Pohon / Tembok
        if (!drawSprite("grass1", px, py, CELL)) {
          ctx.fillStyle = "#d9f99d";
          ctx.fillRect(px, py, CELL, CELL);
        }
        if (!drawSprite(variantKey, px, py, CELL)) {
          ctx.fillStyle = "#6b7280";
          ctx.fillRect(px + 4, py + 4, CELL - 8, CELL - 8);
        }
      } else if (terrain === "R") { // Sungai / Air
        if (!drawSprite("water", px, py, CELL)) {
          ctx.fillStyle = "#60a5fa";
          ctx.fillRect(px, py, CELL, CELL);
        }
      } else { // Rumput biasa
        if (!drawSprite(variantKey, px, py, CELL)) {
          ctx.fillStyle = "#d9f99d";
          ctx.fillRect(px, py, CELL, CELL);
        }
      }

      // Garis grid pembatas petak
      ctx.strokeStyle = "rgba(107, 114, 128, 0.35)";
      ctx.strokeRect(px, py, CELL, CELL);

      // Berikan angka label biaya "7" untuk petak sungai
      if (terrain === "R") {
        ctx.fillStyle = "rgba(29, 78, 216, 0.9)";
        ctx.font = "bold 11px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("7", px + CELL - 9, py + CELL - 9);
      }
    }
  }
}

/**
 * Menggambar Debug Overlay (Expanded Nodes, Wavefront Frontier, dan Jalur Optimal Final)
 */
function drawDebug() {
  if (!currentResult) return;

  // 1. Gambar petak biru transparan untuk node yang sudah di-expand (Explored Set)
  for (const cellKey of animRevealedKeys) {
    const [x, y] = cellKey.split(",").map(Number);
    ctx.fillStyle = "rgba(24, 132, 252, 0.68)";
    ctx.fillRect(x * CELL + 5, y * CELL + 5, CELL - 10, CELL - 10);
  }

  // 2. Gambar garis tepi merah untuk kontur gelombang ekspansi yang sedang aktif
  const lastContour = animContours[animStepIndex - 1];
  if (lastContour) {
    ctx.strokeStyle = "rgba(235, 37, 37, 0.9)";
    ctx.lineWidth = 2;
    for (const node of lastContour.nodes) {
      ctx.strokeRect(node.x * CELL + 3, node.y * CELL + 3, CELL - 6, CELL - 6);
    }
  }

  // 3. Gambar kotak biru gelap untuk node yang berada di dalam Frontier (Open Set)
  for (const cell of currentResult.frontierNodes) {
    ctx.fillStyle = "rgba(41, 30, 244, 0.79)";
    ctx.fillRect(cell.x * CELL + 9, cell.y * CELL + 9, CELL - 18, CELL - 18);
  }

  // 4. Gambar kotak kuning terang untuk memperlihatkan Jalur Solusi Terpendek
  for (const cell of currentResult.path) {
    ctx.fillStyle = "rgba(255, 238, 0, 1)";
    ctx.fillRect(cell.x * CELL + 12, cell.y * CELL + 12, CELL - 24, CELL - 24);
  }
}

/**
 * Menggambar karakter Player, NPC, dan garis target pergejaran.
 */
function drawEntities() {
  const spriteSize = CELL - 4;
  const inset = 2;

  // Gambar Player
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

  // Gambar NPC
  const npc = cellToPixel(npcCell);
  if (!drawSprite("npc", npc.x + inset, npc.y + inset, spriteSize)) {
    ctx.fillStyle = "#fb0202";
    ctx.beginPath();
    ctx.arc(npc.x + CELL / 2, npc.y + CELL / 2, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "white";
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("N", npc.x + CELL / 2, npc.y + CELL / 2);
  }

  // Gambar Garis Putus-putus penghubung NPC -> Player saat pengejar aktif
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

/**
 * Master Render Loop untuk menggambar ulang seluruh tampilan canvas.
 */
function draw() {
  drawGrid();
  drawDebug();
  drawEntities();
}

/**
 * Mendapatkan referensi fungsi heuristik aktif dari dropdown UI.
 */
function getSelectedHeuristic() {
  return getHeuristic(heuristicSelect.value);
}

/**
 * Mendapatkan string nama algoritma untuk ditampilkan di statistik.
 */
function getAlgorithmName() {
  return algorithmSelect.value === "ucs" ? "UCS" : "A*";
}

/**
 * Mendapatkan string nama heuristik terpopuler.
 */
function getHeuristicName() {
  if (algorithmSelect.value === "ucs") return "Zero";
  return heuristicSelect.options[heuristicSelect.selectedIndex].text;
}

/**
 * Memperbarui tabel informasi statistik di panel kanan UI.
 */
function updateStats(result) {
  if (!result) {
    statsContent.innerHTML = "Belum ada perhitungan.";
    return;
  }
  const averageExpanded = totalSearches > 0 ? (totalExpanded / totalSearches).toFixed(2) : "0";
  const averageTime = totalSearches > 0 ? (totalSearchTime / totalSearches).toFixed(3) : "0";
  statsContent.innerHTML = `
    <table>
      <tr><td>Algoritma</td><td>${getAlgorithmName()}</td></tr>
      <tr><td>Heuristik</td><td>${getHeuristicName()}</td></tr>
      <tr><td>Tujuan Saat Ini</td><td>(${playerCell.x}, ${playerCell.y})</td></tr>
      <tr><td>Expanded Saat Ini</td><td>${result.expandedNodes}</td></tr>
      <tr><td>Path cost Saat Ini</td><td>${result.pathCost ?? "No path"}</td></tr>
      <tr><td>Path length Saat Ini</td><td>${result.pathLength}</td></tr>
      <tr><td>Waktu pencarian Saat Ini</td><td>${result.searchTimeMs.toFixed(3)} ms</td></tr>
      <tr><td>Total pencarian</td><td>${totalSearches}</td></tr>
      <tr><td>Total expanded</td><td>${totalExpanded}</td></tr>
      <tr><td>Rata-rata expanded</td><td>${averageExpanded}</td></tr>
      <tr><td>Rata-rata waktu</td><td>${averageTime} ms</td></tr>
    </table>
  `;
}

/**
 * Memperbarui tabel riwayat pencarian jalur terakhir.
 */
function updateHistory() {
  if (searchHistory.length === 0) {
    historyContent.innerHTML = "Belum ada perhitungan.";
    return;
  }
  const recent = searchHistory.slice(-12).reverse(); // Tampilkan 12 pencarian terakhir secara terbalik (terbaru di atas)
  historyContent.innerHTML = `
    <div class="history-box">
      <table>
        <tr><th>No</th><th>Aksi</th><th>Tujuan</th><th>Expanded</th><th>Cost</th></tr>
        ${recent.map(item => {
    const icon = item.source === "player" ? "Player" : "NPC";
    return `
            <tr>
              <td>${item.number}</td>
              <td>${icon}</td>
              <td>${item.goal}</td>
              <td>${item.expanded}</td>
              <td>${item.cost}</td>
            </tr>
          `;
  }).join("")}
      </table>
    </div>
  `;
}

// ================================================================
// Animasi wavefront ekspansi node (Otomatis)
// Mengelompokkan node berdasarkan level f-score / g-score untuk simulasi gelombang
// ================================================================

function buildContours(expansionOrder) {
  const contours = [];
  let currentLevel = null;
  let currentGroup = null;
  for (const node of expansionOrder) {
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
}

function prepareAnimation(result) {
  stopAnimTimer();
  animContours = result && result.expansionOrder ? buildContours(result.expansionOrder) : [];
  animRevealedKeys = new Set();
  animStepIndex = 0;
  playAnimation();
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
  draw();
  if (animStepIndex >= animContours.length) {
    stopAnimTimer();
  }
}

function playAnimation() {
  if (!currentResult || animContours.length === 0) return;
  if (animStepIndex >= animContours.length) {
    animRevealedKeys = new Set();
    animStepIndex = 0;
  }
  animPlaying = true;
  animTimer = setInterval(stepAnimationOnce, 320); // Interval tiap kontur di-render
}

/**
 * Menampilkan modal popup Game Over.
 */
function showGameOverModal() {
  isGameOver = true;
  gameOverModal.classList.remove("hidden");
}

/**
 * Menyembunyikan modal popup Game Over.
 */
function hideGameOverModal() {
  isGameOver = false;
  gameOverModal.classList.add("hidden");
}

/**
 * Menjalankan simulasi paralel perbandingan antara UCS, A* Manhattan, dan A* Euclidean
 * untuk dibandingkan performanya pada kondisi peta & posisi saat ini.
 */
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
    <h3>Perbandingan pada Posisi Saat Ini</h3>
    <table>
      <tr><th>Algoritma</th><th>Expanded</th><th>Cost</th><th>Panjang</th></tr>
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
}

/**
 * Menghitung ulang jalur pengejaran NPC menuju Player menggunakan konfigurasi aktif.
 */
function calculateChasePath(showMessage = true, source = "player") {
  const algorithm = algorithmSelect.value;
  const heuristic = algorithm === "ucs" ? zeroHeuristic : getSelectedHeuristic();

  // Panggil modul pathfinding.js
  const result = searchPath(grid, npcCell, playerCell, { algorithm, heuristic });
  currentResult = result;

  totalSearches++;
  totalExpanded += result.expandedNodes;
  totalSearchTime += result.searchTimeMs;

  searchHistory.push({
    number: totalSearches,
    source: source,
    goal: `(${playerCell.x}, ${playerCell.y})`,
    expanded: result.expandedNodes,
    cost: result.pathCost ?? "No path"
  });

  updateStats(result);
  updateHistory();
  prepareAnimation(result);
  compareAlgorithms();

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

/**
 * Mengerakkan NPC satu langkah maju mengikuti jalur hasil kalkulasi pathfinding.
 */
function moveNpcOneStep() {
  if (!isChasing || isGameOver) return;
  if (!currentResult || !currentResult.found) return;

  // Jika sudah berada pada petak yang sama dengan Player
  if (sameCell(npcCell, playerCell)) {
    showGameOverModal();
    return;
  }

  const path = currentResult.path;
  const npcIndex = path.findIndex(cell => sameCell(cell, npcCell));
  if (npcIndex < 0 || npcIndex + 1 >= path.length) return;

  // NPC berpindah ke node berikutnya di sepanjang path
  npcCell = { ...path[npcIndex + 1] };
  calculateChasePath(false, "npc");

  // Pengecekan tabrakan/tertangkap setelah bergerak
  if (sameCell(npcCell, playerCell)) {
    message.className = "message status-error";
    message.textContent = "Tertangkap! NPC berhasil menangkap Player.";
    setTimeout(showGameOverModal, 400);
  }
}

/**
 * Memindahkan Player berdasarkan input tombol key.
 */
function movePlayer(dx, dy) {
  if (isGameOver || sameCell(npcCell, playerCell)) return;

  const next = { x: playerCell.x + dx, y: playerCell.y + dy };
  // Batasi gerakan jika menabrak tembok/pohon
  if (!grid.isPassable(next)) {
    message.className = "message status-error";
    return;
  }
  if (sameCell(next, playerCell)) return;

  playerCell = next;
  calculateChasePath(false, "player");

  // NPC merespons pergerakan player dengan melangkah mengejar
  if (isChasing) {
    moveNpcOneStep();
    if (!sameCell(npcCell, playerCell)) {
      message.className = "message status-success";
    }
  }
  draw();
}

/**
 * Mengembalikan state game dan posisi entity ke posisi awal.
 */
function resetGame() {
  hideGameOverModal();
  isChasing = true;
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
  statsContent.innerHTML = "Gerakkan Player untuk mulai.";
  historyContent.innerHTML = "Belum ada perhitungan.";
  compareResult.innerHTML = "";
  message.className = "message";
  message.textContent = "";
  calculateChasePath(false, "player");
}

/**
 * Memeriksa apakah suatu sel memiliki minimal 1 tetangga yang passable.
 */
function hasPassableNeighbor(cell) {
  return grid.getNeighbors(cell).length > 0;
}

/**
 * Membuat peta acak baru (Random Map Generator) dengan syarat ada jalur yang valid antara NPC dan Player.
 */
function randomizeMap() {
  hideGameOverModal();

  let mapValid = false;
  while (!mapValid) {
    MAP = [];
    for (let y = 0; y < ROWS; y++) {
      let row = "";
      for (let x = 0; x < COLS; x++) {
        const rand = Math.random();
        if (rand < 0.20) row += "#";      // 20% Peluang Tembok/Pohon
        else if (rand < 0.35) row += "R"; // 15% Peluang Sungai/Air
        else row += ".";                  // 65% Rumput Biasa
      }
      MAP.push(row);
    }

    tileVariantMap = generateTileVariants();

    // Fungsi helper penempatan acak koordinat awal NPC dan Player
    function getRandomEmptyCell(mustBeMovable = false) {
      let cell;
      let attempts = 0;
      while (attempts < 500) {
        attempts++;
        const rx = Math.floor(Math.random() * COLS);
        const ry = Math.floor(Math.random() * ROWS);
        if (MAP[ry][rx] !== "#") {
          cell = { x: rx, y: ry };
          if (!mustBeMovable || hasPassableNeighbor(cell)) {
            return cell;
          }
        }
      }
      return cell;
    }

    initialNpc = getRandomEmptyCell(false);
    let attempts = 0;
    do {
      attempts++;
      initialPlayer = getRandomEmptyCell(true);
    } while (sameCell(initialNpc, initialPlayer) && attempts < 100);

    // Validasi apakah map solvable (ada jalur dari NPC ke Player)
    const testResult = searchPath(grid, initialNpc, initialPlayer, { algorithm: "ucs" });
    if (testResult.found && testResult.path.length > 1) {
      mapValid = true;
    }
  }

  resetGame();
}

/**
 * Keyboard Event Listener (W, A, S, D & Arrow Keys)
 */
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

// Event Listeners Kontrol UI
algorithmSelect.addEventListener("change", () => {
  heuristicSelect.disabled = algorithmSelect.value === "ucs";
  calculateChasePath(true, "player");
});
heuristicSelect.addEventListener("change", () => {
  if (algorithmSelect.value === "astar") calculateChasePath(true, "player");
});

resetBtn.addEventListener("click", resetGame);
randomBtn.addEventListener("click", randomizeMap);
restartBtn.addEventListener("click", randomizeMap);
window.addEventListener("keydown", handleKeydown);

// Startup/Inisialisasi aplikasi pertama kali
heuristicSelect.disabled = false;
randomizeMap();