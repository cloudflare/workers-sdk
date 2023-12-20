import assert from "node:assert";
import { Buffer } from "node:buffer";
import { Colorize, bold, green, grey, red, reset, yellow } from "kleur/colors";
import {
	HttpError,
	LogLevel,
	MiniflareDurableObject,
	MiniflareDurableObjectCf,
	MiniflareDurableObjectEnv,
	POST,
	RouteHandler,
	SharedBindings,
	TimerHandle,
	viewToBuffer,
} from "miniflare:shared";
import { QueueBindings } from "./constants";
import {
	QueueConsumer,
	QueueConsumersSchema,
	QueueContentType,
	QueueContentTypeSchema,
	QueueIncomingMessage,
	QueueOutgoingMessage,
	QueuesBatchRequestSchema,
	QueuesOutgoingBatchRequest,
} from "./schemas";

const MAX_MESSAGE_SIZE_BYTES = 128 * 1000;
const MAX_MESSAGE_BATCH_COUNT = 100;
const MAX_MESSAGE_BATCH_SIZE = (256 + 32) * 1000;

const DEFAULT_BATCH_SIZE = 5;
const DEFAULT_BATCH_TIMEOUT = 1; // second
const DEFAULT_RETRIES = 2;

const exceptionQueueResponse: FetcherQueueResult = {
	outcome: "exception",
	retryAll: false,
	ackAll: false,
	explicitRetries: [],
	explicitAcks: [],
};

class PayloadTooLargeError extends HttpError {
	constructor(message: string) {
		super(413, message);
	}
}

function validateMessageSize(headers: Headers) {
	const size = headers.get("Content-Length");
	if (size !== null && parseInt(size) > MAX_MESSAGE_SIZE_BYTES) {
		throw new PayloadTooLargeError(
			`message length of ${size} bytes exceeds limit of ${MAX_MESSAGE_SIZE_BYTES}`
		);
	}
}

function validateContentType(headers: Headers): QueueContentType {
	const format = headers.get("X-Msg-Fmt") ?? undefined; // zod will throw if null
	const result = QueueContentTypeSchema.safeParse(format);
	if (!result.success) {
		throw new HttpError(
			400,
			`message content type ${format} is invalid; if specified, must be one of 'text', 'json', 'bytes', or 'v8'`
		);
	}
	return result.data;
}

function validateBatchSize(headers: Headers) {
	const count = headers.get("CF-Queue-Batch-Count");
	if (count !== null && parseInt(count) > MAX_MESSAGE_BATCH_COUNT) {
		throw new PayloadTooLargeError(
			`batch message count of ${count} exceeds limit of ${MAX_MESSAGE_BATCH_COUNT}`
		);
	}
	const largestSize = headers.get("CF-Queue-Largest-Msg");
	if (largestSize !== null && parseInt(largestSize) > MAX_MESSAGE_SIZE_BYTES) {
		throw new PayloadTooLargeError(
			`message in batch has length ${largestSize} bytes which exceeds single message size limit of ${MAX_MESSAGE_SIZE_BYTES}`
		);
	}
	const batchSize = headers.get("CF-Queue-Batch-Bytes");
	if (batchSize !== null && parseInt(batchSize) > MAX_MESSAGE_BATCH_SIZE) {
		throw new PayloadTooLargeError(
			`batch size of ${batchSize} bytes exceeds limit of 256000`
		);
	}
}

type QueueBody =
	| { contentType: "text"; body: string }
	| { contentType: "json"; body: unknown }
	| { contentType: "bytes"; body: ArrayBuffer }
	| { contentType: "v8"; body: Buffer };

function deserialise({ contentType, body }: QueueIncomingMessage): QueueBody {
	if (contentType === "text") {
		return { contentType, body: body.toString() };
	} else if (contentType === "json") {
		return { contentType, body: JSON.parse(body.toString()) };
	} else if (contentType === "bytes") {
		return { contentType, body: viewToBuffer(body) };
	} else {
		return { contentType, body };
	}
}

function serialise(msg: QueueMessage): QueueOutgoingMessage {
	let body: Buffer;
	if (msg.body.contentType === "text") {
		body = Buffer.from(msg.body.body);
	} else if (msg.body.contentType === "json") {
		body = Buffer.from(JSON.stringify(msg.body.body));
	} else if (msg.body.contentType === "bytes") {
		body = Buffer.from(msg.body.body);
	} else {
		body = msg.body.body;
	}
	return {
		id: msg.id,
		timestamp: msg.timestamp,
		contentType: msg.body.contentType,
		body: body.toString("base64"),
	};
}

