---
"@cloudflare/cli": minor
"miniflare": patch
"wrangler": patch
"create-cloudflare": patch
---

Improve macOS version validation with better CI detection and separate warning/error behaviors

This change enhances the macOS version validation system by providing both hard-fail and warn-only validation functions, and improves CI environment detection to work across different CI systems.

**Changes:**

- Added `warnMacOSVersion` function to `@cloudflare/cli` for non-blocking warnings
- Enhanced `validateMacOSVersion` function with better CI environment detection
- Updated Wrangler to use `warnMacOSVersion` instead of `validateMacOSVersion`
- Updated C3 to use `warnMacOSVersion` instead of `validateMacOSVersion`
- Miniflare constructor now uses `validateMacOSVersion` from @cloudflare/cli for hard validation
- Fixed CI environment detection to check for any truthy value instead of strict `=== "true"`

**Impact:**

- Wrangler and C3 will now show warnings instead of hard failures on unsupported macOS versions
- Miniflare will fail hard on unsupported macOS versions, preventing runtime issues
- Better CI environment detection across different CI systems (supports CI="1", CI="yes", etc.)
- More informative error messages guide users to solutions
