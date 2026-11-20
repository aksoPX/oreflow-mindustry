"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.planMine = planMine;
var DX = [1, 0, -1, 0], DY = [0, -1, 0, 1];
function array(n, value) { var out = []; for (var i = 0; i < n; i++)
    out.push(value); return out; }
function distance(a, b) { var x = a.x - b.x, y = a.y - b.y; return Math.sqrt(x * x + y * y); }
function center(p, size) {
    if (size === void 0) { size = 1; }
    return { x: p.x + size / 2, y: p.y + size / 2 };
}
function jitter(x, y, seed) { var n = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453; return n - Math.floor(n); }
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
    var expectedBoost = options.overdrive && options.power ? 2.5 : 1;
    var baseGrid = array(n, 0);
    for (var i = 0; i < n; i++)
        if (input.blocked[i])
            baseGrid[i] = -1;
    var sinks = [];
    var groupId = 0;
    var block = function (x, y, name, rotation, kind, size) {
        if (kind === void 0) { kind = 'belt'; }
        if (size === void 0) { size = 1; }
        return ({ x: x, y: y, block: name, size: size, rotation: rotation, kind: kind });
    };
    var _loop_1 = function (side) {
        var transform = function (x, y) { return ({ x: side === 0 ? w - 6 + x : 5 - x, y: y }); };
        var rotation = side === 0 ? 0 : 2;
        var step = options.conveyor === 'plastanium' ? 4 : 2;
        var _loop_7 = function (cy) {
            var template = [];
            var add_1 = function (x, y, name, rot, kind) {
                if (kind === void 0) { kind = 'belt'; }
                var p = transform(x, y);
                template.push(block(p.x, p.y, name, rot, kind));
            };
            if (options.conveyor === 'plastanium') {
                add_1(0, cy - 1, 'phase-conveyor', rotation, 'item-end');
                add_1(0, cy + 1, 'phase-conveyor', rotation, 'item-end');
                add_1(1, cy - 1, 'plastanium-conveyor', rotation, 'loader');
                add_1(2, cy - 1, 'plastanium-conveyor', 3);
                add_1(1, cy + 1, 'plastanium-conveyor', rotation, 'loader');
                add_1(2, cy + 1, 'plastanium-conveyor', 1);
                for (var x = 2; x <= 5; x++)
                    add_1(x, cy, 'plastanium-conveyor', rotation, x === 5 ? 'exit' : 'belt');
            }
            else {
                add_1(0, cy, 'phase-conveyor', rotation, 'item-end');
                for (var x = 1; x <= 5; x++)
                    add_1(x, cy, 'titanium-conveyor', rotation, x === 5 ? 'exit' : 'belt');
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
        for (var cy = 3; cy < h - 3; cy += step) {
            _loop_7(cy);
        }
    };
    // Two real loading docks feed each 40/s plastanium trunk. No mid-line side loading.
    for (var side = 0; side < 2; side++) {
        _loop_1(side);
    }
    // Terminal bridges must not dump sideways into an unrelated nearby route.
    sinks.forEach(function (sink) {
        for (var dir = 0; dir < 4; dir++) {
            var x = sink.x + DX[dir], y = sink.y + DY[dir];
            if (inside(x, y) && baseGrid[idx(x, y)] === 0)
                baseGrid[idx(x, y)] = 3;
        }
    });
    var candidates = [];
    for (var y = 1; y <= h - s - 1; y++)
        for (var x = 6; x <= w - s - 6; x++) {
            if (free(baseGrid, x, y, s)) {
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
            var outCount = Math.max(1, Math.ceil(predicted / Math.min(portCapacity, canPhase ? 30 : 11) - 0.00001));
            var ports_1 = perimeter(c, s).filter(function (p) { return free(grid_1, p.x, p.y); });
            if (ports_1.length < outCount + (wantsWater ? 1 : 0))
                continue;
            ports_1.sort(function (a, b) {
                var cost = function (p) { return (input.ore[idx(p.x, p.y)] ? 8 : 0) + Math.min(p.x, w - p.x) * 0.03; };
                return cost(a) - cost(b);
            });
            var outlets = ports_1.slice(0, outCount);
            var liquidPort = wantsWater ? ports_1[outCount] : undefined;
            mark(grid_1, c, s, 1);
            outlets.forEach(function (p) { return mark(grid_1, p, 1, 2); });
            if (liquidPort)
                mark(grid_1, liquidPort, 1, 2);
            drills.push({ x: c.x, y: c.y, size: s, oreTiles: c.count, rate: 0, boosted: false, watered: false, waterDemand: 0, outlets: outlets, liquidPort: liquidPort });
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
    var domes = [];
    if (options.overdrive && options.power && packing.drills.length) {
        var best = void 0, bestScore = -Infinity;
        for (var y = 1; y < h - 3; y++)
            for (var x = 7; x < w - 9; x++) {
                if (!free(grid, x, y, 3) || !free(grid, x - 1, y) || !free(grid, x - 1, y + 2))
                    continue;
                var p = block(x, y, 'overdrive-dome', 0, 'dome', 3);
                var value = 0;
                for (var i = 0; i < packing.drills.length; i++) {
                    var d = packing.drills[i];
                    if (distance(center(d, s), center(p, 3)) <= 25 + s / 2)
                        value += baseRate(d.oreTiles) * 100;
                }
                value -= oreCount(p, 3) * 15 + distance(center(p, 3), { x: w / 2, y: h / 2 }) * 0.08;
                if (value > bestScore) {
                    bestScore = value;
                    best = p;
                }
            }
        if (best) {
            add(best);
            domes.push(best);
            add(block(best.x - 1, best.y, 'titanium-conveyor', 0, 'fuel'));
            add(block(best.x - 1, best.y + 2, 'titanium-conveyor', 0, 'fuel'));
        }
        else
            warnings.push('no-dome-space');
    }
    var boosted = function (p, size) {
        if (size === void 0) { size = 1; }
        return domes.some(function (d) { return distance(center(p, size), center(d, 3)) <= 25 + size / 2; });
    };
    var path = function (start, targets, range, forbiddenDirection) {
        if (forbiddenDirection === void 0) { forbiddenDirection = -1; }
        if (!targets.length)
            return undefined;
        var target = array(n, false), seen = array(n, false), parent = array(n, -1), queue = [];
        targets.forEach(function (t) { target[idx(t.x, t.y)] = true; });
        var first = idx(start.x, start.y);
        queue.push(first);
        seen[first] = true;
        var found = -1;
        for (var head = 0; head < queue.length && found === -1; head++) {
            var at = queue[head], x = at % w, y = Math.floor(at / w);
            if (target[at] && at !== first) {
                found = at;
                break;
            }
            for (var dir = 0; dir < 4; dir++) {
                if (at === first && dir === forbiddenDirection)
                    continue;
                for (var k = range; k >= 1; k--) {
                    var nx = x + DX[dir] * k, ny = y + DY[dir] * k;
                    if (!inside(nx, ny))
                        continue;
                    var next = idx(nx, ny);
                    if (seen[next] || (grid[next] !== 0 && !target[next]))
                        continue;
                    seen[next] = true;
                    parent[next] = at;
                    queue.push(next);
                }
            }
        }
        if (found < 0)
            return undefined;
        var result = [];
        for (var at = found; at !== -1; at = parent[at])
            result.push({ x: at % w, y: Math.floor(at / w) });
        return result.reverse();
    };
    var buildRoute = function (points, name, kind) {
        for (var i = 0; i < points.length - 1; i++) {
            var p = block(points[i].x, points[i].y, name, 0, kind);
            p.link = points[i + 1];
            add(p);
            connections.push({ from: points[i], to: points[i + 1], kind: kind });
        }
    };
    var active = [];
    for (var di = 0; di < packing.drills.length; di++) {
        var d = packing.drills[di];
        d.boosted = boosted(d, s);
        var expected = baseRate(d.oreTiles) * (wantsWater ? spec.boost * spec.boost : 1) * (d.boosted ? 2.5 : 1), connected = 0;
        var _loop_3 = function (oi) {
            var start = d.outlets[oi], load = Math.min(expected - connected, portCapacity, canPhase ? 30 : 11);
            if (load <= 0.001) {
                grid[idx(start.x, start.y)] = 0;
                return "continue";
            }
            var targets_1 = sinks.filter(function (t) { return t.capacity - t.load >= load - 0.001; });
            var dc = center(d, s), pc = center(start);
            var forbid = pc.x < dc.x && pc.y >= d.y && pc.y < d.y + s ? 0 : pc.x > dc.x && pc.y >= d.y && pc.y < d.y + s ? 2 : pc.y < dc.y ? 3 : 1;
            var route = path(start, targets_1, canPhase ? 12 : 4, forbid), bridge = canPhase ? 'phase-conveyor' : 'bridge-conveyor';
            if (!route)
                return "continue";
            var end = route[route.length - 1], sink = sinks.filter(function (t) { return t.x === end.x && t.y === end.y; })[0];
            if (!sink.used) {
                var group = sinks.filter(function (t) { return t.group === sink.group; });
                group.forEach(function (t) { t.used = true; });
                sink.template.forEach(function (t) { if (t.kind !== 'item-end')
                    placements.push(t); });
            }
            var existing = placements.filter(function (p) { return p.x === sink.x && p.y === sink.y; })[0];
            if (!existing)
                add(block(sink.x, sink.y, bridge, 0, 'item-end'));
            else if (existing.block !== bridge)
                bridge = existing.block;
            // A bridge may only link to the same block type, including its terminal.
            if ((bridge === 'bridge-conveyor' && route.some(function (p, i) { return i > 0 && distance(p, route[i - 1]) > 4.001; })))
                return "continue";
            buildRoute(route, bridge, 'item-bridge');
            sink.load += load;
            connected += load;
        };
        for (var oi = 0; oi < d.outlets.length; oi++) {
            _loop_3(oi);
        }
        if (connected <= 0) {
            mark(grid, d, s, 0);
            d.outlets.forEach(function (p) { if (grid[idx(p.x, p.y)] === 2)
                grid[idx(p.x, p.y)] = 0; });
            if (d.liquidPort)
                grid[idx(d.liquidPort.x, d.liquidPort.y)] = 0;
            warnings.push('unrouted-drill');
            continue;
        }
        d.rate = Math.min(expected, connected);
        active.push(d);
        var placement = block(d.x, d.y, spec.block, 0, 'drill', s);
        placement.rate = d.rate;
        add(placement);
    }
    var pumpRate = function (p) {
        var efficiency = 0;
        for (var y = p.y; y < p.y + 2; y++)
            for (var x = p.x; x < p.x + 2; x++)
                efficiency += Math.max(0, input.waterEfficiency[idx(x, y)] || 0) / 4;
        return 6.6 * efficiency * (boosted(p, 2) ? 2.5 : 1);
    };
    var waterSupply = 0;
    var _loop_4 = function (di) {
        var d = active[di], need = spec.water * (d.boosted ? 2.5 : 1);
        if (!wantsWater || !d.liquidPort)
            return "continue";
        if (options.waterMode === 'external') {
            add(block(d.liquidPort.x, d.liquidPort.y, 'liquid-router', 0, 'water-port'));
            d.watered = true;
            d.waterDemand = need;
            warnings.push('external-water');
            return "continue";
        }
        var supplied = 0;
        for (var attempt = 0; attempt < 3 && supplied < need * 1.05; attempt++) {
            var pumps = [];
            var _loop_8 = function (y) {
                var _loop_9 = function (x) {
                    if (!free(grid, x, y, 2))
                        return "continue";
                    var p = { x: x, y: y }, rate = pumpRate(p);
                    if (rate <= 0.01)
                        return "continue";
                    var direct = x < d.x + s && x + 2 > d.x && (y + 2 === d.y || y === d.y + s) || y < d.y + s && y + 2 > d.y && (x + 2 === d.x || x === d.x + s);
                    if (options.waterMode === 'extractors' && !direct)
                        return "continue";
                    if (active.some(function (other) { return other !== d && (x < other.x + s && x + 2 > other.x && (y + 2 === other.y || y === other.y + s) || y < other.y + s && y + 2 > other.y && (x + 2 === other.x || x === other.x + s)); }))
                        return "continue";
                    var senders = perimeter(p, 2).filter(function (t) { return free(grid, t.x, t.y); });
                    if (!direct && !senders.length)
                        return "continue";
                    var sender = direct ? p : senders.sort(function (a, b) { return distance(a, d.liquidPort) - distance(b, d.liquidPort); })[0];
                    var value = oreCount(p, 2) * 300 + distance(p, d) * 0.5 + (direct ? -20 : 5) - Math.min(need - supplied, rate) * 3;
                    pumps.push({ p: p, sender: sender, value: value, direct: direct });
                };
                for (var x = 6; x < w - 8; x++) {
                    _loop_9(x);
                }
            };
            for (var y = 1; y < h - 2; y++) {
                _loop_8(y);
            }
            pumps.sort(function (a, b) { return a.value - b.value; });
            var installed = false;
            for (var pi = 0; pi < Math.min(12, pumps.length); pi++) {
                var candidate = pumps[pi];
                // A local extractor is used only if it alone sustains the drill.
                if (candidate.direct && pumpRate(candidate.p) < need * 1.05)
                    continue;
                if (candidate.direct) {
                    add(block(candidate.p.x, candidate.p.y, 'water-extractor', 0, 'extractor', 2));
                    supplied += pumpRate(candidate.p);
                    installed = true;
                    break;
                }
                mark(grid, candidate.p, 2, 6);
                var pc = center(candidate.p, 2), sc = center(candidate.sender);
                var forbid = sc.x < pc.x && sc.y >= candidate.p.y && sc.y < candidate.p.y + 2 ? 0 : sc.x > pc.x && sc.y >= candidate.p.y && sc.y < candidate.p.y + 2 ? 2 : sc.y < pc.y ? 3 : 1;
                var route = path(candidate.sender, [d.liquidPort], canPhase ? 12 : 4, forbid);
                if (!route) {
                    mark(grid, candidate.p, 2, 0);
                    continue;
                }
                var liquidName = canPhase ? 'phase-conduit' : 'bridge-conduit';
                var basic = canPhase && options.routing !== 'phase' ? path(candidate.sender, [d.liquidPort], 4, forbid) : undefined;
                var selected = route;
                if (basic && basic.length <= route.length + 1) {
                    selected = basic;
                    liquidName = 'bridge-conduit';
                }
                var terminal = placements.filter(function (p) { return p.x === d.liquidPort.x && p.y === d.liquidPort.y; })[0];
                if (terminal && terminal.block !== liquidName) {
                    liquidName = terminal.block;
                    selected = path(candidate.sender, [d.liquidPort], liquidName === 'phase-conduit' ? 12 : 4, forbid) || [];
                    if (selected.length < 2) {
                        mark(grid, candidate.p, 2, 0);
                        continue;
                    }
                }
                add(block(candidate.p.x, candidate.p.y, 'water-extractor', 0, 'extractor', 2));
                var routeStart = placements.length;
                buildRoute(selected, liquidName, 'liquid-bridge');
                placements[routeStart].supply = candidate.p;
                if (!terminal)
                    add(block(d.liquidPort.x, d.liquidPort.y, liquidName, 0, 'liquid-end'));
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
        if (!d.watered)
            warnings.push('water-shortfall');
    };
    for (var di = 0; di < active.length; di++) {
        _loop_4(di);
    }
    var consumesPower = function (p) { return p.kind === 'dome' || p.kind === 'extractor' || p.kind === 'drill' && spec.power > 0 || p.block === 'phase-conveyor' && !!p.link || p.block === 'phase-conduit' && !!p.link; };
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
    if (options.power) {
        for (var iteration = 0; iteration < 32 && reached.some(function (v) { return !v; }); iteration++) {
            var best = void 0, value = -Infinity;
            for (var y = 0; y < h - 1; y++) {
                var _loop_5 = function (x) {
                    if (!free(grid, x, y, 2))
                        return "continue";
                    var p = block(x, y, 'power-node-large', 0, 'power', 2), c = center(p, 2);
                    if (nodes.length && !nodes.some(function (node) { return (node.links || []).length < 14 && distance(c, center(node, 2)) <= 15 && clearRay(c, center(node, 2)); }))
                        return "continue";
                    var count = 0;
                    for (var i = 0; i < targets.length; i++)
                        if (!reached[i] && distance(c, center(targets[i], targets[i].size)) <= 15 + targets[i].size / 2 && clearRay(c, center(targets[i], targets[i].size)))
                            count++;
                    var score = count * 100 - oreCount(p, 2) * 3 - distance(c, { x: w / 2, y: h / 2 }) * 0.01;
                    if (score > value && count > 0) {
                        best = p;
                        value = score;
                    }
                };
                for (var x = 1; x < w - 2; x++) {
                    _loop_5(x);
                }
            }
            if (!best && nodes.length) {
                var closest = Infinity;
                var oldDistances = targets.map(function (target, i) { return reached[i] ? Infinity : Math.min.apply(null, nodes.map(function (node) { return distance(center(node, 2), center(target, target.size)); })); });
                for (var y = 0; y < h - 1; y++) {
                    var _loop_6 = function (x) {
                        if (!free(grid, x, y, 2))
                            return "continue";
                        var p = block(x, y, 'power-node-large', 0, 'power', 2), c = center(p, 2);
                        if (!nodes.some(function (node) { return (node.links || []).length < 14 && distance(c, center(node, 2)) <= 15 && clearRay(c, center(node, 2)); }))
                            return "continue";
                        for (var i = 0; i < targets.length; i++)
                            if (!reached[i]) {
                                var target = center(targets[i], targets[i].size);
                                var oldDistance = oldDistances[i];
                                var gap = distance(c, target);
                                if (gap < oldDistance - 1 && gap < closest) {
                                    closest = gap;
                                    best = p;
                                }
                            }
                    };
                    for (var x = 1; x < w - 2; x++) {
                        _loop_6(x);
                    }
                }
            }
            if (!best) {
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
            for (var i = 0; i < targets.length && best.links.length < 12; i++) {
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
    var output = 0, waterDemand = 0, power = domes.length * 600;
    for (var i = 0; i < active.length; i++) {
        var d = active[i], rate = baseRate(d.oreTiles) * (d.watered ? spec.boost * spec.boost : 1) * (d.boosted ? 2.5 : 1);
        d.rate = incompatible || spec.power > 0 && !options.power || warnings.indexOf('power-unreachable') >= 0 ? 0 : Math.min(rate, d.rate);
        output += d.rate;
        waterDemand += d.waterDemand;
        power += spec.power * (d.boosted ? 2.5 : 1);
    }
    placements.forEach(function (p) { if (p.kind === 'extractor')
        power += 90 * (boosted(p, 2) ? 2.5 : 1);
    else if ((p.block === 'phase-conveyor' || p.block === 'phase-conduit') && p.link)
        power += 18 * (p.block === 'phase-conveyor' && boosted(p) ? 2.5 : 1); });
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
    sinks.filter(function (t) { return t.used && t.load > 0; }).forEach(function (t) { return ports.push({ x: t.x, y: t.y, kind: 'items', capacity: t.capacity, load: t.load, group: t.group }); });
    domes.forEach(function (d) { ports.push({ x: d.x - 1, y: d.y, kind: 'fuel', item: 'phase-fabric', capacity: 11, load: 0.2, group: -1 }); ports.push({ x: d.x - 1, y: d.y + 2, kind: 'fuel', item: 'silicon', capacity: 11, load: 0.2, group: -1 }); });
    if (nodes.length)
        ports.push({ x: nodes[0].x, y: nodes[0].y, kind: 'power', capacity: 0, load: power, group: -1 });
    if (incompatible)
        warnings.push('incompatible');
    if (spec.power > 0 && !options.power)
        warnings.push('no-power');
    if (options.water && !wantsWater)
        warnings.push('water-needs-power');
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
        upperBound: incompatible ? 0 : baseRate(totalOre) * (wantsWater ? spec.boost * spec.boost : 1) * expectedBoost,
    };
}
