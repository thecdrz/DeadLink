# HordeComms update helper (manual)
# Usage: Run from the repo folder in PowerShell as admin if needed

Write-Host "Backing up config and analytics..."
Copy-Item -Path config.json -Destination config.backup.json -ErrorAction SilentlyContinue
Copy-Item -Path analytics.json -Destination analytics.backup.json -ErrorAction SilentlyContinue

Write-Host "Downloading latest release archive..."
$owner = 'thecdrz'
$repo = 'HordeComms'
$zip = 'HordeComms.zip'
Invoke-WebRequest "https://github.com/$owner/$repo/archive/refs/heads/master.zip" -OutFile $zip

Write-Host "Extracting..."
Expand-Archive -Path $zip -DestinationPath .. -Force

Write-Host "Installing dependencies..."
Push-Location ..\HordeComms
npm ci
Pop-Location

Write-Host "Done. Restart the bot (run.bat)."
