// ================================================================
// pathfinding.js
// Priority Queue sederhana + UCS + A* + heuristic + reconstruction
// Modul core algoritma pencarian jalur yang digunakan NPC
// ================================================================

/**
 * Kelas PriorityQueue (Min-Priority Queue)
 * Digunakan untuk menyimpa node frontier yang akan di-expand berdasarkan nilai prioritas terkecil.
 */
class PriorityQueue {
  constructor() {
    this.items = [];   // Array penampung elemen
    this.counter = 0; // Counter urutan pendaftaran (digunakan untuk tie-breaking / pertimbangan sekunder)
  }

  /**
   * Menambahkan elemen baru ke dalam queue dan mengurutkannya secara mendaki (ascending).
   * @param {Object} item - Koordinat/Node cell {x, y}
   * @param {number} priority - Nilai evaluasi f(n) = g(n) + h(n) atau g(n) untuk UCS
   * @param {number} secondary - Nilai sekunder untuk tie-breaking (misal nilai h(n))
   */
  enqueue(item, priority, secondary = 0) {
    this.items.push({
      item,
      priority,
      secondary,
      order: this.counter++ // Menyimpan urutan elemen saat dimasukkan
    });

    // Mengurutkan elemen di dalam queue
    this.items.sort((a, b) => {
      // Prioritas utama: nilai f(n) atau g(n) paling kecil
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      // Prioritas sekunder jika nilai f(n) sama (misal h(n) terkecil)
      if (a.secondary !== b.secondary) {
        return a.secondary - b.secondary;
      }
      // Tie-breaking akhir: urutan masuk (FIFO)
      return a.order - b.order;
    });
  }

  /**
   * Mengambil dan menghapus node dengan prioritas terendah (paling optimal) dari awal array.
   */
  dequeue() {
    return this.items.shift();
  }

  /**
   * Memeriksa apakah queue kosong.
   */
  isEmpty() {
    return this.items.length === 0;
  }

  /**
   * Mengembalikan daftar node yang saat ini berada di dalam frontier.
   */
  toArray() {
    return this.items.map(entry => entry.item);
  }
}

/**
 * Fungsi Heuristik h(n) = 0
 * Digunakan oleh Uniform-Cost Search (UCS), membuat f(n) = g(n)
 */
function zeroHeuristic(current, goal) {
  return 0;
}

/**
 * Fungsi Heuristik Manhattan Distance
 * Cocok untuk grid 4-connected (gerakan horizontal dan vertikal tanpa diagonal).
 * Formula: |x1 - x2| + |y1 - y2|
 */
function manhattanHeuristic(current, goal) {
  return Math.abs(current.x - goal.x) + Math.abs(current.y - goal.y);
}

/**
 * Fungsi Heuristik Euclidean Distance
 * Menghitung jarak garis lurus dari titik asal ke titik tujuan.
 * Formula: sqrt((x1 - x2)^2 + (y1 - y2)^2)
 */
