#!/usr/bin/env bash
# Usage: same-artifact.sh <a.tgz> <b.tgz>
#
# Exits 0 when two `npm pack` tarballs ship identical files, ignoring package.json
# fields that never reach consumers (version, scripts, devDependencies, gitHead).
# Exits 1 and prints what differs otherwise.
set -euo pipefail

[ $# -eq 2 ] || { echo "usage: $0 <a.tgz> <b.tgz>" >&2; exit 2; }

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

for side in a b; do
  mkdir "$work/$side"
done
tar -xzf "$1" -C "$work/a"
tar -xzf "$2" -C "$work/b"

for side in a b; do
  node -e '
    const fs = require("fs");
    const file = process.argv[1];
    const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const key of ["version", "scripts", "devDependencies", "gitHead"]) delete pkg[key];
    fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
  ' "$work/$side/package/package.json"
done

if diff -rq "$work/a/package" "$work/b/package" >/dev/null; then
  echo "same-artifact: $(basename "$1") and $(basename "$2") ship identical files"
  exit 0
fi

echo "same-artifact: $(basename "$1") and $(basename "$2") differ:"
diff -rq "$work/a/package" "$work/b/package" | sed "s|$work/[ab]/package/||g" || true
diff -u "$work/a/package/package.json" "$work/b/package/package.json" || true
exit 1
