#!/usr/bin/env bash
set -euo pipefail

TAG=${TAG:-v2.11.0}

echo "Backing up config and analytics..."
cp -f config.json config.backup.json 2>/dev/null || true
cp -f analytics.json analytics.backup.json 2>/dev/null || true

owner=thecdrz
repo=DeadLink

echo "Downloading release archive for $TAG ..."
curl -fL "https://github.com/$owner/$repo/archive/refs/tags/$TAG.tar.gz" -o DeadLink.tar.gz || {
  echo "Tag download failed; falling back to latest" >&2
  curl -fL "https://github.com/$owner/$repo/archive/refs/heads/master.tar.gz" -o DeadLink.tar.gz
}

echo "Extracting..."
mkdir -p ..
tar -xzf DeadLink.tar.gz -C ..

# Detect extracted directory (repo-TAG)
dest_dir=$(ls -d ../"$repo-$TAG"* 2>/dev/null | head -n1)
if [[ -z "${dest_dir:-}" ]]; then
  dest_dir=$(ls -d ../"$repo-"* 2>/dev/null | sort -r | head -n1)
fi

if [[ -z "${dest_dir:-}" ]]; then
  echo "Could not locate extracted directory after untar" >&2
  exit 1
fi

echo "Installing dependencies in $dest_dir ..."
cd "$dest_dir"
npm ci || npm install

rm -f ../DeadLink.tar.gz 2>/dev/null || true
echo "Done. Switch your service to the new folder and restart (run.sh)."
