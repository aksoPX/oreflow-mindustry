exports.run = function(api) {
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
    var result = api.engine.planMine(snap.input, { conveyor: 'plastanium', water: true, power: true, overdrive: true, waterMode: 'auto', routing: 'auto', priority: 'output', trials: 64 });
    assert(result.drills.length > 10, 'dense packing');
    assert(result.coverage > 60, 'coverage');
    var plans = api.buildPlans(snap, result);
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
        var usesPower = p.kind === 'power' || p.kind === 'drill' || p.kind === 'extractor' || p.kind === 'dome' || (p.block === 'phase-conveyor' || p.block === 'phase-conduit') && p.link;
        if (usesPower && b.power != null) { if (graph == null) graph = b.power.graph; assert(b.power.graph == graph, 'connected power graph: ' + p.block + ' at ' + p.x + ',' + p.y); poweredChecks++; }
        if (p.supply) {
            var pumpAt = api.anchorOf(snap, { x: p.supply.x, y: p.supply.y, size: 2 });
            var pump = Vars.world.build(pumpAt.x, pumpAt.y);
            assert(b.acceptLiquid(pump, Liquids.water), 'water bridge accepts from its source extractor at ' + p.x + ',' + p.y); waterReceiverChecks++;
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
    var report = { runtime: String(Packages.mindustry.core.Version.build), checks: checks, drills: result.drills.length, coverage: result.coverage, outputEstimate: result.output, watered: result.drills.filter(function(d) { return d.watered; }).length, placements: plans.length, warnings: result.warnings, receiverChecks: receiverChecks, powerConnectionsChecked: poweredChecks, waterConnectionsChecked: waterReceiverChecks, status: 'PASS' };
    print('OREFLOW_TEST ' + JSON.stringify(report));
    return JSON.stringify(report);
};