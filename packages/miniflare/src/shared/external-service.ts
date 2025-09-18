import { z } from "zod";
import { kCurrentWorker, ServiceDesignatorSchema } from "../plugins/core";
import { RemoteProxyConnectionString } from "../plugins/shared";

export function normaliseServiceDesignator(
	service: z.infer<typeof ServiceDesignatorSchema>
): {
	serviceName: string | undefined;
	entrypoint: string | undefined;
	remoteProxyConnectionString: RemoteProxyConnectionString | undefined;
} {
	let serviceName: string | undefined;
	let entrypoint: string | undefined;
	let remoteProxyConnectionString: RemoteProxyConnectionString | undefined;

	if (typeof service === "string") {
		serviceName = service;
	} else if (typeof service === "object" && "name" in service) {
		serviceName = service.name !== kCurrentWorker ? service.name : undefined;
		entrypoint = service.entrypoint;
		remoteProxyConnectionString = service.remoteProxyConnectionString;
	}

	return {
		serviceName,
		entrypoint,
		remoteProxyConnectionString,
	};
}
