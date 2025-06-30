import assert from "node:assert";
import { z } from "zod";
import {
	Plugin,
	ProxyNodeBinding,
	remoteProxyClientWorker,
	RemoteProxyConnectionString,
} from "../shared";

const MtlsSchema = z.object({
	certificate_id: z.string(),
	remoteProxyConnectionString: z.custom<RemoteProxyConnectionString>(),
});

export const MtlsOptionsSchema = z.object({
	mtlsCertificates: z.record(MtlsSchema).optional(),
});

export const MTLS_PLUGIN_NAME = "mtls";

export const MTLS_PLUGIN: Plugin<typeof MtlsOptionsSchema> = {
	options: MtlsOptionsSchema,
	async getBindings(options) {
		if (!options.mtlsCertificates) {
			return [];
		}

		return Object.entries(options.mtlsCertificates).map(
			([name, { certificate_id, remoteProxyConnectionString }]) => {
				assert(
					remoteProxyConnectionString,
					"MTLS only supports running remotely"
				);

				return {
					name,

					service: {
						name: `${MTLS_PLUGIN_NAME}:${certificate_id}`,
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
		if (!options.mtlsCertificates) {
			return [];
		}

		return Object.entries(options.mtlsCertificates).map(
			([name, { certificate_id, remoteProxyConnectionString }]) => {
				assert(
					remoteProxyConnectionString,
					"MTLS only supports running remotely"
				);

				return {
					name: `${MTLS_PLUGIN_NAME}:${certificate_id}`,
					worker: remoteProxyClientWorker(remoteProxyConnectionString, name),
				};
			}
		);
	},
};
