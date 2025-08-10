#!/bin/sh
set -e
name=DeadLink
rm -rf "$name" "$name.zip"
mkdir "$name"
cp -v config.example.json "$name"/
cp -v package.json "$name"/
cp -v index.js "$name"/
cp -v install.bat "$name"/
cp -v run.bat "$name"/
cp -v README.md "$name"/
cp -rv lib "$name"/lib
echo "Creating $name.zip (requires PowerShell on Windows)..."
powershell -NoProfile -Command "Compress-Archive -Path '$name/*' -DestinationPath '$name.zip' -Force"
echo "Created $name.zip"
