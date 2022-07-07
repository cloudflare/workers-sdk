import { logger } from "../logger";
import { getMetricsDispatcher } from "./metrics-dispatcher";
import type { Config } from "../config";
import type { Properties } from "./metrics-dispatcher";

export type EventNames = DashEventNames | WranglerEventNames;

/** These are related event names currently in use in the dashboard. */
type DashEventNames =
	| "add cron trigger"
	| "add workers route"
	| "begin zone activation flow"
	| "begin log stream"
	| "change zone setting"
	| "Change zone setup confirmation"
	| "change zone status"
	| "Change zone status confirmation"
	| "check nameservers"
	| "create notification"
	| "create rate limiting rule"
	| "create service"
	| "create user"
	| "create zone"
	| "edit cron trigger"
	| "edit service environment variables"
	| "edit service kv bindings"
	| "edit service r2 bindings"
	| "edit service to service bindings"
	| "edit workers route"
	| "enable workers"
	| "encrypt variable"
	| "purge everything from cache"
	| "deploy worker script"
	| "register site"
	| "set up custom domain"
	| "set up subdomain"
	| "submit domain name"
	| "update site"
	| "User selected account"
	| "User selected zone"
	| "view accounts";

/** These are new event names specifically(?) for the wrangler client. */
type WranglerEventNames =
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

/**
 * Send a metrics event to Cloudflare, if usage tracking is enabled.
 */
export function sendMetricsEvent(
	event: EventNames,
	config?: Config,
	properties: Properties = {},
	offline = false
): void {
	getMetricsDispatcher({
		sendMetrics: config?.send_metrics,
		offline,
	})
		.then((metricsDispatcher) => metricsDispatcher.sendEvent(event, properties))
		.catch((err) => {
			logger.debug("Error sending metrics event", err);
		});
}
