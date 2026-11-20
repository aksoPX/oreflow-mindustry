// This dependency-free core is compiled to ES5 for Mindustry's Rhino runtime.
// The website imports the same source, not a separate approximation.
export type Point = { x: number; y: number };
export type BlockPlan = Point & { block: string; size: number; rotation: number; link?: Point; links?: (Point & { size?: number })[]; supply?: Point; kind: string; rate?: number };
export type DrillSpec = { block: string; size: number; tier: number; time: number; hardnessMultiplier: number; boost: number; water: number; power: number };
export type MineInput = {
  width: number; height: number; ore: number[]; blocked: boolean[];
  waterEfficiency: number[]; insulated?: boolean[]; hardness: number;
  drill: DrillSpec; anchor?: Point;
};
export type Options = {
  conveyor: 'titanium' | 'plastanium'; water: boolean; power: boolean; overdrive: boolean;
  waterMode?: 'auto' | 'extractors' | 'external'; routing?: 'auto' | 'bridge' | 'phase';
  priority: 'output' | 'compact'; trials?: number;
};
export type MineDrill = Point & { size: number; oreTiles: number; rate: number; boosted: boolean; watered: boolean; waterDemand: number; outlets: Point[]; liquidPort?: Point };
export type Port = Point & { kind: string; item?: string; capacity: number; load: number; group: number };
export type Result = {
  placements: BlockPlan[]; drills: MineDrill[]; ports: Port[];
  connections: { from: Point; to: Point; kind: string }[];
  covered: number; totalOre: number; coverage: number; output: number; potential: number;
  waterDemand: number; waterSupply: number; power: number; domeCoverage: number;
  tried: number; warnings: string[]; uncovered: Point[]; upperBound: number;
};
type Candidate = Point & { count: number; score: number };
type Packing = { grid: number[]; drills: MineDrill[]; score: number };
type Sink = Port & { template: BlockPlan[]; used: boolean };
const DX = [1, 0, -1, 0], DY = [0, -1, 0, 1];

