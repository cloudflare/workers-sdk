import type { Config } from "../config";
import { UserError } from "../errors";
import type { ConnectionBinding } from "./client";

export function validateMetadata(
	metadata: string | undefined
): Record<string, unknown> {
	if (!metadata) {return {};}

	let json: Record<string, unknown>;
	try {
		json = JSON.parse(metadata);
	} catch (e) {
		throw new UserError("Metadata property was not valid JSON");
	}

	// TODO: validate schema?
	return json;
}

export function validateResources(
	resources: (string | number)[] | undefined,
	config: Config
): ConnectionBinding[] {
	if (!resources) {return [];}

	return resources.map((resource) => {
		const [name, target_script = config.name, entrypoint = "default", ...args] =
			String(resource).split(":");

		if (!name) {
			throw new UserError("Resource name is required");
		}
		if (!target_script) {
			throw new UserError(
				"Resource target_script is required as none was inferred from config"
			);
		}
		return {
			name,
			target_script,
			entrypoint,
			args: args.length ? JSON.parse(args.join(":")) : {},
		};
	});
}

export function validateHooks(
	hooks: (string | number)[] | undefined,
	config: Config
): ConnectionBinding[] {
	if (!hooks) {return [];}

	return hooks.map((hook) => {
		const [name, target_script = config.name, entrypoint = "default", ...args] =
			String(hook)
				.split(":")
				.map((s) => (s === "" ? undefined : s));

		if (!name) {
			throw new UserError("Hook name is required");
		}
		if (!target_script) {
			throw new UserError(
				"Hook target_script is required as none was inferred from config"
			);
		}
		return {
			name,
			target_script,
			entrypoint,
			args: args.length ? JSON.parse(args.join(":")) : {},
		};
	});
}
