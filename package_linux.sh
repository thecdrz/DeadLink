#!/bin/sh
set -e
name=DeadLink
rm -rf "$name" "$name.tar.gz"
mkdir "$name"
cp -v config.example.json "$name"/
cp -v package.json "$name"/
cp -v index.js "$name"/
cp -v run.sh "$name"/
cp -v run_silent.sh "$name"/
cp -v README.md "$name"/
cp -rv lib "$name"/lib
tar -zcvf "$name.tar.gz" "$name"
echo "Created $name.tar.gz"
