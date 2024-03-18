// `workerd` doesn't allow these internal classes to be constructed directly.
// To replicate this behaviour require this unique symbol to be specified as the
// first constructor argument. If this is missing, throw `Illegal invocation`.
const kConstructFlag = Symbol("kConstructFlag");

// See public facing `cloudflare:test` types for docs.

// =============================================================================
// `ExecutionContext`
// =============================================================================

/**
 * Empty array and wait for all promises to resolve until no more added.
 * If a single promise rejects, the rejection will be passed-through.
 * If multiple promises reject, the rejections will be aggregated.
 */
async function waitForWaitUntil(/* mut */ waitUntil: unknown[]): Promise<void> {
	const errors: unknown[] = [];

	while (waitUntil.length > 0) {
		const results = await Promise.allSettled(waitUntil.splice(0));
		// Record all rejected promises
		for (const result of results) {
			if (result.status === "rejected") errors.push(result.reason);
		}
	}

	if (errors.length === 1) {
		// If there was only one rejection, rethrow it
		throw errors[0];
	} else if (errors.length > 1) {
		// If there were more rejections, rethrow them all
		throw new AggregateError(errors);
	}
}

// If isolated storage is enabled, we ensure all `waitUntil()`s are `await`ed at
// the end of each test, as these may contain storage calls (e.g. caching
// responses). Note we can't wait at the end of `.concurrent` tests, as we can't
// track which `waitUntil()`s belong to which tests.
//
// If isolated storage is disabled, we ensure all `waitUntil()`s are `await`ed
// at the end of each test *file*. This ensures we don't try to dispose the
// runtime until all `waitUntil()`s complete.
const globalWaitUntil: unknown[] = [];
export function registerGlobalWaitUntil(promise: unknown) {
	globalWaitUntil.push(promise);
}
export function waitForGlobalWaitUntil(): Promise<void> {
	return waitForWaitUntil(globalWaitUntil);
}

const kWaitUntil = Symbol("kWaitUntil");
class ExecutionContext {
	// https://github.com/cloudflare/workerd/blob/v1.20231218.0/src/workerd/api/global-scope.h#L168
	[kWaitUntil]: unknown[] = [];

	constructor(flag: typeof kConstructFlag) {
		if (flag !== kConstructFlag) throw new TypeError("Illegal constructor");
	}

	waitUntil(promise: unknown) {
		if (!(this instanceof ExecutionContext)) {
			throw new TypeError("Illegal invocation");
		}
		this[kWaitUntil].push(promise);
		registerGlobalWaitUntil(promise);
	}

	passThroughOnException(): void {}
}
export function createExecutionContext(): ExecutionContext {
	return new ExecutionContext(kConstructFlag);
}
export async function waitOnExecutionContext(
	ctx: ExecutionContext
): Promise<void> {
	// noinspection SuspiciousTypeOfGuard
	if (!(ctx instanceof ExecutionContext)) {
		throw new TypeError(
			"Failed to execute 'getWaitUntil': parameter 1 is not of type 'ExecutionContext'.\n" +
				"You must call 'createExecutionContext()' to get an 'ExecutionContext' instance."
		);
	}
	return waitForWaitUntil(ctx[kWaitUntil]);
}

// =============================================================================
// `ScheduledController`
// =============================================================================

class ScheduledController {
	// https://github.com/cloudflare/workerd/blob/v1.20231218.0/src/workerd/api/scheduled.h#L35
	readonly scheduledTime!: number;
	readonly cron!: string;

	constructor(flag: typeof kConstructFlag, options?: FetcherScheduledOptions) {
		if (flag !== kConstructFlag) throw new TypeError("Illegal constructor");

		const scheduledTime = Number(options?.scheduledTime ?? Date.now());
		const cron = String(options?.cron ?? "");

		// Match `JSG_READONLY_INSTANCE_PROPERTY` behaviour
		Object.defineProperties(this, {
			scheduledTime: {
				get() {
					return scheduledTime;
				},
			},
			cron: {
				get() {
					return cron;
				},
			},
		});
	}

	noRetry(): void {
		if (!(this instanceof ScheduledController)) {
			throw new TypeError("Illegal invocation");
		}
	}
}
export function createScheduledController(
	options?: FetcherScheduledOptions
): ScheduledController {
	if (options !== undefined && typeof options !== "object") {
		throw new TypeError(
			"Failed to execute 'createScheduledController': parameter 1 is not of type 'ScheduledOptions'."
		);
	}
	return new ScheduledController(kConstructFlag, options);
}

// =============================================================================
// `MessageBatch`
// =============================================================================

const kRetry = Symbol("kRetry");
const kAck = Symbol("kAck");
const kRetryAll = Symbol("kRetryAll");
const kAckAll = Symbol("kAckAll");
class QueueMessage<Body = unknown> /* Message */ {
	// https://github.com/cloudflare/workerd/blob/v1.20231218.0/src/workerd/api/queue.h#L113
	readonly #controller: QueueController;
	readonly id!: string;
	readonly timestamp!: Date;
	readonly body!: Body;
	[kRetry] = false;
	[kAck] = false;

