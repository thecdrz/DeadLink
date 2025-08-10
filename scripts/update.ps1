param(
	[string]$Tag = 'v2.11.0'
)

# DeadLink update helper (manual)
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\update.ps1 [-Tag vX.Y.Z]
# Run from the repo folder in PowerShell (admin only if your service manager requires it).

Write-Host "Backing up config and analytics..."
Copy-Item -Path config.json -Destination config.backup.json -ErrorAction SilentlyContinue
Copy-Item -Path analytics.json -Destination analytics.backup.json -ErrorAction SilentlyContinue

$owner = 'thecdrz'
$repo = 'DeadLink'
$zip = "DeadLink_$Tag.zip"
$url = "https://github.com/$owner/$repo/archive/refs/tags/$Tag.zip"

Write-Host "Downloading release archive for $Tag ..."
try {
	Invoke-WebRequest $url -OutFile $zip -ErrorAction Stop
}
catch {
	Write-Error "Failed to download $url. Ensure the tag exists (e.g., v2.9.0).";
	exit 1
}

Write-Host "Extracting..."
$dest = (Resolve-Path "..").Path
Expand-Archive -Path $zip -DestinationPath $dest -Force

# Try to detect the extracted directory (GitHub uses repo-TAG as the folder name)
$candidate = Get-ChildItem -Path $dest -Directory |
	Where-Object { $_.Name -like "$repo-$Tag*" } |
	Select-Object -First 1
if (-not $candidate) {
	# Fallback: any directory that starts with repo-
	$candidate = Get-ChildItem -Path $dest -Directory |
		Where-Object { $_.Name -like "$repo-*" } |
		Sort-Object LastWriteTime -Descending |
		Select-Object -First 1
}

if (-not $candidate) {
	Write-Error "Could not locate extracted directory after unzip.";
	exit 1
}

Write-Host "Installing dependencies in $($candidate.FullName) ..."
Push-Location $candidate.FullName
npm ci
Pop-Location

Remove-Item $zip -Force -ErrorAction SilentlyContinue | Out-Null
Write-Host "Done. Switch your service to the new folder and restart (run.bat)."
