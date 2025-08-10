param(
  [Parameter(Mandatory=$true)][string]$Tag,
  [string]$Title,
  [string]$BodyFile = ".github/release-body-$Tag.md",
  [switch]$Prerelease
)

if (-not $env:GITHUB_TOKEN) {
  Write-Error "GITHUB_TOKEN env var not set. Create a token with 'repo' scope and set it first."
  exit 1
}

if (-not $Title) { $Title = "HordeComms $Tag" }
if (-not (Test-Path $BodyFile)) {
  # Fallback: look for v-prefixed file name
  $alt = ".github/release-body-$($Tag.TrimStart('v')).md"
  if (Test-Path $alt) { $BodyFile = $alt }
}

$bodyText = ""
if (Test-Path $BodyFile) {
  $bodyText = Get-Content -Raw $BodyFile
} else {
  Write-Warning "Body file not found: $BodyFile. Creating a minimal release."
}

$payload = @{ 
  tag_name = $Tag
  name = $Title
  body = $bodyText
  draft = $false
  prerelease = [bool]$Prerelease
} | ConvertTo-Json -Depth 6

$headers = @{ 
  Authorization = "Bearer $env:GITHUB_TOKEN"
  "User-Agent"  = "PowerShell"
  Accept        = "application/vnd.github+json"
}

$repo = "thecdrz/HordeComms"

try {
  # Try create; if exists, PATCH
  $create = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/releases" -Headers $headers -Body $payload -ErrorAction Stop
  Write-Host "Published release: $($create.html_url)"
} catch {
  try {
    $existing = Invoke-RestMethod -Method Get -Uri "https://api.github.com/repos/$repo/releases/tags/$Tag" -Headers $headers -ErrorAction Stop
    $patch = @{ body = $bodyText; name = $Title; prerelease = [bool]$Prerelease } | ConvertTo-Json
    $updated = Invoke-RestMethod -Method Patch -Uri "https://api.github.com/repos/$repo/releases/$($existing.id)" -Headers $headers -Body $patch -ErrorAction Stop
    Write-Host "Updated release: $($updated.html_url)"
  } catch {
    throw $_
  }
}
