import type { Config } from "@cloudflare/workers-utils";

export function getContainerMetadata(
	config: Config
): { name?: string; class_name?: string }[] | undefined {
	const metadata =
		config.containers?.map(({ name, class_name }) => ({
			...(name !== undefined && { name }),
			...(class_name !== undefined && { class_name }),
		})) ?? [];

	return metadata.length === 0 ? undefined : metadata;
}
