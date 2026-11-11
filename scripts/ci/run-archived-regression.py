"""Run retained historical run-steps explicitly; never publish or rewrite main."""
import os, pathlib, subprocess, sys
import yaml
phase = sys.argv[1]
if phase not in {'verify_geometry', 'verify_bytes', 'verify_browser'}:
    raise SystemExit('Unknown historical phase')
data = yaml.safe_load(pathlib.Path('docs/ci-archive/verify-osm-release-original.yml').read_text())
suite, target = os.getenv('SUITE', ''), os.getenv('TARGET', '')
import re
for step in data['jobs'][phase]['steps']:
    command = step.get('run')
    if not command or 'scripts/ci/impact.mjs' in command or 'npm install' in command:
        continue  # Dependencies are installed once by the manual wrapper.
    condition = str(step.get('if', ''))
    selectors = re.findall(r"matrix\.(suite|target) == '([^']+)'", condition)
    if any((suite if key == 'suite' else target) != value for key, value in selectors):
        continue
    print('HISTORICAL_CHECK:', step.get('name', command), flush=True)
    subprocess.run(['bash', '-eo', 'pipefail', '-c', command], check=True, timeout=1800)
