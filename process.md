# Context

We had to revert [Drop node:process polyfill when v2 is available](https://github.com/cloudflare/workers-sdk/pull/10805) because <https://github.com/cloudflare/workers-sdk/pull/10860>

Write up about native `node:process` and compat flags: <https://chat.google.com/room/AAAAIoWC3AE/AoSWo5SW0UM/4yjE0vd-Wo4?cls=10>

Thread with the Astro team: <https://chat.google.com/room/AAQAZlx39ag/ZwF6ig4H0yo/ZwF6ig4H0yo?cls=10>

Related PR:
<https://github.com/cloudflare/workerd/issues/2746>
<https://github.com/cloudflare/workerd/issues/5704>

# Test astro

E2E_FRAMEWORK_TEMPLATE_TO_TEST=astro pnpm test:e2e -F create-cloudflare -- frameworks

# E2E tests

CLOUDFLARE_ACCOUNT_ID=xx CLOUDFLARE_API_TOKEN=xx WRANGLER="node $PWD/packages/wrangler/bin/wrangler.js" WRANGLER_IMPORT=$PWD/packages/wrangler/wrangler-dist/cli.js pnpm -F wrangler run test:e2e e2e/unenv-preset -- --concurrency=1

# Create a local astro app

`pnpm create cloudflare --framework astro --platform workers -- --skip-houston --no-install --no-git --template=blog --typescript=strict`

copy [test.astro](https://github.com/cloudflare/workers-sdk/blob/main/packages/create-cloudflare/e2e/tests/frameworks/fixtures/astro/src/pages/test.astro) to `src/pages`

`pnpm build`

`pnpm wrangler dev` and navigate to `http://localhost:8787/test`

You should see:

```
[object Object]
```

Update `wrangler.jsonc` with:

```diff
	"compatibility_flags": [
		"nodejs_compat",
		"global_fetch_strictly_public",
+		"fetch_iterable_type_support",
+		"fetch_iterable_type_support_override_adjustment",
	],
```

You should now see:

```
Hello C3 2026-01-28T13:12:08.897Z
{"ASSETS":{}}
```

# More tests

- <https://github.com/withastro/astro>
- `next` branch
- `pnpm -F @astrojs/cloudflare build`
- `pnpm -F @astrojs/cloudflare test`

## Test with default config

- `pnpm build`
- `pnpm -F @astrojs/cloudflare build`
- `pnpm -F @astrojs/cloudflare test`

```
ℹ tests 148
ℹ suites 37
ℹ pass 147
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 1
ℹ duration_ms 53143.603458
```

## Test with process v2 enabled

Compile a local version

- `pnpm link /path/to/workers-sdk/packages/wrangler`
- `pnpm link /path/to/workers-sdk/packages/vite-plugin-cloudflare`

- `pnpm build`
- `pnpm -F @astrojs/cloudflare build`
- `pnpm -F @astrojs/cloudflare test`

-> it mostly works (Tailwind doesn't), probably v2 is not enabled because of date

```
ℹ tests 148
ℹ suites 37
ℹ pass 146
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 1
ℹ duration_ms 42551.62625
```

replacing the compat date with 2026-01-20 everywhere applicable (there are some programmatic config, best is to look for "compatibility_date")
Still only one issue

```
ℹ tests 148
ℹ suites 37
ℹ pass 146
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 1
ℹ duration_ms 43237.80675
```

Forcing isNode to true in `astro/packages/astro/src/runtime/server/render/util.ts` and `astro/packages/astro/e2e/fixtures/pass-js/src/components/React.tsx`
Many more failures as expected:

```
ℹ tests 148
ℹ suites 37
ℹ pass 73
ℹ fail 74
ℹ cancelled 0
ℹ skipped 0
ℹ todo 1
ℹ duration_ms 48724.625
```

? - replace wrangler by `node /path/to/workers-sdk/packages/wrangler/wrangler-dist/cli.js` in `packages/integrations/cloudflare/test/fixtures/sessions/package.json`