class QueueMessage {
	#failedAttempts = 0;

	constructor(
		readonly id: string,
		readonly timestamp: number,
		readonly body: QueueBody
	) {}

	incrementFailedAttempts(): number {
		return ++this.#failedAttempts;
	}
}

function formatQueueResponse(
	queueName: string,
	acked: number,
	total: number,
	time?: number
) {
	let colour: Colorize;
	if (acked === total) colour = green;
	else if (acked > 0) colour = yellow;
	else colour = red;

	let message = `${bold("QUEUE")} ${queueName} ${colour(`${acked}/${total}`)}`;
	if (time !== undefined) message += grey(` (${time}ms)`);
	return reset(message);
}

interface PendingFlush {
	immediate: boolean;
	timeout: TimerHandle;
}

type QueueBrokerObjectEnv = MiniflareDurableObjectEnv & {
	// Reference to own Durable Object namespace for sending to dead-letter queues
	[SharedBindings.DURABLE_OBJECT_NAMESPACE_OBJECT]: DurableObjectNamespace;
	[QueueBindings.MAYBE_JSON_QUEUE_CONSUMERS]?: unknown;
} & {
	[K in `${typeof QueueBindings.SERVICE_WORKER_PREFIX}${string}`]:
		| Fetcher
		| undefined; // Won't have a `Fetcher` for every possible `string`
};

export class QueueBrokerObject extends MiniflareDurableObject<QueueBrokerObjectEnv> {
	readonly #consumers: Record<string, QueueConsumer | undefined>;
	readonly #messages: QueueMessage[] = [];
	#pendingFlush?: PendingFlush;

	constructor(state: DurableObjectState, env: QueueBrokerObjectEnv) {
		super(state, env);
		const maybeConsumers = env[QueueBindings.MAYBE_JSON_QUEUE_CONSUMERS];
		if (maybeConsumers === undefined) this.#consumers = {};
		else this.#consumers = QueueConsumersSchema.parse(maybeConsumers);
	}

