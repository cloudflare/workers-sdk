---
wrangler: patch
---

CI/CD Cleanup
- Removed the build step from tests, which should speed up the "Tests" Workflow.
- Added a branch specific trigger for "Release", now the Workflow for "Release" should only work on PRs closed to `main`
- Removed the "Changeset PR" Workflow. Now the "Release" Workflow will handle everything needed for Changesets.
