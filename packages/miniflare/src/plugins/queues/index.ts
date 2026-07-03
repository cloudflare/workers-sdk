import SCRIPT_QUEUE_BROKER_OBJECT from "worker:queues/broker";
import SCRIPT_QUEUE_FORWARDER from "worker:queues/forwarder";
import { z } from "zod";
import { kVoid } from "../../runtime";
import {
	QueueBindings,
	QueueConsumerOptionsSchema,
	QueueProducerOptionsSchema,
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
	Worker,
	Worker_Binding,
	Worker_Binding_DurableObjectNamespaceDesignator,
} from "../../runtime";
import type { Plugin, RemoteProxyConnectionString } from "../shared";

export const QueuesOptionsSchema = z.object({
	queueProducers: z
		.union([
			z.record(
				QueueProducerOptionsSchema.merge(
					z.object({
						remoteProxyConnectionString: z
							.custom<RemoteProxyConnectionString>()
							.optional(),
					})
				)
			),
			z.string().array(),
			z.record(z.string()),
		])
		.optional(),
	queueConsumers: z
		.union([z.record(QueueConsumerOptionsSchema), z.string().array()])
		.optional(),
});

export const QUEUES_PLUGIN_NAME = "queues";
const SERVICE_QUEUE_PREFIX = `${QUEUES_PLUGIN_NAME}:queue`;
const QUEUE_BROKER_OBJECT_CLASS_NAME = "QueueBrokerObject";
const QUEUE_BROKER_OBJECT: Worker_Binding_DurableObjectNamespaceDesignator = {
	serviceName: SERVICE_QUEUE_PREFIX,
	className: QUEUE_BROKER_OBJECT_CLASS_NAME,
};

// The workerd service name backing a single queue: its local broker, or its
// forwarder when the consumer runs in another process. Producers in other
// Miniflare instances resolve the consumer's broker by this exact name through
// the dev registry, so it must be derived in one place rather than reconstructed
// at each call site.
export function getQueueServiceName(queueId: string): string {
	return `${SERVICE_QUEUE_PREFIX}:${queueId}`;
}

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
		queueProducersToForward,
		unsafeStickyBlobs,
	}) {
		const produced = bindingEntries(options.queueProducers);
		const consumed = namespaceKeys(options.queueConsumers);

		// Decide, per queue id, between an in-process broker and a forwarder.
		// A queue produced here whose consumer lives in another `wrangler dev`
		// process (no local consumer) is forwarded across the dev registry.
		// Everything else is brokered locally, including queues consumed here
		// without a local producer.
		const services: Service[] = [];
		const localBrokerIds = new Set<string>();
		for (const [, id] of produced) {
			if (queueProducersToForward.has(id)) {
				const serviceName = getQueueServiceName(id);
				services.push({
					name: serviceName,
					worker: queueForwarderWorker(serviceName),
				});
			} else {
				localBrokerIds.add(id);
			}
		}
		for (const id of consumed) {
			localBrokerIds.add(id);
		}

		for (const id of localBrokerIds) {
			services.push({
				name: getQueueServiceName(id),
				worker: objectEntryWorker(QUEUE_BROKER_OBJECT, id),
			});
		}

		// The shared broker Durable Object is only needed when something is
		// brokered locally; a forwarder-only worker (or no queues at all) doesn't
		// reference it.
		if (localBrokerIds.size === 0) {
			return services;
		}

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

// Builds the worker that stands in for `queues:queue:<id>` in a producer's
// process when the queue's consumer runs in another `wrangler dev` process.
// It forwards the native producer's HTTP request to the remote queue's broker
// via the dev-registry proxy's `ExternalServiceProxy` entrypoint.
function queueForwarderWorker(queueServiceName: string): Worker {
	return {
		compatibilityDate: "2023-07-24",
		modules: [
			{ name: "forwarder.worker.js", esModule: SCRIPT_QUEUE_FORWARDER() },
		],
		bindings: [
			{
				name: "OUTBOUND",
				service: {
					name: getUserServiceName(SERVICE_DEV_REGISTRY_PROXY),
					entrypoint: "ExternalServiceProxy",
					props: {
						json: JSON.stringify({
							service: queueServiceName,
							entrypoint: null,
						}),
					},
				},
			},
			// Lets the forwarder name the queue in dropped-message diagnostics.
			{ name: "QUEUE_SERVICE", text: queueServiceName },
		],
	};
}

export * from "./errors";
