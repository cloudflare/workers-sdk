// @ts-expect-error "devalue" is ESM-only, but we're bundling for CommonJS here.
//  That doesn't matter to `esbuild`, which will apply format conversion.
import { parse } from "devalue";
import { z } from "zod";
import { Headers, Response } from "../../http";
import { Base64DataSchema, HttpError } from "../../shared";
import {
	HEADER_PERSIST,
	POST,
	QueueConsumer,
	RouteHandler,
	Router,
} from "../shared";
import { QueueEnqueueOn, QueuesGateway } from "./gateway";

const MAX_MESSAGE_SIZE_BYTES = 128 * 1000;
const MAX_MESSAGE_BATCH_COUNT = 100;
const MAX_MESSAGE_BATCH_SIZE = (256 + 32) * 1000;

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

async function decodeQueueConsumer(
	headers: Headers
): Promise<QueueConsumer | undefined> {
	const header = headers.get(HEADER_PERSIST);
	// We stringify the consumer using `devalue` (as it may contain dead letter
	// queue cycles). This which will then be JSON-stringified again when encoding
	// the header (yuck). Unfortunately, we can't use Zod to validate this as it
	// doesn't support cyclic data.
	return header === null ? undefined : parse(JSON.parse(header));
}

const QueuesBatchRequestSchema = z.object({
	messages: z.array(z.object({ body: Base64DataSchema })),
});

export interface QueuesParams {
	queue: string;
}
export class QueuesRouter extends Router<QueuesGateway> {
	#enqueueOn: QueueEnqueueOn = (queueName, consumer, messages) => {
		const gateway = this.gatewayFactory.get(queueName, undefined);
		gateway.enqueue(this.#enqueueOn, consumer, messages);
	};

	@POST("/:queue/message")
	message: RouteHandler<QueuesParams> = async (req, params) => {
		validateMessageSize(req.headers);

		// Get consumer from persistence header, if we don't have a consumer,
		// drop the message
		const consumer = await decodeQueueConsumer(req.headers);
		if (consumer === undefined) return new Response();

		const queue = decodeURIComponent(params.queue);
		const serialisedBody = Buffer.from(await req.arrayBuffer());
		this.#enqueueOn(queue, consumer, [serialisedBody]);
		return new Response();
	};

	@POST("/:queue/batch")
	batch: RouteHandler<QueuesParams> = async (req, params) => {
		validateBatchSize(req.headers);

		// Get consumer from persistence header, if we don't have a consumer,
		// drop the batch
		const consumer = await decodeQueueConsumer(req.headers);
		if (consumer === undefined) return new Response();

		const queue = decodeURIComponent(params.queue);
		const body = QueuesBatchRequestSchema.parse(await req.json());
		const messages = body.messages.map(({ body }) => body);
		this.#enqueueOn(queue, consumer, messages);
		return new Response();
	};
}
