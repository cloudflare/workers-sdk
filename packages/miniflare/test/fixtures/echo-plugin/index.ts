import { ProxyNodeBinding } from "miniflare";
import type { ParsedWorkerOptions, Plugin, Worker_Binding } from "miniflare";

// Module implementing the wrapped binding. It exposes an `asyncIdentity` method
// that echoes back its arguments, allowing tests to exercise the proxy client's
// serialisation of `ReadableStream`/`Blob`/`File` arguments across the
// Node.js <-> workerd boundary.
//
// The `.pipeThrough(new TransformStream())` is required: without it we'd see
// `TypeError: Inter-TransformStream ReadableStream.pipeTo() is not implemented`
// when echoing a `ReadableStream` back. `IdentityTransformStream` doesn't work
// here.
const ECHO_MODULE_NAME = "cloudflare-internal:echo-plugin:module";
const ECHO_MODULE = /* javascript */ `
class Identity {
	async asyncIdentity(...args) {
		const i = args.findIndex((arg) => arg instanceof ReadableStream);
		if (i !== -1) args[i] = args[i].pipeThrough(new TransformStream());
		return args;
	}
}
export default function () {
	return new Identity();
}
`;

const ECHO_PLUGIN_NAME = "echo-plugin";

// Unsafe bindings live in `config.env` with an `unsafe:*` type and carry the
// plugin reference under `dev.plugin`. Select the ones targeting this plugin.
function getEchoBindings(config: ParsedWorkerOptions["config"]) {
	return Object.entries(config.env ?? {}).filter(
		([, binding]) =>
			"dev" in binding && binding.dev?.plugin?.name === ECHO_PLUGIN_NAME
	);
}

export const plugins = {
	"echo-plugin": {
		getBindings(options) {
			return getEchoBindings(options.config).map<Worker_Binding>(([name]) => ({
				name,
				wrapped: {
					moduleName: ECHO_MODULE_NAME,
					innerBindings: [],
				},
			}));
		},
		getNodeBindings(options) {
			return Object.fromEntries(
				getEchoBindings(options.config).map(([name]) => [
					name,
					new ProxyNodeBinding(),
				])
			);
		},
		getServices() {
			return [];
		},
		getExtensions({ options }) {
			const hasEchoBinding = options.some(
				(workerOptions) => getEchoBindings(workerOptions.config).length > 0
			);
			if (!hasEchoBinding) {
				return [];
			}
			return [
				{
					modules: [
						{
							name: ECHO_MODULE_NAME,
							esModule: ECHO_MODULE,
							internal: true,
						},
					],
				},
			];
		},
	} satisfies Plugin,
};
