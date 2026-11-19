#!/bin/bash
# Test everything, then redeploy the home-server agents. Stops at the first failure.
# The browser tests run on the home server, inside the price watcher's image (it has Chromium).
#   scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."
echo "1/3 Server agent tests"
python3 -m unittest discover server 2>&1 | tail -2
echo "2/3 Browser tests (on the home server)"
rsync -az --delete --exclude .git --exclude data ./ homeserver:tmp-betiq-ci/
ssh -o BatchMode=yes homeserver 'cd ~/tmp-betiq-ci && docker run --rm --init --ipc=host -v "$PWD:/repo" -w /repo/tests -e NODE_PATH=/app/node_modules betiq-agent-watcher ./run-all.sh > /tmp/betiq-tests.txt 2>&1; s=$?; grep -E "^(Failed|All scripts)" /tmp/betiq-tests.txt; rm -rf ~/tmp-betiq-ci; exit $s'
echo "3/3 Redeploying the page and the agents"
rsync -az --exclude __pycache__ --exclude .env --exclude backups --exclude page server/ homeserver:docker/betiq-agent/
ssh -o BatchMode=yes homeserver 'mkdir -p ~/docker/betiq-agent/page'
rsync -az index.html manifest.webmanifest icon.png belbo homeserver:docker/betiq-agent/page/
ssh -o BatchMode=yes homeserver 'cd ~/docker/betiq-agent && docker compose up -d --build 2>&1 | tail -1 && sleep 5 && docker ps --filter name=betiq- --format "{{.Names}} {{.Status}}"'
echo "Done. The page is live on the home server now (and on GitHub Pages when main is pushed, until that is switched off)."
