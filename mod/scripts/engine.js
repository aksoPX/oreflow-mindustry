"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.planMine = planMine;
var DX = [1, 0, -1, 0], DY = [0, -1, 0, 1];
function array(n, value) { var out = []; for (var i = 0; i < n; i++)
    out.push(value); return out; }
function distance(a, b) { var x = a.x - b.x, y = a.y - b.y; return Math.sqrt(x * x + y * y); }
function manhattan(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
function center(p, size) {
    if (size === void 0) { size = 1; }
    return { x: p.x + size / 2, y: p.y + size / 2 };
}
function jitter(x, y, seed) { var n = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453; return n - Math.floor(n); }
function dirFromTo(from, to) {
    var dx = to.x - from.x, dy = to.y - from.y;
    if (Math.abs(dx) >= Math.abs(dy))
        return dx > 0 ? 0 : 2;
    return dy < 0 ? 1 : 3;
}
function planMine(input, options) {
    var w = input.width, h = input.height, n = w * h, spec = input.drill, s = spec.size;
    var idx = function (x, y) { return x + y * w; };
    var inside = function (x, y) { return x >= 0 && y >= 0 && x < w && y < h; };
    var free = function (g, x, y, size) {
        if (size === void 0) { size = 1; }
        if (x < 0 || y < 0 || x + size > w || y + size > h)
            return false;
        for (var yy = y; yy < y + size; yy++)
            for (var xx = x; xx < x + size; xx++)
                if (g[idx(xx, yy)] !== 0)
                    return false;
        return true;
    };
    var mark = function (g, p, size, value) {
        for (var y = p.y; y < p.y + size; y++)
            for (var x = p.x; x < p.x + size; x++)
                g[idx(x, y)] = value;
    };
    var oreCount = function (p, size) {
        var count = 0;
        for (var y = p.y; y < p.y + size; y++)
            for (var x = p.x; x < p.x + size; x++)
                count += input.ore[idx(x, y)] || 0;
        return count;
    };
    var perimeter = function (p, size) {
        var out = [];
        for (var i = 0; i < size; i++)
            out.push({ x: p.x + i, y: p.y - 1 }, { x: p.x + i, y: p.y + size }, { x: p.x - 1, y: p.y + i }, { x: p.x + size, y: p.y + i });
        return out.filter(function (t) { return inside(t.x, t.y); });
    };
    var baseRate = function (count) { return 60 * count / (spec.time + spec.hardnessMultiplier * input.hardness); };
    var incompatible = spec.tier < input.hardness;
    var wantsWater = options.water && (options.power || options.waterMode === 'external');
    var portCapacity = options.conveyor === 'titanium' ? 11 : 20;
    var canPhase = options.power && options.routing !== 'bridge';
    var useProjector = options.overdrive && options.power && spec.size <= 3;
    var expectedBoost = options.overdrive && options.power ? (useProjector ? 1.5 : 2.5) : 1;
    var baseGrid = array(n, 0);
    for (var i = 0; i < n; i++)
        if (input.blocked[i])
            baseGrid[i] = -1;
    var foreignOre = input.foreignOre || array(n, false);
    var block = function (x, y, name, rotation, kind, size) {
        if (kind === void 0) { kind = 'belt'; }
        if (size === void 0) { size = 1; }
        return ({ x: x, y: y, block: name, size: size, rotation: rotation, kind: kind });
    };
    // --- Output trunks on left and right edges ---
    var sinks = [];
    var groupId = 0;
    var _loop_1 = function (side) {
        var transform = function (x, y) { return ({ x: side === 0 ? w - 6 + x : 5 - x, y: y }); };
        var rotation = side === 0 ? 0 : 2;
        var step = options.conveyor === 'plastanium' ? 4 : 2;
        var _loop_6 = function (cy) {
            var template = [];
            var addT = function (x, y, name, rot, kind) {
                if (kind === void 0) { kind = 'belt'; }
                var p = transform(x, y);
                template.push(block(p.x, p.y, name, rot, kind));
            };
            if (options.conveyor === 'plastanium') {
                addT(0, cy - 1, 'bridge-conveyor', rotation, 'item-end');
                addT(0, cy + 1, 'bridge-conveyor', rotation, 'item-end');
                addT(1, cy - 1, 'plastanium-conveyor', rotation, 'loader');
                addT(2, cy - 1, 'plastanium-conveyor', 3);
                addT(1, cy + 1, 'plastanium-conveyor', rotation, 'loader');
                addT(2, cy + 1, 'plastanium-conveyor', 1);
                for (var x = 2; x <= 5; x++)
                    addT(x, cy, 'plastanium-conveyor', rotation, x === 5 ? 'exit' : 'belt');
            }
            else {
                addT(0, cy, 'bridge-conveyor', rotation, 'item-end');
                for (var x = 1; x <= 5; x++)
                    addT(x, cy, 'titanium-conveyor', rotation, x === 5 ? 'exit' : 'belt');
            }
            if (template.some(function (p) { return !free(baseGrid, p.x, p.y); }))
                return "continue";
            for (var i = 0; i < template.length; i++)
                mark(baseGrid, template[i], 1, 3);
            var ends = template.filter(function (p) { return p.kind === 'item-end'; });
            for (var i = 0; i < ends.length; i++)
                sinks.push({ x: ends[i].x, y: ends[i].y, kind: 'items', capacity: portCapacity, load: 0, group: groupId, template: template, used: false });
            groupId++;
        };
        for (var cy = 2; cy < h - 2; cy += step) {
            _loop_6(cy);
        }
    };
    for (var side = 0; side < 2; side++) {
        _loop_1(side);
    }
    // --- Dense drill packing ---
    var candidates = [];
    for (var y = 0; y <= h - s; y++)
        for (var x = 6; x <= w - s - 6; x++) {
            if (!incompatible && free(baseGrid, x, y, s)) {
                var count = oreCount({ x: x, y: y }, s);
                if (count > 0)
                    candidates.push({ x: x, y: y, count: count, score: 0 });
            }
        }
    var allTrials = Math.min(options.trials || 64, s * (2 * s + 1) * 2 + 4);
    var packings = [];
    var _loop_2 = function (trial) {
        var grid_1 = baseGrid.slice(), drills = [];
        var vertical = trial % 2 === 1, ox = Math.floor(trial / 2) % s, oy = Math.floor(trial / (s * 2)) % (2 * s + 1);
        var ordered = candidates.map(function (c) {
            var ax = vertical ? c.y : c.x, ay = vertical ? c.x : c.y;
            var band = ((ay - oy) % (2 * s + 1) + 2 * s + 1) % (2 * s + 1);
            var aligned = ((ax - ox) % s + s) % s === 0 && (band === 0 || band === s);
            return { x: c.x, y: c.y, count: c.count, score: c.count * 30 + (aligned ? s * s * 42 : 0) + jitter(c.x, c.y, trial) * 3 };
        }).sort(function (a, b) { return b.score - a.score; });
        if (input.anchor) {
            var forced = candidates.filter(function (c) { return c.x === input.anchor.x && c.y === input.anchor.y; });
            if (forced.length)
                ordered.unshift(forced[0]);
        }
        for (var ci = 0; ci < ordered.length; ci++) {
            var c = ordered[ci];
            if (options.priority === 'compact' && c.count < s * s * 0.5)
                continue;
            if (!free(grid_1, c.x, c.y, s))
                continue;
            var predicted = baseRate(c.count) * (wantsWater ? spec.boost * spec.boost : 1) * expectedBoost;
            var outCount = Math.max(1, Math.ceil(predicted / portCapacity - 0.00001));
            var ports_1 = perimeter(c, s).filter(function (p) { return free(grid_1, p.x, p.y); });
            if (ports_1.length < outCount + (wantsWater ? 1 : 0))
                continue;
            // Prefer non-ore, non-foreign-ore cells for ports
            ports_1.sort(function (a, b) {
                var cost = function (p) { return (input.ore[idx(p.x, p.y)] ? 8 : 0) + (foreignOre[idx(p.x, p.y)] ? 50 : 0) + Math.min(p.x, w - p.x) * 0.03; };
                return cost(a) - cost(b);
            });
            var outlets = ports_1.slice(0, outCount);
            var liquidPort = wantsWater ? ports_1[outCount] : undefined;
            mark(grid_1, c, s, 1);
            outlets.forEach(function (p) { return mark(grid_1, p, 1, 2); });
            if (liquidPort)
                mark(grid_1, liquidPort, 1, 2);
            drills.push({ x: c.x, y: c.y, size: s, oreTiles: c.count, rate: 0, boosted: false, watered: false, waterDemand: 0, outlets: outlets, outletFlows: [], liquidPort: liquidPort });
        }
        var covered_1 = drills.reduce(function (sum, d) { return sum + d.oreTiles; }, 0);
        packings.push({ grid: grid_1, drills: drills, score: covered_1 * 1000 - drills.length * (options.priority === 'compact' ? 5 : 0.1) });
    };
    for (var trial = 0; trial < allTrials; trial++) {
        _loop_2(trial);
    }
    packings.sort(function (a, b) { return b.score - a.score; });
    var packing = packings[0] || { grid: baseGrid, drills: [], score: 0 };
    var grid = packing.grid, placements = [], connections = [], warnings = [];
    var add = function (p) { placements.push(p); mark(grid, p, p.size, 5); };
    // --- A* pathfinding with weights ---
    var astar = function (start, targets, maxBridge) {
        if (!targets.length)
            return undefined;
        var target = array(n, false);
        targets.forEach(function (t) { target[idx(t.x, t.y)] = true; });
        var gScore = array(n, Infinity), parent = array(n, -1), closed = array(n, false);
        // Min-heap by f = g + h
        var heap = [], heuristic = array(n, 0);
        targets.forEach(function (t) { for (var i = 0; i < n; i++)
            heuristic[i] = Math.min(heuristic[i] || 9999, manhattan({ x: i % w, y: Math.floor(i / w) }, t)); });
        var startIdx = idx(start.x, start.y);
        gScore[startIdx] = 0;
        heap.push(startIdx);
        while (heap.length) {
            // Simple extraction of minimum f-score (adequate for small grids)
            var bestI = 0;
            for (var i = 1; i < heap.length; i++)
                if (gScore[heap[i]] + heuristic[heap[i]] < gScore[heap[bestI]] + heuristic[heap[bestI]])
                    bestI = i;
            var at = heap[bestI];
            heap[bestI] = heap[heap.length - 1];
            heap.pop();
            if (closed[at])
                continue;
            closed[at] = true;
            var ax = at % w, ay = Math.floor(at / w);
            if (target[at] && at !== startIdx) {
                var result = [];
                for (var cur = at; cur !== -1; cur = parent[cur])
                    result.push({ x: cur % w, y: Math.floor(cur / w) });
                return result.reverse();
            }
            for (var dir = 0; dir < 4; dir++) {
                for (var k = 1; k <= maxBridge; k++) {
                    var nx = ax + DX[dir] * k, ny = ay + DY[dir] * k;
                    if (!inside(nx, ny))
                        break;
                    var next = idx(nx, ny);
                    if (grid[next] !== 0 && !target[next])
                        break; // obstacle stops this direction
                    var weight = k + (foreignOre[next] ? 40 : 0) + (k > 1 ? 0.5 : 0); // penalty for foreign ore, slight penalty for long jumps
                    var tentative = gScore[at] + weight;
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
    var buildRoute = function (points, name, kind) {
        for (var i = 0; i < points.length - 1; i++) {
            var rot = dirFromTo(points[i], points[i + 1]);
            var p = block(points[i].x, points[i].y, name, rot, kind);
            p.link = points[i + 1];
            add(p);
            connections.push({ from: points[i], to: points[i + 1], kind: kind });
        }
    };
    // --- Overdrive: projector for small, dome for large ---
    var domes = [];
    if (options.overdrive && options.power && packing.drills.length > 0) {
        var minDrillsForDome = 4;
        var useDome = packing.drills.length >= minDrillsForDome && spec.size >= 3;
        var boosterBlock = useDome ? 'overdrive-dome' : 'overdrive-projector';
        var boosterSize = useDome ? 3 : 2;
        var boosterRange_1 = useDome ? 25 : 10;
        var best = void 0, bestScore = -Infinity;
        for (var y = 0; y < h - boosterSize; y++)
            for (var x = 6; x < w - 6 - boosterSize; x++) {
                if (!free(grid, x, y, boosterSize))
                    continue;
                var p = block(x, y, boosterBlock, 0, 'dome', boosterSize);
                var value = 0;
                for (var i = 0; i < packing.drills.length; i++) {
                    var d = packing.drills[i];
                    if (distance(center(d, s), center(p, boosterSize)) <= boosterRange_1)
                        value += baseRate(d.oreTiles) * 100;
                }
                value -= oreCount(p, boosterSize) * 15 + distance(center(p, boosterSize), { x: w / 2, y: h / 2 }) * 0.08;
                if (value > bestScore) {
                    bestScore = value;
                    best = p;
                }
            }
        if (best) {
            add(best);
            domes.push(best);
            if (useDome) {
                // Dome needs silicon + phase-fabric via sorters — place adjacent
                var sx = best.x + boosterSize, sy = best.y;
                if (inside(sx, sy) && free(grid, sx, sy) && inside(sx, sy + 1) && free(grid, sx, sy + 1)) {
                    var f1 = block(sx, sy, 'sorter', 0, 'fuel-filter');
                    f1.item = 'silicon';
                    add(f1);
                    var f2 = block(sx, sy + 1, 'sorter', 0, 'fuel-filter');
                    f2.item = 'phase-fabric';
                    add(f2);
                }
                warnings.push('dome-needs-fuel');
            }
        }
        else
            warnings.push('no-dome-space');
    }
    var boosterRange = domes.length && domes[0].block === 'overdrive-dome' ? 25 : domes.length ? 10 : 0;
    var boosterMult = domes.length && domes[0].block === 'overdrive-dome' ? 2.5 : domes.length ? 1.5 : 1;
    var boosted = function (p, size) {
        if (size === void 0) { size = 1; }
        return domes.some(function (d) { return distance(center(p, size), center(d, d.size)) <= boosterRange; });
    };
    // --- Connect drills to output trunks ---
    var active = [];
    var _loop_3 = function (di) {
        var d = packing.drills[di];
        d.boosted = boosted(d, s);
        var expected = baseRate(d.oreTiles) * (wantsWater ? spec.boost * spec.boost : 1) * (d.boosted ? boosterMult : 1), connected = 0;
        var _loop_7 = function (oi) {
            var start = d.outlets[oi], load = Math.min(expected - connected, portCapacity);
            if (load <= 0.001) {
                grid[idx(start.x, start.y)] = 0;
                return "continue";
            }
            var availSinks = sinks.filter(function (t) { return t.capacity - t.load >= load - 0.001; });
            var maxRange = options.routing === 'phase' ? 12 : 4;
            var route = astar(start, availSinks, maxRange);
            if (!route || route.length < 2)
                return "continue";
            var end = route[route.length - 1], sink = sinks.filter(function (t) { return t.x === end.x && t.y === end.y; })[0];
            if (!sink)
                return "continue";
            if (!sink.used) {
                var group = sinks.filter(function (t) { return t.group === sink.group; });
                group.forEach(function (t) { t.used = true; });
                sink.template.forEach(function (t) { if (t.kind !== 'item-end')
                    placements.push(t); });
            }
            // Determine bridge type: use phase only if span > 4 somewhere in route
            var needsPhase = false;
            for (var i = 1; i < route.length; i++) {
                if (manhattan(route[i], route[i - 1]) > 4) {
                    needsPhase = true;
                    break;
                }
            }
            var bridgeName = needsPhase && canPhase ? 'phase-conveyor' : 'bridge-conveyor';
            var existing = placements.filter(function (p) { return p.x === sink.x && p.y === sink.y; })[0];
            if (!existing) {
                var endRot = dirFromTo(route[route.length - 2], end);
                add(block(sink.x, sink.y, bridgeName, endRot, 'item-end'));
            }
            else if (existing.block !== bridgeName)
                return "continue";
            buildRoute(route, bridgeName, 'item-bridge');
            if (needsPhase)
                for (var i = placements.length - route.length; i < placements.length; i++)
                    if (i >= 0)
                        placements[i].reason = 'obstacle-no-basic-route';
            sink.load += load;
            connected += load;
            d.outletFlows.push({ x: start.x, y: start.y, load: load, capacity: portCapacity });
        };
        for (var oi = 0; oi < d.outlets.length; oi++) {
            _loop_7(oi);
        }
        if (connected <= 0) {
            mark(grid, d, s, 0);
            d.outlets.forEach(function (p) { if (grid[idx(p.x, p.y)] === 2)
                grid[idx(p.x, p.y)] = 0; });
            if (d.liquidPort)
                grid[idx(d.liquidPort.x, d.liquidPort.y)] = 0;
            warnings.push('unrouted-drill');
            return "continue";
        }
        d.outlets = d.outlets.filter(function (p) {
            if (d.outletFlows.some(function (flow) { return flow.x === p.x && flow.y === p.y; }))
                return true;
            if (grid[idx(p.x, p.y)] === 2)
                grid[idx(p.x, p.y)] = 0;
            return false;
        });
        if (connected + 0.001 < expected)
            warnings.push('output-overload');
        d.rate = Math.min(expected, connected);
        active.push(d);
        var placement = block(d.x, d.y, spec.block, 0, 'drill', s);
        placement.rate = d.rate;
        add(placement);
    };
    for (var di = 0; di < packing.drills.length; di++) {
        _loop_3(di);
    }
    // --- Water: extractors with conduit (titanium pipe), not liquid-routers ---
    var pumpRate = function (p) {
        var efficiency = 0;
        for (var y = p.y; y < p.y + 2; y++)
            for (var x = p.x; x < p.x + 2; x++)
                efficiency += Math.max(0, input.waterEfficiency[idx(x, y)] || 0) / 4;
        return 6.6 * efficiency * (boosted(p, 2) ? boosterMult : 1);
    };
    var waterSupply = 0, externalWaterDemand = 0;
    var _loop_4 = function (di) {
        var d = active[di], need = spec.water * (d.boosted ? boosterMult : 1);
        if (!wantsWater || !d.liquidPort)
            return "continue";
        var supplied = 0;
        for (var attempt = 0; attempt < 3 && supplied < need * 1.05; attempt++) {
            var pumps = [];
            for (var y = 0; y < h - 1; y++)
                for (var x = 6; x < w - 7; x++) {
                    if (!free(grid, x, y, 2))
                        continue;
                    var p = { x: x, y: y }, rate = pumpRate(p);
                    if (rate <= 0.01)
                        continue;
                    var direct = x < d.x + s && x + 2 > d.x && (y + 2 === d.y || y === d.y + s) || y < d.y + s && y + 2 > d.y && (x + 2 === d.x || x === d.x + s);
                    if (options.waterMode === 'extractors' && !direct)
                        continue;
                    var senderCandidates = perimeter(p, 2).filter(function (t) { return free(grid, t.x, t.y); });
                    if (!direct && !senderCandidates.length)
                        continue;
                    var sender = direct ? p : senderCandidates.sort(function (a, b) { return distance(a, d.liquidPort) - distance(b, d.liquidPort); })[0];
                    var value = oreCount(p, 2) * 300 + distance(p, d) * 0.5 + (direct ? -20 : 5) - Math.min(need - supplied, rate) * 3;
                    pumps.push({ p: p, sender: sender, value: value, direct: direct });
                }
            pumps.sort(function (a, b) { return a.value - b.value; });
            var installed = false;
            for (var pi = 0; pi < Math.min(12, pumps.length); pi++) {
                var candidate = pumps[pi];
                if (candidate.direct && pumpRate(candidate.p) < need * 1.05)
                    continue;
                if (candidate.direct) {
                    add(block(candidate.p.x, candidate.p.y, 'water-extractor', 0, 'extractor', 2));
                    supplied += pumpRate(candidate.p);
                    installed = true;
                    break;
                }
                mark(grid, candidate.p, 2, 6);
                // Route water via conduit bridges with correct rotation
                var route = astar(candidate.sender, [d.liquidPort], canPhase ? 12 : 4);
                if (!route || route.length < 2) {
                    mark(grid, candidate.p, 2, 0);
                    continue;
                }
                // Check if any span > 4 to decide bridge type
                var needsPhaseLiquid = false;
                for (var i = 1; i < route.length; i++)
                    if (manhattan(route[i], route[i - 1]) > 4) {
                        needsPhaseLiquid = true;
                        break;
                    }
                var liquidName = needsPhaseLiquid && canPhase ? 'phase-conduit' : 'bridge-conduit';
                add(block(candidate.p.x, candidate.p.y, 'water-extractor', 0, 'extractor', 2));
                var routeStart = placements.length;
                buildRoute(route, liquidName, 'liquid-bridge');
                placements[routeStart].supply = candidate.p;
                var terminal = placements.filter(function (p) { return p.x === d.liquidPort.x && p.y === d.liquidPort.y; })[0];
                if (!terminal) {
                    var endRot = dirFromTo(route[route.length - 2], route[route.length - 1]);
                    add(block(d.liquidPort.x, d.liquidPort.y, liquidName, endRot, 'liquid-end'));
                }
                supplied += pumpRate(candidate.p);
                installed = true;
                break;
            }
            if (!installed)
                break;
        }
        d.watered = supplied >= need * 1.05;
        d.waterDemand = d.watered ? need : 0;
        waterSupply += supplied;
        if (!d.watered && options.waterMode === 'external') {
            d.watered = true;
            d.waterDemand = need;
            externalWaterDemand += need;
        }
        if (!d.watered)
            warnings.push('water-shortfall');
    };
    for (var di = 0; di < active.length; di++) {
        _loop_4(di);
    }
    if (externalWaterDemand > 0)
        warnings.push('external-water');
    // --- Power network ---
    var consumesPower = function (p) { return p.kind === 'dome' || p.kind === 'extractor' || (p.kind === 'drill' && spec.power > 0) || p.block === 'phase-conveyor' || p.block === 'phase-conduit'; };
    var targets = placements.filter(consumesPower), reached = array(targets.length, false), nodes = [];
    var clearRay = function (a, b) {
        if (!input.insulated)
            return true;
        var length = Math.ceil(distance(a, b) * 2);
        for (var t = 1; t < length; t++) {
            var x = Math.floor(a.x + (b.x - a.x) * t / length), y = Math.floor(a.y + (b.y - a.y) * t / length);
            if (inside(x, y) && input.insulated[idx(x, y)])
                return false;
        }
        return true;
    };
    var freeNode = function (x, y) {
        if (!inside(x, y) || !inside(x + 1, y + 1))
            return false;
        for (var yy = y; yy < y + 2; yy++)
            for (var xx = x; xx < x + 2; xx++)
                if (grid[idx(xx, yy)] !== 0 && grid[idx(xx, yy)] !== 4)
                    return false;
        return true;
    };
    if (options.power && targets.length) {
        for (var iteration = 0; iteration < 32 && reached.some(function (v) { return !v; }); iteration++) {
            // Try connecting with existing nodes first
            for (var ni = 0; ni < nodes.length; ni++)
                for (var ti = 0; ti < targets.length && nodes[ni].links.length < 13; ti++) {
                    var target = targets[ti], node = nodes[ni];
                    if (!reached[ti] && distance(center(node, 2), center(target, target.size)) <= 15 + target.size / 2 && clearRay(center(node, 2), center(target, target.size))) {
                        node.links.push(target);
                        reached[ti] = true;
                        connections.push({ from: center(node, 2), to: center(target, target.size), kind: 'power' });
                    }
                }
            if (!reached.some(function (v) { return !v; }))
                break;
            // Place new node
            var best = void 0, bestValue = -Infinity;
            for (var y = 0; y < h - 1; y++) {
                var _loop_5 = function (x) {
                    if (!freeNode(x, y))
                        return "continue";
                    var p = block(x, y, 'power-node-large', 0, 'power', 2), c = center(p, 2);
                    if (nodes.length && !nodes.some(function (node) { return (node.links || []).length < 14 && distance(c, center(node, 2)) <= 15 && clearRay(c, center(node, 2)); }))
                        return "continue";
                    var count = 0;
                    for (var i = 0; i < targets.length; i++)
                        if (!reached[i] && distance(c, center(targets[i], targets[i].size)) <= 15 + targets[i].size / 2 && clearRay(c, center(targets[i], targets[i].size)))
                            count++;
                    var score = count * 100 - oreCount(p, 2) * 3 - distance(c, { x: w / 2, y: h / 2 }) * 0.01;
                    if (score > bestValue && count > 0) {
                        best = p;
                        bestValue = score;
                    }
                };
                for (var x = 6; x < w - 7; x++) {
                    _loop_5(x);
                }
            }
            if (!best) {
                // Last resort: use remaining link budget
                for (var ni = 0; ni < nodes.length; ni++)
                    for (var ti = 0; ti < targets.length && nodes[ni].links.length < 14; ti++) {
                        var target = targets[ti], node = nodes[ni];
                        if (!reached[ti] && distance(center(node, 2), center(target, target.size)) <= 15 + target.size / 2 && clearRay(center(node, 2), center(target, target.size))) {
                            node.links.push(target);
                            reached[ti] = true;
                            connections.push({ from: center(node, 2), to: center(target, target.size), kind: 'power' });
                        }
                    }
                if (reached.some(function (v) { return !v; }))
                    warnings.push('power-unreachable');
                break;
            }
            best.links = [];
            for (var i = 0; i < nodes.length; i++)
                if ((nodes[i].links || []).length < 14 && distance(center(best, 2), center(nodes[i], 2)) <= 15 && clearRay(center(best, 2), center(nodes[i], 2))) {
                    best.links.push({ x: nodes[i].x, y: nodes[i].y, size: 2 });
                    nodes[i].links.push({ x: best.x, y: best.y, size: 2 });
                    connections.push({ from: center(best, 2), to: center(nodes[i], 2), kind: 'power' });
                    break;
                }
            for (var i = 0; i < targets.length && best.links.length < 11; i++) {
                var p = targets[i];
                if (!reached[i] && distance(center(best, 2), center(p, p.size)) <= 15 + p.size / 2 && clearRay(center(best, 2), center(p, p.size))) {
                    best.links.push(p);
                    reached[i] = true;
                    connections.push({ from: center(best, 2), to: center(p, p.size), kind: 'power' });
                }
            }
            nodes.push(best);
            add(best);
        }
    }
    // --- Totals ---
    var output = 0, waterDemand = 0, power = domes.length ? (domes[0].block === 'overdrive-dome' ? 600 : 180) : 0;
    for (var i = 0; i < active.length; i++) {
        var d = active[i], rate = baseRate(d.oreTiles) * (d.watered ? spec.boost * spec.boost : 1) * (d.boosted ? boosterMult : 1);
        d.rate = incompatible || (spec.power > 0 && !options.power) || warnings.indexOf('power-unreachable') >= 0 ? 0 : Math.min(rate, d.rate);
        output += d.rate;
        waterDemand += d.waterDemand;
        power += spec.power * (d.boosted ? boosterMult : 1);
    }
    placements.forEach(function (p) { if (p.kind === 'extractor')
        power += 90 * (boosted(p, 2) ? boosterMult : 1);
    else if (p.block === 'phase-conveyor' || p.block === 'phase-conduit')
        power += 18; });
    var coveredMask = array(n, false);
    active.forEach(function (d) { for (var y = d.y; y < d.y + s; y++)
        for (var x = d.x; x < d.x + s; x++)
            coveredMask[idx(x, y)] = true; });
    var totalOre = 0, covered = 0;
    var uncovered = [];
    for (var i = 0; i < n; i++)
        if (input.ore[i]) {
            totalOre++;
            if (coveredMask[i])
                covered++;
            else
                uncovered.push({ x: i % w, y: Math.floor(i / w) });
        }
    var ports = [];
    var usedGroups = [];
    sinks.filter(function (t) { return t.used && t.load > 0; }).forEach(function (t) {
        if (usedGroups.indexOf(t.group) >= 0)
            return;
        usedGroups.push(t.group);
        ports.push({ x: t.x < w / 2 ? 0 : w - 1, y: t.template.filter(function (p) { return p.kind === 'exit'; })[0].y, kind: 'items', capacity: options.conveyor === 'plastanium' ? 40 : 11, load: sinks.filter(function (sink) { return sink.group === t.group; }).reduce(function (sum, sink) { return sum + sink.load; }, 0), group: t.group, direction: t.x < w / 2 ? 2 : 0 });
    });
    if (nodes.length)
        ports.push({ x: nodes[0].x, y: nodes[0].y, kind: 'power', capacity: 0, load: power, group: -1 });
    if (incompatible)
        warnings.push('incompatible');
    if (spec.power > 0 && !options.power)
        warnings.push('no-power');
    if (options.overdrive && !options.power)
        warnings.push('dome-needs-power');
    if (options.water && !wantsWater)
        warnings.push('water-needs-power');
    if (!active.length && totalOre > 0 && !incompatible)
        warnings.push('no-connected-drills');
    var uniqueWarnings = [];
    warnings.forEach(function (v) { if (uniqueWarnings.indexOf(v) < 0)
        uniqueWarnings.push(v); });
    return {
        placements: placements,
        drills: active,
        ports: ports,
        connections: connections,
        covered: covered,
        totalOre: totalOre,
        coverage: Math.round(covered / Math.max(1, totalOre) * 100),
        output: output,
        potential: baseRate(covered) * (wantsWater ? spec.boost * spec.boost : 1) * expectedBoost,
        waterDemand: waterDemand,
        waterSupply: waterSupply,
        power: power,
        domeCoverage: active.filter(function (d) { return d.boosted; }).length,
        tried: allTrials, warnings: uniqueWarnings,
        uncovered: uncovered,
        externalWaterDemand: externalWaterDemand,
        phaseConnections: placements.filter(function (p) { return (p.block === 'phase-conveyor' || p.block === 'phase-conduit') && !!p.link; }).length,
        upperBound: incompatible ? 0 : baseRate(totalOre) * (wantsWater ? spec.boost * spec.boost : 1) * expectedBoost,
    };
}
