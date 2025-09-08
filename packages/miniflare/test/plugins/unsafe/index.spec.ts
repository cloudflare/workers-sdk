import path from "path";
import test from "ava";
import {
	Miniflare,
	MiniflareCoreError,
	MiniflareOptions,
	WorkerOptions,
} from "miniflare";
import { EXPORTED_FIXTURES, FIXTURES_PATH } from "../../test-shared";

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
		console.log(env)
		const writeRes = await env.UNSAFE_BINDING.performUnsafeWrite("some-key", "some-value");
		if (!writeRes.ok) {
			return Response.json(writeRes, { status: 500 })
		}
		const res = await env.UNSAFE_BINDING.performUnsafeRead("some-key");
		return Response.json(res)
	}
}
`;

test("A plugin that does not expose `plugins` will cause an error to be thrown", async (t) => {
	const badPluginDir = path.resolve(FIXTURES_PATH, "unsafe-plugin-bad");
	const [packageName, pluginName] = [
		`${badPluginDir}/no-export.cjs`,
		"unsafe-plugin",
	];
	const opts: MiniflareOptions = {
		name: "unsafe-plugin-worker",
		// Use a compatability date that supports RPCs
		compatibilityDate: "2025-08-04",
		modules: true,
		script: PLUGIN_SCRIPT,
		unsafeBindings: UNSAFE_BINDINGS(packageName, pluginName),
	};
	const mf = new Miniflare({ modules: true, script: "" });
	t.teardown(() => mf.dispose());

	await t.throwsAsync(mf.setOptions(opts), {
		instanceOf: MiniflareCoreError,
		code: "ERR_PLUGIN_LOADING_FAILED",
	});
});

test("A plugin that exposes a non-object `plugins` export will cause an error to be thrown", async (t) => {
	const badPluginDir = path.resolve(FIXTURES_PATH, "unsafe-plugin-bad");
	const [packageName, pluginName] = [
		`${badPluginDir}/not-function.cjs`,
		"unsafe-plugin",
	];
	const opts: MiniflareOptions = {
		name: "unsafe-plugin-worker",
		// Use a compatability date that supports RPCs
		compatibilityDate: "2025-08-04",
		modules: true,
		script: PLUGIN_SCRIPT,
		unsafeBindings: UNSAFE_BINDINGS(packageName, pluginName),
	};
	const mf = new Miniflare({ modules: true, script: "" });
	t.teardown(() => mf.dispose());

	await t.throwsAsync(mf.setOptions(opts), {
		instanceOf: MiniflareCoreError,
		code: "ERR_PLUGIN_LOADING_FAILED",
	});
});

test("Supports specifying an unsafe plugin will be loaded into Miniflare and will be usable in local dev", async (t) => {
	const [packageName, pluginName] = [pluginEntrypoint, "unsafe-plugin"];
	const opts: MiniflareOptions = {
		name: "unsafe-plugin-worker",
		// Use a compatability date that supports RPCs
		compatibilityDate: "2025-08-04",
		modules: true,
		script: PLUGIN_SCRIPT,
		unsafeBindings: UNSAFE_BINDINGS(packageName, pluginName),
	};
	const mf = new Miniflare(opts);
	t.teardown(() => mf.dispose());

	const res = await mf.dispatchFetch("http://localhost");
	t.is(
		await res.text(),
		'{"ok":true,"result":"some-value","meta":{"workersVersion":"0.0.1"}}'
	);
});
