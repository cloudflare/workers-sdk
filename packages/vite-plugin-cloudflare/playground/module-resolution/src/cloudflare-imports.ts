import { retryable } from "cloudflare:durable-objects";
import { connect } from "cloudflare:sockets";
import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";

export default {
	"(cloudflare:workers) WorkerEntrypoint.name": WorkerEntrypoint.name,
	"(cloudflare:workers) DurableObject.name": DurableObject.name,
	"(cloudflare:sockets) typeof connect": typeof connect,
	"(cloudflare:durable-objects) typeof retryable": typeof retryable,
};
