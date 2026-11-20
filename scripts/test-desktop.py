"""Optional graphical settings/HUD smoke test; requires Linux Xvfb and Java."""
import os
import pathlib
import shutil
import subprocess
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
HOME = ROOT / '.cache/ui-smoke-v146'
JAR = ROOT / '.cache/mindustry/v146/client.jar'
JAR.parent.mkdir(parents=True, exist_ok=True)
if not JAR.exists():
    urllib.request.urlretrieve('https://github.com/Anuken/Mindustry/releases/download/v146/Mindustry.jar', JAR)
for directory in [HOME / 'Mindustry/mods', HOME / '.local/share/Mindustry/mods']:
    directory.mkdir(parents=True, exist_ok=True)
    shutil.copy(ROOT / 'public/downloads/oreflow-mod-0.2.0.zip', directory / 'oreflow.zip')
process = subprocess.run(['xvfb-run', '-a', 'java', '-Duser.home=' + str(HOME),
                          '-Doreflow.uiSmoke=1', '-jar', str(JAR)], cwd=HOME,
                         env=dict(os.environ, XDG_DATA_HOME=str(HOME),
                                  ALSOFT_DRIVERS='null', LIBGL_ALWAYS_SOFTWARE='1'),
                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                         text=True, timeout=90)
(ROOT / '.cache/ui-v146.log').write_text(process.stdout)
if 'OREFLOW_UI_PASS' not in process.stdout:
    print(process.stdout)
    raise SystemExit('Desktop UI smoke test failed')
print('v146 desktop: HUD and settings dialog PASS')