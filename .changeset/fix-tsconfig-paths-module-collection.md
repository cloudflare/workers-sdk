---
"wrangler": patch
---

fix: respect TypeScript path aliases when resolving non-JS modules with module rules

When importing non-JavaScript files (like `.graphql`, `.txt`, etc.) using TypeScript path aliases defined in `tsconfig.json`, Wrangler's module-collection plugin now correctly resolves these imports. Previously, path aliases were only respected for JavaScript/TypeScript files, causing imports like `import schema from '~lib/schema.graphql'` to fail when using module rules.
