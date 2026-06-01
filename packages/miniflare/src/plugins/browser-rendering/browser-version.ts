/**
 * The Chrome browser version downloaded by Miniflare's Browser Run binding.
 *
 * Puppeteer v22.13.1 supported chrome version:
 * https://pptr.dev/supported-browsers#supported-browser-version-list
 *
 * It should match the supported chrome version for the upstream puppeteer
 * version from which @cloudflare/puppeteer branched off, which is specified in:
 * https://github.com/cloudflare/puppeteer/?tab=readme-ov-file#workers-version-of-puppeteer-core
 *
 * Bumping this value also invalidates the Chrome binary cache in
 * `.github/workflows/test-and-check.yml` (which uses `hashFiles()` on this file).
 */
export const BROWSER_VERSION = "126.0.6478.182";
