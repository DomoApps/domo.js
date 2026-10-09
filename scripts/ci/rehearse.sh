#!/usr/bin/env bash
# Usage: npm run release:rehearse
#
# Rehearses what happens when this checkout is merged: the Release workflow's
# dry run, a live run, and the Publish workflow for the tag it creates. Runs in a
# throwaway clone whose "origin" is a local bare repo and whose `gh` only logs.
# Never pushes to GitHub; the npm step is `npm publish --dry-run` with an empty
# npm config, so your own npm login is never used.
set -euo pipefail

src=$(git rev-parse --show-toplevel)
tmp=${TMPDIR:-/tmp}
w=$(mktemp -d "${tmp%/}/ryuu-rehearsal.XXXXXX")
step() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
kv() { grep "^$1=" "$2" | tail -1 | cut -d= -f2- || true; }

step "Sandbox: $w"
git clone -q --bare "$src" "$w/origin.git"
git clone -q "$w/origin.git" "$w/merge"
git -C "$w/merge" checkout -q -B master "$(git -C "$src" rev-parse HEAD)"

step "Simulate the merge: this checkout's HEAD plus uncommitted changes, as master"
(cd "$src" && { git diff --name-only HEAD; git ls-files --others --exclude-standard; } | sort -u) > "$w/changed"
while read -r f; do
  if [ -e "$src/$f" ]; then
    mkdir -p "$w/merge/$(dirname "$f")" && cp -p "$src/$f" "$w/merge/$f"
  else
    git -C "$w/merge" rm -q "$f"
  fi
done < "$w/changed"
git -C "$w/merge" add -A
git -C "$w/merge" -c user.name=rehearsal -c user.email=rehearsal@example.invalid commit -qm "rehearsal merge" --allow-empty
git -C "$w/merge" push -q -f origin HEAD:master

mkdir -p "$w/bin"
printf '#!/bin/sh\necho "gh $*" >> "%s/gh.log"\n' "$w" > "$w/bin/gh"
chmod +x "$w/bin/gh"
export PATH="$w/bin:$PATH"
: > "$w/empty.npmrc"

# Mirrors release.yml's reconcile job. $1 = dry_run (true|false)
release() {
  rm -rf "$w/runner" && git clone -q -b master "$w/origin.git" "$w/runner"
  cd "$w/runner"
  npm ci --ignore-scripts --no-audit --no-fund > "$w/npm-ci.log" 2>&1
  export RUNNER_TEMP="$w/runner-temp" && rm -rf "$RUNNER_TEMP" && mkdir -p "$RUNNER_TEMP"
  npx tsc -p scripts/ci --outDir "$RUNNER_TEMP/ci"
  cp scripts/ci/*.sh "$RUNNER_TEMP/ci/"
  : > "$w/plan.out"
  DRY_RUN=$1 GITHUB_OUTPUT="$w/plan.out" node "$RUNNER_TEMP/ci/release.js" plan
  local action version compare
  action=$(kv action "$w/plan.out") version=$(kv version "$w/plan.out") compare=$(kv compare "$w/plan.out")
  case "$action" in
    beta | rc | ga)
      if DRY_RUN=$1 HOTFIX=$(kv hotfix "$w/plan.out") "$RUNNER_TEMP/ci/cut-release.sh" "$action" "$version" "$(kv from "$w/plan.out")" "${compare:--}" \
        > "$w/cut.log" 2>&1; then
        grep -E 'same-artifact|DRY_RUN|No shippable|Tests:|new tag|new branch' "$w/cut.log" || true
      else
        tail -20 "$w/cut.log"
        return 1
      fi
      ;;
    publish) [ "$1" = true ] || gh workflow run publish.yml --ref "v$version" ;;
  esac
  cd "$w"
}

# Mirrors publish.yml for one tag. $1 = tag
publish() {
  rm -rf "$w/pub" && git clone -q "$w/origin.git" "$w/pub"
  cd "$w/pub" && git checkout -q --detach "$1"
  scripts/ci/verify-tag.sh "$1" | tee "$w/verify.out"
  [ "$(kv skip "$w/verify.out")" = false ] || { cd "$w"; return 0; }
  local version dist_tag soaked
  version=$(kv version "$w/verify.out") dist_tag=$(kv dist_tag "$w/verify.out") soaked=$(kv soaked "$w/verify.out")
  npm ci --ignore-scripts --no-audit --no-fund > "$w/npm-ci.log" 2>&1
  { npm run typecheck && npm test && npm run build; } > "$w/build.log" 2>&1 || { tail -30 "$w/build.log"; return 1; }
  grep -E '^Tests:' "$w/build.log"
  npm pack --ignore-scripts > /dev/null 2>&1
  if [ "$dist_tag" != beta ]; then
    npm pack "ryuu.js@$soaked" --pack-destination "$w" > /dev/null
    scripts/ci/same-artifact.sh "$w/ryuu.js-$soaked.tgz" "ryuu.js-$version.tgz"
  fi
  NPM_CONFIG_USERCONFIG="$w/empty.npmrc" npm publish "./ryuu.js-$version.tgz" --tag "$dist_tag" --dry-run 2>&1 |
    grep -E 'Publishing to|^\+ ' || true
  cd "$w"
}

step "1. Release, dry run (the default when you click Run workflow)"
release true

step "2. Release, live (pushes to the local bare origin only)"
release false
git -C "$w/origin.git" tag -l "v$(kv version "$w/plan.out")" | sed 's/^/pushed tag: /'
sed 's/^/dispatched: /' "$w/gh.log" 2>/dev/null || echo "dispatched: nothing"

if [ -s "$w/gh.log" ]; then
  step "3. Publish workflow for that tag (npm publish --dry-run)"
  publish "v$(kv version "$w/plan.out")"

  step "4. Release again: the tag is not on npm, so it should retry the publish"
  release true
fi

step "Done. Sandbox kept at $w"
