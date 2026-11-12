import path from "node:path";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import dedent from "ts-dedent";
import { afterEach, beforeEach, describe, test, vi } from "vitest";
import { BundlerController } from "../../../api/startDevWorker/BundlerController";
import { FakeBus } from "../../helpers/fake-bus";
import { mockConsoleMethods } from "../../helpers/mock-console";
import type { StartDevWorkerOptions } from "../../../api";
import type { BuildFailure } from "esbuild";

// esbuild's watch mode polls the files a build read, and starts a rebuild as
// soon as it notices one has changed or gone. A context that is disposed only
// after its build's files have been deleted can therefore notice them going
// first, and `dispose()` waits for that rebuild, which fails with "Could not
// resolve .wrangler/tmp/bundle-XXXX/middleware-loader.entry.ts" (see
// https://github.com/cloudflare/workers-sdk/issues/6562).
//
// Whether the watcher polls in that window is down to timing, so make it
// deterministic: every watch context runs one more build at the moment it is
// disposed, just as the watcher would if it noticed a change then.
vi.mock("esbuild", async (importOriginal) => {
	const actual = await importOriginal<typeof import("esbuild")>();
	return {
		...actual,
		context: (async (options: Parameters<typeof actual.context>[0]) => {
			const ctx = await actual.context(options);
			return {
				...ctx,
				async dispose() {
					try {
						await ctx.rebuild();
					} catch {
						// A failed build is reported through the build's own `onEnd`
						// plugins, which is what these tests observe.
					}
					await ctx.dispose();
				},
			};
		}) as typeof actual.context,
	};
});

function configDefaults(
	overrides: Partial<StartDevWorkerOptions> = {}
): StartDevWorkerOptions {
	const persist = path.join(process.cwd(), ".wrangler/persist");
	return {
		name: "test-worker",
		complianceRegion: undefined,
		entrypoint: path.resolve("src/index.ts"),
		projectRoot: path.resolve("src"),
		legacy: {},
		dev: { persist },
		build: {
			additionalModules: [],
			processEntrypoint: false,
			nodejsCompatMode: null,
			bundle: true,
			moduleRules: [],
			custom: {},
			define: {},
			format: "modules",
			moduleRoot: path.resolve("src"),
			exports: [],
		},
		...overrides,
	};
}

/** The error events dispatched so far, with the build errors they carry. */
function errorEvents(bus: FakeBus) {
	return bus.events
		.filter((event) => event.type === "error")
		.map((event) => ({
			source: event.source,
			reason: event.reason,
			buildErrors: ((event.cause as BuildFailure).errors ?? []).map(
				(error) => error.text
			),
		}));
}

describe("BundlerController bundle cleanup (#6562)", () => {
	mockConsoleMethods();
	runInTempDir();

	let bus: FakeBus;
	let controller: BundlerController;
	beforeEach(() => {
		bus = new FakeBus();
		controller = new BundlerController(bus);
	});
	afterEach(() => controller.teardown());

	test("replacing the bundle after a config change doesn't report a failed rebuild of the previous bundle", async ({
		expect,
	}) => {
		await seed({
			"src/index.ts": dedent /* javascript */ `
				export default {
					fetch(request, env, ctx) {
						return new Response("hello world")
					}
				} satisfies ExportedHandler
			`,
		});
		const config = configDefaults();
		const initialBundle = bus.waitFor(
			"bundleComplete",
			(event) => event.config === config
		);
		controller.onConfigUpdate({ type: "configUpdate", config });
		await initialBundle;

		// A config change, such as editing the Wrangler config file during
		// `wrangler dev`, replaces the esbuild watch context with a new one.
		const updatedConfig = configDefaults({
			build: { ...config.build, define: { GREETING: '"hello"' } },
		});
		const updatedBundle = bus.waitFor(
			"bundleComplete",
			(event) => event.config === updatedConfig
		);
		controller.onConfigUpdate({
			type: "configUpdate",
			config: updatedConfig,
		});
		await updatedBundle;

		// The previous context must be stopped without building against its
		// temporary directory after that directory has been removed.
		expect(errorEvents(bus)).toEqual([]);
	});
});
