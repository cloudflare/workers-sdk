import { z } from "zod";
import { SERVICE_REMOTE_BINDINGS } from "../core";
import { buildRemoteProxyProps, ProxyNodeBinding } from "../shared";
import type { Plugin, RemoteProxyConnectionString } from "../shared";

export const MEDIA_PLUGIN_NAME = "media";

const MediaSchema = z.object({
	binding: z.string(),
	remoteProxyConnectionString: z
		.custom<RemoteProxyConnectionString>()
		.optional(),
});

export const MediaOptionsSchema = z.object({
	media: MediaSchema.optional(),
});

export const MEDIA_PLUGIN: Plugin<typeof MediaOptionsSchema> = {
	options: MediaOptionsSchema,
	bindingTypeDescription: "Media",
	async getBindings(options) {
		if (!options.media) {
			return [];
		}

		return [
			{
				name: options.media.binding,
				service: {
					name: SERVICE_REMOTE_BINDINGS,
					props: buildRemoteProxyProps(
						options.media.remoteProxyConnectionString,
						options.media.binding
					),
				},
			},
		];
	},
	getNodeBindings(options: z.infer<typeof MediaOptionsSchema>) {
		if (!options.media) {
			return {};
		}
		return {
			[options.media.binding]: new ProxyNodeBinding(),
		};
	},
	async getServices({ options }) {
		return [];
	},
};