function euclideanHeuristic(current, goal) {
  const dx = current.x - goal.x;
  const dy = current.y - goal.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Factory function untuk mengambil fungsi heuristik berdasarkan nama.
 * @param {string} name - "manhattan", "euclidean", atau default zero.
 */
function getHeuristic(name) {
  if (name === "manhattan") return manhattanHeuristic;
  if (name === "euclidean") return euclideanHeuristic;
  return zeroHeuristic;
}

/**
 * Mengubah koordinat objek {x, y} menjadi string unik sebagai key Hash Map/Set.
 */
function key(cell) {
  return `${cell.x},${cell.y}`;
}

/**
 * Memeriksa apakah dua cell memiliki koordinat yang sama persis.
 */
function sameCell(a, b) {
  return a.x === b.x && a.y === b.y;
}

/**
 * Membangun ulang (rekonstruksi) jalur terpendek dari Goal kembali ke Start menggunakan Map parent.
 * @param {Map} parent - Map penelusuran balik key(cell) -> key(parent_cell)
 * @param {Object} start - Koordinat titik awal {x, y}
 * @param {Object} goal - Koordinat titik tujuan {x, y}
 * @returns {Array} Array koordinat urut dari Start ke Goal
 */
function reconstructPath(parent, start, goal) {
  const path = [];
  let currentKey = key(goal);

  // Menelusuri rantai parent dari goal ke belakang hingga menemukan start
  while (currentKey) {
    const [x, y] = currentKey.split(",").map(Number);
    path.push({ x, y });
    if (currentKey === key(start)) break;
    currentKey = parent.get(currentKey) || null;
  }

  // Jika jalur gagal dikonstruksi sampai ke start, kembalikan array kosong
  if (
    path.length === 0 ||
    path[path.length - 1].x !== start.x ||
    path[path.length - 1].y !== start.y
  ) {
    return [];
  }

  // Balikkan urutan agar jalur dimulai dari Start -> Goal
  return path.reverse();
}

/**
 * Fungsi Utama Pencarian Jalur (UCS & A*)
 * @param {Object} grid - Objek dunia/map yang menyediakan fungsi passable, getStepCost, dan getNeighbors
 * @param {Object} start - Titik awal pencarian {x, y}
 * @param {Object} goal - Titik tujuan pencarian {x, y}
 * @param {Object} options - Pengaturan seperti { algorithm: "ucs"|"astar", heuristic: fn }
 * @returns {Object} Objek statistik hasil pencarian (path, expandedNodes, searchTimeMs, dll)
 */
function searchPath(grid, start, goal, options = {}) {
  const algorithm = options.algorithm || "ucs";
  const heuristic = options.heuristic || zeroHeuristic;
  const startTime = performance.now(); // Mencatat waktu mulai pencarian

  const gScore = new Map();             // Menyimpan biaya akumulasi terkecil g(n) untuk setiap node
  const parent = new Map();              // Menyimpan pointer parent untuk rekonstruksi jalur
  const closed = new Set();              // Explored set (node yang sudah di-expand)
  const frontier = new PriorityQueue();  // Open set (node yang menunggu di-expand)

  // Urutan node di-expand beserta "level" (priority saat di-dequeue).
  // Untuk UCS level == g (cost), untuk A* level == g + h (f-score).
  // Ini dipakai untuk animasi wave: node dengan level sama = satu kontur.
  const expansionOrder = [];

  // Inisialisasi gScore untuk node awal = 0
  gScore.set(key(start), 0);
  const startH = heuristic(start, goal);

  // Prioritas awal di priority queue:
  // UCS: f(start) = g(start) = 0
  // A*:  f(start) = g(start) + h(start) = h(start)
  const startPriority = algorithm === "ucs" ? 0 : startH;

  frontier.enqueue(
    start,
    startPriority,
    algorithm === "ucs" ? 0 : startH
  );

  let expandedNodes = 0; // Metrik penghitung total node yang di-expand

  // Loop utama algoritma pencarian
  while (!frontier.isEmpty()) {
    const entry = frontier.dequeue(); // Ambil node dengan f(n) atau g(n) paling kecil
    const current = entry.item;
    const currentKey = key(current);

    // Jika node sudah ada dalam closed set, abaikan (mencegah evaluasi ganda)
    if (closed.has(currentKey)) {
      continue;
    }

    // Node resmi di-expand
    expandedNodes++;
    expansionOrder.push({
      x: current.x,
      y: current.y,
      level: entry.priority,
      g: gScore.get(currentKey)
    });

    // Goal Test: Apakah node saat ini adalah titik tujuan (Goal)?
    if (sameCell(current, goal)) {
      const path = reconstructPath(parent, start, goal);
      return {
        found: true,
        path,
        expandedNodes,
        expandedNodesList: [...closed, currentKey],
        expansionOrder,
        frontierNodes: frontier.toArray(),
        pathCost: gScore.get(currentKey),
        pathLength: Math.max(0, path.length - 1),
        searchTimeMs: performance.now() - startTime,
        start: { ...start },
        goal: { ...goal }
      };
    }

    // Masukkan node ke dalam Explored Set (closed)
    closed.add(currentKey);

    // Evaluasi semua tetangga (neighbors) dari node saat ini
    for (const next of grid.getNeighbors(current)) {
      const nextKey = key(next);
      // Biaya akumulasi g baru = g(current) + biaya masuk ke petak tetangga (step_cost)
      const newG = gScore.get(currentKey) + grid.getStepCost(next);

      // Jika ditemukan jalur yang lebih murah menuju petak 'next'
      if (newG < (gScore.get(nextKey) ?? Infinity)) {
        gScore.set(nextKey, newG);
        parent.set(nextKey, currentKey);

        const h = heuristic(next, goal);
        // Formulasi prioritas: UCS menggunakan g, A* menggunakan f = g + h
        const priority = algorithm === "ucs" ? newG : newG + h;

        frontier.enqueue(
          next,
          priority,
          algorithm === "ucs" ? 0 : h
        );
      }
    }
  }

  // Jika frontier kosong dan goal tidak ditemukan
  return {
    found: false,
    path: [],
    expandedNodes,
    expandedNodesList: [...closed],
    expansionOrder,
    frontierNodes: [],
    pathCost: null,
    pathLength: 0,
    searchTimeMs: performance.now() - startTime,
    start: { ...start },
    goal: { ...goal }
  };
}