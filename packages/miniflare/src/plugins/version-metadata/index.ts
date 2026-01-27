import VERSION_METADATA_SCRIPT from "worker:version-metadata/version-metadata";
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
				wrapped: {
					moduleName: `${VERSION_METADATA_PLUGIN_NAME}:local-simulator`,
					innerBindings: [
						{
							name: "id",
							json: JSON.stringify(id),
						},
						{
							name: "tag",
							json: JSON.stringify(tag),
						},
						{
							name: "timestamp",
							json: JSON.stringify(timestamp),
						},
					],
				},
			},
		];
		return bindings;
	},
	getNodeBindings(options: z.infer<typeof VersionMetadataOptionsSchema>) {
		if (!options.versionMetadata) {
			return {};
		}
		// Return the version metadata object directly for Node.js bindings
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
	getExtensions({ options }) {
		if (!options.some((o) => o.versionMetadata)) {
			return [];
		}
		return [
			{
				modules: [
					{
						name: `${VERSION_METADATA_PLUGIN_NAME}:local-simulator`,
						esModule: VERSION_METADATA_SCRIPT(),
						internal: true,
					},
				],
			},
		];
	},
};
