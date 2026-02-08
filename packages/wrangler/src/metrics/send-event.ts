import { logger } from "../logger";
import { getMetricsDispatcher } from "./metrics-dispatcher";
import type { MetricsConfigOptions } from "./metrics-config";
import type { Properties } from "./metrics-dispatcher";

/** These are event names used by this wrangler client. */
export type EventNames =
	| "view accounts"
	| "deploy worker script"
	| "delete worker script"
	| "begin log stream"
	| "end log stream"
	| "begin pages log stream"
	| "end pages log stream"
	| "create encrypted variable"
	| "delete encrypted variable"
	| "list encrypted variables"
	| "create pages encrypted variable"
	| "delete pages encrypted variable"
	| "list pages encrypted variables"
	| "create kv namespace"
	| "list kv namespaces"
	| "delete kv namespace"
	| "write kv key-value"
	| "write kv key-value (local)"
	| "list kv keys"
	| "list kv keys (local)"
	| "read kv value"
	| "read kv value (local)"
	| "delete kv key-value"
	| "delete kv key-value (local)"
	| "write kv key-values (bulk)"
	| "write kv key-values (bulk) (local)"
	| "delete kv key-values (bulk)"
	| "delete kv key-values (bulk) (local)"
	| "create r2 bucket"
	| "list r2 buckets"
	| "delete r2 bucket"
	| "login user"
	| "logout user"
	| "retrieve auth token"
	| "list dispatch namespaces"
	| "view dispatch namespace"
	| "create dispatch namespace"
	| "delete dispatch namespace"
	| "rename dispatch namespace"
	| "create pages project"
	| "list pages projects"
	| "create pages deployment"
	| "list pages deployments"
	| "delete pages deployment"
	| "build pages functions"
	| "run dev"
	| "run dev (api)"
	| "run pages dev"
	| "view docs"
	| "view deployments"
	| "rollback deployments"
	| "upload worker version"
	| "deploy worker versions"
	| "view worker version"
	| "list worker versions"
	| "view versioned deployment"
	| "view latest versioned deployment"
	| "list versioned deployments"
	| "download pages config"
	| "deploy worker triggers"
	| "create pipeline"
	| "list pipelines"
	| "delete pipeline"
	| "update pipeline"
	| "show pipeline"
	| "provision resources"
	| AutoConfigEvent;

/** Event related to the autoconfig flow */
type AutoConfigEvent =
	| "autoconfig_process_started"
	| "autoconfig_process_ended"
	| "autoconfig_detection_started"
	| "autoconfig_detection_completed"
	| "autoconfig_configuration_started"
	| "autoconfig_configuration_completed";

/**
 * Send a metrics event, with no extra properties, to Cloudflare, if usage tracking is enabled.
 *
 * This overload assumes that you do not want to configure analytics with options.
 */
export function sendMetricsEvent(event: EventNames): void;
/**
 * Send a metrics event, with no extra properties, to Cloudflare, if usage tracking is enabled.
 */
export function sendMetricsEvent(
	event: EventNames,
	options: MetricsConfigOptions
): void;
export function sendMetricsEvent(
	event: EventNames,
	properties: Properties,
	options: MetricsConfigOptions
): void;
export function sendMetricsEvent(
	event: EventNames,
	...args: [] | [MetricsConfigOptions] | [Properties, MetricsConfigOptions]
): void {
	try {
		const options = args.pop() ?? {};
		const properties = (args.pop() ?? {}) as Properties;
		const metricsDispatcher = getMetricsDispatcher(options);
		metricsDispatcher.sendAdhocEvent(event, properties);
	} catch (err) {
		logger.debug("Error sending metrics event", err);
	}
}
