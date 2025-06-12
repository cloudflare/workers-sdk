import assert from "node:assert";
import { z } from "zod";
import {
	Plugin,
	ProxyNodeBinding,
	remoteProxyClientWorker,
	RemoteProxyConnectionString,
} from "../shared";

const AISchema = z.object({
	binding: z.string(),
	remoteProxyConnectionString: z.custom<RemoteProxyConnectionString>(),
});

export const AIOptionsSchema = z.object({
	ai: AISchema.optional(),
});

export const AI_PLUGIN_NAME = "ai";

export const AI_PLUGIN: Plugin<typeof AIOptionsSchema> = {
	options: AIOptionsSchema,
	async getBindings(options) {
		if (!options.ai) {
			return [];
		}

		assert(
			options.ai.remoteProxyConnectionString,
			"Workers AI only supports running remotely"
		);

		return [
			{
				name: options.ai.binding,
				wrapped: {
					moduleName: "cloudflare-internal:ai-api",
					innerBindings: [
						{
							name: "fetcher",
							service: { name: `${AI_PLUGIN_NAME}:${options.ai.binding}` },
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
	async getServices({ options }) {
		if (!options.ai) {
			return [];
		}

		return [
			{
				name: `${AI_PLUGIN_NAME}:${options.ai.binding}`,
				worker: remoteProxyClientWorker(
					options.ai.remoteProxyConnectionString,
					options.ai.binding
				),
			},
		];
	},
};
