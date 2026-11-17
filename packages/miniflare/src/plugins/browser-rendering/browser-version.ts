/**
 * The Chrome browser version downloaded by Miniflare's Browser Run binding.
 *
 * It should match the Chrome version that Browser Run uses in production.
 *
 * Bumping this value also invalidates the Chrome binary cache in
 * `.github/workflows/test-and-check.yml` (which uses `hashFiles()` on this file).
 */
export const BROWSER_VERSION = "152.0.7977.64";
