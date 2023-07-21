import assert from "assert";
import crypto from "crypto";
import v8 from "v8";
import { stringify } from "devalue";
import { Colorize, bold, green, grey, red, reset, yellow } from "kleur/colors";
import { z } from "zod";
import { Log, Timers } from "../../shared";
import { Storage } from "../../storage";
import { CoreHeaders, structuredSerializableReducers } from "../../workers";
import { DispatchFetch, QueueConsumer } from "../shared";

const DEFAULT_BATCH_SIZE = 5;
const DEFAULT_BATCH_TIMEOUT = 1; // second
const DEFAULT_RETRIES = 2;

// https://github.com/cloudflare/workerd/blob/01b87642f4eac932aa9074d7e5eec4fd3c90968a/src/workerd/io/outcome.capnp
const Outcome = {
	UNKNOWN: 0,
	OK: 1,
	EXCEPTION: 2,
	EXCEEDED_CPU: 3,
	KILL_SWITCH: 4,
	DAEMON_DOWN: 5,
	SCRIPT_NOT_FOUND: 6,
	CANCELED: 7,
	EXCEEDED_MEMORY: 8,
} as const;
const OutcomeSchema = z.nativeEnum(Outcome);

const QueueResponseSchema = z.object({
	outcome: OutcomeSchema,
	retryAll: z.boolean(),
	ackAll: z.boolean(),
	explicitRetries: z.string().array(),
	explicitAcks: z.string().array(),
	time: z.number().optional(), // (added by Miniflare)
});
type QueueResponse = z.infer<typeof QueueResponseSchema>;
const exceptionQueueResponse: QueueResponse = {
	outcome: Outcome.EXCEPTION,
	retryAll: false,
	ackAll: false,
	explicitRetries: [],
	explicitAcks: [],
};

export class Message {
	#failedAttempts = 0;

	constructor(
		readonly id: string,
		readonly timestamp: number,
		readonly body: unknown
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
	timeout: unknown;
}

export type QueueEnqueueOn = (
	queueName: string,
	consumer: QueueConsumer,
	messages: (Message | Buffer)[]
) => void;

// `QueuesGateway` slightly misrepresents what this class does. Each queue will
// get a single `QueuesGateway` instance (per `Miniflare` instance). This class
// is responsible for receiving queued messages, batching them up, dispatching
// them, and retrying any messages that failed.
export class QueuesGateway {
	readonly #queueUrl: URL;
	readonly #messages: Message[] = [];

	#pendingFlush?: PendingFlush;

	constructor(
		private readonly log: Log,
		_storage: Storage,
		private readonly timers: Timers,
		private readonly queueName: string,
		private readonly dispatchFetch: DispatchFetch
	) {
		this.#queueUrl = new URL(`http://entry/${queueName}`);
	}

	async #dispatchBatch(workerName: string, batch: Message[]) {
		// The `queue()` method on a service binding expects regular, de-serialised
		// JavaScript objects. Unfortunately, `workerd` doesn't expose the V8
		// serialiser in Workers yet, so we need to re-serialise all messages into a
		// format we can deserialise in a Worker.
		// TODO: stop re-serialising messages once `v8` module added to `workerd` as
		//  part of Node.js compat work, can also remove V8 version restriction too
		// `stringify` doesn't support arbitrary non-POJOs, so convert to POJOs
		const messages = batch.map((message) => ({ ...message }));
		const response = await this.dispatchFetch(this.#queueUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json; charset=utf-8",
				[CoreHeaders.ROUTE_OVERRIDE]: workerName,
				[CoreHeaders.CUSTOM_EVENT]: "queue",
			},
			body: stringify(messages, structuredSerializableReducers),
		});
		if (!response.ok) assert.fail(await response.text());
		return QueueResponseSchema.parse(await response.json());
	}

	#flush = async (enqueueOn: QueueEnqueueOn, consumer: QueueConsumer) => {
		const batchSize = consumer.maxBatchSize ?? DEFAULT_BATCH_SIZE;
		const maxAttempts = (consumer.maxRetires ?? DEFAULT_RETRIES) + 1;
		const maxAttemptsS = maxAttempts === 1 ? "" : "s";

		// Extract and dispatch a batch
		const batch = this.#messages.splice(0, batchSize);
		let response: QueueResponse;
		try {
			response = await this.#dispatchBatch(consumer.workerName, batch);
		} catch (e: any) {
			this.log.error(e);
			response = exceptionQueueResponse;
		}

		// Get messages to retry. If dispatching the batch failed for any reason,
		// retry all messages.
		const retryAll = response.retryAll || response.outcome !== Outcome.OK;
		const explicitRetries = new Set(response.explicitRetries);

		let failedMessages = 0;
		const toRetry: Message[] = [];
		const toDeadLetterQueue: Message[] = [];
		for (const message of batch) {
			if (retryAll || explicitRetries.has(message.id)) {
				failedMessages++;
				const failedAttempts = message.incrementFailedAttempts();
				if (failedAttempts < maxAttempts) {
					this.log.debug(
						`Retrying message "${message.id}" on queue "${this.queueName}"...`
					);
					toRetry.push(message);
				} else if (consumer.deadLetterQueue !== undefined) {
					this.log.warn(
						`Moving message "${message.id}" on queue "${this.queueName}" to dead letter queue "${consumer.deadLetterQueue}" after ${maxAttempts} failed attempt${maxAttemptsS}...`
					);
					toDeadLetterQueue.push(message);
				} else {
					this.log.warn(
						`Dropped message "${message.id}" on queue "${this.queueName}" after ${maxAttempts} failed attempt${maxAttemptsS}!`
					);
				}
			}
		}
		const acked = batch.length - failedMessages;
		this.log.info(
			formatQueueResponse(this.queueName, acked, batch.length, response.time)
		);

		// Add messages for retry back to the queue, and ensure we flush again if
		// we still have messages
		this.#messages.push(...toRetry);
		this.#pendingFlush = undefined;
		if (this.#messages.length > 0) {
			this.#ensurePendingFlush(enqueueOn, consumer);
		}

		if (toDeadLetterQueue.length > 0) {
			// If we have messages to move to a dead letter queue, do so
			assert(consumer.deadLetterQueue !== undefined);
			assert(consumer.deadLetterConsumer !== undefined);
			enqueueOn(
				consumer.deadLetterQueue,
				consumer.deadLetterConsumer,
				toDeadLetterQueue // Reuse same message instances with same IDs
			);
		}
	};

	#ensurePendingFlush(enqueueOn: QueueEnqueueOn, consumer: QueueConsumer) {
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
		const timeout = this.timers.setTimeout(
			this.#flush,
			delay,
			enqueueOn,
			consumer
		);
		this.#pendingFlush = { immediate: delay === 0, timeout };
	}

	enqueue(
		enqueueOn: QueueEnqueueOn,
		consumer: QueueConsumer,
		messages: (Message | Buffer)[]
	) {
		for (const message of messages) {
			if (message instanceof Message) {
				this.#messages.push(message);
			} else {
				const id = crypto.randomBytes(16).toString("hex");
				const timestamp = this.timers.now();
				const body = v8.deserialize(message);
				this.#messages.push(new Message(id, timestamp, body));
			}
		}
		this.#ensurePendingFlush(enqueueOn, consumer);
	}
}
