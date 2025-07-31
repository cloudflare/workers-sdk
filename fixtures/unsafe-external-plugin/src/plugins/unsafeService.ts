import fs from "node:fs/promises";
import { z } from "miniflare-shared";
import type { Service, Worker_Binding } from "miniflare";
import {
    SharedBindings,
    getMiniflareObjectBindings,
    getPersistPath,
    Plugin,
    ProxyNodeBinding,
    SERVICE_LOOPBACK,
} from "miniflare";
import OBJECT_WORKER from 'worker:object.worker'
import BINDING_WORKER from 'worker:binding.worker'


export const UNSAFE_PLUGIN_NAME = 'unsafe-plugin'

/**
 * Options for the unsafe plugin. It takes a map of binding names to options for that specific binding
 */
export const UnsafeServiceBindingOption = z.record(
    z.string(),
    z.object({
        emitLogs: z.boolean()
    })
)
export type UnsafeServiceBindingOption = typeof UnsafeServiceBindingOption


export const UnsafeServiceBindingSharedOptions = z.undefined()
export type UnsafeServiceBindingSharedOption = typeof UnsafeServiceBindingSharedOptions

export const UNSAFE_SERVICE_PLUGIN: Plugin<
    typeof UnsafeServiceBindingOption,
    typeof UnsafeServiceBindingSharedOptions
> = {
    options: UnsafeServiceBindingOption,
    sharedOptions: UnsafeServiceBindingSharedOptions,
    /**
     * getBindings will add bindings to the user's Workers. Specifically, we add a service
     * that will expose an `UnsafeBindingServiceEntrypoint`
     * @param options
     * @returns
     */
    async getBindings(options) {
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
                        name: `${UNSAFE_PLUGIN_NAME}:${bindingName}`,
                        entrypoint: "UnsafeBindingServiceEntrypoint",
                    }
                }
            }
        )
    },
    getNodeBindings(options: z.infer<typeof UnsafeServiceBindingOption>) {
        if (!options?.accountConverters) {
            return {};
        }
        return Object.fromEntries(
            Object.keys(options.accountConverters).map((name) => [
                name,
                new ProxyNodeBinding(),
            ])
        );
    },
    async getServices({
        options,
        tmpPath,
        defaultPersistRoot,
        unsafeStickyBlobs,
    }) {

        const configOptions = Object.entries(options);
        if (configOptions.length === 0) {
            return []
        }

        const persistPath = getPersistPath(
            UNSAFE_PLUGIN_NAME,
            tmpPath,
            defaultPersistRoot,
            undefined,
        );

        await fs.mkdir(persistPath, { recursive: true });

        // Create a service that will persist any data
        const storageService = {
            name: `${UNSAFE_PLUGIN_NAME}:storage`,
            disk: { path: persistPath, writable: true },
        } satisfies Service;

        const objectService = {
            name: `${UNSAFE_PLUGIN_NAME}:object`,
            worker: {
                compatibilityDate: "2025-01-01",
                modules: [
                    {
                        name: "object.worker.js",
                        esModule: OBJECT_WORKER(),
                    },
                ],
                durableObjectNamespaces: [
                    {
                        className: "UnsafeBindingObject",
                        uniqueKey: `miniflare-unsafe-binding-UnsafeBindingObject`,
                    },
                ],
                // Store Durable Object SQL databases in persist path
                durableObjectStorage: { localDisk: storageService.name },
                // Bind blob disk directory service to object
                bindings: [
                    {
                        name: SharedBindings.MAYBE_SERVICE_BLOBS,
                        service: { name: storageService.name },
                    },
                    {
                        name: SharedBindings.MAYBE_SERVICE_LOOPBACK,
                        service: { name: SERVICE_LOOPBACK },
                    },
                    ...getMiniflareObjectBindings(unsafeStickyBlobs),
                ],
            },
        } satisfies Service;

        const bindingWorker = configOptions.map<Service>(([bindingName, config]) => ({
            name: `${UNSAFE_PLUGIN_NAME}:${bindingName}`,
            worker: {
                compatibilityDate: "2025-01-01",
                modules: [
                    {
                        name: "binding.worker.js",
                        esModule: BINDING_WORKER(),
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
                            className: "UnsafeBindingObject",
                            serviceName: objectService.name,
                        },
                    },
                ],
            },
        } satisfies Service));

        return [...bindingWorker, storageService, objectService];
    },
};
