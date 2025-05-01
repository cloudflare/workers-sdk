import assert from "node:assert";
import { devRegistry } from "../dev-registry";
import type { CfDurableObject } from "../deployment-bundle/worker";
import type { WorkerEntrypointsDefinition } from "../dev-registry";

export function maybeRegisterLocalWorker(
	url: URL,
	name: string | undefined,
	internalDurableObjects: CfDurableObject[] | undefined,
	entrypointAddresses: WorkerEntrypointsDefinition | undefined
) {
	assert(name !== undefined);

	let protocol = url.protocol;
	protocol = protocol.substring(0, url.protocol.length - 1);

	assert(protocol === "http" || protocol === "https");

	const port = parseInt(url.port);
	return devRegistry.register(name, {
		protocol,
		mode: "local",
		port,
		host: url.hostname,
		durableObjects: (internalDurableObjects ?? []).map((binding) => ({
			name: binding.name,
			className: binding.class_name,
		})),
		durableObjectsHost: url.hostname,
		durableObjectsPort: port,
		entrypointAddresses: entrypointAddresses,
	});
}
