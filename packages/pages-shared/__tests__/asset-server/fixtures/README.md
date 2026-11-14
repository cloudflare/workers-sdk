# Local preservation browser probe

Build Pages shared and its prerequisites from the repository root:

```sh
pnpm exec turbo build --filter=@cloudflare/pages-shared...
cd packages/pages-shared
node scripts/preservation-browser.mjs
```

Open the printed loopback URL. Keep the version-1 tab open. Select **Warm old assets**, then **Switch deployment**, then **Load old lazy chunk and data**. The result should be `Old SPA still works; data version 1`. The event log should show deployment 2 serving the old script with destination `script` and old JSON with destination `empty`, both with preservation outcome `body`.

Open **Navigate to deleted chunk** in another tab. It should show `SPA version 2`. Select **Load old lazy chunk and data** again in the original tab to refresh its event log. The new navigation should have `preservationCacheResult: skipped-navigation`. A later `304` for the current SPA fallback is valid; it must not be a historical preservation `304`.

This probe passed in the Codex in-app browser on 2026-11-06 using the modified handler in local workerd. Automated handler tests separately cover old strong/weak ETags, custom 404s, current-asset revalidation, missing-header clients, and an unwarmed chunk. The probe proves warmed assets only; preservation is not complete version-skew protection. It does not exercise production KV, upstream caching, WAF, or production telemetry delivery.

The control endpoints and manifest switch exist only in this local fixture. Restart the process to repeat from deployment 1; stop it with Ctrl-C.
