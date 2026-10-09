#!/usr/bin/env bash
# Usage: cut-release.sh <beta|rc|ga> <version> <from-ref> <compare-version|->
#
# Builds <from-ref> as <version> and compares the packed tarball with
# <compare-version> from npm:
#   beta:  an identical artifact means nothing shippable changed, so stop (exit 0).
#   rc/ga: the artifact must be identical to the soaked beta/rc, or fail.
# Then commits the version bump on a detached HEAD, tags v<version> (plus
# release/v<version> for a GA), pushes atomically and dispatches publish.yml.
#
# DRY_RUN=true stops before pushing. Run from a copy outside the checkout: this
# script checks out other trees.
set -euo pipefail

kind=$1 version=$2 from=$3 compare=$4
here=$(cd "$(dirname "$0")" && pwd)
summary=${GITHUB_STEP_SUMMARY:-/dev/null}

case "$kind" in beta | rc | ga) ;; *) echo "kind must be beta, rc or ga, got $kind" >&2; exit 2 ;; esac
[ "$kind" = beta ] || [ "$compare" != "-" ] || { echo "$kind needs the soaked version to compare against" >&2; exit 2; }

git checkout --quiet --detach "$from"
npm ci --ignore-scripts --no-audit --no-fund
npm version "$version" --no-git-tag-version --allow-same-version --ignore-scripts >/dev/null
npm run typecheck
npm test
npm run build

dirty=$(git status --porcelain -- . ':!package.json' ':!package-lock.json')
if [ -n "$dirty" ]; then
  echo "build left unexpected changes:" >&2
  echo "$dirty" >&2
  exit 1
fi

out=$(mktemp -d)
built="$out/$(npm pack --ignore-scripts --json --pack-destination "$out" | node -pe 'JSON.parse(require("fs").readFileSync(0))[0].filename')"

if [ "$compare" != "-" ]; then
  previous="$out/$(cd "$out" && npm pack "ryuu.js@$compare" --json | node -pe 'JSON.parse(require("fs").readFileSync(0))[0].filename')"
  if "$here/same-artifact.sh" "$previous" "$built"; then
    if [ "$kind" = beta ]; then
      echo "No shippable change since $compare; not cutting $version."
      echo "No shippable change since \`$compare\`; skipped \`$version\`." >> "$summary"
      exit 0
    fi
  elif [ "$kind" != beta ]; then
    echo "$version does not match the soaked $compare artifact; refusing to release." >&2
    exit 1
  fi
fi

git -c user.name='github-actions[bot]' \
    -c user.email='41898282+github-actions[bot]@users.noreply.github.com' \
    commit --quiet -m "chore(release): $version" -- package.json package-lock.json
git -c user.name='github-actions[bot]' \
    -c user.email='41898282+github-actions[bot]@users.noreply.github.com' \
    tag -a "v$version" -m "ryuu.js $version"

refs=("refs/tags/v$version")
if [ "$kind" = ga ]; then
  refs+=("HEAD:refs/heads/release/v$version")
fi

if [ "${DRY_RUN:-}" = "true" ]; then
  echo "DRY_RUN: would push ${refs[*]} and dispatch publish.yml for v$version"
  echo "Dry run: would push \`${refs[*]}\` and publish \`$version\`." >> "$summary"
  exit 0
fi

git push --atomic origin "${refs[@]}"
gh workflow run publish.yml --ref "v$version"
echo "Pushed \`${refs[*]}\` and dispatched publish for \`$version\`." >> "$summary"
