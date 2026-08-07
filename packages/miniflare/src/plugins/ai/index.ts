import { z } from "zod";
import { SERVICE_REMOTE_BINDINGS } from "../core";
import { buildRemoteProxyProps, ProxyNodeBinding } from "../shared";
import type { Plugin, RemoteProxyConnectionString } from "../shared";

const AISchema = z.object({
	binding: z.string(),
	remoteProxyConnectionString: z
		.custom<RemoteProxyConnectionString>()
		.optional(),
});

export const AIOptionsSchema = z.object({
	ai: AISchema.optional(),
});

export const AI_PLUGIN_NAME = "ai";

export const AI_PLUGIN: Plugin<typeof AIOptionsSchema> = {
	options: AIOptionsSchema,
	bindingTypeDescription: "AI",
	async getBindings(options) {
		if (!options.ai) {
			return [];
		}

		return [
			{
				name: options.ai.binding,
				wrapped: {
					moduleName: "cloudflare-internal:ai-api",
					innerBindings: [
						{
							name: "fetcher",
							service: {
								name: SERVICE_REMOTE_BINDINGS,
								props: buildRemoteProxyProps(
									options.ai.remoteProxyConnectionString,
									options.ai.binding
								),
							},
						},
					],
				},
			},
		];
	},
	getNodeBindings(options: z.infer<typeof AIOptionsSchema>) {
		if (!options.ai) {
			return {};
		}
		return {
			[options.ai.binding]: new ProxyNodeBinding(),
		};
	},
	async getServices() {
		return [];
	},
};
