// Oreflow shared planner core — compiled to ES5 for Mindustry Rhino.
// Website imports the same source. No dependencies.
export type Point = { x: number; y: number };
export type BlockPlan = Point & { block: string; size: number; rotation: number; link?: Point; links?: (Point & { size?: number })[]; supply?: Point; kind: string; rate?: number; item?: string; reason?: string };
export type DrillSpec = { block: string; size: number; tier: number; time: number; hardnessMultiplier: number; boost: number; water: number; power: number };
export type MineInput = {
  width: number; height: number; ore: number[]; blocked: boolean[];
  waterEfficiency: number[]; insulated?: boolean[]; hardness: number;
  drill: DrillSpec; anchor?: Point; foreignOre?: boolean[];
};
export type Options = {
  conveyor: 'titanium' | 'plastanium'; water: boolean; power: boolean; overdrive: boolean;
  waterMode?: 'auto' | 'extractors' | 'external'; routing?: 'auto' | 'bridge' | 'phase';
  priority: 'output' | 'compact'; trials?: number;
};
export type MineDrill = Point & { size: number; oreTiles: number; rate: number; boosted: boolean; watered: boolean; waterDemand: number; outlets: Point[]; outletFlows: (Point & { load: number; capacity: number })[]; liquidPort?: Point };
export type Port = Point & { kind: string; item?: string; capacity: number; load: number; group: number; direction?: number };
export type Result = {
  placements: BlockPlan[]; drills: MineDrill[]; ports: Port[];
  connections: { from: Point; to: Point; kind: string }[];
  covered: number; totalOre: number; coverage: number; output: number; potential: number;
  waterDemand: number; waterSupply: number; power: number; domeCoverage: number;
  tried: number; warnings: string[]; uncovered: Point[]; upperBound: number; phaseConnections: number; externalWaterDemand: number;
};
type Candidate = Point & { count: number; score: number };
type Packing = { grid: number[]; drills: MineDrill[]; score: number };
type Sink = Port & { template: BlockPlan[]; used: boolean };
const DX = [1, 0, -1, 0], DY = [0, -1, 0, 1];

