# PowerShell pre-commit hook to prevent committing analytics.json
if (Test-Path -Path "analytics.json") {
    Write-Error "ERROR: analytics.json must not be committed. Remove it from the index before committing.";
    exit 1
}
exit 0
