---
description: "update associated cloudflare-docs based on your changes in this repo"
---

Create or update documentation in the cloudflare-docs repo based on changes in this branch.

User feedback: $ARGUMENTS

## Instructions

1. First, analyze the current branch's diff from main to understand what changed:

   - Run `git diff main...HEAD` to see all changes
   - Identify user-facing changes that need documentation (new features, CLI changes, API updates, config changes)

2. Clone or navigate to the cloudflare-docs repo (typically at `../cloudflare-docs` or clone from `https://github.com/cloudflare/cloudflare-docs`)

3. **IMPORTANT**: You MUST follow the Docs agent guidance from the cloudflare-docs repo:

   - Fetch and read: https://raw.githubusercontent.com/cloudflare/cloudflare-docs/production/.opencode/agent/docs.md
   - Apply all writing principles, page structure requirements, and content guidelines

4. Focus on small, clear documentation changes:

   - Update code examples to reflect the changes
   - Update wrangler CLI command documentation if commands changed
   - Update API usage documentation if APIs changed
   - Ensure changes are reflected across Developer Platform documentation

5. Create a new branch in cloudflare-docs for your changes

6. Open a PR on the cloudflare-docs repo using the gh cli:

   ```sh
   gh pr create --repo cloudflare/cloudflare-docs --title "docs: <brief description>" --body "<description of changes>"
   ```

7. Provide the PR link in your response

## Important Notes

- If no documentation updates are needed for the changes, say so clearly
- If significant documentation changes are required that go beyond small updates, describe what is needed and recommend manual intervention
- Always link back to the workers-sdk PR or changes that prompted the docs update
