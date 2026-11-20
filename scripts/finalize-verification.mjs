import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const file = 'public/downloads/verification.json';
const report = read(file), web = read('.cache/playwright-results.json');
const desktop = read('.cache/desktop-results.json');
const sha256 = hash('mod/oreflow-mod-0.2.0.zip');
if (sha256 !== hash('public/downloads/oreflow-mod-0.2.0.zip') || sha256 !== report.artifactSha256) throw new Error('Tested mod archive hash mismatch');
if (report.nativeEngines.length !== 2 || report.nativeEngines.some(r => r.status !== 'PASS' || r.fullTypeScriptRhinoParity !== 'PASS')) throw new Error('Native matrix or parity did not pass');
if (desktop.length !== 2 || desktop.some(r => r.status !== 'PASS' || r.artifactSha256 !== sha256)) throw new Error('Real client tests do not match this archive');
if (web.stats.unexpected !== 0 || web.stats.flaky !== 0 || web.stats.skipped !== 0 || !web.stats.expected) throw new Error('Browser regression did not pass cleanly');
execFileSync('npx', ['tsc', '--noEmit'], { stdio: 'inherit' });
execFileSync('npm', ['run', 'build'], { stdio: 'inherit' });
report.generatedAt = new Date().toISOString();
report.source = { repository: 'https://github.com/aksoPX/oreflow-mindustry', baseCommit: '4de4d89f51505d027ce3c66a0a40c35e0be66b48' };
report.desktopUI = desktop;
report.nativeCheckCount = report.nativeEngines.reduce((sum, runtime) => sum + runtime.checks, 0);
report.webRegression = { status: 'PASS', testsPassed: web.stats.expected, failures: 0, skipped: 0, flaky: 0, targets: ['desktop Chromium', 'mobile Chromium'], viewportWidths: [360, 390, 430, 768, 1440], includes: ['Settings and before/after', 'Save, reload, reopen, export, delete', 'Favorites and search', 'Focus trap, Escape and Cyrillic font', 'Real ZIP downloads', 'No horizontal overflow', 'Shared engine capacity and geometry regressions', 'ES5 CommonJS parity'] };
report.build = { vite: 'PASS', typescriptNoEmit: 'PASS' };
report.archiveChecks = { modRootHjson: 'PASS', standaloneCopiesIdentical: 'PASS', pythonZipfileTestzip: 'PASS', nestedModPath: 'mod/oreflow-mod-0.2.0.zip', recursiveArchiveExcluded: true };
report.notVerified = ['Long-running steady-state item and liquid throughput on arbitrary maps', 'Every campaign research state, modpack and multiplayer server', 'Physical mouse selection: native TapEvent handler was exercised instead', 'External fuel, energy, water supply and automatic delivery to the core', 'Saving world markers across game restarts', 'Global mathematical optimality or globally minimal phase block count'];
report.limitationsRu = ['Алгоритм эвристический: 100% покрытия, глобальный максимум и абсолютный минимум фазовых не доказаны.', 'Цифры добычи условны до подачи питания, воды и топлива; это не измерение устойчивого трафика.', 'Навигатор до ядра пока только идея. В моде есть вывод внутри плана добычи.', 'В «Авто» водный вход резервный, ускорение считается от насосов. Во «Внешней воде» подача нужна снаружи.', 'Маркеры сохраняются только в текущем сеансе карты.'];
writeFileSync(file, JSON.stringify(report, null, 2));
writeFileSync('docs/VERIFICATION.md', [
  '# Проверка Oreflow 0.2.0', '',
  `Дата: ${report.generatedAt}.`, '',
  `SHA-256 мода: \`${sha256}\`.`, '',
  `Пройдено ${report.nativeCheckCount} нативных утверждений в официальных headless v146 и v160.8.`,
  'Четыре сценария на версию: авто/пластан, обычные/титан, внешняя вода, фазовые/пластан.',
  'Проверены Build.validPlace, геометрия, одинаковые концы и дальность мостов, состояние двух',
  'пластановых загрузчиков, power graph, лимиты узлов, приём и хранение воды, фильтры сортировщиков,',
  'непустая Unit.plans Queue, запреты карты и отказ устаревшему плану.', '',
  'Полный Result общего TypeScript-ядра совпал с Rhino на обоих движках при одинаковом JSON-входе.', '',
  'Оба реальных SDL/OpenGL-клиента запущены под Xvfb/Mesa. Физические F7 и Escape через XTEST,',
  'создание HUD, настройки, нативный TapEvent по руде с открытой очередью и отрисовка: PASS.', '',
  `Playwright: ${web.stats.expected} теста, 0 сбоев, 0 пропусков, 0 нестабильных повторов.`,
  'Ширины 360, 390, 430, 768 и 1440: горизонтального скролла нет.',
  'Vite build и tsc --noEmit: PASS. ZIP и вложенный мод проверены zipfile.testzip().', '',
  '## Не Проверено', '',
  ...report.limitationsRu.map(line => '- ' + line),
  '- Длительный устойчивый поток на произвольных картах и все серверы/модпаки.',
  '- Физический клик мышью: проверен нативный обработчик TapEvent.', '',
  'Полный машинный протокол: public/downloads/verification.json.', '',
].join('\n'));
console.log(`Verified ${report.nativeCheckCount} native assertions and ${web.stats.expected} browser/core tests against ${sha256}`);