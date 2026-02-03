import BINDING from "worker:media/binding";
import * as z from "zod/v4";
import {
	getUserBindingServiceName,
	Plugin,
	ProxyNodeBinding,
	remoteProxyClientWorker,
	RemoteProxyConnectionString,
} from "../shared";

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
	async getBindings(options) {
		if (!options.media) {
			return [];
		}

		return [
			{
				name: options.media.binding,
				service: {
					name: getUserBindingServiceName(
						MEDIA_PLUGIN_NAME,
						options.media.binding,
						options.media.remoteProxyConnectionString
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
		if (!options.media) {
			return [];
		}

		return [
			{
				name: getUserBindingServiceName(
					MEDIA_PLUGIN_NAME,
					options.media.binding,
					options.media.remoteProxyConnectionString
				),
				worker: {
					compatibilityDate: "2025-01-01",
					modules: [
						{
							name: "index.worker.js",
							esModule: BINDING(),
						},
					],
					bindings: [
						{
							name: "remote",
							service: {
								name: getUserBindingServiceName(
									`${MEDIA_PLUGIN_NAME}:remote`,
									options.media.binding,
									options.media.remoteProxyConnectionString
								),
							},
						},
					],
				},
			},
			{
				name: getUserBindingServiceName(
					`${MEDIA_PLUGIN_NAME}:remote`,
					options.media.binding,
					options.media.remoteProxyConnectionString
				),
				worker: remoteProxyClientWorker(
					options.media.remoteProxyConnectionString,
					options.media.binding
				),
			},
		];
	},
};
