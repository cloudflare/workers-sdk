import { Response } from "miniflare";
import { fetch } from "undici";
import { getRegisteredWorkers } from "../../../dev-registry";
import type { WorkerDefinition } from "../../../dev-registry";
import type { Request, RequestInit } from "undici";

/**
 * Gets service bindings that proxy requests to external workers running locally, so that they
 * can be passed to miniflare and used to fetch from such workers by the next app.
 *
 * @param services the services requested by the user
 * @returns the service bindings ready to be passed to miniflare
 */
export async function getServiceBindings(
	services:
		| {
				binding: string;
				service: string;
		  }[]
		| undefined = []
): Promise<ServiceBindings | undefined> {
	if (services.length === 0) {
		return;
	}

	const registeredWorkers = await maybeGetRegisteredWorkers();
	if (!registeredWorkers) {
		return;
	}

	const foundServices: AvailableBindingInfo[] = [];
	for (const { binding: bindingName, service: serviceName } of services) {
		const worker = registeredWorkers[serviceName];
		if (worker) {
			foundServices.push({
				bindingName,
				serviceName,
				workerDefinition: worker,
			});
		}
	}

	const serviceBindings: ServiceBindings = {};
	for (const bindingInfo of foundServices) {
		serviceBindings[bindingInfo.bindingName] =
			getServiceBindingProxyFetch(bindingInfo);
	}
	return serviceBindings;
}

type ServiceBindings = Record<string, (_req: Request) => Promise<Response>>;

type AvailableBindingInfo = {
	bindingName: string;
	serviceName: string;
	workerDefinition: WorkerDefinition;
};

/**
 * Given all the relevant information about a service binding and its relative worker definition this
 * function generates a proxy fetch that takes requests targeted to the service and proxies them to it
 *
 * @param availableBindingInfo the binding information to be used to create a proxy to an external service
 * @returns the binding proxy (in the form of a nodejs fetch method)
 */
function getServiceBindingProxyFetch({
	workerDefinition,
	bindingName,
	serviceName,
}: AvailableBindingInfo) {
	const { protocol, host, port } = workerDefinition;

	const getExternalUrl = (request: Request) => {
		const newUrl = new URL(request.url);
		if (protocol) {
			newUrl.protocol = protocol;
		}
		if (host) {
			newUrl.host = host;
		}
		if (port) {
			newUrl.port = `${port}`;
		}
		return newUrl;
	};

	return async (request: Request) => {
		const newUrl = getExternalUrl(request);
		try {
			const resp = await fetch(newUrl, request as RequestInit);
			const respBody = await resp.arrayBuffer();
			return new Response(respBody, resp as unknown as Response);
		} catch {
			return new Response(
				`Error: Unable to fetch from external service (${serviceName} bound with ${bindingName} binding), please make sure that the service is still running with \`wrangler dev\``,
				{ status: 500 }
			);
		}
	};
}

async function maybeGetRegisteredWorkers() {
	try {
		return getRegisteredWorkers();
	} catch {
		return undefined;
	}
}
