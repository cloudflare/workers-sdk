import { z } from "zod";
import {
	buildRemoteProxyProps,
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
// One shared remote-proxy service for every artifacts binding; per-binding
// config travels via props.
const ARTIFACTS_REMOTE_SERVICE_NAME = `${ARTIFACTS_PLUGIN_NAME}:remote`;

export const ARTIFACTS_PLUGIN: Plugin<typeof ArtifactsOptionsSchema> = {
	options: ArtifactsOptionsSchema,
	bindingTypeDescription: "Artifacts",
	async getBindings(options) {
		if (!options.artifacts) {
			return [];
		}

		return Object.entries(options.artifacts).map(([name, config]) => ({
			name,
			service: {
				name: ARTIFACTS_REMOTE_SERVICE_NAME,
				props: buildRemoteProxyProps(config.remoteProxyConnectionString, name),
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
		if (!options.artifacts || Object.keys(options.artifacts).length === 0) {
			return [];
		}

		return [
			{
				name: ARTIFACTS_REMOTE_SERVICE_NAME,
				worker: remoteProxyClientWorker(),
			},
		];
	},
};
