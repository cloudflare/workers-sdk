import SCRIPT_QUEUE_BROKER_OBJECT from "worker:queues/broker";
import { z } from "zod";
import { kVoid } from "../../runtime";
import {
	getQueueServiceName,
	QueueBindings,
	QueueConsumerOptionsSchema,
	QueueProducerOptionsSchema,
	SERVICE_QUEUE_PREFIX,
	SharedBindings,
} from "../../workers";
import { getUserServiceName } from "../core";
import {
	getMiniflareObjectBindings,
	namespaceKeys,
	objectEntryWorker,
	ProxyNodeBinding,
	SERVICE_DEV_REGISTRY_PROXY,
	SERVICE_LOOPBACK,
} from "../shared";
import type {
	Service,
	Worker_Binding,
	Worker_Binding_DurableObjectNamespaceDesignator,
} from "../../runtime";
import type { Plugin, RemoteProxyConnectionString } from "../shared";

export const QueuesOptionsSchema = z.object({
	queueProducers: z
		.union([
			z.record(
				z.string(),
				QueueProducerOptionsSchema.extend({
					remoteProxyConnectionString: z
						.custom<RemoteProxyConnectionString>()
						.optional(),
				})
			),
			z.string().array(),
			z.record(z.string(), z.string()),
		])
		.optional(),
	queueConsumers: z
		.union([
			z.record(z.string(), QueueConsumerOptionsSchema),
			z.string().array(),
		])
		.optional(),
});

export const QUEUES_PLUGIN_NAME = "queues";
const QUEUE_BROKER_OBJECT_CLASS_NAME = "QueueBrokerObject";
const QUEUE_BROKER_OBJECT: Worker_Binding_DurableObjectNamespaceDesignator = {
	serviceName: SERVICE_QUEUE_PREFIX,
	className: QUEUE_BROKER_OBJECT_CLASS_NAME,
};

export const QUEUES_PLUGIN: Plugin<typeof QueuesOptionsSchema> = {
	options: QueuesOptionsSchema,
	bindingTypeDescription: "Queue producer",
	getBindings(options) {
		const queues = bindingEntries(options.queueProducers);
		return queues.map<Worker_Binding>(([name, id]) => ({
			name,
			queue: { name: getQueueServiceName(id) },
		}));
	},
	getNodeBindings(options) {
		const queues = namespaceKeys(options.queueProducers);
		return Object.fromEntries(
			queues.map((name) => [name, new ProxyNodeBinding()])
		);
	},
	async getServices({
		options,
		workerNames,
		queueProducers: allQueueProducers,
		queueConsumers: allQueueConsumers,
		devRegistryEnabled,
		unsafeStickyBlobs,
	}) {
		const produced = bindingEntries(options.queueProducers).map(([, id]) => id);
		// Consumed queues get a broker service even without a local producer so
		// producers in other dev sessions can reach this process's broker through
		// the dev registry's debug port.
		const consumed = namespaceKeys(options.queueConsumers);
		const queueIds = new Set([...produced, ...consumed]);
		if (queueIds.size === 0) return [];

		const services = Array.from(queueIds).map<Service>((id) => ({
			name: getQueueServiceName(id),
			worker: objectEntryWorker(QUEUE_BROKER_OBJECT, id),
		}));

		const uniqueKey = `miniflare-${QUEUE_BROKER_OBJECT_CLASS_NAME}`;
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
				// Miniflare's Queue broker is in-memory only at the moment
				durableObjectStorage: { inMemory: kVoid },
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
					// When the dev registry is enabled, a produced queue's consumer may
					// live in another dev session: the broker delivers otherwise-dropped
					// messages through the dev-registry proxy (see
					// `QueueBrokerObject.#tryRemoteConsumer`).
					...(devRegistryEnabled
						? [
								{
									name: QueueBindings.MAYBE_SERVICE_QUEUE_PROXY,
									service: {
										name: getUserServiceName(SERVICE_DEV_REGISTRY_PROXY),
										entrypoint: "ExternalQueueProxy",
									},
								},
							]
						: []),
				],
			},
		};
		services.push(objectService);

		return services;
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

export * from "./errors";
