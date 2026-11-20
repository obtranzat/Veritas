## Summary

<!-- Describe what this Pull Request changes and why. Reference any related issue (e.g., Fixes #123). -->

## Type of Change

- [ ] Bug fix (non-breaking change fixing an issue)
- [ ] New feature (non-breaking change adding functionality)
- [ ] Breaking change (fix or feature that breaks existing API/data compatibility)
- [ ] Security hardening / dependency update
- [ ] Documentation / examples update
- [ ] Infrastructure / Docker / Kubernetes / CI change

## Pre-Submission Checklist

- [ ] Code follows Veritas TypeScript & React conventions (`CONTRIBUTING.md`)
- [ ] Added or updated unit, integration, API, or security tests covering the change
- [ ] `npm run lint` (`tsc --noEmit`) passes with zero errors
- [ ] `npm run test:coverage` passes and preserves `>=95%` statement/line/function coverage
- [ ] `npm run build` succeeds cleanly
- [ ] No hardcoded API keys, credentials, or `.env` secrets are included
- [ ] Documentation / `src/server/openapi.ts` updated if API routes or env vars changed

## Screenshots / Test Output

<!-- Attach relevant terminal verification output or UI screenshots (light + dark mode for UI PRs). -->
