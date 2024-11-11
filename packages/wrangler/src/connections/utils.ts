import { ConnectionBinding } from "./client";

export function validateMetadata(
	metadata: string | undefined
): Record<string, unknown> {
	if (!metadata) return {};

	let json: Record<string, unknown>;
	try {
		json = JSON.parse(metadata);
	} catch (e) {
		throw new Error("Metadata property was not valid JSON");
	}

	// TODO: validate schema?
	return json;
}

export function validateResources(
	resources: (string | number)[] | undefined
): ConnectionBinding[] {
	if (!resources) return [];

	return resources.map((resource) => {
		let json: ConnectionBinding;
		try {
			json = JSON.parse(String(resource));
		} catch (e) {
			throw new Error("Resources property was not valid JSON");
		}

		if (!json.name) {
			throw new Error("Resource name is required");
		}
		if (!json.target_script) {
			throw new Error("Resource target_script is required");
		}
		return json;
	});
}
