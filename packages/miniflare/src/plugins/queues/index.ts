import SCRIPT_QUEUE_BROKER_OBJECT from "worker:queues/broker";
import { kVoid } from "../../runtime";
import {
	getQueueServiceName,
	QueueBindings,
	SERVICE_QUEUE_PREFIX,
	SharedBindings,
} from "../../workers";
import { getUserServiceName } from "../core";
import {
	getEnvBindingsOfType,
	getMiniflareObjectBindings,
	getTriggersOfType,
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
import type { ParsedWorkerOptions } from "../../config/schema";
import type { Plugin } from "../shared";

export const QUEUES_PLUGIN_NAME = "queues";
const QUEUE_BROKER_OBJECT_CLASS_NAME = "QueueBrokerObject";
const QUEUE_BROKER_OBJECT: Worker_Binding_DurableObjectNamespaceDesignator = {
	serviceName: SERVICE_QUEUE_PREFIX,
	className: QUEUE_BROKER_OBJECT_CLASS_NAME,
};

export const QUEUES_PLUGIN: Plugin = {
	bindingTypeDescription: "Queue producer",
	getBindings(options) {
		return producerEntries(options).map<Worker_Binding>(([name, id]) => ({
			name,
			queue: { name: getQueueServiceName(id) },
		}));
	},
	getNodeBindings(options) {
		return Object.fromEntries(
			producerEntries(options).map(([name]) => [name, new ProxyNodeBinding()])
		);
	},
	async getServices({
		options,
		workerNames,
		queueProducers: allQueueProducers,
		queueConsumers: allQueueConsumers,
		devRegistryEnabled,
	}) {
		const produced = producerEntries(options).map(([, id]) => id);
		// Consumed queues get a broker service even without a local producer so
		// producers in other dev sessions can reach this process's broker through
		// the dev registry's debug port.
		const consumed = getTriggersOfType(options.config, "queue").map(
			(trigger) => trigger.name
		);
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
					...getMiniflareObjectBindings(),
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

function producerEntries(
	options: ParsedWorkerOptions
): [bindingName: string, id: string][] {
	return getEnvBindingsOfType(options.config, "queue").map(
		([bindingName, binding]) => [bindingName, binding.name ?? bindingName]
	);
}

export * from "./errors";
