#!/bin/bash
# Build, check, and publish Junior Quizmaster. Refuses to publish if any guard fails.
set -euo pipefail
cd "$(dirname "$0")"
MSG="${1:?commit message}"
AV=$(date +%Y%m%d%H%M)
python3 gen_all.py build santa --js-only > /dev/null                       # content.js + clips.json from content files
sed -i -E "s/\?v=[0-9]+/?v=$AV/g" build/index.html
sed "s/__AV__/$AV/" app.src.js > build/app.js
node --check build/app.js
python3 check_clips.py build                                            # every line the app can say is recorded
node check_answers.js app.src.js build/content.js                       # answer matching: no wrong answers accepted
find site -mindepth 1 -maxdepth 1 ! -name .git ! -name tools ! -name README.md ! -name .nojekyll -exec rm -rf {} +
cp -r build/. site/
cp content.py content_new.py names.py mathflag.py gen_all.py check_clips.py check_answers.js deploy.sh app.src.js site/tools/
cd site && git add -A && git -c user.name="Barry Dowling" -c user.email="barrydowling76@gmail.com" commit -q -m "$MSG

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JtpTiiDn1SwhqcRQB6M466" && git push -q origin main
H=$(git rev-parse --short=7 HEAD)
until [ "$(gh api repos/barrydowling76/junior-quizmaster/actions/runs --jq '.workflow_runs[0] | .head_sha[0:7] + " " + .status')" = "$H completed" ]; do sleep 10; done
gh api repos/barrydowling76/junior-quizmaster/actions/runs --jq '.workflow_runs[0] | "deployed " + .head_sha[0:7] + " " + .conclusion'
echo "AUDIO_VERSION=$AV"
