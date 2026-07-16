import { z } from "zod";
import {
	buildRemoteProxyProps,
	ProxyNodeBinding,
	remoteProxyClientWorker,
} from "../shared";
import type { Plugin, RemoteProxyConnectionString } from "../shared";

const MtlsSchema = z.object({
	certificate_id: z.string(),
	remoteProxyConnectionString: z
		.custom<RemoteProxyConnectionString>()
		.optional(),
});

export const MtlsOptionsSchema = z.object({
	mtlsCertificates: z.record(z.string(), MtlsSchema).optional(),
});

export const MTLS_PLUGIN_NAME = "mtls";
const MTLS_REMOTE_SERVICE_NAME = `${MTLS_PLUGIN_NAME}:remote`;

export const MTLS_PLUGIN: Plugin<typeof MtlsOptionsSchema> = {
	options: MtlsOptionsSchema,
	bindingTypeDescription: "mTLS certificate",
	async getBindings(options) {
		if (!options.mtlsCertificates) {
			return [];
		}

		return Object.entries(options.mtlsCertificates).map(
			([name, { remoteProxyConnectionString }]) => {
				return {
					name,

					service: {
						name: MTLS_REMOTE_SERVICE_NAME,
						props: buildRemoteProxyProps(remoteProxyConnectionString, name),
					},
				};
			}
		);
	},
	getNodeBindings(options: z.infer<typeof MtlsOptionsSchema>) {
		if (!options.mtlsCertificates) {
			return {};
		}
		return Object.fromEntries(
			Object.keys(options.mtlsCertificates).map((name) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({ options }) {
		if (
			!options.mtlsCertificates ||
			Object.keys(options.mtlsCertificates).length === 0
		) {
			return [];
		}

		return [
			{
				name: MTLS_REMOTE_SERVICE_NAME,
				worker: remoteProxyClientWorker(),
			},
		];
	},
};
