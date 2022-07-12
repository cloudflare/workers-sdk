import { logger } from "../logger";
import { getMetricsDispatcher } from "./metrics-dispatcher";
import type { MetricsConfigOptions } from "./metrics-config";
import type { Properties } from "./metrics-dispatcher";

/** These are event names used by this wrangler client. */
export type EventNames =
	| "view accounts"
	| "deploy worker script"
	| "begin log stream"
	| "end log stream"
	| "create encrypted variable"
	| "delete encrypted variable"
	| "list encrypted variables"
	| "create kv namespace"
	| "list kv namespaces"
	| "delete kv namespace"
	| "write kv key-value"
	| "list kv keys"
	| "read kv value"
	| "delete kv key-value"
	| "write kv key-values (bulk)"
	| "delete kv key-values (bulk)"
	| "create r2 bucket"
	| "list r2 buckets"
	| "delete r2 bucket"
	| "login user"
	| "logout user"
	| "create pubsub namespace"
	| "list pubsub namespaces"
	| "delete pubsub namespace"
	| "view pubsub namespace"
	| "create pubsub broker"
	| "update pubsub broker"
	| "list pubsub brokers"
	| "delete pubsub broker"
	| "view pubsub broker"
	| "issue pubsub broker credentials"
	| "revoke pubsub broker credentials"
	| "unrevoke pubsub broker credentials"
	| "list pubsub broker revoked credentials"
	| "list pubsub broker public-keys"
	| "list worker namespaces"
	| "view worker namespace"
	| "create worker namespace"
	| "delete worker namespace"
	| "rename worker namespace"
	| "create pages project"
	| "list pages projects"
	| "deploy pages project"
	| "list pages projects deployments"
	| "build pages functions"
	| "run dev"
	| "run pages dev";

export function sendMetricsEvent(event: EventNames): void;
export function sendMetricsEvent(
	event: EventNames,
	options: MetricsConfigOptions
): void;
export function sendMetricsEvent(
	event: EventNames,
	properties: Properties,
	options: MetricsConfigOptions
): void;
/**
 * Send a metrics event to Cloudflare, if usage tracking is enabled.
 */
export function sendMetricsEvent(
	event: EventNames,
	...args: [] | [MetricsConfigOptions] | [Properties, MetricsConfigOptions]
): void {
	const options = args.pop() ?? {};
	const properties = (args.pop() ?? {}) as Properties;
	getMetricsDispatcher(options)
		.then((metricsDispatcher) => metricsDispatcher.sendEvent(event, properties))
		.catch((err) => {
			logger.debug("Error sending metrics event", err);
		});
}
