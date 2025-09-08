import {
	getMiniflareObjectBindings,
	kVoid,
	Plugin,
	ProxyNodeBinding,
	Service,
	SERVICE_LOOPBACK,
	SharedBindings,
	Worker_Binding,
} from "miniflare";
import { z } from "miniflare:zod";

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

export const UnsafeServiceBindingOptionSchema = z.array(
	z.object({
		name: z.string(),
		type: z.string(),
		plugin: z.object({
			package: z.string(),
			name: z.string(),
		}),
		options: z.object({ emitLogs: z.boolean() }),
	})
);

export const plugins = {
	"unsafe-plugin": {
		options: UnsafeServiceBindingOptionSchema,
		getBindings(options) {
			return options.map<Worker_Binding>((binding) => {
				return {
					name: binding.name,
					service: {
						name: `unsafe-plugin:${binding.name}`,
						entrypoint: "UnsafeBindingServiceEntrypoint",
					},
				};
			});
		},
		getNodeBindings(options) {
			const configOptions = Object.entries(options);

			// If the user hasn't specified pre-determined mappings, we will skip adding any services
			if (!configOptions.length) {
				return {};
			}

			return Object.fromEntries(
				Object.keys(options).map((name) => [name, new ProxyNodeBinding()])
			);
		},
		getServices({ options, unsafeStickyBlobs }) {
			if (options.length === 0) {
				return [];
			}

			const bindingWorkers = options.map<Service>((config) => ({
				name: `unsafe-plugin:${config.name}`,
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
							json: JSON.stringify(config),
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
							...getMiniflareObjectBindings(unsafeStickyBlobs),
						],
					},
				},
			];
		},
	} satisfies Plugin<typeof UnsafeServiceBindingOptionSchema>,
};
