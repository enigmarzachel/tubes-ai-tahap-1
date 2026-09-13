// ================================================================
// pathfinding.js
// Implements a simple priority queue and UCS/A* pathfinding algorithms.
// ------------------------------------------------
// pathfinding.js
// Priority Queue sederhana + UCS + A* + heuristic + reconstruction
// ================================================================

// Simple priority queue used by the search algorithms.
class PriorityQueue {
  constructor() {
    this.items = [];
    this.counter = 0;
  }
  enqueue(item, priority, secondary = 0) {
    this.items.push({
      item,
      priority,
      secondary,
      order: this.counter++
    });
    this.items.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      if (a.secondary !== b.secondary) {
        return a.secondary - b.secondary;
      }
      return a.order - b.order;
    });
  }
  dequeue() {
    return this.items.shift();
  }
  isEmpty() {
    return this.items.length === 0;
  }
  toArray() {
    return this.items.map(entry => entry.item);
  }
}

// Zero heuristic for Uniform Cost Search (UCS).
function zeroHeuristic(current, goal) {
  return 0;
}
// Manhattan distance heuristic for grid movement (A*).
function manhattanHeuristic(current, goal) {
  return Math.abs(current.x - goal.x) + Math.abs(current.y - goal.y);
}
// Euclidean distance heuristic for A* (continuous space).
function euclideanHeuristic(current, goal) {
  const dx = current.x - goal.x;
  const dy = current.y - goal.y;
  return Math.sqrt(dx * dx + dy * dy);
}
// Retrieve the appropriate heuristic function by name.
function getHeuristic(name) {
  if (name === "manhattan") return manhattanHeuristic;
  if (name === "euclidean") return euclideanHeuristic;
  return zeroHeuristic;
}

// Convert a cell coordinate to a unique string key.
function key(cell) {
  return `${cell.x},${cell.y}`;
}
// Check if two cells have identical coordinates.
function sameCell(a, b) {
  return a.x === b.x && a.y === b.y;
}

// Reconstruct the path from goal to start using the parent map.
function reconstructPath(parent, start, goal) {
  const path = [];
  let currentKey = key(goal);
  while (currentKey) {
    const [x, y] = currentKey.split(",").map(Number);
    path.push({ x, y });
    if (currentKey === key(start)) break;
    currentKey = parent.get(currentKey) || null;
  }
  if (
    path.length === 0 ||
    path[path.length - 1].x !== start.x ||
    path[path.length - 1].y !== start.y
  ) {
    return [];
  }
  return path.reverse();
}

// Main pathfinding function implementing UCS or A* based on options.
function searchPath(grid, start, goal, options = {}) {
  const algorithm = options.algorithm || "ucs";
  const heuristic = options.heuristic || zeroHeuristic;
  const startTime = performance.now();

  const gScore = new Map();
  const parent = new Map();
  const closed = new Set();
  const frontier = new PriorityQueue();

  gScore.set(key(start), 0);
  const startH = heuristic(start, goal);

  const startPriority = algorithm === "ucs" ? 0 : startH;

  frontier.enqueue(
    start,
    startPriority,
    algorithm === "ucs" ? 0 : startH
  );

  let expandedNodes = 0;

  while (!frontier.isEmpty()) {
    const entry = frontier.dequeue();
    const current = entry.item;
    const currentKey = key(current);

    if (closed.has(currentKey)) {
      continue;
    }

    expandedNodes++;

    if (sameCell(current, goal)) {
      const path = reconstructPath(parent, start, goal);
      return {
        found: true,
        path,
        expandedNodes,
        expandedNodesList: [...closed, currentKey],
        frontierNodes: frontier.toArray(),
        pathCost: gScore.get(currentKey),
        pathLength: Math.max(0, path.length - 1),
        searchTimeMs: performance.now() - startTime,
        start: { ...start },
        goal: { ...goal }
      };
    }

    closed.add(currentKey);

    for (const next of grid.getNeighbors(current)) {
      const nextKey = key(next);
      const newG = gScore.get(currentKey) + grid.getStepCost(next);

      if (newG < (gScore.get(nextKey) ?? Infinity)) {
        gScore.set(nextKey, newG);
        parent.set(nextKey, currentKey);

        const h = heuristic(next, goal);
        const priority = algorithm === "ucs" ? newG : newG + h;

        frontier.enqueue(
          next,
          priority,
          algorithm === "ucs" ? 0 : h
        );
      }
    }
  }

  return {
    found: false,
    path: [],
    expandedNodes,
    expandedNodesList: [...closed],
    frontierNodes: [],
    pathCost: null,
    pathLength: 0,
    searchTimeMs: performance.now() - startTime,
    start: { ...start },
    goal: { ...goal }
  };
}