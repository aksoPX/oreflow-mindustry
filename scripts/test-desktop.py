"""Real clients, XTEST F7/Escape and a native ore TapEvent with queued plans."""
import json
import hashlib
import os
import pathlib
import shutil
import subprocess
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
reports = []
for version in ['v146', 'v160.8']:
    home = ROOT / '.cache' / ('ui-smoke-' + version)
    jar = ROOT / '.cache/mindustry' / version / 'client.jar'
    jar.parent.mkdir(parents=True, exist_ok=True)
    if not jar.exists():
        urllib.request.urlretrieve('https://github.com/Anuken/Mindustry/releases/download/' + version + '/Mindustry.jar', jar)
    for directory in [home / 'Mindustry/mods', home / '.local/share/Mindustry/mods']:
        directory.mkdir(parents=True, exist_ok=True)
        shutil.copy(ROOT / 'public/downloads/oreflow-mod-0.2.0.zip', directory / 'oreflow.zip')
    display = ':' + str(80 + os.getpid() % 15)
    xvfb = subprocess.Popen(['Xvfb', display, '-screen', '0', '1280x900x24', '-nolisten', 'tcp'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    env = dict(os.environ, DISPLAY=display, XDG_DATA_HOME=str(home), ALSOFT_DRIVERS='null', LIBGL_ALWAYS_SOFTWARE='1')
    log_path = ROOT / '.cache' / ('ui-' + version + '.log')
    time.sleep(1)
    try:
        with log_path.open('w') as log:
            client = subprocess.Popen(['java', '-Duser.home=' + str(home), '-Doreflow.uiSmoke=1', '-jar', str(jar)], cwd=home, env=env, stdout=log, stderr=subprocess.STDOUT)
            sent_f7 = sent_escape = False
            deadline = time.time() + 65
            while time.time() < deadline and client.poll() is None:
                text = log_path.read_text(errors='replace')
                if 'OREFLOW_UI_READY' in text and not sent_f7:
                    windows = subprocess.check_output(['xdotool', 'search', '--onlyvisible', '--name', 'Mindustry'], env=env, text=True).strip().splitlines()
                    subprocess.run(['xdotool', 'windowfocus', '--sync', windows[-1], 'key', 'F7'], env=env, check=True)
                    sent_f7 = True
                if 'OREFLOW_CLICK_PASS' in text and not sent_escape:
                    time.sleep(1.2)
                    subprocess.run(['xdotool', 'key', 'Escape'], env=env, check=True)
                    sent_escape = True
                time.sleep(0.15)
            if client.poll() is None:
                client.kill()
                raise RuntimeError(version + ' graphical client timeout')
        text = log_path.read_text(errors='replace')
        required = ['OREFLOW_F7_PASS', 'OREFLOW_CLICK_PASS', 'OREFLOW_ESCAPE_PASS', 'OREFLOW_UI_PASS']
        if not all(marker in text for marker in required) or 'OREFLOW_UI_FAIL' in text or 'EcmaError' in text or 'TypeError' in text:
            print(text[-16000:])
            raise RuntimeError(version + ' graphical interaction failed')
        reports.append({'release': version, 'artifactSha256': hashlib.sha256((ROOT / 'public/downloads/oreflow-mod-0.2.0.zip').read_bytes()).hexdigest(), 'runtimeSha256': hashlib.sha256(jar.read_bytes()).hexdigest(), 'runtime': 'official SDL/OpenGL client under Xvfb, software Mesa', 'f7PhysicalKey': 'PASS', 'settingsDialog': 'PASS', 'hudCreation': 'PASS', 'oreTapWithOpenUnitQueue': 'PASS', 'previewRendering': 'PASS', 'escapePhysicalKey': 'PASS', 'status': 'PASS'})
        print(version, 'real F7, ore TapEvent, rendering, Escape: PASS')
    finally:
        xvfb.terminate()
        xvfb.wait(timeout=5)
(ROOT / '.cache/desktop-results.json').write_text(json.dumps(reports, indent=2))