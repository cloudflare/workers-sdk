import { z } from "zod";
import {
	buildRemoteProxyProps,
	ProxyNodeBinding,
	remoteProxyClientWorker,
} from "../shared";
import type { Plugin, RemoteProxyConnectionString } from "../shared";

const VpcServicesSchema = z.object({
	service_id: z.string(),
	remoteProxyConnectionString: z
		.custom<RemoteProxyConnectionString>()
		.optional(),
});

export const VpcServicesOptionsSchema = z.object({
	vpcServices: z.record(z.string(), VpcServicesSchema).optional(),
});

export const VPC_SERVICES_PLUGIN_NAME = "vpc-services";
const VPC_SERVICES_REMOTE_SERVICE_NAME = `${VPC_SERVICES_PLUGIN_NAME}:remote`;

export const VPC_SERVICES_PLUGIN: Plugin<typeof VpcServicesOptionsSchema> = {
	options: VpcServicesOptionsSchema,
	bindingTypeDescription: "VPC service",
	async getBindings(options) {
		if (!options.vpcServices) {
			return [];
		}

		return Object.entries(options.vpcServices).map(
			([name, { remoteProxyConnectionString }]) => {
				return {
					name,

					service: {
						name: VPC_SERVICES_REMOTE_SERVICE_NAME,
						props: buildRemoteProxyProps(remoteProxyConnectionString, name),
					},
				};
			}
		);
	},
	getNodeBindings(options: z.infer<typeof VpcServicesOptionsSchema>) {
		if (!options.vpcServices) {
			return {};
		}
		return Object.fromEntries(
			Object.keys(options.vpcServices).map((name) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({ options }) {
		if (!options.vpcServices || Object.keys(options.vpcServices).length === 0) {
			return [];
		}

		return [
			{
				name: VPC_SERVICES_REMOTE_SERVICE_NAME,
				worker: remoteProxyClientWorker(),
			},
		];
	},
};
