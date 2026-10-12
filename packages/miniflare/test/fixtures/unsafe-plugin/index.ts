import {
	getMiniflareObjectBindings,
	kVoid,
	ProxyNodeBinding,
	SERVICE_LOOPBACK,
	SharedBindings,
} from "miniflare";
import type {
	MiniflareBinding,
	ParsedWorkerOptions,
	Plugin,
	Service,
	Worker_Binding,
} from "miniflare";

const MODULE_SCRIPTS = {
	DO_CLASS: "UnsafeBindingObject",
	get OBJECT_WORKER() {
		return `import { DurableObject } from 'cloudflare:workers'

export class ${this.DO_CLASS} extends DurableObject {
    async get(tag) {
        return await this.ctx.storage.get(tag);
    }

    async set(key, value) {
        await this.ctx.storage.put(key, value);
    }
}`;
	},
	get BINDING_WORKER() {
		return `import { WorkerEntrypoint } from "cloudflare:workers";
export class UnsafeBindingServiceEntrypoint extends WorkerEntrypoint {
    async performUnsafeWrite(key, value) {
        const objectNamespace = this.env.store;
        const namespaceId = JSON.stringify({});
        const id = objectNamespace.idFromName(namespaceId);
        const stub = objectNamespace.get(id);
        await stub.set(key, value);
        return {
            ok: true,
            result: "Wrote result",
            meta: {
                workersVersion: "0.0.1"
            }
        }
    }

    async performUnsafeRead(key) {
        const objectNamespace = this.env.store;
        const namespaceId = JSON.stringify({});
        const id = objectNamespace.idFromName(namespaceId);
        const stub = objectNamespace.get(id);
        const result = await stub.get(key);
        return {
            ok: true,
            result,
            meta: {
                workersVersion: "0.0.1"
            }
        }
    }
}
`;
	},
};

const UNSAFE_PLUGIN_NAME = "unsafe-plugin";

function isUnsafeBinding(
	binding: MiniflareBinding
): binding is Extract<MiniflareBinding, { type: `unsafe:${string}` }> {
	return binding.type.startsWith("unsafe:");
}

// Unsafe bindings live in `config.env` with an `unsafe:*` type and carry the
// plugin reference under `dev.plugin`. Select the ones targeting this plugin.
function getUnsafeBindings(config: ParsedWorkerOptions["config"]) {
	return Object.entries(config.env ?? {}).filter(
		([, binding]) =>
			isUnsafeBinding(binding) &&
			binding.dev?.plugin?.name === UNSAFE_PLUGIN_NAME
	);
}

export const plugins = {
	"unsafe-plugin": {
		getBindings(options) {
			return getUnsafeBindings(options.config).map<Worker_Binding>(
				([name]) => ({
					name,
					service: {
						name: `unsafe-plugin:${name}`,
						entrypoint: "UnsafeBindingServiceEntrypoint",
					},
				})
			);
		},
		getNodeBindings(options) {
			return Object.fromEntries(
				getUnsafeBindings(options.config).map(([name]) => [
					name,
					new ProxyNodeBinding(),
				])
			);
		},
		getServices({ options }) {
			const bindings = getUnsafeBindings(options.config);
			if (bindings.length === 0) {
				return [];
			}

			const bindingWorkers = bindings.map<Service>(([name, binding]) => ({
				name: `unsafe-plugin:${name}`,
				worker: {
					compatibilityDate: "2025-07-09",
					modules: [
						{
							name: "binding.worker.js",
							esModule: MODULE_SCRIPTS.BINDING_WORKER,
						},
					],
					bindings: [
						{
							name: "config",
							json: JSON.stringify({ name, ...binding }),
						},
						{
							name: "store",
							durableObjectNamespace: {
								className: MODULE_SCRIPTS.DO_CLASS,
								serviceName: "unsafe-plugin:object",
							},
						},
					],
				},
			}));

			return [
				...bindingWorkers,
				{
					name: "unsafe-plugin:object",
					worker: {
						compatibilityDate: "2025-07-09",
						modules: [
							{
								name: "object.worker.js",
								esModule: MODULE_SCRIPTS.OBJECT_WORKER,
							},
						],
						durableObjectNamespaces: [
							{
								className: MODULE_SCRIPTS.DO_CLASS,
								uniqueKey: `miniflare-unsafe-binding-UnsafeBindingObject`,
							},
						],
						durableObjectStorage: {
							inMemory: kVoid,
						},
						bindings: [
							{
								name: SharedBindings.MAYBE_SERVICE_LOOPBACK,
								service: { name: SERVICE_LOOPBACK },
							},
							...getMiniflareObjectBindings(),
						],
					},
				},
			];
		},
	} satisfies Plugin,
};
