import fs from "fs/promises";
import path from "path";
import SCRIPT_QUEUE_BROKER_OBJECT from "worker:queues/broker";
import { z } from "zod";
import {
	kVoid,
	Service,
	Worker_Binding,
	Worker_Binding_DurableObjectNamespaceDesignator,
} from "../../runtime";
import {
	QueueBindings,
	QueueConsumerOptionsSchema,
	QueueProducerOptionsSchema,
	SharedBindings,
} from "../../workers";
import { getUserServiceName } from "../core";
import {
	getMiniflareObjectBindings,
	getPersistPath,
	objectEntryWorker,
	PersistenceSchema,
	Plugin,
	ProxyNodeBinding,
	SERVICE_LOOPBACK,
} from "../shared";
import {
	QUEUE_BROKER_OBJECT_CLASS_NAME,
	QUEUES_PLUGIN_NAME,
	QUEUES_STORAGE_SERVICE_NAME,
	SERVICE_QUEUE_PREFIX,
} from "./constants";

export const QueuesOptionsSchema = z.object({
	queueProducers: z
		.union([
			z.record(QueueProducerOptionsSchema),
			z.string().array(),
			z.record(z.string()),
		])
		.optional(),
	queueConsumers: z
		.union([z.record(QueueConsumerOptionsSchema), z.string().array()])
		.optional(),
});

export const QueuesSharedOptionsSchema = z.object({
	queuesPersist: PersistenceSchema,
});

const QUEUE_BROKER_OBJECT: Worker_Binding_DurableObjectNamespaceDesignator = {
	serviceName: SERVICE_QUEUE_PREFIX,
	className: QUEUE_BROKER_OBJECT_CLASS_NAME,
};

export const QUEUES_PLUGIN: Plugin<
	typeof QueuesOptionsSchema,
	typeof QueuesSharedOptionsSchema
> = {
	options: QueuesOptionsSchema,
	sharedOptions: QueuesSharedOptionsSchema,
	getBindings(options) {
		const queues = bindingEntries(options.queueProducers);
		return queues.map<Worker_Binding>(([name, id]) => ({
			name,
			queue: { name: `${SERVICE_QUEUE_PREFIX}:${id}` },
		}));
	},
	getNodeBindings(options) {
		const queues = bindingKeys(options.queueProducers);
		return Object.fromEntries(
			queues.map((name) => [name, new ProxyNodeBinding()])
		);
	},
	async getServices({
		options,
		sharedOptions,
		workerNames,
		queueProducers: allQueueProducers,
		queueConsumers: allQueueConsumers,
		unsafeStickyBlobs,
		tmpPath,
	}) {
		const queues = bindingEntries(options.queueProducers);
		if (queues.length === 0) return [];

		const services = queues.map<Service>(([_, id]) => ({
			name: `${SERVICE_QUEUE_PREFIX}:${id}`,
			worker: objectEntryWorker(QUEUE_BROKER_OBJECT, id),
		}));

		const uniqueKey = `miniflare-${QUEUE_BROKER_OBJECT_CLASS_NAME}`;
		const storagePath =
			sharedOptions?.queuesPersist === false
				? undefined
				: this.getPersistPath?.(sharedOptions, tmpPath);
		const objectService: Service = {
			name: SERVICE_QUEUE_PREFIX,
			worker: {
				compatibilityDate: "2023-07-24",
				compatibilityFlags: [
					"nodejs_compat",
					"experimental",
					"service_binding_extra_handlers",
				],
				modules: [
					{ name: "broker.worker.js", esModule: SCRIPT_QUEUE_BROKER_OBJECT() },
				],
				durableObjectNamespaces: [
					{
						className: QUEUE_BROKER_OBJECT_CLASS_NAME,
						uniqueKey,
						preventEviction: true,
					},
				],
				durableObjectStorage: storagePath
					? { localDisk: QUEUES_STORAGE_SERVICE_NAME }
					: { inMemory: kVoid },
				bindings: [
					{
						name: SharedBindings.MAYBE_SERVICE_LOOPBACK,
						service: { name: SERVICE_LOOPBACK },
					},
					...getMiniflareObjectBindings(unsafeStickyBlobs),
					{
						name: SharedBindings.DURABLE_OBJECT_NAMESPACE_OBJECT,
						durableObjectNamespace: {
							className: QUEUE_BROKER_OBJECT_CLASS_NAME,
						},
					},
					{
						name: QueueBindings.MAYBE_JSON_QUEUE_PRODUCERS,
						json: JSON.stringify(Object.fromEntries(allQueueProducers)),
					},
					{
						name: QueueBindings.MAYBE_JSON_QUEUE_CONSUMERS,
						json: JSON.stringify(Object.fromEntries(allQueueConsumers)),
					},
					...workerNames.map((name) => ({
						name: QueueBindings.SERVICE_WORKER_PREFIX + name,
						service: { name: getUserServiceName(name) },
					})),
				],
			},
		};
		services.push(objectService);

		// Add storage service if using local disk
		if (storagePath) {
			// Create the storage directory if it doesn't exist
			await fs.mkdir(path.dirname(storagePath), { recursive: true });
			await fs.mkdir(storagePath, { recursive: true });
			const storageService: Service = {
				name: QUEUES_STORAGE_SERVICE_NAME,
				disk: { path: storagePath, writable: true },
			};
			services.push(storageService);
		}

		return services;
	},

	getPersistPath({ queuesPersist }, tmpPath) {
		return getPersistPath(QUEUES_PLUGIN_NAME, tmpPath, queuesPersist);
	},
};

function bindingEntries(
	namespaces?:
		| Record<string, { queueName: string; deliveryDelay?: number }>
		| string[]
		| Record<string, string>
): [bindingName: string, id: string][] {
	if (Array.isArray(namespaces)) {
		return namespaces.map((bindingName) => [bindingName, bindingName]);
	} else if (namespaces !== undefined) {
		return Object.entries(namespaces).map(([name, opts]) => [
			name,
			typeof opts === "string" ? opts : opts.queueName,
		]);
	} else {
		return [];
	}
}

function bindingKeys(
	namespaces?:
		| Record<string, { queueName: string; deliveryDelay?: number }>
		| string[]
		| Record<string, string>
): string[] {
	if (Array.isArray(namespaces)) {
		return namespaces;
	} else if (namespaces !== undefined) {
		return Object.keys(namespaces);
	} else {
		return [];
	}
}

export * from "./errors";
export { QUEUES_PLUGIN_NAME } from "./constants";