	constructor(
		flag: typeof kConstructFlag,
		controller: QueueController,
		message: ServiceBindingQueueMessage<Body>
	) {
		if (flag !== kConstructFlag) throw new TypeError("Illegal constructor");
		this.#controller = controller;

		const id = String(message.id);

		let timestamp: Date;
		// noinspection SuspiciousTypeOfGuard
		if (typeof message.timestamp === "number") {
			timestamp = new Date(message.timestamp);
		} else if (message.timestamp instanceof Date) {
			timestamp = new Date(message.timestamp.getTime()); // Prevent external mutations
		} else {
			throw new TypeError(
				"Incorrect type for the 'timestamp' field on 'ServiceBindingQueueMessage': the provided value is not of type 'date'."
			);
		}

		if ("serializedBody" in message) {
			throw new TypeError(
				"Cannot use `serializedBody` with `createMessageBatch()`"
			);
		}
		const body = structuredClone(message.body); // Prevent external mutations

		// Match `JSG_READONLY_INSTANCE_PROPERTY` behaviour
		Object.defineProperties(this, {
			id: {
				get() {
					return id;
				},
			},
			timestamp: {
				get() {
					return timestamp;
				},
			},
			body: {
				get() {
					return body;
				},
			},
		});
	}

	retry() {
		if (!(this instanceof QueueMessage)) {
			throw new TypeError("Illegal invocation");
		}
		if (this.#controller[kRetryAll]) return;
		if (this.#controller[kAckAll]) {
			console.warn(
				`Received a call to retry() on message ${this.id} after ackAll() was already called. ` +
					"Calling retry() on a message after calling ackAll() has no effect."
			);
			return;
		}
		if (this[kAck]) {
			console.warn(
				`Received a call to retry() on message ${this.id} after ack() was already called. ` +
					"Calling retry() on a message after calling ack() has no effect."
			);
			return;
		}
		this[kRetry] = true;
	}

	ack() {
		if (!(this instanceof QueueMessage)) {
			throw new TypeError("Illegal invocation");
		}
		if (this.#controller[kAckAll]) return;
		if (this.#controller[kRetryAll]) {
			console.warn(
				`Received a call to ack() on message ${this.id} after retryAll() was already called. ` +
					"Calling ack() on a message after calling retryAll() has no effect."
			);
			return;
		}
		if (this[kRetry]) {
			console.warn(
				`Received a call to ack() on message ${this.id} after retry() was already called. ` +
					"Calling ack() on a message after calling retry() has no effect."
			);
			return;
		}
		this[kAck] = true;
	}
}
class QueueController<Body = unknown> /* MessageBatch */ {
	// https://github.com/cloudflare/workerd/blob/v1.20231218.0/src/workerd/api/queue.h#L198
	readonly queue!: string;
	readonly messages!: QueueMessage<Body>[];
	[kRetryAll] = false;
	[kAckAll] = false;

	constructor(
		flag: typeof kConstructFlag,
		queueOption: string,
		messagesOption: ServiceBindingQueueMessage<Body>[]
	) {
		if (flag !== kConstructFlag) throw new TypeError("Illegal constructor");

		const queue = String(queueOption);
		const messages = messagesOption.map(
			(message) => new QueueMessage(kConstructFlag, this, message)
		);

		// Match `JSG_READONLY_INSTANCE_PROPERTY` behaviour
		Object.defineProperties(this, {
			queue: {
				get() {
					return queue;
				},
			},
			messages: {
				get() {
					return messages;
				},
			},
		});
	}

	retryAll() {
		if (!(this instanceof QueueController)) {
			throw new TypeError("Illegal invocation");
		}
		if (this[kAckAll]) {
			console.warn(
				"Received a call to retryAll() after ackAll() was already called. " +
					"Calling retryAll() after calling ackAll() has no effect."
			);
			return;
		}
		this[kRetryAll] = true;
	}

	ackAll() {
		if (!(this instanceof QueueController)) {
			throw new TypeError("Illegal invocation");
		}
		if (this[kRetryAll]) {
			console.warn(
				"Received a call to ackAll() after retryAll() was already called. " +
					"Calling ackAll() after calling retryAll() has no effect."
			);
			return;
		}
		this[kAckAll] = true;
	}
}
export function createMessageBatch<Body = unknown>(
	queueName: string,
	messages: ServiceBindingQueueMessage<Body>[]
): MessageBatch<Body> {
	if (arguments.length === 0) {
		// `queueName` will be coerced to a `string`, but it must be defined
		throw new TypeError(
			"TypeError: Failed to execute 'createMessageBatch': parameter 1 is not of type 'string'."
		);
	}
	if (!Array.isArray(messages)) {
		throw new TypeError(
			"TypeError: Failed to execute 'createMessageBatch': parameter 2 is not of type 'Array'."
		);
	}
	return new QueueController(kConstructFlag, queueName, messages);
}
export async function getQueueResult(
	batch: QueueController,
	ctx: ExecutionContext
): Promise<FetcherQueueResult> {
	// noinspection SuspiciousTypeOfGuard
	if (!(batch instanceof QueueController)) {
		throw new TypeError(
			"Failed to execute 'getQueueResult': parameter 1 is not of type 'MessageBatch'.\n" +
				"You must call 'createMessageBatch()' to get a 'MessageBatch' instance."
		);
	}
	// noinspection SuspiciousTypeOfGuard
	if (!(ctx instanceof ExecutionContext)) {
		throw new TypeError(
			"Failed to execute 'getQueueResult': parameter 2 is not of type 'ExecutionContext'.\n" +
				"You must call 'createExecutionContext()' to get an 'ExecutionContext' instance."
		);
	}
	await waitOnExecutionContext(ctx);

	const retryMessages: QueueRetryMessage[] = [];
	const explicitAcks: string[] = [];
	for (const message of batch.messages) {
		if (message[kRetry]) retryMessages.push({ msgId: message.id });
		if (message[kAck]) explicitAcks.push(message.id);
	}
	return {
		outcome: "ok",
		retryBatch: {
			retry: batch[kRetryAll],
		},
		ackAll: batch[kAckAll],
		retryMessages,
		explicitAcks,
	};
}
