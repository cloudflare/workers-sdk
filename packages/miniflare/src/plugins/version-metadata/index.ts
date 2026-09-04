import { randomUUID } from "node:crypto";
import { getEnvBindingsOfType } from "../shared";
import type { Worker_Binding } from "../../runtime";
import type { Plugin } from "../shared";

export const VERSION_METADATA_PLUGIN_NAME = "version-metadata";

export const VERSION_METADATA_PLUGIN: Plugin = {
	async getBindings(options) {
		return getEnvBindingsOfType(
			options.config,
			"version-metadata"
		).map<Worker_Binding>(([name]) => {
			const id = randomUUID();
			const tag = "";
			const timestamp = new Date().toISOString();

			return {
				name,
				json: JSON.stringify({ id, tag, timestamp }),
			};
		});
	},
	getNodeBindings(options) {
		return Object.fromEntries(
			getEnvBindingsOfType(options.config, "version-metadata").map(([name]) => {
				const id = randomUUID();
				const tag = "";
				const timestamp = new Date().toISOString();

				return [name, { id, tag, timestamp }];
			})
		);
	},
	async getServices() {
		return [];
	},
};
