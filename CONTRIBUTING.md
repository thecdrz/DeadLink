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
