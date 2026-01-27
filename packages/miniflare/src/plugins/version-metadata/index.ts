import { z } from "zod";
import { Worker_Binding } from "../../runtime";
import { Plugin } from "../shared";

export const VERSION_METADATA_PLUGIN_NAME = "version-metadata";

const VersionMetadataSchema = z.object({
	binding: z.string(),
	id: z.string(),
	tag: z.string(),
	timestamp: z.string(),
});

export const VersionMetadataOptionsSchema = z.object({
	versionMetadata: VersionMetadataSchema.optional(),
});

export const VERSION_METADATA_PLUGIN: Plugin<
	typeof VersionMetadataOptionsSchema
> = {
	options: VersionMetadataOptionsSchema,
	async getBindings(options) {
		if (!options.versionMetadata) {
			return [];
		}

		const { binding, id, tag, timestamp } = options.versionMetadata;

		const bindings: Worker_Binding[] = [
			{
				name: binding,
				json: JSON.stringify({ id, tag, timestamp }),
			},
		];
		return bindings;
	},
	getNodeBindings(options: z.infer<typeof VersionMetadataOptionsSchema>) {
		if (!options.versionMetadata) {
			return {};
		}
		return {
			[options.versionMetadata.binding]: {
				id: options.versionMetadata.id,
				tag: options.versionMetadata.tag,
				timestamp: options.versionMetadata.timestamp,
			},
		};
	},
	async getServices() {
		return [];
	},
};
