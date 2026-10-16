#!/usr/bin/env bash
# Publish sdks/node to its public GitHub repository.
#
# The monorepo (GitLab, private) is the source of truth. This pushes ONLY the
# sdks/node subtree, with its history, to github.com/sendclipper/sendclipper-node.
# Never push the monorepo itself there.
#
#   sdks/node/scripts/split-to-github.sh            # push main
#   sdks/node/scripts/split-to-github.sh v0.1.0     # push main and tag v0.1.0
#
# REMOTE defaults to the `github-sendclipper` SSH alias (~/.ssh/config), which
# authenticates as the sendclipper GitHub account.
set -euo pipefail

REMOTE="${REMOTE:-git@github-sendclipper:sendclipper/sendclipper-node.git}"
TAG="${1:-}"
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

if [ -n "$(git status --porcelain -- sdks/node)" ]; then
  echo "sdks/node has uncommitted changes; commit them first." >&2
  exit 1
fi

SPLIT="$(git subtree split --prefix=sdks/node HEAD)"
echo "split commit: $SPLIT"
git push "$REMOTE" "$SPLIT:refs/heads/main"

if [ -n "$TAG" ]; then
  version="$(node -p "require('./sdks/node/package.json').version")"
  if [ "v$version" != "$TAG" ]; then
    echo "tag $TAG does not match package.json version $version" >&2
    exit 1
  fi
  git push "$REMOTE" "$SPLIT:refs/tags/$TAG"
fi
