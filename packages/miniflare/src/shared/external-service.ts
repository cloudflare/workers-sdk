import { kCurrentWorker } from "../plugins/core";
import type { ServiceDesignatorSchema } from "../plugins/core";
import type { RemoteProxyConnectionString } from "../plugins/shared";
import type { z } from "zod";

export function normaliseServiceDesignator(
	service: z.infer<typeof ServiceDesignatorSchema>
): {
	serviceName: string | undefined;
	entrypoint: string | undefined;
	props: Record<string, unknown> | undefined;
	remoteProxyConnectionString: RemoteProxyConnectionString | undefined;
} {
	let serviceName: string | undefined;
	let entrypoint: string | undefined;
	let props: Record<string, unknown> | undefined;
	let remoteProxyConnectionString: RemoteProxyConnectionString | undefined;

	if (typeof service === "string") {
		serviceName = service;
	} else if (typeof service === "object" && "name" in service) {
		serviceName = service.name !== kCurrentWorker ? service.name : undefined;
		entrypoint = service.entrypoint;
		props = service.props;
		remoteProxyConnectionString = service.remoteProxyConnectionString;
	}

	return {
		serviceName,
		entrypoint,
		props,
		remoteProxyConnectionString,
	};
}

const unsafeVariableCharRegex = /[^0-9a-zA-Z_\$]/g;

export function getOutboundDoProxyClassName(
	scriptName: string,
	className: string
) {
	return `${scriptName.replace(unsafeVariableCharRegex, "_")}_${className}`;
}
