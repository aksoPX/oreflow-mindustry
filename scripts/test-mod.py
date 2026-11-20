"""Load the actual packaged mod into both official headless engines."""
import hashlib
import json
import pathlib
import re
import shutil
import subprocess
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
RESULTS = []
MOD = ROOT / 'public/downloads/oreflow-mod-0.2.0.zip'
subprocess.run(['npx', 'tsx', 'scripts/parity-fixture.ts'], cwd=ROOT, check=True)

for version in ['v146', 'v160.8']:
    jar = ROOT / '.cache/mindustry' / version / 'server.jar'
    jar.parent.mkdir(parents=True, exist_ok=True)
    if not jar.exists():
        urllib.request.urlretrieve('https://github.com/Anuken/Mindustry/releases/download/' + version + '/server-release.jar', jar)
    directory = ROOT / '.cache/runtime-tests' / version
    (directory / 'config/mods').mkdir(parents=True, exist_ok=True)
    shutil.copy(MOD, directory / 'config/mods/oreflow.zip')
    scenarios = [
        {'conveyor': 'plastanium', 'water': True, 'power': True, 'overdrive': True, 'waterMode': 'auto', 'routing': 'auto', 'priority': 'output', 'trials': 64},
        {'conveyor': 'titanium', 'water': True, 'power': True, 'overdrive': True, 'waterMode': 'auto', 'routing': 'bridge', 'priority': 'output', 'trials': 64},
        {'conveyor': 'plastanium', 'water': True, 'power': True, 'overdrive': True, 'waterMode': 'external', 'routing': 'auto', 'priority': 'output', 'trials': 64},
        {'conveyor': 'plastanium', 'water': True, 'power': True, 'overdrive': True, 'waterMode': 'auto', 'routing': 'phase', 'priority': 'output', 'trials': 64},
    ]
    fixture_path = json.dumps(str(ROOT / '.cache/parity/input.json'))
    native_path = ROOT / '.cache/parity' / (version + '.json')
    commands = ''.join('js oreflow.selfTest(' + json.dumps(options) + ')\n' for options in scenarios)
    commands += 'js var fixture = JSON.parse(new Packages.arc.files.Fi(' + fixture_path + ').readString()); new Packages.arc.files.Fi(' + json.dumps(str(native_path)) + ').writeString(JSON.stringify(oreflow.engine.planMine(fixture.input, fixture.options)));\nexit\n'
    process = subprocess.run(['java', '-jar', str(jar)], cwd=directory,
                             input=commands, text=True,
                             stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=120)
    log = re.sub(r'\x1b\[[0-9;]*m', '', process.stdout)
    (ROOT / '.cache' / ('test-' + version + '.log')).write_text(log)
    matches = re.findall(r'OREFLOW_TEST (\{[^\n]+\})', log)
    if len(matches) != len(scenarios) or 'JavaScriptException' in log:
        print(log)
        raise SystemExit('Native test did not pass for ' + version)
    scenario_reports = [json.loads(match) for match in matches]
    expected = json.loads((ROOT / '.cache/parity/typescript.json').read_text())
    actual = json.loads(native_path.read_text())
    if actual != expected:
        raise RuntimeError(version + ' TypeScript/Rhino full result mismatch')
    report = {'release': version, 'runtime': scenario_reports[0]['runtime'], 'checks': sum(scenario['checks'] for scenario in scenario_reports), 'scenarios': scenario_reports, 'status': 'PASS', 'runtimeSha256': hashlib.sha256(jar.read_bytes()).hexdigest()}
    report['fullTypeScriptRhinoParity'] = 'PASS'
    RESULTS.append(report)
    print(version, json.dumps(report, ensure_ascii=False))

report = {
    'modVersion': '0.2.0',
    'artifactSha256': hashlib.sha256(MOD.read_bytes()).hexdigest(),
    'nativeEngines': RESULTS,
    'checks': ['Actual script import', 'Build.validPlace', 'No overlapping footprints',
               'Native bridge linkValid', 'Native plastanium stateLoad',
               'Power-node connection limit', 'Connected power graph',
               'Water bridge input and storage from extractor', 'Drill item acceptance',
               'Rhino unit.plans field with nonempty Queue', 'Map block bans',
               'Separate silicon/phase-fabric sorter configurations', 'Single utility ports',
               'Ordinary-only routing has zero phase connections', 'Stale plan rejection'],
    'notVerified': ['Long-running steady-state flow on arbitrary maps',
                    'Every modpack and multiplayer server', 'Global mathematical optimality']
}
desktop_results = ROOT / '.cache/desktop-results.json'
if desktop_results.exists():
    report['desktopUI'] = json.loads(desktop_results.read_text())
(ROOT / 'public/downloads/verification.json').write_text(json.dumps(report, indent=2, ensure_ascii=False))