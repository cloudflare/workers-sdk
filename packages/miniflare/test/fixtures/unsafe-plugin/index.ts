import { z } from 'miniflare:zod'
import { SharedBindings, ProxyNodeBinding, kVoid, SERVICE_LOOPBACK, PluginBase, getMiniflareObjectBindings, getPersistPath, Service, Worker_Binding, } from 'miniflare'

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
}`
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
`
    }
}

const PluginOptionSchema = z.record(
    z.string(),
    z.object({
        foo: z.string()
    })
)
type PluginOption = typeof PluginOptionSchema

const SharedOptionsSchema = z.undefined()
type SharedPluginOption = typeof SharedOptionsSchema


type PluginCreator = (pluginName: string, bindingName: string) => Record<string, PluginBase<PluginOption, SharedPluginOption>>

const createMiniflarePlugin: PluginCreator = (pluginName, bindingName) => {
    const objectServiceName = `${pluginName}:object`;
    const boundServiceName = `${pluginName}:${bindingName}`;
    return {
        [pluginName]: {
            options: PluginOptionSchema,
            sharedOptions: SharedOptionsSchema,
            getBindings(options) {
                const configOptions = Object.entries(options);

                // If the user hasn't specified pre-determined mappings, we will skip adding any services
                if (!configOptions.length) {
                    return []
                }
                return configOptions.map<Worker_Binding>(
                    ([bindingName, config]) => {
                        return {
                            name: bindingName,
                            service: {
                                name: boundServiceName,
                                entrypoint: "UnsafeBindingServiceEntrypoint",
                            }
                        }
                    }
                )
            },
            getNodeBindings(options) {
                const configOptions = Object.entries(options);

                // If the user hasn't specified pre-determined mappings, we will skip adding any services
                if (!configOptions.length) {
                    return {}
                }

                return Object.fromEntries(
                    Object.keys(options).map((name) => [
                        name,
                        new ProxyNodeBinding(),
                    ])
                );
            },
            getServices({
                options,
                unsafeStickyBlobs,
                tmpPath,
                defaultPersistRoot,
            }) {
                const configOptions = Object.values(options)
                if (configOptions.length === 0) {
                    return []
                }
                const persistPath = getPersistPath(
                    pluginName,
                    tmpPath,
                    defaultPersistRoot,
                    undefined
                );

                const bindingWorkers = configOptions.map<Service>((config) => ({

                    name: boundServiceName,
                    worker: {
                        compatibilityDate: "2025-07-09",
                        modules: [
                            {
                                name: "binding.worker.js",
                                esModule: MODULE_SCRIPTS.BINDING_WORKER,
                            }
                        ],
                        bindings: [
                            {
                                name: "config",
                                json: JSON.stringify(config)
                            },
                            {
                                name: "store",
                                durableObjectNamespace: {
                                    className: MODULE_SCRIPTS.DO_CLASS,
                                    serviceName: objectServiceName,
                                }
                            }
                        ]
                    },
                }))

                return [
                    ...bindingWorkers,
                    {
                        name: objectServiceName,
                        worker: {
                            compatibilityDate: "2025-07-09",
                            modules: [
                                {
                                    name: "object.worker.js",
                                    esModule: MODULE_SCRIPTS.OBJECT_WORKER,
                                }
                            ],
                            durableObjectNamespaces: [
                                {
                                    className: MODULE_SCRIPTS.DO_CLASS,
                                    uniqueKey: `miniflare-unsafe-binding-UnsafeBindingObject`,
                                }
                            ],
                            durableObjectStorage: {
                                inMemory: kVoid,
                            },
                            bindings: [
                                {
                                    name: SharedBindings.MAYBE_SERVICE_LOOPBACK,
                                    service: { name: SERVICE_LOOPBACK }
                                },
                                ...getMiniflareObjectBindings(unsafeStickyBlobs),
                            ]
                        },
                    },
                ]
            }
        }
    }
}

export function registerMiniflarePlugins() {
    return createMiniflarePlugin('unsafe-plugin', 'UNSAFE_BINDING')
}