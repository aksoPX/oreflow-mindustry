var engine = require('engine');
var testModule = require('selftest');
var DrillClass = Packages.mindustry.world.blocks.production.Drill;
var ConsumeLiquidClass = Packages.mindustry.world.consumers.ConsumeLiquid;
var armed = false, preview = null, automatic = false, queued = {}, pendingPower = [], lastError = '', selectedDrill = null, activeMarkers = null;
var preferences = { conveyor: 'plastanium', water: true, power: true, overdrive: false, waterMode: 'auto', routing: 'auto', priority: 'output', trials: 64 };

function text(message) { if (Vars.headless) print(message); else Vars.ui.showInfoFade(message); }
function getBlock(name) { return Vars.content.block(name); }
function playerUnit() { return Vars.player == null ? null : Vars.player.unit(); }
function guardQueue(unit) {
    if (unit == null) return null;
    // Rhino exposes BuilderComp.plans as Queue, never as a callable method.
    return unit.plans == null || typeof unit.plans === 'function' ? null : unit.plans;
}
function anchorOf(snapshot, p) {
    var half = Math.floor((p.size - 1) / 2);
    return new Point2(snapshot.baseX + p.x + half, snapshot.baseY + snapshot.input.height - p.y - p.size + half);
}
function bridgePoint(snapshot, p) {
    return new Point2(snapshot.baseX + p.x, snapshot.baseY + snapshot.input.height - 1 - p.y);
}
function snapshot(source, drill) {
    if (source == null) throw new Error('Клетка карты недоступна.');
    if (!(drill instanceof DrillClass) || ['mechanical-drill', 'pneumatic-drill', 'laser-drill', 'blast-drill'].indexOf(String(drill.name)) < 0) throw new Error('Выбери один из четырёх обычных буров Серпуло. Модовые буры не поддерживаются.');
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
    var ore = [], blocked = [], water = [], insulated = [], foreignOre = [];
    var own = source.build != null && source.block() == drill ? source.build : null;
    for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) {
        var tile = Vars.world.tile(baseX + x, baseY + height - 1 - y), floor = tile.floor();
        var isForeignOre = tile.drop() != null && tile.drop() != item;
        var isBoulder = tile.block().breakable && tile.block().isStatic();
        ore.push(tile.drop() == item ? 1 : 0);
        blocked.push((!isBoulder && tile.block() != Blocks.air && tile.build != own) || floor.isLiquid || !floor.placeableOn || isForeignOre);
        insulated.push(tile.block().insulated);
        foreignOre.push(isForeignOre);
        water.push(floor.isLiquid ? 0 : Math.max(0, 1 + floor.attributes.get(Attribute.water) + Attribute.water.env()));
    }
    // Build plans already in the player's queue are obstacles, not free terrain.
    var unit = playerUnit(), plans = guardQueue(unit);
    if (plans != null) {
        var iterator = plans.iterator();
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
    var input = { width: width, height: height, ore: ore, blocked: blocked, waterEfficiency: water, insulated: insulated, foreignOre: foreignOre, hardness: Number(item.hardness), drill: { block: String(drill.name), size: Number(drill.size), tier: Number(drill.tier), time: Number(drill.getDrillTime(item)), hardnessMultiplier: 0, boost: Number(drill.liquidBoostIntensity), water: consumption, power: drill.consPower == null ? 0 : Number(drill.consPower.usage) * 60 } };
    if (own != null) { var off = Math.floor((drill.size - 1) / 2); input.anchor = { x: own.tile.x - off - baseX, y: height - (own.tile.y - off - baseY) - drill.size }; }
    return { input: input, baseX: baseX, baseY: baseY, item: item, existing: own };
}
function configFor(snap, p) {
    var at = anchorOf(snap, p);
    if (p.item) return Vars.content.item(p.item);
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
        if (p == null || p.block == null || Vars.world.tile(p.x, p.y) == null) return 'Клетка карты недоступна.';
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
        if (playerUnit() == null) throw new Error('Нужен живой строительный юнит.');
        var snap = snapshot(source, drill), result = engine.planMine(snap.input, preferences), plans = buildPlans(snap, result);
        if (!result.drills.length) throw new Error('Не удалось разместить подключённые буры. Освободи место вокруг жилы.');
        if (result.warnings.indexOf('power-unreachable') >= 0) throw new Error('Электросеть не собрана. Освободи место под узлы.');
        if (result.warnings.indexOf('incompatible') >= 0) throw new Error('Этот бур не может добывать эту руду.');
        var error = validate(plans, Vars.player.team()); if (error) throw new Error(error);
        // Silent mode: queue immediately, no dialog
        for (var i = 0; i < plans.length; i++) { var p = plans[i]; queued[p.x + ',' + p.y] = true; if (String(p.block.name) === 'power-node-large') pendingPower.push(p); Vars.player.unit().addBuild(p); }
        activeMarkers = { snapshot: snap, result: result };
        var msg = result.drills.length + ' буров · ' + result.coverage + '% · ' + result.output.toFixed(1) + ' предм./с · ' + plans.length + ' планов';
        if (result.warnings.length) msg += ' [orange](' + result.warnings.length + ' замеч.)[]';
        text('Oreflow: ' + msg);
        armed = false; preview = null;
    } catch (error) { var detail = String(error).replace(/^Error: /, ''); lastError = /[А-Яа-яЁё]/.test(detail) ? detail.substring(0, 240) : 'Не удалось рассчитать план.'; text('Oreflow: ' + lastError); }
}
function warningText(code) {
    var labels = { 'dome-needs-fuel': 'Купол заработает только при подаче кремния и фазовой ткани.', 'water-shortfall': 'Часть буров без воды: для них посчитана сухая добыча.', 'unrouted-drill': 'Буры без безопасного вывода исключены.', 'external-water': 'Нужна внешняя вода; порт не создаёт жидкость.', 'no-power': 'Буру не подано питание.', 'power-unreachable': 'Электросеть разорвана: освободите место под узлы.', 'water-needs-power': 'Гидронасосам нужно питание.', 'no-dome-space': 'Нет места для купола и двух линий топлива.', 'incompatible': 'Недостаточный уровень бура.', 'water-service-blocked': 'Место общего водного входа занято.' };
    labels['output-overload'] = 'Добыча ограничена безопасной ёмкостью вывода.';
    labels['dome-needs-power'] = 'Без электросети купол не включён в план.';
    labels['no-connected-drills'] = 'Нет места для буров с безопасным выводом.';
    return labels[code] || 'Ограничение схемы: ' + code;
}
function settings(smoke) {
    if (Vars.state.isMenu() && smoke !== true) { text('Сначала открой карту Серпуло.'); return; }
    var dialog = new BaseDialog('Oreflow · Умная добыча');
    dialog.cont.add('Выбери тип бура, затем «Выбрать жилу» и клетку с рудой.').width(600).wrap().row();
    dialog.cont.add('Плотная расстановка, отдельные входы лент, настоящие мосты.\nНаилучшая найденная схема, не доказанный глобальный максимум.').width(600).wrap().color(Color.lightGray).padBottom(14).row();
    var drillChoice = selectedDrill || (Vars.control != null && Vars.control.input != null && Vars.control.input.block instanceof DrillClass ? Vars.control.input.block : Blocks.laserDrill);
    dialog.cont.button('Бур: ' + drillChoice.localizedName, run(function() {
        var choices = [Blocks.mechanicalDrill, Blocks.pneumaticDrill, Blocks.laserDrill, Blocks.blastDrill];
        selectedDrill = choices[(choices.indexOf(drillChoice) + 1) % choices.length]; dialog.hide(); settings();
    })).width(540).row();
    dialog.cont.button('Вывод: ' + (preferences.conveyor === 'plastanium' ? 'пластановый (40/с, два входа)' : 'титановый (11/с)'), run(function() { preferences.conveyor = preferences.conveyor === 'plastanium' ? 'titanium' : 'plastanium'; dialog.hide(); settings(); })).width(540).row();
    dialog.cont.check('Вода: гидронасосы и мостовые трубопроводы', preferences.water, function(value) { preferences.water = value; }).left().pad(7).row();
    dialog.cont.check('Соединить энергетическими узлами (источник энергии снаружи)', preferences.power, function(value) { preferences.power = value; }).left().pad(7).row();
    dialog.cont.check('Купол: радиус 25 клеток, нужны кремний и фазовая ткань', preferences.overdrive, function(value) { preferences.overdrive = value; }).left().pad(7).row();
    dialog.cont.check('Автопредпросмотр после первого построенного бура', automatic, function(value) { automatic = value; Core.settings.put('oreflow-auto', value); }).left().pad(7).row();
    dialog.cont.button('Источник воды: ' + ({ auto: 'авто', extractors: 'только соседние гидронасосы', external: 'внешняя вода' })[preferences.waterMode], run(function() { preferences.waterMode = preferences.waterMode === 'auto' ? 'extractors' : preferences.waterMode === 'extractors' ? 'external' : 'auto'; dialog.hide(); settings(); })).width(540).row();
    dialog.cont.button('Мосты: ' + ({ auto: 'авто, минимум фазовых', bridge: 'обычные', phase: 'фазовые' })[preferences.routing], run(function() { preferences.routing = preferences.routing === 'auto' ? 'bridge' : preferences.routing === 'bridge' ? 'phase' : 'auto'; dialog.hide(); settings(); })).width(540).row();
    dialog.cont.button('Приоритет: ' + (preferences.priority === 'output' ? 'максимум добычи' : 'компактность'), run(function() { preferences.priority = preferences.priority === 'output' ? 'compact' : 'output'; dialog.hide(); settings(); })).width(540).row();
    dialog.cont.add('[lightgray]«Авто»: сначала лента, затем обычный мост. Фазовый только\nпри отсутствии обычного пути. Выходы не подключаются к ядру сами.[]').width(540).wrap().pad(9).row();
    dialog.buttons.button('Закрыть', run(function() {
        Core.settings.put('oreflow-conveyor', preferences.conveyor);
        Core.settings.put('oreflow-water', preferences.water);
        Core.settings.put('oreflow-power', preferences.power);
        Core.settings.put('oreflow-overdrive', preferences.overdrive);
        Core.settings.put('oreflow-waterMode', preferences.waterMode);
        Core.settings.put('oreflow-routing', preferences.routing);
        Core.settings.put('oreflow-priority', preferences.priority);
        if (selectedDrill) Core.settings.put('oreflow-drill', String(selectedDrill.name));
        dialog.hide();
    })).width(180);
    dialog.buttons.button('Выбрать жилу', run(function() { armed = true; preview = null; selectedDrill = selectedDrill || (Vars.control.input.block instanceof DrillClass ? Vars.control.input.block : Blocks.laserDrill); Vars.control.input.block = null; dialog.hide(); text('Oreflow: нажми на руду или на первый бур. Esc отменяет выбор.'); })).width(220);
    dialog.addCloseListener(); dialog.show();
    if (java.lang.System.getProperty('oreflow.uiSmoke') === '1' && !Vars.state.isMenu()) {
        print('OREFLOW_F7_PASS');
        Timer.schedule(run(function() {
            dialog.hide(); selectedDrill = Blocks.laserDrill; armed = true; preferences.overdrive = true;
            print('OREFLOW_CLIENT_TAP unit=' + playerUnit() + ' armed=' + armed + ' menu=' + Vars.state.isMenu());
            Events.fire(new EventType.TapEvent(Vars.player, Vars.world.tile(42, 38)));
            if (preview == null || lastError !== '') { print('OREFLOW_UI_FAIL click: ' + lastError); Core.app.exit(); return; }
            print('OREFLOW_CLICK_PASS');
            Timer.schedule(run(function() {
                if (preview == null && !armed) print('OREFLOW_ESCAPE_PASS'); else print('OREFLOW_UI_FAIL Escape did not clear preview');
                print('OREFLOW_UI_PASS'); Core.app.exit();
            }), 4);
        }), 1);
    }
}
Events.on(EventType.ClientLoadEvent, cons(function() {
    automatic = Core.settings.getBool('oreflow-auto', false);
    preferences.conveyor = Core.settings.getString('oreflow-conveyor', 'plastanium');
    preferences.water = Core.settings.getBool('oreflow-water', true);
    preferences.power = Core.settings.getBool('oreflow-power', true);
    preferences.overdrive = Core.settings.getBool('oreflow-overdrive', true);
    preferences.waterMode = Core.settings.getString('oreflow-waterMode', 'auto');
    preferences.routing = Core.settings.getString('oreflow-routing', 'auto');
    preferences.priority = Core.settings.getString('oreflow-priority', 'output');
    var savedDrill = Core.settings.getString('oreflow-drill', '');
    if (savedDrill && getBlock(savedDrill) instanceof DrillClass) selectedDrill = getBlock(savedDrill);
    var hud = new Table(); hud.bottom().left(); hud.visibility = boolp(function() { return !Vars.state.isMenu(); });
    hud.button('Oreflow [lightgray]F7[]', run(settings)).width(145).height(40).pad(7);
    Vars.ui.hudGroup.addChild(hud); hud.setFillParent(true);
    if (java.lang.System.getProperty('oreflow.uiSmoke') === '1') Timer.schedule(run(function() {
        try { testModule.clientWorld(); } catch (error) { print('OREFLOW_UI_FAIL ' + error); Core.app.exit(); }
        Timer.schedule(run(function() { print('OREFLOW_UI_FAIL keyboard timeout'); Core.app.exit(); }), 45);
    }), 1);
}));
Events.on(EventType.TapEvent, cons(function(event) {
    if (!armed || Vars.headless || event.player != Vars.player || event.tile == null || playerUnit() == null) return;
    if (activeMarkers != null && event.tile.drop() == null && !(event.tile.block() instanceof DrillClass)) { text('Внешний вход не является жилой. Выбери клетку с рудой.'); return; }
    var drill = event.tile.block() instanceof DrillClass ? event.tile.block() : selectedDrill || Blocks.laserDrill;
    calculate(event.tile, drill);
}));
Events.on(EventType.BlockBuildEndEvent, cons(function(event) {
    refreshPower();
    if (event.tile == null) return;
    var key = event.tile.x + ',' + event.tile.y;
    if (queued[key]) { delete queued[key]; return; }
    if (Vars.headless || !automatic || preview != null || event.breaking || playerUnit() == null || event.unit != playerUnit() || !(event.tile.block() instanceof DrillClass)) return;
    calculate(event.tile, event.tile.block());
}));
Events.on(EventType.WorldLoadEvent, cons(function() { queued = {}; pendingPower = []; armed = false; preview = null; activeMarkers = null; }));
Events.on(EventType.BlockBuildBeginEvent, cons(function(event) {
    if (Vars.headless || Vars.player == null || activeMarkers == null || event.tile == null || event.breaking || event.team != Vars.player.team()) return;
    for (var i = 0; i < activeMarkers.result.ports.length; i++) {
        var port = activeMarkers.result.ports[i], at = bridgePoint(activeMarkers.snapshot, port);
        if (at.x === event.tile.x && at.y === event.tile.y && !queued[at.x + ',' + at.y]) { text('Oreflow: здесь отмечен внешний ' + (port.kind === 'items' ? 'выход руды' : 'вход снабжения') + '. Не смешивай отдельные линии.'); break; }
    }
}));
Events.run(EventType.Trigger.update, run(function() {
    if (Vars.headless) return;
    if (Core.input.keyTap(KeyCode.f7)) settings();
    if (Core.input.keyTap(KeyCode.escape)) { armed = false; preview = null; }
}));
Events.run(EventType.Trigger.draw, run(function() {
    if (Vars.headless || playerUnit() == null) return;
    if (preview != null) for (var i = 0; i < preview.plans.length; i++) playerUnit().drawPlan(preview.plans[i], 1);
    var marked = preview == null ? activeMarkers : preview;
    if (marked == null) return;
    for (var d = 0; d < marked.result.placements.length; d++) {
        var p = marked.result.placements[d];
        if (p.kind === 'dome') { var at = anchorOf(marked.snapshot, p); Drawf.dashCircle(at.x * 8, at.y * 8, 200, Pal.accent); }
    }
    // Minimal markers: colored circles and item icons only, no text labels
    for (var i = 0; i < marked.result.ports.length; i++) {
        var port = marked.result.ports[i], at = bridgePoint(marked.snapshot, port);
        var color = port.kind === 'power' ? Color.valueOf('f2cf70') : port.kind === 'water' ? Color.valueOf('79cadd') : port.kind === 'fuel' ? Color.valueOf('c9a6e7') : Color.valueOf('daedaa');
        Draw.color(color); Lines.stroke(1.2); Lines.circle(at.x * 8, at.y * 8, 7);
        var item = port.kind === 'items' ? marked.snapshot.item : port.item && port.item !== 'water' ? Vars.content.item(port.item) : null;
        if (item != null) Draw.rect(item.fullIcon, at.x * 8, at.y * 8, 5, 5);
        var dx = port.kind === 'items' ? (port.direction === 2 ? -1 : 1) : 0, dy = port.kind === 'items' ? 0 : -1;
        Drawf.arrow(at.x * 8 - dx * 9, at.y * 8 - dy * 9, at.x * 8 + dx * 9, at.y * 8 + dy * 9, 2, 3, color);
    }
    Draw.reset();
}));
var api = { engine: engine, snapshot: snapshot, buildPlans: buildPlans, validate: validate, anchorOf: anchorOf, configFor: configFor, guardQueue: guardQueue, settings: settings, calculate: calculate, preferences: preferences, getLastError: function() { return lastError; }, selfTest: function(options) { return testModule.run(api, options); } };
Vars.mods.getScripts().scope.oreflow = api;
print('Oreflow 0.2.0: shared planner loaded. Desktop: F7.');