import type { MiniflareTrigger } from "../config/schema";

type ConnectTrigger = Extract<MiniflareTrigger, { type: "connect" }>;

interface ConnectTriggerSelectionOptions {
	protocol?: "tcp" | "udp";
	workerName?: string;
	port?: number;
}

/** Selects a configured connect trigger independently of its bound socket. */
export function selectConnectTrigger(
	triggers: ConnectTrigger[],
	options: ConnectTriggerSelectionOptions = {}
): ConnectTrigger {
	const protocol = options.protocol ?? "tcp";
	const protocolName = protocol.toUpperCase();
	const connectTriggers = triggers.filter(
		(trigger) => trigger.protocol === protocol
	);
	const workerDescription =
		options.workerName === undefined
			? "entrypoint worker"
			: `${JSON.stringify(options.workerName)} worker`;

	if (options.port === undefined) {
		if (connectTriggers.length === 0) {
			throw new TypeError(
				`No ${protocolName} connect triggers configured for ${workerDescription}`
			);
		}
		if (connectTriggers.length > 1) {
			throw new TypeError(
				`Multiple ${protocolName} connect triggers configured for ${workerDescription}; specify a port`
			);
		}
		return connectTriggers[0];
	}

	const trigger = connectTriggers.find(({ port }) => port === options.port);
	if (trigger === undefined) {
		throw new TypeError(
			`${protocolName} connect trigger on port ${options.port} not found for ${workerDescription}`
		);
	}
	return trigger;
}
