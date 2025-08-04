---
"@cloudflare/cli": minor
"miniflare": patch
"wrangler": patch
"create-cloudflare": patch
---

Add macOS version validation with separate warning and error behaviors

This change adds macOS version validation to prevent EPIPE errors on unsupported macOS versions (below 13.5), with different behaviors for different tools:

**New validation functions in @cloudflare/cli:**

- `validateMacOSVersion()`: Throws an error for hard validation (used by Miniflare)
- `warnMacOSVersion()`: Logs a warning but continues execution (used by Wrangler and C3)

**Tool-specific behavior:**

- **Miniflare**: Hard fails on unsupported macOS versions to prevent runtime issues with workerd
- **Wrangler**: Shows warnings but continues, since some Wrangler features work on older macOS
- **Create Cloudflare (C3)**: Shows warnings but continues, keeping the scaffolding tool lightweight

**Features:**

- Detects macOS platform and maps Darwin kernel versions to macOS versions
- Skips validation in CI environments (detects any truthy `process.env.CI` value)
- Provides helpful error messages suggesting DevContainer alternatives
- Comprehensive test coverage for version detection and CI environment handling

This ensures users get appropriate feedback about macOS compatibility while maintaining tool-specific behavior expectations.
