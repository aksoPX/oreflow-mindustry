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

for version in ['v146', 'v160.8']:
    jar = ROOT / '.cache/mindustry' / version / 'server.jar'
    jar.parent.mkdir(parents=True, exist_ok=True)
    if not jar.exists():
        urllib.request.urlretrieve('https://github.com/Anuken/Mindustry/releases/download/' + version + '/server-release.jar', jar)
    directory = ROOT / '.cache/runtime-tests' / version
    (directory / 'config/mods').mkdir(parents=True, exist_ok=True)
    shutil.copy(MOD, directory / 'config/mods/oreflow.zip')
    process = subprocess.run(['java', '-jar', str(jar)], cwd=directory,
                             input='js oreflow.selfTest()\nexit\n', text=True,
                             stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=120)
    log = re.sub(r'\x1b\[[0-9;]*m', '', process.stdout)
    (ROOT / '.cache' / ('test-' + version + '.log')).write_text(log)
    match = re.search(r'OREFLOW_TEST (\{[^\n]+\})', log)
    if not match:
        print(log)
        raise SystemExit('Native test did not pass for ' + version)
    report = json.loads(match.group(1))
    report['release'] = version
    report['runtimeSha256'] = hashlib.sha256(jar.read_bytes()).hexdigest()
    RESULTS.append(report)
    print(version, json.dumps(report, ensure_ascii=False))

report = {
    'modVersion': '0.2.0',
    'artifactSha256': hashlib.sha256(MOD.read_bytes()).hexdigest(),
    'nativeEngines': RESULTS,
    'checks': ['Actual script import', 'Build.validPlace', 'No overlapping footprints',
               'Native bridge linkValid', 'Native plastanium stateLoad',
               'Power-node connection limit', 'Connected power graph',
               'Water bridge input from extractor', 'Drill item acceptance'],
    'notVerified': ['Long-running steady-state flow on arbitrary maps',
                    'Every modpack and multiplayer server', 'Global mathematical optimality']
}
ui_log = ROOT / '.cache/ui-v146.log'
if ui_log.exists() and 'OREFLOW_UI_PASS' in ui_log.read_text():
    report['desktopUI'] = [{'release': 'v146', 'settingsDialog': 'PASS', 'hudCreation': 'PASS', 'runtime': 'Real SDL/OpenGL client under Xvfb'}]
(ROOT / 'public/downloads/verification.json').write_text(json.dumps(report, indent=2, ensure_ascii=False))