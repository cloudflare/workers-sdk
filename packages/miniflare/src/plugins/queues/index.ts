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
	objectEntryWorker,
	Plugin,
	ProxyNodeBinding,
	RemoteProxyConnectionString,
	SERVICE_LOOPBACK,
} from "../shared";

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

export const QUEUES_PLUGIN: Plugin<typeof QueuesOptionsSchema> = {
	options: QueuesOptionsSchema,
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
		workerNames,
		queueProducers: allQueueProducers,
		queueConsumers: allQueueConsumers,
		unsafeStickyBlobs,
	}) {
		const queues = bindingEntries(options.queueProducers);
		if (queues.length === 0) return [];

		const services = queues.map<Service>(([_, id]) => ({
			name: `${SERVICE_QUEUE_PREFIX}:${id}`,
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
