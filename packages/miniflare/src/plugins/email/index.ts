import path from "node:path";
import EMAIL_MESSAGE from "worker:email/email";
import SEND_EMAIL_BINDING from "worker:email/send_email";
import { CoreBindings } from "../../workers";
import { EMAIL_STORE_SERVICE_NAME } from "../core/constants";
import {
	buildRemoteProxyProps,
	getEnvBindingsOfType,
	getRemoteProxyConnectionString,
	getUserBindingServiceName,
	ProxyNodeBinding,
	remoteProxyClientWorker,
	WORKER_BINDING_SERVICE_LOOPBACK,
} from "../shared";
import type { Service, Worker_Binding } from "../../runtime";
import type { Plugin } from "../shared";

export const EMAIL_PLUGIN_NAME = "email";
const SERVICE_SEND_EMAIL_WORKER_PREFIX = `SEND-EMAIL-WORKER`;
const EMAIL_REMOTE_SERVICE_NAME = `${EMAIL_PLUGIN_NAME}:remote`;

function getSendEmailServiceName(
	workerName: string | undefined,
	bindingName: string
): string {
	const scope =
		workerName === undefined
			? SERVICE_SEND_EMAIL_WORKER_PREFIX
			: `${SERVICE_SEND_EMAIL_WORKER_PREFIX}:${workerName}`;
	return getUserBindingServiceName(scope, bindingName);
}

function buildJsonBindings(
	bindings: Record<string, unknown>
): Worker_Binding[] {
	return Object.entries(bindings).map(([name, value]) => ({
		name,
		json: JSON.stringify(value),
	}));
}

function getEmailProjectParentDirectory(
	resourceTmpPath: string | undefined
): string | undefined {
	if (resourceTmpPath === undefined) {
		return undefined;
	}
	return path.join(resourceTmpPath, EMAIL_PLUGIN_NAME);
}

/**
 * Returns the session directory for email files.
 * Path: `<resourceTmpPath>/email/<session-id>`
 * Example: `/path/to/project/.wrangler/tmp/email/dev-abc123`
 * When an email is logged, it is stored under this directory using a type indicator
 * and a unique ID.
 * Path: `<session-dir>/<email-type>/<message-id>.<ext>`
 */
function getEmailProjectSessionDirectory(
	resourceTmpPath: string | undefined,
	tmpPath: string
): string | undefined {
	const parentDir = getEmailProjectParentDirectory(resourceTmpPath);
	if (parentDir === undefined) {
		return undefined;
	}
	return path.join(parentDir, path.basename(tmpPath));
}

export function getEmailPathsToClean(
	resourceTmpPath: string | undefined,
	tmpPath: string
): { sessionDir: string; parentDir: string } | undefined {
	if (resourceTmpPath === undefined) {
		return undefined;
	}
	const sessionDir = getEmailProjectSessionDirectory(resourceTmpPath, tmpPath);
	const parentDir = getEmailProjectParentDirectory(resourceTmpPath);
	if (sessionDir === undefined || parentDir === undefined) {
		return undefined;
	}
	return { sessionDir, parentDir };
}

export const EMAIL_PLUGIN: Plugin = {
	bindingTypeDescription: "Email",
	getBindings(options): Worker_Binding[] {
		return getEnvBindingsOfType(options.config, "send-email").map(
			([name, binding]) => {
				const remoteProxyConnectionString = getRemoteProxyConnectionString(
					binding,
					options.dev
				);
				return {
					name,
					service: remoteProxyConnectionString
						? {
								name: EMAIL_REMOTE_SERVICE_NAME,
								props: buildRemoteProxyProps(remoteProxyConnectionString, name),
							}
						: {
								entrypoint: "SendEmailBinding",
								name: getSendEmailServiceName(options.config.name, name),
							},
				};
			}
		);
	},
	getNodeBindings(options) {
		return Object.fromEntries(
			getEnvBindingsOfType(options.config, "send-email").map(([name]) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices(args) {
		const sendEmailBindings = getEnvBindingsOfType(
			args.options.config,
			"send-email"
		);
		if (sendEmailBindings.length === 0) {
			return [];
		}

		const emailStoreBinding: Worker_Binding = {
			name: CoreBindings.SERVICE_EMAIL_STORE,
			service: { name: EMAIL_STORE_SERVICE_NAME },
		};

		// The worker that owns these send_email bindings. `getServices` is called
		// once per worker, so this identifies which worker sent a message and lets
		// the local explorer filter the "Sending" inbox by the selected worker.
		const ownerWorkerBinding: Worker_Binding = {
			name: "SEND_EMAIL_OWNER_WORKER",
			json: JSON.stringify(args.workerNames[args.workerIndex]),
		};

		const services: Service[] = [];
		let hasRemote = false;
		for (const [name, binding] of sendEmailBindings) {
			if (getRemoteProxyConnectionString(binding, args.options.dev)) {
				hasRemote = true;
				continue;
			}

			// The local send-email worker reads these config values from env
			// directly, so pass through only the ones that are present.
			const config: Record<string, unknown> = {};
			if (binding.destinationAddress !== undefined) {
				config.destinationAddress = binding.destinationAddress;
			}
			if (binding.allowedDestinationAddresses !== undefined) {
				config.allowedDestinationAddresses =
					binding.allowedDestinationAddresses;
			}
			if (binding.allowedSenderAddresses !== undefined) {
				config.allowedSenderAddresses = binding.allowedSenderAddresses;
			}

			services.push({
				name: getSendEmailServiceName(args.workerNames[args.workerIndex], name),
				worker: {
					compatibilityDate: "2025-03-17",
					modules: [
						{
							name: "send_email.mjs",
							esModule: SEND_EMAIL_BINDING(),
						},
					],
					bindings: [
						...buildJsonBindings(config),
						WORKER_BINDING_SERVICE_LOOPBACK,
						emailStoreBinding,
						ownerWorkerBinding,
					],
				},
			});
		}

		if (hasRemote) {
			services.push({
				name: EMAIL_REMOTE_SERVICE_NAME,
				worker: remoteProxyClientWorker(),
			});
		}

		return services;
	},

	getExtensions() {
		return [
			{
				modules: [
					{
						name: "cloudflare-internal:email",
						esModule: EMAIL_MESSAGE(),
						internal: true,
					},
				],
			},
		];
	},
};
