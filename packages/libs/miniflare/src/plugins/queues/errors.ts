import { MiniflareError } from "../../shared";

export type QueuesErrorCode =
	| "ERR_MULTIPLE_CONSUMERS" // Attempted to set multiple consumers for a single queue;
	| "ERR_DEAD_LETTER_QUEUE_CYCLE"; // Attempted to set dead letter queue to self
export class QueuesError extends MiniflareError<QueuesErrorCode> {}
