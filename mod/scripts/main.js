var engine = require('engine');
var testModule = require('selftest');
var DrillClass = Packages.mindustry.world.blocks.production.Drill;
var ConsumeLiquidClass = Packages.mindustry.world.consumers.ConsumeLiquid;
var armed = false, preview = null, automatic = false, queued = {}, pendingPower = [], lastError = '', selectedDrill = null;
var preferences = { conveyor: 'plastanium', water: true, power: true, overdrive: false, waterMode: 'auto', routing: 'auto', priority: 'output', trials: 64 };

function text(message) { if (Vars.headless) print(message); else Vars.ui.showInfoFade(message); }
function getBlock(name) { return Vars.content.block(name); }
function anchorOf(snapshot, p) {
    var half = Math.floor((p.size - 1) / 2);
    return new Point2(snapshot.baseX + p.x + half, snapshot.baseY + snapshot.input.height - p.y - p.size + half);
}
function bridgePoint(snapshot, p) {
    return new Point2(snapshot.baseX + p.x, snapshot.baseY + snapshot.input.height - 1 - p.y);
}
function snapshot(source, drill) {
    if (!(drill instanceof DrillClass)) throw new Error('Выбери обычный бур Серпуло.');
    var item = source.drop();
    if (source.build != null && source.build.block instanceof DrillClass) item = source.build.dominantItem;
    if (item == null) throw new Error('В этой клетке нет доступной руды.');
    if (item.hardness > drill.tier) throw new Error('Этот бур не может добывать выбранную руду.');
    var queue = [source.pos()], seen = {}, deposit = [], minX = source.x, maxX = source.x, minY = source.y, maxY = source.y;
    seen[String(source.pos())] = true;
    for (var head = 0; head < queue.length; head++) {
        var t = Vars.world.tile(queue[head]);
        if (t == null || t.drop() != item) continue;
        deposit.push(t); minX = Math.min(minX, t.x); maxX = Math.max(maxX, t.x); minY = Math.min(minY, t.y); maxY = Math.max(maxY, t.y);
        if (deposit.length > 1200 || maxX - minX > 56 || maxY - minY > 56) throw new Error('Слишком большая жила для одного прохода (максимум 56 × 56).');
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            var next = Vars.world.tile(t.x + dx, t.y + dy);
            if (next != null && !seen[String(next.pos())] && next.drop() == item) { seen[String(next.pos())] = true; queue.push(next.pos()); }
        }
    }
    if (!deposit.length) throw new Error('Не удалось найти связанную жилу.');
    var baseX = Math.max(0, Math.min(minX - 9, Vars.world.width() - 32));
    var baseY = Math.max(0, Math.min(minY - 8, Vars.world.height() - 26));
    var width = Math.min(Vars.world.width() - baseX, Math.max(32, maxX - baseX + 10));
    var height = Math.min(Vars.world.height() - baseY, Math.max(26, maxY - baseY + 9));
    var ore = [], blocked = [], water = [], insulated = [];
    var own = source.build != null && source.block() == drill ? source.build : null;
    for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) {
        var tile = Vars.world.tile(baseX + x, baseY + height - 1 - y), floor = tile.floor();
        var foreignOre = tile.drop() != null && tile.drop() != item;
        ore.push(tile.drop() == item ? 1 : 0);
        blocked.push((tile.block() != Blocks.air && tile.build != own) || floor.isLiquid || !floor.placeableOn || foreignOre);
        insulated.push(tile.block().insulated);
        water.push(floor.isLiquid ? 0 : Math.max(0, 1 + floor.attributes.get(Attribute.water) + Attribute.water.env()));
    }
    // Build plans already in the player's queue are obstacles, not free terrain.
    if (!Vars.headless && Vars.player != null) {
        var iterator = Vars.player.unit().plans().iterator();
        while (iterator.hasNext()) {
            var bp = iterator.next(); if (bp.breaking || bp.block == null) continue;
            var bs = bp.block.size, offset = Math.floor((bs - 1) / 2);
            for (var yy = 0; yy < bs; yy++) for (var xx = 0; xx < bs; xx++) {
                var bx = bp.x - offset + xx - baseX, by = height - 1 - (bp.y - offset + yy - baseY);
                if (bx >= 0 && by >= 0 && bx < width && by < height) blocked[bx + by * width] = true;
            }
        }
    }
    var consumption = 0;
    for (var c = 0; c < drill.consumers.length; c++) if (drill.consumers[c] instanceof ConsumeLiquidClass && drill.consumers[c].liquid == Liquids.water) consumption = Number(drill.consumers[c].amount) * 60;
    var input = { width: width, height: height, ore: ore, blocked: blocked, waterEfficiency: water, insulated: insulated, hardness: Number(item.hardness), drill: { block: String(drill.name), size: Number(drill.size), tier: Number(drill.tier), time: Number(drill.getDrillTime(item)), hardnessMultiplier: 0, boost: Number(drill.liquidBoostIntensity), water: consumption, power: drill.consPower == null ? 0 : Number(drill.consPower.usage) * 60 } };
    if (own != null) { var off = Math.floor((drill.size - 1) / 2); input.anchor = { x: own.tile.x - off - baseX, y: height - (own.tile.y - off - baseY) - drill.size }; }
    return { input: input, baseX: baseX, baseY: baseY, item: item, existing: own };
}
function configFor(snap, p) {
    var at = anchorOf(snap, p);
    if (p.link) { var dest = bridgePoint(snap, p.link); return new Point2(dest.x - at.x, dest.y - at.y); }
    if (p.links) {
        var points = java.lang.reflect.Array.newInstance(Packages.arc.math.geom.Point2, p.links.length);
        for (var i = 0; i < p.links.length; i++) { var dest = anchorOf(snap, p.links[i]); points[i] = new Point2(dest.x - at.x, dest.y - at.y); }
        return points;
    }
    return null;
}
function buildPlans(snap, result) {
    var plans = [], occupied = {};
    for (var i = 0; i < result.placements.length; i++) {
        var p = result.placements[i], b = getBlock(p.block);
        if (b == null) throw new Error('Блок не найден: ' + p.block);
        for (var yy = 0; yy < p.size; yy++) for (var xx = 0; xx < p.size; xx++) {
            var key = (p.x + xx) + ',' + (p.y + yy);
            if (occupied[key]) throw new Error('Пересечение планов: ' + key + ' (' + occupied[key] + ' / ' + p.block + ')');
            occupied[key] = p.block;
        }
        var at = anchorOf(snap, p);
        if (snap.existing != null && snap.existing.tile.x == at.x && snap.existing.tile.y == at.y && snap.existing.block == b) continue;
        plans.push(new BuildPlan(at.x, at.y, p.rotation, b, configFor(snap, p)));
    }
    return plans;
}
function validate(plans, team) {
    for (var i = 0; i < plans.length; i++) {
        var p = plans[i];
        if (Vars.state.rules.bannedBlocks.contains(p.block)) return 'Блок запрещён правилами карты: ' + p.block.localizedName;
        if (Vars.state.isCampaign() && !p.block.unlockedNow()) return 'Сначала исследуй блок: ' + p.block.localizedName;
        if (!Build.validPlace(p.block, team, p.x, p.y, p.rotation)) return 'Клетка недоступна: ' + p.x + ', ' + p.y + ' (' + p.block.localizedName + ')';
    }
    return '';
}
function refreshPower() {
    if (Vars.headless || Vars.player == null) return;
    for (var i = pendingPower.length - 1; i >= 0; i--) {
        var plan = pendingPower[i], b = Vars.world.build(plan.x, plan.y);
        if (b == null || b.block != plan.block || b.team != Vars.player.team()) continue;
        var ready = true;
        for (var j = 0; j < plan.config.length; j++) {
            var p = plan.config[j], target = Vars.world.build(plan.x + p.x, plan.y + p.y);
            if (target == null || target.power == null || target.team != b.team) { ready = false; break; }
        }
        if (ready) { b.configure(plan.config); pendingPower.splice(i, 1); }
    }
}
function calculate(source, drill) {
    try {
        var snap = snapshot(source, drill), result = engine.planMine(snap.input, preferences), plans = buildPlans(snap, result);
        if (!result.drills.length) throw new Error('Не удалось разместить подключённые буры. Освободи место вокруг жилы.');
        if (result.warnings.indexOf('power-unreachable') >= 0) throw new Error('Не удалось соединить всю электросеть. Освободи места под узлы или выбери другой вариант вывода. План не добавлен.');
        var error = validate(plans, Vars.player.team()); if (error) throw new Error(error);
        preview = { snapshot: snap, result: result, plans: plans }; armed = false;
        var dialog = new BaseDialog('Oreflow · Предпросмотр');
        dialog.cont.add('[accent]' + result.drills.length + ' буров · ' + result.coverage + '% руды · ' + result.output.toFixed(1) + ' предм./с[]').width(600).wrap().row();
        dialog.cont.add('Проверено компоновок: ' + result.tried + '\nСвободная руда: ' + result.uncovered.length + ' клеток. Не математический максимум.\n\nПодключи выходные линии к ядру или хранилищам.\nПодай ' + Math.ceil(result.power) + ' ед./с энергии на узел.\n' + (preferences.overdrive ? 'Куполу: 0,2 фазовой ткани/с и 0,2 кремния/с (два входа рядом).\n' : '') + (preferences.waterMode === 'external' ? 'Подключи внешнюю воду ко всем жидкостным портам.\n' : '') + (result.warnings.length ? '\n[orange]Предупреждения: ' + result.warnings.join(', ') + '[]' : '')).width(600).wrap().pad(14).row();
        dialog.cont.add('[lightgray]Обычная очередь строительства. Без бесплатных ресурсов.\nEsc или «Отмена» отклоняет план.[]').width(600).wrap().row();
        dialog.buttons.button('Отмена', run(function() { preview = null; dialog.hide(); })).width(180);
        dialog.buttons.button('В очередь', run(function() {
            var reason = validate(preview.plans, Vars.player.team());
            if (reason) { Vars.ui.showErrorMessage(reason); return; }
            for (var i = 0; i < preview.plans.length; i++) { var p = preview.plans[i]; queued[p.x + ',' + p.y] = true; if (String(p.block.name) === 'power-node-large') pendingPower.push(p); Vars.player.unit().addBuild(p); }
            text('Oreflow: добавлено планов: ' + preview.plans.length); preview = null; dialog.hide();
        })).width(180);
        dialog.addCloseListener(); dialog.hidden(run(function() { preview = null; })); dialog.show();
    } catch (error) { lastError = String(error); text('Oreflow: ' + lastError); Log.err(error); }
}
function settings(smoke) {
    if (Vars.state.isMenu() && smoke !== true) { text('Сначала открой карту Серпуло.'); return; }
    var dialog = new BaseDialog('Oreflow · Умная добыча');
    dialog.cont.add('Выбери бур в меню строительства, затем «Выбрать жилу».').width(600).wrap().row();
    dialog.cont.add('Плотная расстановка, отдельные входы лент, настоящие мосты.\nНаилучшая найденная схема, не доказанный глобальный максимум.').width(600).wrap().color(Color.lightGray).padBottom(14).row();
    dialog.cont.button('Вывод: ' + (preferences.conveyor === 'plastanium' ? 'пластановый (40/с, два входа)' : 'титановый (11/с)'), run(function() { preferences.conveyor = preferences.conveyor === 'plastanium' ? 'titanium' : 'plastanium'; dialog.hide(); settings(); })).width(540).row();
    dialog.cont.check('Вода: гидронасосы и мостовые трубопроводы', preferences.water, function(value) { preferences.water = value; }).left().pad(7).row();
    dialog.cont.check('Соединить энергетическими узлами (источник энергии снаружи)', preferences.power, function(value) { preferences.power = value; }).left().pad(7).row();
    dialog.cont.check('Купол: радиус 25 клеток, нужны кремний и фазовая ткань', preferences.overdrive, function(value) { preferences.overdrive = value; }).left().pad(7).row();
    dialog.cont.check('Автопредпросмотр после первого построенного бура', automatic, function(value) { automatic = value; Core.settings.put('oreflow-auto', value); }).left().pad(7).row();
    dialog.cont.button('Вода: ' + preferences.waterMode, run(function() { preferences.waterMode = preferences.waterMode === 'auto' ? 'extractors' : preferences.waterMode === 'extractors' ? 'external' : 'auto'; dialog.hide(); settings(); })).width(540).row();
    dialog.cont.button('Мосты: ' + preferences.routing, run(function() { preferences.routing = preferences.routing === 'auto' ? 'bridge' : preferences.routing === 'bridge' ? 'phase' : 'auto'; dialog.hide(); settings(); })).width(540).row();
    dialog.cont.add('[lightgray]«Авто»: фазовые для плотного вывода; короткие жидкостные\nмосты без питания, когда они дают такой же короткий путь.[]').width(540).wrap().pad(9).row();
    dialog.buttons.button('Закрыть', run(function() { dialog.hide(); })).width(180);
    dialog.buttons.button('Выбрать жилу', run(function() { armed = true; preview = null; selectedDrill = Vars.control.input.block instanceof DrillClass ? Vars.control.input.block : Blocks.laserDrill; Vars.control.input.block = null; dialog.hide(); text('Oreflow: нажми на руду или на первый бур. Esc отменяет выбор.'); })).width(220);
    dialog.addCloseListener(); dialog.show();
}
Events.on(EventType.ClientLoadEvent, cons(function() {
    automatic = Core.settings.getBool('oreflow-auto', false);
    var hud = new Table(); hud.bottom().left(); hud.visibility = boolp(function() { return !Vars.state.isMenu(); });
    hud.button('Oreflow [lightgray]F7[]', run(settings)).width(145).height(40).pad(7);
    Vars.ui.hudGroup.addChild(hud); hud.setFillParent(true);
    if (java.lang.System.getProperty('oreflow.uiSmoke') === '1') Timer.schedule(run(function() {
        try { settings(true); print('OREFLOW_UI_PASS'); } catch (error) { print('OREFLOW_UI_FAIL ' + error); Log.err(error); }
        Timer.schedule(run(function() { Core.app.exit(); }), 1);
    }), 1);
}));
Events.on(EventType.TapEvent, cons(function(event) {
    if (!armed || Vars.headless || event.player != Vars.player) return;
    var drill = event.tile.block() instanceof DrillClass ? event.tile.block() : selectedDrill || Blocks.laserDrill;
    calculate(event.tile, drill);
}));
Events.on(EventType.BlockBuildEndEvent, cons(function(event) {
    refreshPower();
    var key = event.tile.x + ',' + event.tile.y;
    if (queued[key]) { delete queued[key]; return; }
    if (Vars.headless || !automatic || preview != null || event.breaking || event.unit != Vars.player.unit() || !(event.tile.block() instanceof DrillClass)) return;
    calculate(event.tile, event.tile.block());
}));
Events.on(EventType.WorldLoadEvent, cons(function() { queued = {}; pendingPower = []; armed = false; preview = null; }));
Events.run(EventType.Trigger.update, run(function() {
    if (Vars.headless) return;
    if (Core.input.keyTap(KeyCode.f7)) settings();
    if (Core.input.keyTap(KeyCode.escape)) { armed = false; preview = null; }
}));
Events.run(EventType.Trigger.draw, run(function() {
    if (Vars.headless || preview == null) return;
    for (var i = 0; i < preview.plans.length; i++) Vars.player.unit().drawPlan(preview.plans[i], 1);
    for (var d = 0; d < preview.result.placements.length; d++) {
        var p = preview.result.placements[d];
        if (p.kind === 'dome') { var at = anchorOf(preview.snapshot, p); Drawf.dashCircle(at.x * 8, at.y * 8, 200, Pal.accent); }
    }
    Draw.reset();
}));
var api = { engine: engine, snapshot: snapshot, buildPlans: buildPlans, validate: validate, anchorOf: anchorOf, configFor: configFor, preferences: preferences, getLastError: function() { return lastError; }, selfTest: function() { return testModule.run(api); } };
Vars.mods.getScripts().scope.oreflow = api;
print('Oreflow 0.2.0: shared planner loaded. Desktop: F7.');