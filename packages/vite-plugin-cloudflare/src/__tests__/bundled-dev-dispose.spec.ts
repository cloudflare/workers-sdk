import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import { createServer } from "vite";
import { afterEach, describe, test } from "vitest";
import type { ObjectHook, Plugin, ViteDevServer } from "vite";

const fixturesPath = fileURLToPath(new URL("./fixtures", import.meta.url));

function callBuildEnd(plugin: Plugin): unknown {
	const hook = plugin.buildEnd as ObjectHook<NonNullable<Plugin["buildEnd"]>>;
	const handler = typeof hook === "function" ? hook : hook?.handler;
	// The cloudflare hooks close over their own context, so the `this`
	// PluginContext is unused; an empty object is sufficient to invoke them.
	return handler?.call({} as never);
}

describe("bundled dev mode", () => {
	let server: ViteDevServer | undefined;

	afterEach(async () => {
		await server?.close();
		server = undefined;
	});

	// Reference: Vite's `experimental.bundledDev` runs a Rolldown build pass
	// *during* `serve`, which fires every plugin's `buildEnd` hook while the
	// dev server is still live. The cloudflare plugin previously treated
	// `buildEnd` as "the dev server is closing" and disposed Miniflare, so the
	// next request failed with `Expected \`miniflare\` to be defined`. Miniflare
	// must survive a `buildEnd` that fires during `serve`.
	test("Miniflare survives a buildEnd fired during serve", async ({
		expect,
	}) => {
		server = await createServer({
			root: fixturesPath,
			logLevel: "silent",
			plugins: [cloudflare({ inspectorPort: false, persistState: false })],
		});

		await server.listen();
		const address = server.resolvedUrls?.local[0];
		if (!address) {
			throw new Error("Server address is undefined");
		}

		expect((await fetch(address)).ok).toBe(true);

		// Simulate a bundledDev build pass completing mid-serve.
		for (const plugin of server.config.plugins) {
			if (plugin.name.startsWith("vite-plugin-cloudflare")) {
				await callBuildEnd(plugin);
			}
		}

		// Before the fix this request throws / 500s because Miniflare was
		// disposed by the buildEnd above.
		expect((await fetch(address)).ok).toBe(true);
	});
});