	get #maybeConsumer() {
		return this.#consumers[this.name];
	}

	#dispatchBatch(workerName: string, batch: QueueMessage[]) {
		const bindingName =
			`${QueueBindings.SERVICE_WORKER_PREFIX}${workerName}` as const;
		const maybeService = this.env[bindingName];
		assert(
			maybeService !== undefined,
			`Expected ${bindingName} service binding`
		);
		const messages = batch.map(({ id, timestamp, body }) => {
			if (body.contentType === "v8") {
				return { id, timestamp, serializedBody: body.body };
			} else {
				return { id, timestamp, body: body.body };
			}
		});
		// @ts-expect-error `Fetcher#queue()` types haven't been updated for
		//  `serializedBody` yet, and don't allow `number` for `timestamp`, even
		//  though that's permitted at runtime
		return maybeService.queue(this.name, messages);
	}

	#flush = async () => {
		const consumer = this.#maybeConsumer;
		assert(consumer !== undefined);

		const batchSize = consumer.maxBatchSize ?? DEFAULT_BATCH_SIZE;
		const maxAttempts = (consumer.maxRetries ?? DEFAULT_RETRIES) + 1;
		const maxAttemptsS = maxAttempts === 1 ? "" : "s";

		// Extract and dispatch a batch
		const batch = this.#messages.splice(0, batchSize);
		const startTime = Date.now();
		let endTime: number;
		let response: FetcherQueueResult;
		try {
			response = await this.#dispatchBatch(consumer.workerName, batch);
			endTime = Date.now();
		} catch (e: any) {
			endTime = Date.now();
			await this.logWithLevel(LogLevel.ERROR, String(e));
			response = exceptionQueueResponse;
		}

		// Get messages to retry. If dispatching the batch failed for any reason,
		// retry all messages.
		const retryAll = response.retryAll || response.outcome !== "ok";
		const explicitRetries = new Set(response.explicitRetries);

		let failedMessages = 0;
		const toRetry: QueueMessage[] = [];
		const toDeadLetterQueue: QueueMessage[] = [];
		for (const message of batch) {
			if (retryAll || explicitRetries.has(message.id)) {
				failedMessages++;
				const failedAttempts = message.incrementFailedAttempts();
				if (failedAttempts < maxAttempts) {
					await this.logWithLevel(
						LogLevel.DEBUG,
						`Retrying message "${message.id}" on queue "${this.name}"...`
					);
					toRetry.push(message);
				} else if (consumer.deadLetterQueue !== undefined) {
					await this.logWithLevel(
						LogLevel.WARN,
						`Moving message "${message.id}" on queue "${this.name}" to dead letter queue "${consumer.deadLetterQueue}" after ${maxAttempts} failed attempt${maxAttemptsS}...`
					);
					toDeadLetterQueue.push(message);
				} else {
					await this.logWithLevel(
						LogLevel.WARN,
						`Dropped message "${message.id}" on queue "${this.name}" after ${maxAttempts} failed attempt${maxAttemptsS}!`
					);
				}
			}
		}
		const acked = batch.length - failedMessages;
		await this.logWithLevel(
			LogLevel.INFO,
			formatQueueResponse(this.name, acked, batch.length, endTime - startTime)
		);

		// Add messages for retry back to the queue, and ensure we flush again if
		// we still have messages
		this.#messages.push(...toRetry);
		this.#pendingFlush = undefined;
		if (this.#messages.length > 0) this.#ensurePendingFlush();

		if (toDeadLetterQueue.length > 0) {
			// If we have messages to move to a dead letter queue, do so
			const name = consumer.deadLetterQueue;
			assert(name !== undefined);
			const ns = this.env[SharedBindings.DURABLE_OBJECT_NAMESPACE_OBJECT];
			const id = ns.idFromName(name);
			const stub = ns.get(id);
			const cf: MiniflareDurableObjectCf = { miniflare: { name } };
			const batchRequest: QueuesOutgoingBatchRequest = {
				messages: toDeadLetterQueue.map(serialise),
			};
			const res = await stub.fetch("http://placeholder/batch", {
				method: "POST",
				body: JSON.stringify(batchRequest),
				cf: cf as Record<string, unknown>,
			});
			assert(res.ok);
		}
	};

	#ensurePendingFlush() {
		const consumer = this.#maybeConsumer;
		assert(consumer !== undefined);

		const batchSize = consumer.maxBatchSize ?? DEFAULT_BATCH_SIZE;
		const batchTimeout = consumer.maxBatchTimeout ?? DEFAULT_BATCH_TIMEOUT;
		const batchHasSpace = this.#messages.length < batchSize;

		if (this.#pendingFlush !== undefined) {
			// If we have a pending immediate flush, or a delayed flush we haven't
			// filled the batch for yet, just wait for it
			if (this.#pendingFlush.immediate || batchHasSpace) return;
			// Otherwise, the batch is full, so clear the existing timeout, and
			// register an immediate flush
			this.timers.clearTimeout(this.#pendingFlush.timeout);
			this.#pendingFlush = undefined;
		}

		// Register a new flush timeout with the appropriate delay
		const delay = batchHasSpace ? batchTimeout * 1000 : 0;
		const timeout = this.timers.setTimeout(this.#flush, delay);
		this.#pendingFlush = { immediate: delay === 0, timeout };
	}

	#enqueue(messages: QueueIncomingMessage[]) {
		for (const message of messages) {
			const randomness = crypto.getRandomValues(new Uint8Array(16));
			const id = message.id ?? Buffer.from(randomness).toString("hex");
			const timestamp = message.timestamp ?? this.timers.now();
			const body = deserialise(message);
			this.#messages.push(new QueueMessage(id, timestamp, body));
		}
		this.#ensurePendingFlush();
	}

	@POST("/message")
	message: RouteHandler = async (req) => {
		validateMessageSize(req.headers);
		const contentType = validateContentType(req.headers);
		const body = Buffer.from(await req.arrayBuffer());

		// If we don't have a consumer, drop the message
		const consumer = this.#maybeConsumer;
		if (consumer === undefined) return new Response();

		this.#enqueue([{ contentType, body }]);
		return new Response();
	};

	@POST("/batch")
	batch: RouteHandler = async (req) => {
		// NOTE: this endpoint is also used when moving messages to the dead-letter
		// queue. In this case, size headers won't be added and this validation is
		// a no-op. This allows us to enqueue a maximum size batch with additional
		// ID and timestamp information.
		validateBatchSize(req.headers);
		const body = QueuesBatchRequestSchema.parse(await req.json());

		// If we don't have a consumer, drop the message
		const consumer = this.#maybeConsumer;
		if (consumer === undefined) return new Response();

		this.#enqueue(body.messages);
		return new Response();
	};
}
