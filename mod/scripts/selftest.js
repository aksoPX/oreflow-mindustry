exports.run = function(api, options) {
    if (!Vars.headless) throw new Error('Self-test is headless-only: it replaces the test world.');
    var checks = 0;
    function assert(value, message) { if (!value) throw new Error('OREflow TEST FAILED: ' + message); checks++; }
    Vars.state.rules = new Packages.mindustry.game.Rules();
    Vars.state.rules.infiniteResources = true;
    Vars.state.rules.waves = false;
    Vars.world.loadGenerator(96, 80, cons(function(tiles) {
        tiles.fill();
        for (var y = 0; y < 80; y++) for (var x = 0; x < 96; x++) {
            var t = tiles.get(x, y); t.setFloor(Blocks.stone);
            if (Math.pow((x - 45) / 12, 2) + Math.pow((y - 38) / 8, 2) < 1) t.setOverlay(Blocks.oreCopper);
        }
    }));
    var source = Vars.world.tile(42, 38); source.setBlock(Blocks.laserDrill, Team.sharded, 0);
    var snap = api.snapshot(source, Blocks.laserDrill);
    var emptyRejected = false;
    try { api.snapshot(null, Blocks.laserDrill); } catch (emptyError) { emptyRejected = true; }
    assert(emptyRejected, 'null source tile is safely rejected');
    var savedPlayer = Vars.player, testPlayer = Player.create(), testUnit = UnitTypes.gamma.create(Team.sharded);
    testPlayer.unit(testUnit); Vars.player = testPlayer;
    assert(api.guardQueue(null) == null, 'null unit queue guard');
    var queuedPlan = new BuildPlan(snap.baseX + 7, snap.baseY + 7, 0, Blocks.mechanicalDrill);
    testUnit.plans.addLast(queuedPlan);
    assert(api.guardQueue(testUnit) === testUnit.plans && testUnit.plans.size === 1, 'Rhino plans is a Queue field with an open construction plan');
    var withQueue = api.snapshot(source, Blocks.laserDrill);
    assert(withQueue.input.blocked[7 + (withQueue.input.height - 8) * withQueue.input.width], 'open construction queue footprint is blocked');
    assert(testUnit.plans.size === 1, 'snapshot does not consume the unit queue');
    Vars.player = savedPlayer;
    options = options || { conveyor: 'plastanium', water: true, power: true, overdrive: true, waterMode: 'auto', routing: 'auto', priority: 'output', trials: 64 };
    var result = api.engine.planMine(snap.input, options);
    api.lastTestResult = result; api.lastSnapshot = snap;
    assert(result.drills.length > 10, 'dense packing');
    assert(result.covered + result.uncovered.length === result.totalOre && result.covered > 0, 'coverage accounting with no promise of 100 percent');
    var plans = api.buildPlans(snap, result);
    testUnit.addBuild(plans[0]);
    assert(testUnit.plans.size === 2, 'native addBuild appends without replacing the existing queued plan');
    Vars.state.rules.bannedBlocks.add(Blocks.laserDrill);
    assert(api.validate(plans, Team.sharded).length > 0, 'map ban is enforced before placing');
    Vars.state.rules.bannedBlocks.remove(Blocks.laserDrill);
    assert(api.validate(plans, Team.sharded) === '', 'all native Build.validPlace checks: ' + api.validate(plans, Team.sharded));
    for (var i = 0; i < plans.length; i++) {
        var p = plans[i]; Vars.world.tile(p.x, p.y).setBlock(p.block, Team.sharded, p.rotation);
    }
    for (var i = 0; i < plans.length; i++) { var p = plans[i]; if (p.config != null) Vars.world.build(p.x, p.y).configureAny(p.config); }
    for (var i = 0; i < result.placements.length; i++) {
        var p = result.placements[i], at = api.anchorOf(snap, p), build = Vars.world.build(at.x, at.y);
        assert(build != null && String(build.block.name) === p.block, 'placed ' + p.block);
        if (p.link) {
            var dest = Vars.world.tile(build.link);
            assert(dest != null && build.block.linkValid(build.tile, dest), 'native bridge link ' + p.block + ' ' + p.x + ',' + p.y);
        }
        if (p.kind === 'loader') assert(build.state === 1, 'plastanium loading state at ' + p.x + ',' + p.y + ': ' + build.state);
        if (p.kind === 'power') assert(build.power.links.size <= build.block.maxNodes, 'power node link limit');
        if (p.kind === 'extractor') assert(build.block.canPlaceOn(build.tile, Team.sharded, 0), 'extractor on valid solid floor');
    }
    var receiverChecks = 0, graph = null, poweredChecks = 0, waterReceiverChecks = 0;
    for (var i = 0; i < result.placements.length; i++) {
        var p = result.placements[i], at = api.anchorOf(snap, p), b = Vars.world.build(at.x, at.y);
        var usesPower = p.kind === 'power' || p.kind === 'drill' || p.kind === 'extractor' || p.kind === 'dome' || p.block === 'phase-conveyor' || p.block === 'phase-conduit';
        if (usesPower && b.power != null) { if (graph == null) graph = b.power.graph; assert(b.power.graph == graph, 'connected power graph: ' + p.block + ' at ' + p.x + ',' + p.y); poweredChecks++; }
        if (p.supply) {
            var pumpAt = api.anchorOf(snap, { x: p.supply.x, y: p.supply.y, size: 2 });
            var pump = Vars.world.build(pumpAt.x, pumpAt.y);
            assert(b.acceptLiquid(pump, Liquids.water), 'water bridge accepts from its source extractor at ' + p.x + ',' + p.y); waterReceiverChecks++;
            var before = b.liquids.get(Liquids.water); b.handleLiquid(pump, Liquids.water, 0.1);
            assert(b.liquids.get(Liquids.water) > before, 'native receiver stores water delivered by extractor');
        }
    }
    for (var i = 0; i < result.drills.length; i++) {
        var d = result.drills[i], at = api.anchorOf(snap, { x: d.x, y: d.y, size: d.size }), drill = Vars.world.build(at.x, at.y);
        var accepts = false;
        for (var j = 0; j < d.outlets.length; j++) {
            var cell = d.outlets[j], world = api.anchorOf(snap, { x: cell.x, y: cell.y, size: 1 }), out = Vars.world.build(world.x, world.y);
            if (out != null && out.acceptItem(drill, Items.copper)) accepts = true;
        }
        assert(accepts, 'drill has an accepting item receiver'); receiverChecks++;
    }
    assert(result.warnings.indexOf('power-unreachable') < 0, 'engine confirms complete power network');
    assert(result.output > 0, 'a powered plan has nonzero output');
    var filters = result.placements.filter(function(p) { return p.block === 'sorter'; });
    assert(filters.length === 2, 'two independent dome supply filters');
    for (var i = 0; i < filters.length; i++) { var at = api.anchorOf(snap, filters[i]); assert(String(Vars.world.build(at.x, at.y).sortItem.name) === filters[i].item, 'native sorter resource configuration'); }
    assert(result.ports.filter(function(p) { return p.kind === 'power'; }).length === 1, 'exactly one external power input');
    if (options.waterMode !== 'extractors') assert(result.ports.filter(function(p) { return p.kind === 'water'; }).length === 1, 'one common external water port');
    if (options.routing === 'bridge') assert(result.phaseConnections === 0, 'ordinary-only mode creates zero phase bridges');
    for (var i = 0; i < result.placements.length; i++) { var p = result.placements[i]; if (p.link && p.block.indexOf('phase-') === 0) assert(p.reason != null, 'every phase sender has a reason'); }
    assert(api.validate(plans, Team.sharded).length > 0, 'changed placement state rejects stale plans');
    var report = { runtime: String(Packages.mindustry.core.Version.build), scenario: options.waterMode + '/' + options.routing + '/' + options.conveyor, checks: checks, drills: result.drills.length, coverage: result.coverage, outputEstimate: result.output, watered: result.drills.filter(function(d) { return d.watered; }).length, phaseConnections: result.phaseConnections, placements: plans.length, warnings: result.warnings, receiverChecks: receiverChecks, powerConnectionsChecked: poweredChecks, waterConnectionsChecked: waterReceiverChecks, queueFieldRegression: 'PASS', sorterFilters: 'PASS', status: 'PASS' };
    print('OREFLOW_TEST ' + JSON.stringify(report));
    return JSON.stringify(report);
};

