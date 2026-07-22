import { getRemoteProxyConnectionString } from "../config/schema";
import { kCurrentWorker } from "../plugins/core";
import type { MiniflareWorkerBinding, ParsedDevConfig } from "../config/schema";
import type { RemoteProxyConnectionString } from "../plugins/shared";

/**
 * Extracts the target service name, entrypoint, props and (resolved) remote
 * proxy connection string from a parsed `worker` service binding.
 * `kCurrentWorker` (SELF) yields an undefined `serviceName`.
 */
export function normaliseServiceDesignator(
	binding: MiniflareWorkerBinding,
	dev: ParsedDevConfig | undefined
): {
	serviceName: string | undefined;
	entrypoint: string | undefined;
	props: Record<string, unknown> | undefined;
	remoteProxyConnectionString: RemoteProxyConnectionString | undefined;
} {
	return {
		serviceName:
			binding.workerName !== kCurrentWorker ? binding.workerName : undefined,
		entrypoint: binding.exportName,
		props: binding.props,
		remoteProxyConnectionString: getRemoteProxyConnectionString(binding, dev),
	};
}

const unsafeVariableCharRegex = /[^0-9a-zA-Z_\$]/g;

export function getOutboundDoProxyClassName(
	scriptName: string,
	className: string
) {
	return `${scriptName.replace(unsafeVariableCharRegex, "_")}_${className}`;
}
