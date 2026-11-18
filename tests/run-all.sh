#!/bin/bash
# Runs every browser test script. A script passes when it exits normally, prints no line starting
# "FAIL", and reports no page errors (a line starting "errs" followed by anything but empty lists).
cd "$(dirname "$0")" || exit 1
failed=""
passes() { timeout 240 node "$1" > out.txt 2>&1 && ! grep -Eq '^FAIL ' out.txt && ! grep -Eq "(^|[^a-z])errs \[ *[^] [,]" out.txt; }
flaky=""
for t in t*.js; do
  echo "::group::$t"
  if passes "$t"; then
    echo passed
  elif cat out.txt && echo "Retrying $t once (browser timing can vary)" && passes "$t"; then
    echo "passed on retry"; flaky="$flaky $t"
  else
    failed="$failed $t"
  fi
  cat out.txt
  echo "::endgroup::"
done
rm -f out.txt
# Named in GitHub's run summary, which can be read without signing in.
if [ -n "$flaky" ]; then echo "::warning::Passed only on a second try:$flaky"; fi
if [ -n "$failed" ]; then echo "::error::Failed:$failed"; echo "Failed:$failed"; exit 1; fi
echo "All scripts passed"
