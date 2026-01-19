import path from "node:path";
import {
	Miniflare,
	MiniflareCoreError,
	MiniflareOptions,
	WorkerOptions,
} from "miniflare";
import { expect, test } from "vitest";
import {
	EXPORTED_FIXTURES,
	FIXTURES_PATH,
	useDispose,
} from "../../test-shared";

/**
 * Use the plugin located in `test/fixtures/unsafe-plugin`
 * for these tests
 */
export const unsafePluginDirectory = path.resolve(
	EXPORTED_FIXTURES,
	"unsafe-plugin"
);

const pluginEntrypoint = `${unsafePluginDirectory}/index.js`;

const UNSAFE_BINDINGS: (
	packageName: string,
	pluginName: string
) => WorkerOptions["unsafeBindings"] = (packageName, pluginName) => [
	{
		name: "UNSAFE_BINDING",
		type: "service",
		plugin: {
			package: packageName,
			name: pluginName,
		},
		options: {
			foo: "bar",
			service: "my-unsafe-service",
		},
	},
];
const PLUGIN_SCRIPT = /* javascript */ `export default {
	async fetch(req, env, ctx) {
		const writeRes = await env.UNSAFE_BINDING.performUnsafeWrite("some-key", "some-value");
		if (!writeRes.ok) {
			return Response.json(writeRes, { status: 500 })
		}
		const res = await env.UNSAFE_BINDING.performUnsafeRead("some-key");
		return Response.json(res)
	}
}
`;

test("A plugin that does not expose `plugins` will cause an error to be thrown", async () => {
	const badPluginDir = path.resolve(FIXTURES_PATH, "unsafe-plugin-bad");
	const [packageName, pluginName] = [
		`${badPluginDir}/no-export.cjs`,
		"unsafe-plugin",
	];
	const opts: MiniflareOptions = {
		name: "unsafe-plugin-worker",
		// Use a compatibility date that supports RPCs
		compatibilityDate: "2025-08-04",
		modules: true,
		script: PLUGIN_SCRIPT,
		unsafeBindings: UNSAFE_BINDINGS(packageName, pluginName),
	};
	const mf = new Miniflare({ modules: true, script: "" });
	useDispose(mf);

	let error: MiniflareCoreError | undefined = undefined;
	try {
		await mf.setOptions(opts);
	} catch (err) {
		error = err as MiniflareCoreError;
	}

	expect(error).toBeInstanceOf(MiniflareCoreError);
	expect(error?.code).toEqual("ERR_PLUGIN_LOADING_FAILED");
	expect(error?.message).toMatch(/did not provide any plugins/);
});

test("A plugin that exposes a non-object `plugins` export will cause an error to be thrown", async () => {
	const badPluginDir = path.resolve(FIXTURES_PATH, "unsafe-plugin-bad");
	const [packageName, pluginName] = [
		`${badPluginDir}/not-function.cjs`,
		"unsafe-plugin",
	];
	const opts: MiniflareOptions = {
		name: "unsafe-plugin-worker",
		// Use a compatibility date that supports RPCs
		compatibilityDate: "2025-08-04",
		modules: true,
		script: PLUGIN_SCRIPT,
		unsafeBindings: UNSAFE_BINDINGS(packageName, pluginName),
	};
	const mf = new Miniflare({ modules: true, script: "" });
	useDispose(mf);

	let error: MiniflareCoreError | undefined = undefined;
	try {
		await mf.setOptions(opts);
	} catch (err) {
		error = err as MiniflareCoreError;
	}

	expect(error).toBeInstanceOf(MiniflareCoreError);
	expect(error?.code).toEqual("ERR_PLUGIN_LOADING_FAILED");
	expect(error?.message).toMatch(/did not provide the plugin 'unsafe-plugin'/);
});

test("Supports specifying an unsafe plugin will be loaded into Miniflare and will be usable in local dev", async () => {
	const [packageName, pluginName] = [pluginEntrypoint, "unsafe-plugin"];
	const opts: MiniflareOptions = {
		name: "unsafe-plugin-worker",
		// Use a compatibility date that supports RPCs
		compatibilityDate: "2025-08-04",
		modules: true,
		script: PLUGIN_SCRIPT,
		unsafeBindings: UNSAFE_BINDINGS(packageName, pluginName),
	};
	const mf = new Miniflare(opts);
	useDispose(mf);

	const res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe(
		'{"ok":true,"result":"some-value","meta":{"workersVersion":"0.0.1"}}'
	);
});
