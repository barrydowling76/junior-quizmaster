"""Pre-deploy guard: every clip the app can ask for must exist and be real audio. Exits 1 otherwise."""
import json, os, sys, subprocess
root = sys.argv[1]; want = json.load(open("clips.json"))
missing = [c for c in want if not os.path.exists(f"{root}/audio/{c}.mp3")]
tiny = [c for c in want if c not in missing and os.path.getsize(f"{root}/audio/{c}.mp3") < 1500]
print(f"{len(want)} clips expected, {len(missing)} missing, {len(tiny)} suspiciously small")
if missing: print("missing:", missing[:20])
if tiny: print("small:", tiny[:20])
sys.exit(1 if missing or tiny else 0)
