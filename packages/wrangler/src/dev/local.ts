import { registerWorker } from "../dev-registry";
import type {
	CfDurableObject,
} from "../deployment-bundle/worker";
import type {
	WorkerEntrypointsDefinition,
} from "../dev-registry";

export function maybeRegisterLocalWorker(
	url: URL,
	name: string | undefined,
	internalDurableObjects: CfDurableObject[] | undefined,
	entrypointAddresses: WorkerEntrypointsDefinition | undefined
) {
	if (name === undefined) {
		return;
	}

	let protocol = url.protocol;
	protocol = protocol.substring(0, url.protocol.length - 1);
	if (protocol !== "http" && protocol !== "https") {
		return;
	}

	const port = parseInt(url.port);
	return registerWorker(name, {
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
