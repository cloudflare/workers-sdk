import SCRIPT_IMAGES_SERVICE from "worker:images/images";
import { z } from "zod";
import { Service } from "../../runtime";
import {
	getUserBindingServiceName,
	Plugin,
	ProxyNodeBinding,
	remoteProxyClientWorker,
	RemoteProxyConnectionString,
	WORKER_BINDING_SERVICE_LOOPBACK,
} from "../shared";

const ImagesSchema = z.object({
	binding: z.string(),
	remoteProxyConnectionString: z
		.custom<RemoteProxyConnectionString>()
		.optional(),
});

export const ImagesOptionsSchema = z.object({
	images: ImagesSchema.optional(),
});

export const IMAGES_PLUGIN_NAME = "images";

export const IMAGES_PLUGIN: Plugin<typeof ImagesOptionsSchema> = {
	options: ImagesOptionsSchema,
	async getBindings(options) {
		if (!options.images) {
			return [];
		}

		return [
			{
				name: options.images.binding,
				wrapped: {
					moduleName: "cloudflare-internal:images-api",
					innerBindings: [
						{
							name: "fetcher",
							service: {
								name: getUserBindingServiceName(
									IMAGES_PLUGIN_NAME,
									options.images.binding,
									options.images.remoteProxyConnectionString
								),
							},
						},
					],
				},
			},
		];
	},
	getNodeBindings(options: z.infer<typeof ImagesOptionsSchema>) {
		if (!options.images) {
			return {};
		}
		return {
			[options.images.binding]: new ProxyNodeBinding(),
		};
	},
	async getServices({ options }) {
		if (!options.images) {
			return [];
		}

		const serviceName = getUserBindingServiceName(
			IMAGES_PLUGIN_NAME,
			options.images.binding,
			options.images.remoteProxyConnectionString
		);

		const service: Service = {
			name: serviceName,
			worker: options.images.remoteProxyConnectionString
				? remoteProxyClientWorker(
						options.images.remoteProxyConnectionString,
						options.images.binding
					)
			: {
					compatibilityDate: "2025-04-01",
					compatibilityFlags: ["nodejs_compat"],
					modules: [
						{
							name: "images.worker.js",
							esModule: SCRIPT_IMAGES_SERVICE(),
						},
					],
					bindings: [WORKER_BINDING_SERVICE_LOOPBACK],
				},
		};

		return [service];
	},
};
