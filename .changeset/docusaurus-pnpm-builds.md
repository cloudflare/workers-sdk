---
"create-cloudflare": patch
---

Fix Docusaurus project creation with pnpm's strict build approvals.

Previously creating a Docusaurus project with pnpm could fail when dependency build scripts required approval. Now users can approve those scripts during setup and complete project creation.
