import { z } from "zod";
import {
	buildRemoteProxyProps,
	ProxyNodeBinding,
	remoteProxyClientWorker,
} from "../shared";
import type { Plugin, RemoteProxyConnectionString } from "../shared";

const MessagingEntrySchema = z.object({
	namespace: z.string(),
	remoteProxyConnectionString: z
		.custom<RemoteProxyConnectionString>()
		.optional(),
});

export const MessagingOptionsSchema = z.object({
	messaging: z.record(MessagingEntrySchema).optional(),
});

export const MESSAGING_PLUGIN_NAME = "messaging";
const MESSAGING_REMOTE_SERVICE_NAME = `${MESSAGING_PLUGIN_NAME}:remote`;

export const MESSAGING_PLUGIN: Plugin<typeof MessagingOptionsSchema> = {
	options: MessagingOptionsSchema,
	bindingTypeDescription: "Messaging",
	async getBindings(options) {
		if (!options.messaging) {
			return [];
		}

		return Object.entries(options.messaging).map(([bindingName, entry]) => ({
			name: bindingName,
			service: {
				name: MESSAGING_REMOTE_SERVICE_NAME,
				props: buildRemoteProxyProps(
					entry.remoteProxyConnectionString,
					bindingName
				),
			},
		}));
	},
	getNodeBindings(options) {
		if (!options.messaging) {
			return {};
		}

		return Object.fromEntries(
			Object.keys(options.messaging).map((bindingName) => [
				bindingName,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({ options }) {
		if (!options.messaging || Object.keys(options.messaging).length === 0) {
			return [];
		}

		return [
			{
				name: MESSAGING_REMOTE_SERVICE_NAME,
				worker: remoteProxyClientWorker(),
			},
		];
	},
};