function array<T>(n: number, value: T): T[] { const out: T[] = []; for (let i = 0; i < n; i++) out.push(value); return out; }
function distance(a: Point, b: Point): number { const x = a.x - b.x, y = a.y - b.y; return Math.sqrt(x * x + y * y); }
function center(p: Point, size = 1): Point { return { x: p.x + size / 2, y: p.y + size / 2 }; }
function jitter(x: number, y: number, seed: number): number { const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453; return n - Math.floor(n); }

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
  const expectedBoost = options.overdrive && options.power ? 2.5 : 1;
  const baseGrid = array(n, 0);
  for (let i = 0; i < n; i++) if (input.blocked[i]) baseGrid[i] = -1;
  const sinks: Sink[] = [];
  let groupId = 0;
  const block = (x: number, y: number, name: string, rotation: number, kind = 'belt', size = 1): BlockPlan => ({ x, y, block: name, size, rotation, kind });
  // Two real loading docks feed each 40/s plastanium trunk. No mid-line side loading.
  for (let side = 0; side < 2; side++) {
    const transform = (x: number, y: number) => ({ x: side === 0 ? w - 6 + x : 5 - x, y });
    const rotation = side === 0 ? 0 : 2;
    const step = options.conveyor === 'plastanium' ? 4 : 2;
    for (let cy = 3; cy < h - 3; cy += step) {
      const template: BlockPlan[] = [];
      const add = (x: number, y: number, name: string, rot: number, kind = 'belt') => { const p = transform(x, y); template.push(block(p.x, p.y, name, rot, kind)); };
      if (options.conveyor === 'plastanium') {
        add(0, cy - 1, 'phase-conveyor', rotation, 'item-end');
        add(0, cy + 1, 'phase-conveyor', rotation, 'item-end');
        add(1, cy - 1, 'plastanium-conveyor', rotation, 'loader');
        add(2, cy - 1, 'plastanium-conveyor', 3);
        add(1, cy + 1, 'plastanium-conveyor', rotation, 'loader');
        add(2, cy + 1, 'plastanium-conveyor', 1);
        for (let x = 2; x <= 5; x++) add(x, cy, 'plastanium-conveyor', rotation, x === 5 ? 'exit' : 'belt');
      } else {
        add(0, cy, 'phase-conveyor', rotation, 'item-end');
        for (let x = 1; x <= 5; x++) add(x, cy, 'titanium-conveyor', rotation, x === 5 ? 'exit' : 'belt');
      }
      if (template.some(p => !free(baseGrid, p.x, p.y))) continue;
      for (let i = 0; i < template.length; i++) mark(baseGrid, template[i], 1, 3);
      const ends = template.filter(p => p.kind === 'item-end');
      for (let i = 0; i < ends.length; i++) sinks.push({ x: ends[i].x, y: ends[i].y, kind: 'items', capacity: portCapacity, load: 0, group: groupId, template, used: false });
      groupId++;
    }
  }
  // Terminal bridges must not dump sideways into an unrelated nearby route.
  sinks.forEach(sink => {
    for (let dir = 0; dir < 4; dir++) {
      const x = sink.x + DX[dir], y = sink.y + DY[dir];
      if (inside(x, y) && baseGrid[idx(x, y)] === 0) baseGrid[idx(x, y)] = 3;
    }
  });
  const candidates: Candidate[] = [];
  for (let y = 1; y <= h - s - 1; y++) for (let x = 6; x <= w - s - 6; x++) {
    if (free(baseGrid, x, y, s)) { const count = oreCount({ x, y }, s); if (count > 0) candidates.push({ x, y, count, score: 0 }); }
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
      const outCount = Math.max(1, Math.ceil(predicted / Math.min(portCapacity, canPhase ? 30 : 11) - 0.00001));
      const ports = perimeter(c, s).filter(p => free(grid, p.x, p.y));
      if (ports.length < outCount + (wantsWater ? 1 : 0)) continue;
      ports.sort((a, b) => {
        const cost = (p: Point) => (input.ore[idx(p.x, p.y)] ? 8 : 0) + Math.min(p.x, w - p.x) * 0.03;
        return cost(a) - cost(b);
      });
      const outlets = ports.slice(0, outCount);
      const liquidPort = wantsWater ? ports[outCount] : undefined;
      mark(grid, c, s, 1); outlets.forEach(p => mark(grid, p, 1, 2)); if (liquidPort) mark(grid, liquidPort, 1, 2);
      drills.push({ x: c.x, y: c.y, size: s, oreTiles: c.count, rate: 0, boosted: false, watered: false, waterDemand: 0, outlets, liquidPort });
    }
    const covered = drills.reduce((sum, d) => sum + d.oreTiles, 0);
    packings.push({ grid, drills, score: covered * 1000 - drills.length * (options.priority === 'compact' ? 5 : 0.1) });
  }
  packings.sort((a, b) => b.score - a.score);
  const packing = packings[0] || { grid: baseGrid, drills: [], score: 0 };
  const grid = packing.grid, placements: BlockPlan[] = [], connections: Result['connections'] = [], warnings: string[] = [];
  const add = (p: BlockPlan) => { placements.push(p); mark(grid, p, p.size, 5); };
  const domes: BlockPlan[] = [];
  if (options.overdrive && options.power && packing.drills.length) {
    let best: BlockPlan | undefined, bestScore = -Infinity;
    for (let y = 1; y < h - 3; y++) for (let x = 7; x < w - 9; x++) {
      if (!free(grid, x, y, 3) || !free(grid, x - 1, y) || !free(grid, x - 1, y + 2)) continue;
      const p = block(x, y, 'overdrive-dome', 0, 'dome', 3);
      let value = 0;
      for (let i = 0; i < packing.drills.length; i++) {
        const d = packing.drills[i];
        if (distance(center(d, s), center(p, 3)) <= 25 + s / 2) value += baseRate(d.oreTiles) * 100;
      }
      value -= oreCount(p, 3) * 15 + distance(center(p, 3), { x: w / 2, y: h / 2 }) * 0.08;
      if (value > bestScore) { bestScore = value; best = p; }
    }
    if (best) {
      add(best); domes.push(best);
      add(block(best.x - 1, best.y, 'titanium-conveyor', 0, 'fuel'));
      add(block(best.x - 1, best.y + 2, 'titanium-conveyor', 0, 'fuel'));
    } else warnings.push('no-dome-space');
  }
  const boosted = (p: Point, size = 1) => domes.some(d => distance(center(p, size), center(d, 3)) <= 25 + size / 2);
  const path = (start: Point, targets: Point[], range: number, forbiddenDirection = -1): Point[] | undefined => {
    if (!targets.length) return undefined;
    const target = array(n, false), seen = array(n, false), parent = array(n, -1), queue: number[] = [];
    targets.forEach(t => { target[idx(t.x, t.y)] = true; });
    const first = idx(start.x, start.y); queue.push(first); seen[first] = true;
    let found = -1;
    for (let head = 0; head < queue.length && found === -1; head++) {
      const at = queue[head], x = at % w, y = Math.floor(at / w);
      if (target[at] && at !== first) { found = at; break; }
      for (let dir = 0; dir < 4; dir++) {
        if (at === first && dir === forbiddenDirection) continue;
        for (let k = range; k >= 1; k--) {
          const nx = x + DX[dir] * k, ny = y + DY[dir] * k;
          if (!inside(nx, ny)) continue;
          const next = idx(nx, ny);
          if (seen[next] || (grid[next] !== 0 && !target[next])) continue;
          seen[next] = true; parent[next] = at; queue.push(next);
        }
      }
    }
    if (found < 0) return undefined;
    const result: Point[] = [];
    for (let at = found; at !== -1; at = parent[at]) result.push({ x: at % w, y: Math.floor(at / w) });
    return result.reverse();
  };
  const buildRoute = (points: Point[], name: string, kind: string) => {
    for (let i = 0; i < points.length - 1; i++) {
      const p = block(points[i].x, points[i].y, name, 0, kind); p.link = points[i + 1]; add(p);
      connections.push({ from: points[i], to: points[i + 1], kind });
    }
  };
  const active: MineDrill[] = [];
  for (let di = 0; di < packing.drills.length; di++) {
    const d = packing.drills[di];
    d.boosted = boosted(d, s);
    let expected = baseRate(d.oreTiles) * (wantsWater ? spec.boost * spec.boost : 1) * (d.boosted ? 2.5 : 1), connected = 0;
    for (let oi = 0; oi < d.outlets.length; oi++) {
      const start = d.outlets[oi], load = Math.min(expected - connected, portCapacity, canPhase ? 30 : 11);
      if (load <= 0.001) { grid[idx(start.x, start.y)] = 0; continue; }
      const targets = sinks.filter(t => t.capacity - t.load >= load - 0.001);
      const dc = center(d, s), pc = center(start);
      const forbid = pc.x < dc.x && pc.y >= d.y && pc.y < d.y + s ? 0 : pc.x > dc.x && pc.y >= d.y && pc.y < d.y + s ? 2 : pc.y < dc.y ? 3 : 1;
      let route = path(start, targets, canPhase ? 12 : 4, forbid), bridge = canPhase ? 'phase-conveyor' : 'bridge-conveyor';
      if (!route) continue;
      const end = route[route.length - 1], sink = sinks.filter(t => t.x === end.x && t.y === end.y)[0];
      if (!sink.used) {
        const group = sinks.filter(t => t.group === sink.group);
        group.forEach(t => { t.used = true; });
        sink.template.forEach(t => { if (t.kind !== 'item-end') placements.push(t); });
      }
      const existing = placements.filter(p => p.x === sink.x && p.y === sink.y)[0];
      if (!existing) add(block(sink.x, sink.y, bridge, 0, 'item-end'));
      else if (existing.block !== bridge) bridge = existing.block;
      // A bridge may only link to the same block type, including its terminal.
      if ((bridge === 'bridge-conveyor' && route.some((p, i) => i > 0 && distance(p, route![i - 1]) > 4.001))) continue;
      buildRoute(route, bridge, 'item-bridge'); sink.load += load; connected += load;
    }
    if (connected <= 0) { mark(grid, d, s, 0); d.outlets.forEach(p => { if (grid[idx(p.x, p.y)] === 2) grid[idx(p.x, p.y)] = 0; }); if (d.liquidPort) grid[idx(d.liquidPort.x, d.liquidPort.y)] = 0; warnings.push('unrouted-drill'); continue; }
    d.rate = Math.min(expected, connected); active.push(d);
    const placement = block(d.x, d.y, spec.block, 0, 'drill', s); placement.rate = d.rate; add(placement);
  }
  const pumpRate = (p: Point): number => {
    let efficiency = 0; for (let y = p.y; y < p.y + 2; y++) for (let x = p.x; x < p.x + 2; x++) efficiency += Math.max(0, input.waterEfficiency[idx(x, y)] || 0) / 4;
    return 6.6 * efficiency * (boosted(p, 2) ? 2.5 : 1);
  };
  let waterSupply = 0;
  for (let di = 0; di < active.length; di++) {
    const d = active[di], need = spec.water * (d.boosted ? 2.5 : 1);
    if (!wantsWater || !d.liquidPort) continue;
    if (options.waterMode === 'external') {
      add(block(d.liquidPort.x, d.liquidPort.y, 'liquid-router', 0, 'water-port'));
      d.watered = true; d.waterDemand = need; warnings.push('external-water'); continue;
    }
    let supplied = 0;
    for (let attempt = 0; attempt < 3 && supplied < need * 1.05; attempt++) {
      const pumps: { p: Point; sender: Point; value: number; direct: boolean }[] = [];
      for (let y = 1; y < h - 2; y++) for (let x = 6; x < w - 8; x++) {
        if (!free(grid, x, y, 2)) continue;
        const p = { x, y }, rate = pumpRate(p); if (rate <= 0.01) continue;
        const direct = x < d.x + s && x + 2 > d.x && (y + 2 === d.y || y === d.y + s) || y < d.y + s && y + 2 > d.y && (x + 2 === d.x || x === d.x + s);
        if (options.waterMode === 'extractors' && !direct) continue;
        if (active.some(other => other !== d && (x < other.x + s && x + 2 > other.x && (y + 2 === other.y || y === other.y + s) || y < other.y + s && y + 2 > other.y && (x + 2 === other.x || x === other.x + s)))) continue;
        const senders = perimeter(p, 2).filter(t => free(grid, t.x, t.y));
        if (!direct && !senders.length) continue;
        const sender = direct ? p : senders.sort((a, b) => distance(a, d.liquidPort!) - distance(b, d.liquidPort!))[0];
        const value = oreCount(p, 2) * 300 + distance(p, d) * 0.5 + (direct ? -20 : 5) - Math.min(need - supplied, rate) * 3;
        pumps.push({ p, sender, value, direct });
      }
      pumps.sort((a, b) => a.value - b.value);
      let installed = false;
      for (let pi = 0; pi < Math.min(12, pumps.length); pi++) {
        const candidate = pumps[pi];
        // A local extractor is used only if it alone sustains the drill.
        if (candidate.direct && pumpRate(candidate.p) < need * 1.05) continue;
        if (candidate.direct) {
          add(block(candidate.p.x, candidate.p.y, 'water-extractor', 0, 'extractor', 2)); supplied += pumpRate(candidate.p); installed = true; break;
        }
        mark(grid, candidate.p, 2, 6);
        const pc = center(candidate.p, 2), sc = center(candidate.sender);
        const forbid = sc.x < pc.x && sc.y >= candidate.p.y && sc.y < candidate.p.y + 2 ? 0 : sc.x > pc.x && sc.y >= candidate.p.y && sc.y < candidate.p.y + 2 ? 2 : sc.y < pc.y ? 3 : 1;
        const route = path(candidate.sender, [d.liquidPort], canPhase ? 12 : 4, forbid);
        if (!route) { mark(grid, candidate.p, 2, 0); continue; }
        let liquidName = canPhase ? 'phase-conduit' : 'bridge-conduit';
        const basic = canPhase && options.routing !== 'phase' ? path(candidate.sender, [d.liquidPort], 4, forbid) : undefined;
        let selected = route;
        if (basic && basic.length <= route.length + 1) { selected = basic; liquidName = 'bridge-conduit'; }
        const terminal = placements.filter(p => p.x === d.liquidPort!.x && p.y === d.liquidPort!.y)[0];
        if (terminal && terminal.block !== liquidName) { liquidName = terminal.block; selected = path(candidate.sender, [d.liquidPort], liquidName === 'phase-conduit' ? 12 : 4, forbid) || []; if (selected.length < 2) { mark(grid, candidate.p, 2, 0); continue; } }
        add(block(candidate.p.x, candidate.p.y, 'water-extractor', 0, 'extractor', 2));
        const routeStart = placements.length;
        buildRoute(selected, liquidName, 'liquid-bridge');
        placements[routeStart].supply = candidate.p;
        if (!terminal) add(block(d.liquidPort.x, d.liquidPort.y, liquidName, 0, 'liquid-end'));
        supplied += pumpRate(candidate.p); installed = true; break;
      }
      if (!installed) break;
    }
    d.watered = supplied >= need * 1.05; d.waterDemand = d.watered ? need : 0; waterSupply += supplied;
    if (!d.watered) warnings.push('water-shortfall');
  }
  const consumesPower = (p: BlockPlan) => p.kind === 'dome' || p.kind === 'extractor' || p.kind === 'drill' && spec.power > 0 || p.block === 'phase-conveyor' && !!p.link || p.block === 'phase-conduit' && !!p.link;
  const targets = placements.filter(consumesPower), reached = array(targets.length, false), nodes: BlockPlan[] = [];
  const clearRay = (a: Point, b: Point) => {
    if (!input.insulated) return true;
    const length = Math.ceil(distance(a, b) * 2);
    for (let t = 1; t < length; t++) { const x = Math.floor(a.x + (b.x - a.x) * t / length), y = Math.floor(a.y + (b.y - a.y) * t / length); if (inside(x, y) && input.insulated[idx(x, y)]) return false; }
    return true;
  };
  if (options.power) {
    for (let iteration = 0; iteration < 32 && reached.some(v => !v); iteration++) {
      let best: BlockPlan | undefined, value = -Infinity;
      for (let y = 0; y < h - 1; y++) for (let x = 1; x < w - 2; x++) {
        if (!free(grid, x, y, 2)) continue;
        const p = block(x, y, 'power-node-large', 0, 'power', 2), c = center(p, 2);
        if (nodes.length && !nodes.some(node => (node.links || []).length < 14 && distance(c, center(node, 2)) <= 15 && clearRay(c, center(node, 2)))) continue;
        let count = 0;
        for (let i = 0; i < targets.length; i++) if (!reached[i] && distance(c, center(targets[i], targets[i].size)) <= 15 + targets[i].size / 2 && clearRay(c, center(targets[i], targets[i].size))) count++;
        const score = count * 100 - oreCount(p, 2) * 3 - distance(c, { x: w / 2, y: h / 2 }) * 0.01;
        if (score > value && count > 0) { best = p; value = score; }
      }
      if (!best && nodes.length) {
        let closest = Infinity;
        const oldDistances = targets.map((target, i) => reached[i] ? Infinity : Math.min.apply(null, nodes.map(node => distance(center(node, 2), center(target, target.size)))));
        for (let y = 0; y < h - 1; y++) for (let x = 1; x < w - 2; x++) {
          if (!free(grid, x, y, 2)) continue;
          const p = block(x, y, 'power-node-large', 0, 'power', 2), c = center(p, 2);
          if (!nodes.some(node => (node.links || []).length < 14 && distance(c, center(node, 2)) <= 15 && clearRay(c, center(node, 2)))) continue;
          for (let i = 0; i < targets.length; i++) if (!reached[i]) {
            const target = center(targets[i], targets[i].size);
            const oldDistance = oldDistances[i];
            const gap = distance(c, target);
            if (gap < oldDistance - 1 && gap < closest) { closest = gap; best = p; }
          }
        }
      }
      if (!best) { warnings.push('power-unreachable'); break; }
      best.links = [];
      for (let i = 0; i < nodes.length; i++) if ((nodes[i].links || []).length < 14 && distance(center(best, 2), center(nodes[i], 2)) <= 15 && clearRay(center(best, 2), center(nodes[i], 2))) { best.links.push({ x: nodes[i].x, y: nodes[i].y, size: 2 }); nodes[i].links!.push({ x: best.x, y: best.y, size: 2 }); connections.push({ from: center(best, 2), to: center(nodes[i], 2), kind: 'power' }); break; }
      for (let i = 0; i < targets.length && best.links.length < 12; i++) {
        const p = targets[i];
        if (!reached[i] && distance(center(best, 2), center(p, p.size)) <= 15 + p.size / 2 && clearRay(center(best, 2), center(p, p.size))) { best.links.push(p); reached[i] = true; connections.push({ from: center(best, 2), to: center(p, p.size), kind: 'power' }); }
      }
      nodes.push(best); add(best);
    }
  }
  let output = 0, waterDemand = 0, power = domes.length * 600;
  for (let i = 0; i < active.length; i++) {
    const d = active[i], rate = baseRate(d.oreTiles) * (d.watered ? spec.boost * spec.boost : 1) * (d.boosted ? 2.5 : 1);
    d.rate = incompatible || spec.power > 0 && !options.power || warnings.indexOf('power-unreachable') >= 0 ? 0 : Math.min(rate, d.rate); output += d.rate; waterDemand += d.waterDemand;
    power += spec.power * (d.boosted ? 2.5 : 1);
  }
  placements.forEach(p => { if (p.kind === 'extractor') power += 90 * (boosted(p, 2) ? 2.5 : 1); else if ((p.block === 'phase-conveyor' || p.block === 'phase-conduit') && p.link) power += 18 * (p.block === 'phase-conveyor' && boosted(p) ? 2.5 : 1); });
  const coveredMask = array(n, false);
  active.forEach(d => { for (let y = d.y; y < d.y + s; y++) for (let x = d.x; x < d.x + s; x++) coveredMask[idx(x, y)] = true; });
  let totalOre = 0, covered = 0;
  const uncovered: Point[] = [];
  for (let i = 0; i < n; i++) if (input.ore[i]) { totalOre++; if (coveredMask[i]) covered++; else uncovered.push({ x: i % w, y: Math.floor(i / w) }); }
  const ports: Port[] = [];
  sinks.filter(t => t.used && t.load > 0).forEach(t => ports.push({ x: t.x, y: t.y, kind: 'items', capacity: t.capacity, load: t.load, group: t.group }));
  domes.forEach(d => { ports.push({ x: d.x - 1, y: d.y, kind: 'fuel', item: 'phase-fabric', capacity: 11, load: 0.2, group: -1 }); ports.push({ x: d.x - 1, y: d.y + 2, kind: 'fuel', item: 'silicon', capacity: 11, load: 0.2, group: -1 }); });
  if (nodes.length) ports.push({ x: nodes[0].x, y: nodes[0].y, kind: 'power', capacity: 0, load: power, group: -1 });
  if (incompatible) warnings.push('incompatible');
  if (spec.power > 0 && !options.power) warnings.push('no-power');
  if (options.water && !wantsWater) warnings.push('water-needs-power');
  const uniqueWarnings: string[] = []; warnings.forEach(v => { if (uniqueWarnings.indexOf(v) < 0) uniqueWarnings.push(v); });
  return {
    placements, drills: active, ports, connections, covered, totalOre, coverage: Math.round(covered / Math.max(1, totalOre) * 100),
    output, potential: baseRate(covered) * (wantsWater ? spec.boost * spec.boost : 1) * expectedBoost,
    waterDemand, waterSupply, power, domeCoverage: active.filter(d => d.boosted).length,
    tried: allTrials, warnings: uniqueWarnings, uncovered,
    upperBound: incompatible ? 0 : baseRate(totalOre) * (wantsWater ? spec.boost * spec.boost : 1) * expectedBoost,
  };
}