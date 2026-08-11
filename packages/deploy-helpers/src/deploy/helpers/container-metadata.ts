import {
	getContainerDurableObjectClassNames,
	getContainerInstanceGroupExports,
} from "@cloudflare/workers-utils";
import type { Config } from "@cloudflare/workers-utils";

export function getContainerMetadata(
	config: Config
): { name?: string; class_name?: string }[] | undefined {
	const metadata =
		config.containers?.map(({ name, class_name }) => ({
			...(name !== undefined && { name }),
			...(class_name !== undefined && { class_name }),
		})) ?? [];
	const applicationClassNames = getContainerDurableObjectClassNames(
		config.containers,
		config.exports
	);

	for (const { className } of getContainerInstanceGroupExports(
		config.exports
	)) {
		if (!applicationClassNames.has(className)) {
			metadata.push({ class_name: className });
			applicationClassNames.add(className);
		}
	}

	return metadata.length === 0 ? undefined : metadata;
}
