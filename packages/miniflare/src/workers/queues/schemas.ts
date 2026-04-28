import { Base64DataSchema, z } from "miniflare:zod";

export const QueueMessageDelaySchema = z
	.number()
	.int()
	.min(0)
	.max(86400)
	.optional();

export const QueueProducerOptionsSchema = /* @__PURE__ */ z.object({
	// https://developers.cloudflare.com/queues/platform/configuration/#producer
	queueName: z.string(),
	deliveryDelay: QueueMessageDelaySchema,
});

export const QueueProducerSchema = /* @__PURE__ */ z.intersection(
	QueueProducerOptionsSchema,
	z.object({ workerName: z.string() })
);
export type QueueProducer = z.infer<typeof QueueProducerSchema>;
export const QueueProducersSchema =
	/* @__PURE__ */ z.record(QueueProducerSchema);

export const QueueConsumerOptionsSchema = /* @__PURE__ */ z
	.object({
		// https://developers.cloudflare.com/queues/platform/configuration/#consumer
		// https://developers.cloudflare.com/queues/platform/limits/
		maxBatchSize: z.number().min(0).max(100).optional(),
		maxBatchTimeout: z.number().min(0).max(60).optional(), // seconds
		maxRetires: z.number().min(0).max(100).optional(), // deprecated
		maxRetries: z.number().min(0).max(100).optional(),
		deadLetterQueue: z.ostring(),
		retryDelay: QueueMessageDelaySchema,
	})
	.transform((queue) => {
		if (queue.maxRetires !== undefined) {
			queue.maxRetries = queue.maxRetires;
		}

		return queue as Omit<typeof queue, "maxRetires">;
	});
export const QueueConsumerSchema = /* @__PURE__ */ z.intersection(
	QueueConsumerOptionsSchema,
	z.object({ workerName: z.string() })
);
export type QueueConsumer = z.infer<typeof QueueConsumerSchema>;
// Maps queue names to the Worker that wishes to consume it. Note each queue
// can only be consumed by one Worker, but one Worker may consume multiple
// queues. Support for multiple consumers of a single queue is not planned
// anytime soon.
export const QueueConsumersSchema =
	/* @__PURE__ */ z.record(QueueConsumerSchema);

export const QueueContentTypeSchema = /* @__PURE__ */ z
	.enum(["text", "json", "bytes", "v8"])
	.default("v8");
export type QueueContentType = z.infer<typeof QueueContentTypeSchema>;

export type QueueMessageDelay = z.infer<typeof QueueMessageDelaySchema>;

export const QueueIncomingMessageSchema = /* @__PURE__ */ z.object({
	contentType: QueueContentTypeSchema,
	delaySecs: QueueMessageDelaySchema,
	body: Base64DataSchema,
	// When enqueuing messages on dead-letter queues, we want to reuse the same ID
	// and timestamp
	id: z.ostring(),
	timestamp: z.onumber(),
});
export type QueueIncomingMessage = z.infer<typeof QueueIncomingMessageSchema>;
export type QueueOutgoingMessage = z.input<typeof QueueIncomingMessageSchema>;

export const QueuesBatchRequestSchema = /* @__PURE__ */ z.object({
	messages: z.array(QueueIncomingMessageSchema),
});
export type QueuesOutgoingBatchRequest = z.input<
	typeof QueuesBatchRequestSchema
>;
