## Contributing guidelines (short)

Thank you for contributing to DeadLink. A few repo-specific notes to help keep personal data private:

- analytics.json is intentionally ignored and contains local/personal analytics. Do not commit it to the repository.
- Use `analytics.example.json` when you need a sample to understand the data schema.
- To reset your local analytics during testing:

```powershell
Remove-Item analytics.json
Copy-Item analytics.example.json analytics.json
```

- The repository contains a CI guard that runs on pull requests and will fail if `analytics.json` is included in a PR. If that happens, remove the file from the branch and recommit.

Thanks for keeping personal data out of the repo.

### Optional: Enable local git hooks

This repo ships local hook scripts in `.githooks/` to help avoid accidentally committing sensitive runtime files like `analytics.json`.

To enable them locally run:

```powershell
# Windows PowerShell
git config core.hooksPath .githooks
```

```bash
# macOS / Linux
git config core.hooksPath .githooks
```

The hooks include a cross-platform `pre-commit` check (`pre-commit` for POSIX shells and `pre-commit.ps1` for PowerShell) that prevents committing `analytics.json`. Enabling hooks is optional and local—this change is not forced for contributors.
