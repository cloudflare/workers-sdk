import { ProxyNodeBinding } from "miniflare";
import { z } from "miniflare:zod";
import type { Plugin, Worker_Binding } from "miniflare";

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

export const EchoBindingOptionSchema = z.array(
	z.object({
		name: z.string(),
		type: z.string(),
		plugin: z.object({
			package: z.string(),
			name: z.string(),
		}),
		options: z.record(z.string(), z.unknown()),
	})
);

export const plugins = {
	"echo-plugin": {
		options: EchoBindingOptionSchema,
		getBindings(options) {
			return options.map<Worker_Binding>((binding) => ({
				name: binding.name,
				wrapped: {
					moduleName: ECHO_MODULE_NAME,
					innerBindings: [],
				},
			}));
		},
		getNodeBindings(options) {
			return Object.fromEntries(
				options.map((binding) => [binding.name, new ProxyNodeBinding()])
			);
		},
		getServices() {
			return [];
		},
		getExtensions({ options }) {
			if (!options.some((bindings) => bindings.length > 0)) {
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
	} satisfies Plugin<typeof EchoBindingOptionSchema>,
};