function array<T>(n: number, value: T): T[] { const out: T[] = []; for (let i = 0; i < n; i++) out.push(value); return out; }
function distance(a: Point, b: Point): number { const x = a.x - b.x, y = a.y - b.y; return Math.sqrt(x * x + y * y); }
function manhattan(a: Point, b: Point): number { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
function center(p: Point, size = 1): Point { return { x: p.x + size / 2, y: p.y + size / 2 }; }
function jitter(x: number, y: number, seed: number): number { const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453; return n - Math.floor(n); }
function dirFromTo(from: Point, to: Point): number {
  const dx = to.x - from.x, dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 0 : 2;
  return dy < 0 ? 1 : 3;
}

export function planMine(input: MineInput, options: Options): Result {
  const w = input.width, h = input.height, n = w * h, spec = input.drill, s = spec.size;
  const idx = (x: number, y: number) => x + y * w;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
  const free = (g: number[], x: number, y: number, size = 1) => {
    if (x < 0 || y < 0 || x + size > w || y + size > h) return false;
    for (let yy = y; yy < y + size; yy++) for (let xx = x; xx < x + size; xx++) if (g[idx(xx, yy)] !== 0) return false;
    return true;
  };
  const mark = (g: number[], p: Point, size: number, value: number) => {
    for (let y = p.y; y < p.y + size; y++) for (let x = p.x; x < p.x + size; x++) g[idx(x, y)] = value;
  };
  const oreCount = (p: Point, size: number) => {
    let count = 0; for (let y = p.y; y < p.y + size; y++) for (let x = p.x; x < p.x + size; x++) count += input.ore[idx(x, y)] || 0;
    return count;
  };
  const perimeter = (p: Point, size: number): Point[] => {
    const out: Point[] = [];
    for (let i = 0; i < size; i++) out.push({ x: p.x + i, y: p.y - 1 }, { x: p.x + i, y: p.y + size }, { x: p.x - 1, y: p.y + i }, { x: p.x + size, y: p.y + i });
    return out.filter(t => inside(t.x, t.y));
  };
  const baseRate = (count: number) => 60 * count / (spec.time + spec.hardnessMultiplier * input.hardness);
  const incompatible = spec.tier < input.hardness;
  const wantsWater = options.water && (options.power || options.waterMode === 'external');
  const portCapacity = options.conveyor === 'titanium' ? 11 : 20;
  const canPhase = options.power && options.routing !== 'bridge';
  const useProjector = options.overdrive && options.power && spec.size <= 3;
  const expectedBoost = options.overdrive && options.power ? (useProjector ? 1.5 : 2.5) : 1;
  const baseGrid = array(n, 0);
  for (let i = 0; i < n; i++) if (input.blocked[i]) baseGrid[i] = -1;
  const foreignOre = input.foreignOre || array(n, false);
  const block = (x: number, y: number, name: string, rotation: number, kind = 'belt', size = 1): BlockPlan => ({ x, y, block: name, size, rotation, kind });

  // --- Output trunks on left and right edges ---
  const sinks: Sink[] = [];
  let groupId = 0;
  for (let side = 0; side < 2; side++) {
    const transform = (x: number, y: number) => ({ x: side === 0 ? w - 6 + x : 5 - x, y });
    const rotation = side === 0 ? 0 : 2;
    const step = options.conveyor === 'plastanium' ? 4 : 2;
    for (let cy = 2; cy < h - 2; cy += step) {
      const template: BlockPlan[] = [];
      const addT = (x: number, y: number, name: string, rot: number, kind = 'belt') => { const p = transform(x, y); template.push(block(p.x, p.y, name, rot, kind)); };
      if (options.conveyor === 'plastanium') {
        addT(0, cy - 1, 'bridge-conveyor', rotation, 'item-end');
        addT(0, cy + 1, 'bridge-conveyor', rotation, 'item-end');
        addT(1, cy - 1, 'plastanium-conveyor', rotation, 'loader');
        addT(2, cy - 1, 'plastanium-conveyor', 3);
        addT(1, cy + 1, 'plastanium-conveyor', rotation, 'loader');
        addT(2, cy + 1, 'plastanium-conveyor', 1);
        for (let x = 2; x <= 5; x++) addT(x, cy, 'plastanium-conveyor', rotation, x === 5 ? 'exit' : 'belt');
      } else {
        addT(0, cy, 'bridge-conveyor', rotation, 'item-end');
        for (let x = 1; x <= 5; x++) addT(x, cy, 'titanium-conveyor', rotation, x === 5 ? 'exit' : 'belt');
      }
      if (template.some(p => !free(baseGrid, p.x, p.y))) continue;
      for (let i = 0; i < template.length; i++) mark(baseGrid, template[i], 1, 3);
      const ends = template.filter(p => p.kind === 'item-end');
      for (let i = 0; i < ends.length; i++) sinks.push({ x: ends[i].x, y: ends[i].y, kind: 'items', capacity: portCapacity, load: 0, group: groupId, template, used: false });
      groupId++;
    }
  }

  // --- Dense drill packing ---
  const candidates: Candidate[] = [];
  for (let y = 0; y <= h - s; y++) for (let x = 6; x <= w - s - 6; x++) {
    if (!incompatible && free(baseGrid, x, y, s)) { const count = oreCount({ x, y }, s); if (count > 0) candidates.push({ x, y, count, score: 0 }); }
  }
  const allTrials = Math.min(options.trials || 64, s * (2 * s + 1) * 2 + 4);
  const packings: Packing[] = [];
  for (let trial = 0; trial < allTrials; trial++) {
    const grid = baseGrid.slice(), drills: MineDrill[] = [];
    const vertical = trial % 2 === 1, ox = Math.floor(trial / 2) % s, oy = Math.floor(trial / (s * 2)) % (2 * s + 1);
    const ordered = candidates.map(c => {
      const ax = vertical ? c.y : c.x, ay = vertical ? c.x : c.y;
      const band = ((ay - oy) % (2 * s + 1) + 2 * s + 1) % (2 * s + 1);
      const aligned = ((ax - ox) % s + s) % s === 0 && (band === 0 || band === s);
      return { x: c.x, y: c.y, count: c.count, score: c.count * 30 + (aligned ? s * s * 42 : 0) + jitter(c.x, c.y, trial) * 3 };
    }).sort((a, b) => b.score - a.score);
    if (input.anchor) { const forced = candidates.filter(c => c.x === input.anchor!.x && c.y === input.anchor!.y); if (forced.length) ordered.unshift(forced[0]); }
    for (let ci = 0; ci < ordered.length; ci++) {
      const c = ordered[ci];
      if (options.priority === 'compact' && c.count < s * s * 0.5) continue;
      if (!free(grid, c.x, c.y, s)) continue;
      const predicted = baseRate(c.count) * (wantsWater ? spec.boost * spec.boost : 1) * expectedBoost;
      const outCount = Math.max(1, Math.ceil(predicted / portCapacity - 0.00001));
      const ports = perimeter(c, s).filter(p => free(grid, p.x, p.y));
      if (ports.length < outCount + (wantsWater ? 1 : 0)) continue;
      // Prefer non-ore, non-foreign-ore cells for ports
      ports.sort((a, b) => {
        const cost = (p: Point) => (input.ore[idx(p.x, p.y)] ? 8 : 0) + (foreignOre[idx(p.x, p.y)] ? 50 : 0) + Math.min(p.x, w - p.x) * 0.03;
        return cost(a) - cost(b);
      });
      const outlets = ports.slice(0, outCount);
      const liquidPort = wantsWater ? ports[outCount] : undefined;
      mark(grid, c, s, 1); outlets.forEach(p => mark(grid, p, 1, 2)); if (liquidPort) mark(grid, liquidPort, 1, 2);
      drills.push({ x: c.x, y: c.y, size: s, oreTiles: c.count, rate: 0, boosted: false, watered: false, waterDemand: 0, outlets, outletFlows: [], liquidPort });
    }
    const covered = drills.reduce((sum, d) => sum + d.oreTiles, 0);
    packings.push({ grid, drills, score: covered * 1000 - drills.length * (options.priority === 'compact' ? 5 : 0.1) });
  }
  packings.sort((a, b) => b.score - a.score);
  const packing = packings[0] || { grid: baseGrid, drills: [], score: 0 };
  const grid = packing.grid, placements: BlockPlan[] = [], connections: Result['connections'] = [], warnings: string[] = [];
  const add = (p: BlockPlan) => { placements.push(p); mark(grid, p, p.size, 5); };

  // --- A* pathfinding with weights ---
  const astar = (start: Point, targets: Point[], maxBridge: number): Point[] | undefined => {
    if (!targets.length) return undefined;
    const target = array(n, false);
    targets.forEach(t => { target[idx(t.x, t.y)] = true; });
    const gScore = array(n, Infinity), parent = array(n, -1), closed = array(n, false);
    // Min-heap by f = g + h
    const heap: number[] = [], heuristic = array(n, 0);
    targets.forEach(t => { for (let i = 0; i < n; i++) heuristic[i] = Math.min(heuristic[i] || 9999, manhattan({ x: i % w, y: Math.floor(i / w) }, t)); });
    const startIdx = idx(start.x, start.y);
    gScore[startIdx] = 0;
    heap.push(startIdx);
    while (heap.length) {
      // Simple extraction of minimum f-score (adequate for small grids)
      let bestI = 0;
      for (let i = 1; i < heap.length; i++) if (gScore[heap[i]] + heuristic[heap[i]] < gScore[heap[bestI]] + heuristic[heap[bestI]]) bestI = i;
      const at = heap[bestI]; heap[bestI] = heap[heap.length - 1]; heap.pop();
      if (closed[at]) continue;
      closed[at] = true;
      const ax = at % w, ay = Math.floor(at / w);
      if (target[at] && at !== startIdx) {
        const result: Point[] = [];
        for (let cur = at; cur !== -1; cur = parent[cur]) result.push({ x: cur % w, y: Math.floor(cur / w) });
        return result.reverse();
      }
      for (let dir = 0; dir < 4; dir++) {
        for (let k = 1; k <= maxBridge; k++) {
          const nx = ax + DX[dir] * k, ny = ay + DY[dir] * k;
          if (!inside(nx, ny)) break;
          const next = idx(nx, ny);
          if (grid[next] !== 0 && !target[next]) break; // obstacle stops this direction
          const weight = k + (foreignOre[next] ? 40 : 0) + (k > 1 ? 0.5 : 0); // penalty for foreign ore, slight penalty for long jumps
          const tentative = gScore[at] + weight;
          if (tentative < gScore[next]) {
            gScore[next] = tentative;
            parent[next] = at;
            heap.push(next);
          }
        }
      }
    }
    return undefined;
  };

  // --- Build bridge/conduit route with correct rotation ---
  const buildRoute = (points: Point[], name: string, kind: string) => {
    for (let i = 0; i < points.length - 1; i++) {
      const rot = dirFromTo(points[i], points[i + 1]);
      const p = block(points[i].x, points[i].y, name, rot, kind); p.link = points[i + 1]; add(p);
      connections.push({ from: points[i], to: points[i + 1], kind });
    }
  };

  // --- Overdrive: projector for small, dome for large ---
  const domes: BlockPlan[] = [];
  if (options.overdrive && options.power && packing.drills.length > 0) {
    const minDrillsForDome = 4;
    const useDome = packing.drills.length >= minDrillsForDome && spec.size >= 3;
    const boosterBlock = useDome ? 'overdrive-dome' : 'overdrive-projector';
    const boosterSize = useDome ? 3 : 2;
    const boosterRange = useDome ? 25 : 10;

    let best: BlockPlan | undefined, bestScore = -Infinity;
    for (let y = 0; y < h - boosterSize; y++) for (let x = 6; x < w - 6 - boosterSize; x++) {
      if (!free(grid, x, y, boosterSize)) continue;
      const p = block(x, y, boosterBlock, 0, 'dome', boosterSize);
      let value = 0;
      for (let i = 0; i < packing.drills.length; i++) {
        const d = packing.drills[i];
        if (distance(center(d, s), center(p, boosterSize)) <= boosterRange) value += baseRate(d.oreTiles) * 100;
      }
      value -= oreCount(p, boosterSize) * 15 + distance(center(p, boosterSize), { x: w / 2, y: h / 2 }) * 0.08;
      if (value > bestScore) { bestScore = value; best = p; }
    }
    if (best) {
      add(best); domes.push(best);
      if (useDome) {
        // Dome needs silicon + phase-fabric via sorters — place adjacent
        const sx = best.x + boosterSize, sy = best.y;
        if (inside(sx, sy) && free(grid, sx, sy) && inside(sx, sy + 1) && free(grid, sx, sy + 1)) {
          const f1 = block(sx, sy, 'sorter', 0, 'fuel-filter'); f1.item = 'silicon'; add(f1);
          const f2 = block(sx, sy + 1, 'sorter', 0, 'fuel-filter'); f2.item = 'phase-fabric'; add(f2);
        }
        warnings.push('dome-needs-fuel');
      }
    } else warnings.push('no-dome-space');
  }
  const boosterRange = domes.length && domes[0].block === 'overdrive-dome' ? 25 : domes.length ? 10 : 0;
  const boosterMult = domes.length && domes[0].block === 'overdrive-dome' ? 2.5 : domes.length ? 1.5 : 1;
  const boosted = (p: Point, size = 1) => domes.some(d => distance(center(p, size), center(d, d.size)) <= boosterRange);

  // --- Connect drills to output trunks ---
  const active: MineDrill[] = [];
  for (let di = 0; di < packing.drills.length; di++) {
    const d = packing.drills[di];
    d.boosted = boosted(d, s);
    let expected = baseRate(d.oreTiles) * (wantsWater ? spec.boost * spec.boost : 1) * (d.boosted ? boosterMult : 1), connected = 0;
    for (let oi = 0; oi < d.outlets.length; oi++) {
      const start = d.outlets[oi], load = Math.min(expected - connected, portCapacity);
      if (load <= 0.001) { grid[idx(start.x, start.y)] = 0; continue; }
      const availSinks = sinks.filter(t => t.capacity - t.load >= load - 0.001);
      const maxRange = options.routing === 'phase' ? 12 : 4;
      const route = astar(start, availSinks, maxRange);
      if (!route || route.length < 2) continue;
      const end = route[route.length - 1], sink = sinks.filter(t => t.x === end.x && t.y === end.y)[0];
      if (!sink) continue;
      if (!sink.used) {
        const group = sinks.filter(t => t.group === sink.group);
        group.forEach(t => { t.used = true; });
        sink.template.forEach(t => { if (t.kind !== 'item-end') placements.push(t); });
      }
      // Determine bridge type: use phase only if span > 4 somewhere in route
      let needsPhase = false;
      for (let i = 1; i < route.length; i++) {
        if (manhattan(route[i], route[i - 1]) > 4) { needsPhase = true; break; }
      }
      const bridgeName = needsPhase && canPhase ? 'phase-conveyor' : 'bridge-conveyor';
      const existing = placements.filter(p => p.x === sink.x && p.y === sink.y)[0];
      if (!existing) {
        const endRot = dirFromTo(route[route.length - 2], end);
        add(block(sink.x, sink.y, bridgeName, endRot, 'item-end'));
      } else if (existing.block !== bridgeName) continue;

      buildRoute(route, bridgeName, 'item-bridge');
      if (needsPhase) for (let i = placements.length - route.length; i < placements.length; i++) if (i >= 0) placements[i].reason = 'obstacle-no-basic-route';
      sink.load += load; connected += load;
      d.outletFlows.push({ x: start.x, y: start.y, load, capacity: portCapacity });
    }
    if (connected <= 0) {
      mark(grid, d, s, 0);
      d.outlets.forEach(p => { if (grid[idx(p.x, p.y)] === 2) grid[idx(p.x, p.y)] = 0; });
      if (d.liquidPort) grid[idx(d.liquidPort.x, d.liquidPort.y)] = 0;
      warnings.push('unrouted-drill'); continue;
    }
    d.outlets = d.outlets.filter(p => {
      if (d.outletFlows.some(flow => flow.x === p.x && flow.y === p.y)) return true;
      if (grid[idx(p.x, p.y)] === 2) grid[idx(p.x, p.y)] = 0;
      return false;
    });
    if (connected + 0.001 < expected) warnings.push('output-overload');
    d.rate = Math.min(expected, connected); active.push(d);
    const placement = block(d.x, d.y, spec.block, 0, 'drill', s); placement.rate = d.rate; add(placement);
  }

  // --- Water: extractors with conduit (titanium pipe), not liquid-routers ---
  const pumpRate = (p: Point): number => {
    let efficiency = 0; for (let y = p.y; y < p.y + 2; y++) for (let x = p.x; x < p.x + 2; x++) efficiency += Math.max(0, input.waterEfficiency[idx(x, y)] || 0) / 4;
    return 6.6 * efficiency * (boosted(p, 2) ? boosterMult : 1);
  };
  let waterSupply = 0, externalWaterDemand = 0;
  for (let di = 0; di < active.length; di++) {
    const d = active[di], need = spec.water * (d.boosted ? boosterMult : 1);
    if (!wantsWater || !d.liquidPort) continue;
    let supplied = 0;
    for (let attempt = 0; attempt < 3 && supplied < need * 1.05; attempt++) {
      const pumps: { p: Point; sender: Point; value: number; direct: boolean }[] = [];
      for (let y = 0; y < h - 1; y++) for (let x = 6; x < w - 7; x++) {
        if (!free(grid, x, y, 2)) continue;
        const p = { x, y }, rate = pumpRate(p); if (rate <= 0.01) continue;
        const direct = x < d.x + s && x + 2 > d.x && (y + 2 === d.y || y === d.y + s) || y < d.y + s && y + 2 > d.y && (x + 2 === d.x || x === d.x + s);
        if (options.waterMode === 'extractors' && !direct) continue;
        const senderCandidates = perimeter(p, 2).filter(t => free(grid, t.x, t.y));
        if (!direct && !senderCandidates.length) continue;
        const sender = direct ? p : senderCandidates.sort((a, b) => distance(a, d.liquidPort!) - distance(b, d.liquidPort!))[0];
        const value = oreCount(p, 2) * 300 + distance(p, d) * 0.5 + (direct ? -20 : 5) - Math.min(need - supplied, rate) * 3;
        pumps.push({ p, sender, value, direct });
      }
      pumps.sort((a, b) => a.value - b.value);
      let installed = false;
      for (let pi = 0; pi < Math.min(12, pumps.length); pi++) {
        const candidate = pumps[pi];
        if (candidate.direct && pumpRate(candidate.p) < need * 1.05) continue;
        if (candidate.direct) {
          add(block(candidate.p.x, candidate.p.y, 'water-extractor', 0, 'extractor', 2)); supplied += pumpRate(candidate.p); installed = true; break;
        }
        mark(grid, candidate.p, 2, 6);
        // Route water via conduit bridges with correct rotation
        const route = astar(candidate.sender, [d.liquidPort], canPhase ? 12 : 4);
        if (!route || route.length < 2) { mark(grid, candidate.p, 2, 0); continue; }
        // Check if any span > 4 to decide bridge type
        let needsPhaseLiquid = false;
        for (let i = 1; i < route.length; i++) if (manhattan(route[i], route[i - 1]) > 4) { needsPhaseLiquid = true; break; }
        const liquidName = needsPhaseLiquid && canPhase ? 'phase-conduit' : 'bridge-conduit';
        add(block(candidate.p.x, candidate.p.y, 'water-extractor', 0, 'extractor', 2));
        const routeStart = placements.length;
        buildRoute(route, liquidName, 'liquid-bridge');
        placements[routeStart].supply = candidate.p;
        const terminal = placements.filter(p => p.x === d.liquidPort!.x && p.y === d.liquidPort!.y)[0];
        if (!terminal) {
          const endRot = dirFromTo(route[route.length - 2], route[route.length - 1]);
          add(block(d.liquidPort.x, d.liquidPort.y, liquidName, endRot, 'liquid-end'));
        }
        supplied += pumpRate(candidate.p); installed = true; break;
      }
      if (!installed) break;
    }
    d.watered = supplied >= need * 1.05; d.waterDemand = d.watered ? need : 0; waterSupply += supplied;
    if (!d.watered && options.waterMode === 'external') {
      d.watered = true; d.waterDemand = need; externalWaterDemand += need;
    }
    if (!d.watered) warnings.push('water-shortfall');
  }
  if (externalWaterDemand > 0) warnings.push('external-water');

  // --- Power network ---
  const consumesPower = (p: BlockPlan) => p.kind === 'dome' || p.kind === 'extractor' || (p.kind === 'drill' && spec.power > 0) || p.block === 'phase-conveyor' || p.block === 'phase-conduit';
  const targets = placements.filter(consumesPower), reached = array(targets.length, false), nodes: BlockPlan[] = [];
  const clearRay = (a: Point, b: Point) => {
    if (!input.insulated) return true;
    const length = Math.ceil(distance(a, b) * 2);
    for (let t = 1; t < length; t++) { const x = Math.floor(a.x + (b.x - a.x) * t / length), y = Math.floor(a.y + (b.y - a.y) * t / length); if (inside(x, y) && input.insulated[idx(x, y)]) return false; }
    return true;
  };
  const freeNode = (x: number, y: number) => {
    if (!inside(x, y) || !inside(x + 1, y + 1)) return false;
    for (let yy = y; yy < y + 2; yy++) for (let xx = x; xx < x + 2; xx++) if (grid[idx(xx, yy)] !== 0 && grid[idx(xx, yy)] !== 4) return false;
    return true;
  };
  if (options.power && targets.length) {
    for (let iteration = 0; iteration < 32 && reached.some(v => !v); iteration++) {
      // Try connecting with existing nodes first
      for (let ni = 0; ni < nodes.length; ni++) for (let ti = 0; ti < targets.length && nodes[ni].links!.length < 13; ti++) {
        const target = targets[ti], node = nodes[ni];
        if (!reached[ti] && distance(center(node, 2), center(target, target.size)) <= 15 + target.size / 2 && clearRay(center(node, 2), center(target, target.size))) {
          node.links!.push(target); reached[ti] = true;
          connections.push({ from: center(node, 2), to: center(target, target.size), kind: 'power' });
        }
      }
      if (!reached.some(v => !v)) break;
      // Place new node
      let best: BlockPlan | undefined, bestValue = -Infinity;
      for (let y = 0; y < h - 1; y++) for (let x = 6; x < w - 7; x++) {
        if (!freeNode(x, y)) continue;
        const p = block(x, y, 'power-node-large', 0, 'power', 2), c = center(p, 2);
        if (nodes.length && !nodes.some(node => (node.links || []).length < 14 && distance(c, center(node, 2)) <= 15 && clearRay(c, center(node, 2)))) continue;
        let count = 0;
        for (let i = 0; i < targets.length; i++) if (!reached[i] && distance(c, center(targets[i], targets[i].size)) <= 15 + targets[i].size / 2 && clearRay(c, center(targets[i], targets[i].size))) count++;
        const score = count * 100 - oreCount(p, 2) * 3 - distance(c, { x: w / 2, y: h / 2 }) * 0.01;
        if (score > bestValue && count > 0) { best = p; bestValue = score; }
      }
      if (!best) {
        // Last resort: use remaining link budget
        for (let ni = 0; ni < nodes.length; ni++) for (let ti = 0; ti < targets.length && nodes[ni].links!.length < 14; ti++) {
          const target = targets[ti], node = nodes[ni];
          if (!reached[ti] && distance(center(node, 2), center(target, target.size)) <= 15 + target.size / 2 && clearRay(center(node, 2), center(target, target.size))) {
            node.links!.push(target); reached[ti] = true;
            connections.push({ from: center(node, 2), to: center(target, target.size), kind: 'power' });
          }
        }
        if (reached.some(v => !v)) warnings.push('power-unreachable');
        break;
      }
      best.links = [];
      for (let i = 0; i < nodes.length; i++) if ((nodes[i].links || []).length < 14 && distance(center(best, 2), center(nodes[i], 2)) <= 15 && clearRay(center(best, 2), center(nodes[i], 2))) {
        best.links.push({ x: nodes[i].x, y: nodes[i].y, size: 2 }); nodes[i].links!.push({ x: best.x, y: best.y, size: 2 });
        connections.push({ from: center(best, 2), to: center(nodes[i], 2), kind: 'power' }); break;
      }
      for (let i = 0; i < targets.length && best.links.length < 11; i++) {
        const p = targets[i];
        if (!reached[i] && distance(center(best, 2), center(p, p.size)) <= 15 + p.size / 2 && clearRay(center(best, 2), center(p, p.size))) {
          best.links.push(p); reached[i] = true;
          connections.push({ from: center(best, 2), to: center(p, p.size), kind: 'power' });
        }
      }
      nodes.push(best); add(best);
    }
  }

  // --- Totals ---
  let output = 0, waterDemand = 0, power = domes.length ? (domes[0].block === 'overdrive-dome' ? 600 : 180) : 0;
  for (let i = 0; i < active.length; i++) {
    const d = active[i], rate = baseRate(d.oreTiles) * (d.watered ? spec.boost * spec.boost : 1) * (d.boosted ? boosterMult : 1);
    d.rate = incompatible || (spec.power > 0 && !options.power) || warnings.indexOf('power-unreachable') >= 0 ? 0 : Math.min(rate, d.rate);
    output += d.rate; waterDemand += d.waterDemand;
    power += spec.power * (d.boosted ? boosterMult : 1);
  }
  placements.forEach(p => { if (p.kind === 'extractor') power += 90 * (boosted(p, 2) ? boosterMult : 1); else if (p.block === 'phase-conveyor' || p.block === 'phase-conduit') power += 18; });
  const coveredMask = array(n, false);
  active.forEach(d => { for (let y = d.y; y < d.y + s; y++) for (let x = d.x; x < d.x + s; x++) coveredMask[idx(x, y)] = true; });
  let totalOre = 0, covered = 0;
  const uncovered: Point[] = [];
  for (let i = 0; i < n; i++) if (input.ore[i]) { totalOre++; if (coveredMask[i]) covered++; else uncovered.push({ x: i % w, y: Math.floor(i / w) }); }
  const ports: Port[] = [];
  const usedGroups: number[] = [];
  sinks.filter(t => t.used && t.load > 0).forEach(t => {
    if (usedGroups.indexOf(t.group) >= 0) return;
    usedGroups.push(t.group);
    ports.push({ x: t.x < w / 2 ? 0 : w - 1, y: t.template.filter(p => p.kind === 'exit')[0].y, kind: 'items', capacity: options.conveyor === 'plastanium' ? 40 : 11, load: sinks.filter(sink => sink.group === t.group).reduce((sum, sink) => sum + sink.load, 0), group: t.group, direction: t.x < w / 2 ? 2 : 0 });
  });
  if (nodes.length) ports.push({ x: nodes[0].x, y: nodes[0].y, kind: 'power', capacity: 0, load: power, group: -1 });
  if (incompatible) warnings.push('incompatible');
  if (spec.power > 0 && !options.power) warnings.push('no-power');
  if (options.overdrive && !options.power) warnings.push('dome-needs-power');
  if (options.water && !wantsWater) warnings.push('water-needs-power');
  if (!active.length && totalOre > 0 && !incompatible) warnings.push('no-connected-drills');
  const uniqueWarnings: string[] = []; warnings.forEach(v => { if (uniqueWarnings.indexOf(v) < 0) uniqueWarnings.push(v); });
  return {
    placements, drills: active, ports, connections, covered, totalOre, coverage: Math.round(covered / Math.max(1, totalOre) * 100),
    output, potential: baseRate(covered) * (wantsWater ? spec.boost * spec.boost : 1) * expectedBoost,
    waterDemand, waterSupply, power, domeCoverage: active.filter(d => d.boosted).length,
    tried: allTrials, warnings: uniqueWarnings, uncovered, externalWaterDemand,
    phaseConnections: placements.filter(p => (p.block === 'phase-conveyor' || p.block === 'phase-conduit') && !!p.link).length,
    upperBound: incompatible ? 0 : baseRate(totalOre) * (wantsWater ? spec.boost * spec.boost : 1) * expectedBoost,
  };
}