exports.clientWorld = function() {
    if (java.lang.System.getProperty('oreflow.uiSmoke') !== '1') return;
    Vars.state.rules = new Packages.mindustry.game.Rules(); Vars.state.rules.waves = false; Vars.state.rules.canGameOver = false;
    Vars.world.loadGenerator(96, 80, cons(function(tiles) {
        tiles.fill();
        for (var y = 0; y < 80; y++) for (var x = 0; x < 96; x++) {
            var t = tiles.get(x, y); t.setFloor(Blocks.stone);
            if (Math.pow((x - 45) / 12, 2) + Math.pow((y - 38) / 8, 2) < 1) t.setOverlay(Blocks.oreCopper);
        }
    }));
    Vars.world.tile(10, 10).setBlock(Blocks.coreShard, Team.sharded, 0);
    var unit = UnitTypes.gamma.create(Team.sharded); unit.set(42 * 8, 38 * 8); unit.add(); unit.updateBuilding = false;
    Vars.player.team(Team.sharded); Vars.player.unit(unit);
    unit.plans.addLast(new BuildPlan(28, 23, 0, Blocks.titaniumConveyor));
    Vars.state.set(Packages.mindustry.core.GameState.State.playing);
    Core.camera.position.set(45 * 8, 38 * 8);
    print('OREFLOW_UI_READY');
};