import { stringify } from "devalue";
import semiver from "semiver";
import { z } from "zod";
import { Service, Worker_Binding } from "../../runtime";
import { maybeApply } from "../../shared";
import {
	Plugin,
	QueueConsumerOptionsSchema,
	namespaceEntries,
	pluginNamespacePersistWorker,
} from "../shared";
import { QueuesError } from "./errors";
import { QueuesGateway } from "./gateway";
import { QueuesRouter } from "./router";

export const QueuesOptionsSchema = z.object({
	queueProducers: z
		.union([z.record(z.string()), z.string().array()])
		.optional(),
	queueConsumers: z
		.union([z.record(QueueConsumerOptionsSchema), z.string().array()])
		.optional(),
});

// workerd uses V8 serialisation version 15 when sending messages:
// https://github.com/cloudflare/workerd/blob/575eba6747054fb810f8a8138c2bf04b22339f77/src/workerd/api/queue.c%2B%2B#L17
// This is only supported by V8 versions 10.0.29 and above:
// https://github.com/v8/v8/commit/fc23bc1de29f415f5e3bc080055b67fb3ea19c53.
//
// For reference, the V8 versions associated with notable Node versions are:
// - Miniflare's minimum supported version: Node 16.13.0 --> V8 9.4
// - Last Node 17/unsupported version:      Node 17.9.1  --> V8 9.6
// - First supported version:               Node 18.0.0  --> V8 10.1
//
// See also https://github.com/nodejs/node/issues/42192.
/** @internal */
export const _QUEUES_COMPATIBLE_V8_VERSION =
	semiver(process.versions.v8, "10.0.29") >= 0;

function assertCompatibleV8Version() {
	if (!_QUEUES_COMPATIBLE_V8_VERSION) {
		throw new QueuesError(
			"ERR_V8_UNSUPPORTED",
			"The version of V8 bundled with this version of Node.js does not support Queues. " +
				"Please upgrade to the latest Node.js LTS release."
		);
	}
}

export const QUEUES_PLUGIN_NAME = "queues";
export const QUEUES_PLUGIN: Plugin<
	typeof QueuesOptionsSchema,
	undefined,
	QueuesGateway
> = {
	gateway: QueuesGateway,
	router: QueuesRouter,
	options: QueuesOptionsSchema,
	getBindings(options) {
		const queues = namespaceEntries(options.queueProducers);

		const hasProducers = queues.length > 0;
		const hasConsumers = Object.keys(options.queueConsumers ?? {}).length > 0;
		if (hasProducers || hasConsumers) assertCompatibleV8Version();

		return queues.map<Worker_Binding>(([name, id]) => ({
			name,
			queue: { name: `${QUEUES_PLUGIN_NAME}:${id}` },
		}));
	},
	async getServices({ options, queueConsumers: allQueueConsumers }) {
		const buckets = namespaceEntries(options.queueProducers);
		if (buckets.length === 0) return [];
		return buckets.map<Service>(([_, id]) => {
			// Abusing persistence to store queue consumer. We don't support
			// persisting queued data yet, but we are essentially persisting messages
			// to a consumer. We'll unwrap this in the router as usual. Note we're
			// using `devalue` here as `consumer` may contain cycles, if a dead-letter
			// queue references itself or another queue that references the same
			// dead-letter queue.
			const consumer = allQueueConsumers.get(id);
			const persist = maybeApply(stringify, consumer);
			return {
				name: `${QUEUES_PLUGIN_NAME}:${id}`,
				worker: pluginNamespacePersistWorker(
					QUEUES_PLUGIN_NAME,
					encodeURIComponent(id),
					persist
				),
			};
		});
	},
};

export * from "./errors";
export * from "./gateway";
