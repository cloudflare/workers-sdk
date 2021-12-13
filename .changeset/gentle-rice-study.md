---
wrangler: patch
---

CI/CD Tests & Type Checking
GH Workflow additions:

- Added Testing script
- Added Linting script
- tsc is using skipLibCheck as a current workaround
  - TODO added for future removal
- Runs on every Pull Request instance
- Removed npm ci in favor of npm install
  - Removed --prefer-offline in favor of local cache artifact
