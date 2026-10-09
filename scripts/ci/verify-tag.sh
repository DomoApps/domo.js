#!/usr/bin/env bash
# Usage: verify-tag.sh <tag>   (run with the tag checked out, full history fetched)
#
# Checks that <tag> is a commit release.yml made, and prints the publish plan as
# key=value lines (version, dist_tag, soaked, skip) for $GITHUB_OUTPUT.
set -euo pipefail

fail() { echo "::error::$1" >&2; exit 1; }

# package.json and package-lock.json at <commit> with their version fields removed.
without_versions() {
  node -e '
    const { execFileSync } = require("child_process");
    const show = (file) => JSON.parse(execFileSync("git", ["show", `${process.argv[1]}:${file}`], { encoding: "utf8" }));
    const pkg = show("package.json");
    const lock = show("package-lock.json");
    delete pkg.version;
    delete lock.version;
    if (lock.packages && lock.packages[""]) delete lock.packages[""].version;
    console.log(JSON.stringify([pkg, lock]));
  ' "$1"
}

version_at() {
  git show "$1:$2" | node -p 'JSON.parse(require("fs").readFileSync(0, "utf8")).version'
}

# A release commit is one bot-made commit on top of <parent> that changes nothing but the version.
check_release_commit() {
  local commit=$1 expected=$2 label=$3
  [ "$(git rev-list --parents -n1 "$commit" | wc -w)" -eq 2 ] || fail "$label: commit must have exactly one parent"
  [ "$(git log -1 --format=%ae "$commit")" = "$bot" ] || fail "$label: commit was not made by the release workflow"
  [ "$(git diff --name-only "$commit^" "$commit" | LC_ALL=C sort | tr '\n' ' ')" = "package-lock.json package.json " ] ||
    fail "$label: commit must change only package.json and package-lock.json"
  [ "$(without_versions "$commit^")" = "$(without_versions "$commit")" ] ||
    fail "$label: commit changes more than the version in package.json or package-lock.json"
  [ "$(version_at "$commit" package.json)" = "$expected" ] || fail "$label: package.json is not $expected"
  [ "$(version_at "$commit" package-lock.json)" = "$expected" ] || fail "$label: package-lock.json is not $expected"
}

tag=$1
version=${tag#v}
bot='41898282+github-actions[bot]@users.noreply.github.com'

[ "$(git rev-parse HEAD)" = "$(git rev-parse "$tag^{commit}")" ] || fail "HEAD is not $tag"

if [[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+-beta\.[0-9]+$ ]]; then
  dist_tag=beta soaked=
  check_release_commit HEAD "$version" "$tag"
  git merge-base --is-ancestor HEAD^ origin/master || fail "$tag: parent is not on master"
elif [[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  dist_tag=latest
  soaked=$(git tag --points-at HEAD^ | grep -E "^v${version//./\\.}-beta\.[0-9]+$" | head -1 || true)
  [ -n "$soaked" ] || fail "$tag: parent is not a v$version-beta.* tag"
  soaked=${soaked#v}
  check_release_commit HEAD "$version" "$tag"
  # The GA ships the soaked beta's tree, so that beta must pass the same checks.
  check_release_commit HEAD^ "$soaked" "v$soaked"
  git merge-base --is-ancestor HEAD^^ origin/master || fail "v$soaked: parent is not on master"
else
  fail "$tag is not a pipeline tag"
fi

skip=false
if [ -n "$(npm view "ryuu.js@$version" version --prefer-online 2>/dev/null || true)" ]; then
  echo "ryuu.js@$version is already on npm; nothing to publish." >&2
  skip=true
else
  current=$(npm view ryuu.js "dist-tags.$dist_tag" --prefer-online 2>/dev/null || true)
  # Never move a dist-tag backwards. A GA sorts above its own betas.
  node -e '
    const parse = (v) => {
      const m = /^(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/.exec(v);
      return m && [m[1], m[2], m[3], m[4] ?? Infinity].map(Number);
    };
    const [next, current] = [parse(process.argv[1]), parse(process.argv[2])];
    const diff = current ? next.map((n, i) => n - current[i]).find((d) => d !== 0 && !Number.isNaN(d)) ?? 0 : 1;
    if (diff <= 0) {
      console.error(`::error::${process.argv[1]} is not newer than ${process.argv[3]} (${process.argv[2]})`);
      process.exit(1);
    }
  ' "$version" "$current" "$dist_tag"
fi

echo "version=$version"
echo "dist_tag=$dist_tag"
echo "soaked=$soaked"
echo "skip=$skip"
