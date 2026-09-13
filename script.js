// ================================================================
// script.js
// Handles game logic, rendering, user interaction, and pathfinding integration.
// ------------------------------------------------
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

// Convert grid cell coordinates to pixel positions on the canvas.
function cellToPixel(cell) {
  return {
    x: cell.x * CELL,
    y: cell.y * CELL
  };
}

// Check if two cells have identical coordinates.
function sameCell(a, b) {
  return a.x === b.x && a.y === b.y;
}

// Render the grid background, terrain colors, and optional labels.
function drawGrid() {
  ctx.clearRect(0, 0, GRID_WIDTH, GRID_HEIGHT);
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const terrain = MAP[y][x];
      const px = x * CELL;
      const py = y * CELL;
      if (terrain === "#") {
        ctx.fillStyle = "#6b7280";
      } else if (terrain === "R") {
        ctx.fillStyle = "#60a5fa";
      } else {
        ctx.fillStyle = "#d9f99d";
      }
      ctx.fillRect(px, py, CELL, CELL);
      ctx.strokeStyle = "#9ca3af";
      ctx.strokeRect(px, py, CELL, CELL);

      if (terrain === "#") {
        ctx.fillStyle = "#374151";
        ctx.font = "20px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(" ", px + CELL / 2, py + CELL / 2);
      } else if (terrain === "R") {
        ctx.fillStyle = "#1d4ed8";
        ctx.font = "13px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("3", px + CELL / 2, py + CELL / 2);
      }
    }
  }
}

// Draw debugging overlays: expanded nodes, frontier, and final path.
function drawDebug() {
  if (!debugCheckbox.checked || !currentResult) return;
  for (const item of currentResult.expandedNodesList) {
    const [x, y] = item.split(",").map(Number);
    ctx.fillStyle = "rgba(255, 215, 0, 0.55)";
    ctx.fillRect(x * CELL + 5, y * CELL + 5, CELL - 10, CELL - 10);
  }
  for (const cell of currentResult.frontierNodes) {
    ctx.fillStyle = "rgba(70, 130, 255, 0.35)";
    ctx.fillRect(cell.x * CELL + 9, cell.y * CELL + 9, CELL - 18, CELL - 18);
  }
  for (const cell of currentResult.path) {
    ctx.fillStyle = "rgba(50, 205, 50, 0.60)";
    ctx.fillRect(cell.x * CELL + 12, cell.y * CELL + 12, CELL - 24, CELL - 24);
  }
}

// Render player and NPC entities, and connection line when chasing.
function drawEntities() {
  const player = cellToPixel(playerCell);
  ctx.fillStyle = "#8b5cf6";
  ctx.beginPath();
  ctx.arc(player.x + CELL / 2, player.y + CELL / 2, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "white";
  ctx.font = "bold 12px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("P", player.x + CELL / 2, player.y + CELL / 2);

  const npc = cellToPixel(npcCell);
  ctx.fillStyle = "#ef4444";
  ctx.beginPath();
  ctx.arc(npc.x + CELL / 2, npc.y + CELL / 2, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "white";
  ctx.fillText("N", npc.x + CELL / 2, npc.y + CELL / 2);

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

// Main draw routine: grid, debug info, and entities.
function draw() {
  drawGrid();
  drawDebug();
  drawEntities();
}

// Retrieve the currently selected heuristic function.
function getSelectedHeuristic() {
  return getHeuristic(heuristicSelect.value);
}

// Return the display name of the selected algorithm.
function getAlgorithmName() {
  return algorithmSelect.value === "ucs" ? "UCS" : "A*";
}

// Return the name of the selected heuristic (or Zero for UCS).
function getHeuristicName() {
  if (algorithmSelect.value === "ucs") return "Zero";
  return heuristicSelect.options[heuristicSelect.selectedIndex].text;
}

// Update the statistics panel with the latest search results.
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

// Refresh the search history display with recent runs.
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

// Compute the NPC chase path using the selected algorithm and update UI.
function calculateChasePath(showMessage = true) {
  const algorithm = algorithmSelect.value;
  const heuristic = algorithm === "ucs" ? zeroHeuristic : getSelectedHeuristic();

  const result = searchPath(grid, npcCell, playerCell, { algorithm, heuristic });
  currentResult = result;

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

// Advance the NPC one step along the current path toward the player.
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

// Move the player by the given delta if the target cell is passable.
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

// Trigger a single pathfinding run and display results.
function runPathfinding() {
  calculateChasePath(true);
}

// Activate chase mode: NPC will follow the player on each move.
function startChase() {
  isChasing = true;
  calculateChasePath(false);
  message.className = "message status-success";
  message.textContent = "Mode chase aktif: setiap Player bergerak 1 blok, NPC bergerak 1 blok.";
}

// Reset all game state to initial conditions.
function resetGame() {
  isChasing = false;
  npcCell = { ...initialNpc };
  playerCell = { ...initialPlayer };
  currentResult = null;
  totalSearches = 0;
  totalExpanded = 0;
  totalSearchTime = 0;
  searchHistory = [];
  statsContent.innerHTML = "Tekan Run atau gerakkan Player.";
  historyContent.innerHTML = "Belum ada perhitungan.";
  compareResult.innerHTML = "";
  message.className = "message";
  message.textContent = "";
  draw();
}

// Generate a new random map layout and reposition entities.
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

// Compare multiple algorithms on the current map configuration.
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

// Handle keyboard input for player movement.
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

heuristicSelect.disabled = false;
resetGame();