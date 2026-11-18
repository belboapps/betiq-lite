#!/bin/bash
# Runs every browser test script. A script passes when it exits normally, prints no line starting
# "FAIL", and reports no page errors (a line starting "errs" followed by anything but empty lists).
cd "$(dirname "$0")" || exit 1
failed=""
for t in t*.js; do
  echo "::group::$t"
  if timeout 240 node "$t" > out.txt 2>&1 && ! grep -Eq '^FAIL ' out.txt && ! grep -Eq "(^|[^a-z])errs \[ *[^] [,]" out.txt; then
    echo passed
  else
    failed="$failed $t"
  fi
  cat out.txt
  echo "::endgroup::"
done
rm -f out.txt
if [ -n "$failed" ]; then echo "Failed:$failed"; exit 1; fi
echo "All scripts passed"
