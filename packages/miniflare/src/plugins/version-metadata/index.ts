import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Worker_Binding } from "../../runtime";
import { Plugin } from "../shared";

export const VERSION_METADATA_PLUGIN_NAME = "version-metadata";

export const VersionMetadataOptionsSchema = z.object({
	versionMetadata: z.string().optional(),
});

export const VERSION_METADATA_PLUGIN: Plugin<
	typeof VersionMetadataOptionsSchema
> = {
	options: VersionMetadataOptionsSchema,
	async getBindings(options) {
		if (!options.versionMetadata) {
			return [];
		}

		const id = randomUUID();
		const tag = "";
		const timestamp = new Date().toISOString();

		const bindings: Worker_Binding[] = [
			{
				name: options.versionMetadata,
				json: JSON.stringify({ id, tag, timestamp }),
			},
		];
		return bindings;
	},
	getNodeBindings(options: z.infer<typeof VersionMetadataOptionsSchema>) {
		if (!options.versionMetadata) {
			return {};
		}

		const id = randomUUID();
		const tag = "";
		const timestamp = new Date().toISOString();

		return {
			[options.versionMetadata]: { id, tag, timestamp },
		};
	},
	async getServices() {
		return [];
	},
};
