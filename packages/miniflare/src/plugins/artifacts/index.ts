import { z } from "zod";
import {
	getUserBindingServiceName,
	ProxyNodeBinding,
	remoteProxyClientWorker,
} from "../shared";
import type { Plugin, RemoteProxyConnectionString } from "../shared";

const ArtifactsSchema = z.object({
	namespace: z.string(),
	remoteProxyConnectionString: z
		.custom<RemoteProxyConnectionString>()
		.optional(),
});

export const ArtifactsOptionsSchema = z.object({
	artifacts: z.record(ArtifactsSchema).optional(),
});

export const ARTIFACTS_PLUGIN_NAME = "artifacts";

export const ARTIFACTS_PLUGIN: Plugin<typeof ArtifactsOptionsSchema> = {
	options: ArtifactsOptionsSchema,
	async getBindings(options) {
		if (!options.artifacts) {
			return [];
		}

		return Object.entries(options.artifacts).map(([name, config]) => ({
			name,
			service: {
				name: getUserBindingServiceName(
					ARTIFACTS_PLUGIN_NAME,
					name,
					config.remoteProxyConnectionString
				),
			},
		}));
	},
	getNodeBindings(options: z.infer<typeof ArtifactsOptionsSchema>) {
		if (!options.artifacts) {
			return {};
		}
		return Object.fromEntries(
			Object.keys(options.artifacts).map((name) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({ options }) {
		if (!options.artifacts) {
			return [];
		}

		return Object.entries(options.artifacts).map(
			([name, { remoteProxyConnectionString }]) => ({
				name: getUserBindingServiceName(
					ARTIFACTS_PLUGIN_NAME,
					name,
					remoteProxyConnectionString
				),
				worker: remoteProxyClientWorker(remoteProxyConnectionString, name),
			})
		);
	},
};
