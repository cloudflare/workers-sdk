---
"wrangler": patch
---

Fix autoconfig package installation always failing at workspace roots

When running autoconfig at the root of a monorepo workspace, package installation commands now include the appropriate workspace root flags (`--workspace-root` for pnpm, `-W` for yarn). This prevents errors like "Running this command will add the dependency to the workspace root" that previously occurred when configuring projects at the workspace root.

Additionally, autoconfig now allows running at the workspace root if the root directory itself is listed as a workspace package (e.g., `workspaces: ["packages/*", "."]`).
