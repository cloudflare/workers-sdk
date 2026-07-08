import { WorkerEntrypoint } from "cloudflare:workers";
import workerdUnsafe from "workerd:unsafe";
import {
	type DevControl as DevControlInterface,
	type DevControlDurableObjectEvictionOptions,
	getDevControlDurableObjectBindingName,
} from "./dev-control";
import type { DurableObjectNamespace } from "@cloudflare/workers-types/experimental";

function getDurableObjectNamespace(
	env: Record<string, unknown>,
	bindingName: string
): DurableObjectNamespace | null {
	const namespace = env[bindingName];

	if (
		!(typeof namespace === "object" && namespace !== null) ||
		!("idFromName" in namespace) ||
		typeof namespace.idFromName !== "function" ||
		!("idFromString" in namespace) ||
		typeof namespace.idFromString !== "function" ||
		!("get" in namespace) ||
		typeof namespace.get !== "function"
	) {
		return null;
	}

	return namespace as DurableObjectNamespace;
}

export default class DevControl
	extends WorkerEntrypoint<Record<string, unknown>>
	implements DevControlInterface
{
	async evictDurableObject(
		scriptName: string,
		className: string,
		options: DevControlDurableObjectEvictionOptions
	): Promise<void> {
		const doNamespace = getDurableObjectNamespace(
			this.env,
			getDevControlDurableObjectBindingName(scriptName, className)
		);

		if (!doNamespace) {
			throw new TypeError(
				`Expected Durable Object namespace binding for ${scriptName}:${className}`
			);
		}

		const id =
			options.id === undefined
				? doNamespace.idFromName(options.name)
				: doNamespace.idFromString(options.id);
		const stub = doNamespace.get(id);

		await workerdUnsafe.evict(stub, {
			webSockets: options.webSockets,
		});
	}
}
