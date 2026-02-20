import fs from "node:fs/promises";
import path from "node:path";
import dedent from "ts-dedent";
import { test } from "./helpers";

test(
	"resolves bare specifier to npm package, not subpath export with same name",
	async ({ expect, tmpPath, seed, vitestRun }) => {
		// Regression test: when a package has both a dependency on "some-lib" and
		// a subpath export "./some-lib", the module fallback should resolve the
		// bare specifier "some-lib" to the npm package, not the subpath export.
		// This bug is triggered by pnpm's symlinked node_modules layout.

		// 1. Seed the pnpm store with the actual package files
		const store = "node_modules/.pnpm";
		const adapterStore = `${store}/my-adapter@1.0.0/node_modules/my-adapter`;
		const someLibInAdapterNm = `${store}/my-adapter@1.0.0/node_modules/some-lib`;
		const someLibStore = `${store}/some-lib@1.0.0/node_modules/some-lib`;
		await seed({
			"vitest.config.mts": dedent`
				import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
				export default defineWorkersConfig({
					test: {
						poolOptions: {
							workers: {
								singleWorker: true,
								miniflare: {
									compatibilityDate: "2024-01-01",
									compatibilityFlags: ["nodejs_compat"],
								},
							},
						},
					}
				});
			`,
			// some-lib in the pnpm store
			[`${someLibStore}/package.json`]: JSON.stringify({
				name: "some-lib",
				version: "1.0.0",
				type: "module",
				exports: { ".": { import: "./index.js" } },
			}),
			[`${someLibStore}/index.js`]: dedent`
				export function createApp() {
					return { name: "some-lib-app" };
				}
			`,
			// my-adapter in the pnpm store — has both:
			//   - a dependency on "some-lib" (bare specifier in dist/index.js)
			//   - a subpath export "./some-lib" (dist/some-lib.js)
			[`${adapterStore}/package.json`]: JSON.stringify({
				name: "my-adapter",
				version: "1.0.0",
				type: "module",
				exports: {
					".": { import: "./dist/index.js" },
					"./some-lib": { import: "./dist/some-lib.js" },
				},
				dependencies: { "some-lib": "1.0.0" },
			}),
			[`${adapterStore}/dist/index.js`]: dedent`
				import { createApp } from "some-lib";
				export class MyAdapter {
					app = createApp();
					find() { return []; }
				}
			`,
			[`${adapterStore}/dist/some-lib.js`]: dedent`
				export function createCompatAdapter() {
					return { compat: true };
				}
			`,
			"index.test.ts": dedent`
				import { it, expect } from "vitest";
				import { MyAdapter } from "my-adapter";
				it("resolves bare specifier to npm package", () => {
					const adapter = new MyAdapter();
					expect(adapter.app).toEqual({ name: "some-lib-app" });
				});
			`,
		});

		// 2. Create pnpm-style symlinks
		const nm = path.join(tmpPath, "node_modules");

		// Top-level node_modules/my-adapter → store path (real package)
		await fs.symlink(
			path.join(tmpPath, adapterStore),
			path.join(nm, "my-adapter")
		);
		// Top-level node_modules/some-lib → store path (real package)
		await fs.symlink(
			path.join(tmpPath, someLibStore),
			path.join(nm, "some-lib")
		);
		// some-lib accessible from my-adapter's store node_modules
		// (pnpm hoists deps into the package's own node_modules in the store)
		await fs.symlink(
			path.join(tmpPath, someLibStore),
			path.join(tmpPath, someLibInAdapterNm)
		);

		const result = await vitestRun();
		expect(await result.exitCode).toBe(0);
	}
);
