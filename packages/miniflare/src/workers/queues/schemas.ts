import { Base64DataSchema, z } from "miniflare:zod";

const QueueConsumerOptionsSchemaInput = /* @__PURE__ */ z.object({
	// https://developers.cloudflare.com/queues/platform/configuration/#consumer
	// https://developers.cloudflare.com/queues/platform/limits/
	maxBatchSize: z.number().min(0).max(100).optional(),
	maxBatchTimeout: z.number().min(0).max(30).optional(), // seconds
	maxRetries: z.number().min(0).max(100).optional(),
	/** @deprecated use `maxRetries` instead */
	maxRetires: z.number().min(0).max(100).optional(),
	deadLetterQueue: z.ostring(),
});
export const QueueConsumerOptionsSchema =
	/* @__PURE__ */ QueueConsumerOptionsSchemaInput.transform((value) => ({
		maxBatchSize: value.maxBatchSize,
		maxBatchTimeout: value.maxBatchTimeout,
		maxRetries: value.maxRetries ?? value.maxRetires, // Fallback to deprecated alias
		deadLetterQueue: value.deadLetterQueue,
	}));
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

export const QueueIncomingMessageSchema = /* @__PURE__ */ z.object({
	contentType: QueueContentTypeSchema,
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
