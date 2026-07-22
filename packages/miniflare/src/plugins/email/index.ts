import { mkdir } from "node:fs/promises";
import path from "node:path";
import EMAIL_MESSAGE from "worker:email/email";
import SEND_EMAIL_BINDING from "worker:email/send_email";
import {
	buildRemoteProxyProps,
	getEnvBindingsOfType,
	getRemoteProxyConnectionString,
	getUserBindingServiceName,
	ProxyNodeBinding,
	remoteProxyClientWorker,
} from "../shared";
import type { Service, Worker_Binding } from "../../runtime";
import type { ParsedWorkerOptions, Plugin } from "../shared";

export const EMAIL_PLUGIN_NAME = "email";
const SERVICE_SEND_EMAIL_WORKER_PREFIX = `SEND-EMAIL-WORKER`;
const EMAIL_REMOTE_SERVICE_NAME = `${EMAIL_PLUGIN_NAME}:remote`;
// Disk service name and binding name for writing temporary files to system temp directory
const EMAIL_DISK_SERVICE_NAME = `${EMAIL_PLUGIN_NAME}:disk`;
const EMAIL_DISK_BINDING_NAME = "MINIFLARE_EMAIL_DISK";

function buildJsonBindings(bindings: Record<string, any>): Worker_Binding[] {
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
								props: buildRemoteProxyProps(
									remoteProxyConnectionString,
									name
								),
							}
						: {
								entrypoint: "SendEmailBinding",
								name: getUserBindingServiceName(
									SERVICE_SEND_EMAIL_WORKER_PREFIX,
									name
								),
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

		// Root directories for disk services - must exist before service creation
		// Subdirectories (e.g., email-text/, email-html/) are created lazily on first write
		const emailSystemDirectory = path.join(args.tmpPath, EMAIL_PLUGIN_NAME);
		await mkdir(emailSystemDirectory, { recursive: true });

		// Map binding disk services to names and paths, for concise access when storing emails as files.
		// When resourceTmpPath is unset, only create system service to avoid duplicates
		const diskServices: Array<{
			location: "system" | "project";
			bindingName: string;
			serviceName: string;
			path: string;
		}> = [
			{
				location: "system",
				bindingName: `${EMAIL_DISK_BINDING_NAME}_SYSTEM`,
				serviceName: `${EMAIL_DISK_SERVICE_NAME}:system`,
				path: emailSystemDirectory,
			},
		];

		if (args.resourceTmpPath) {
			const emailProjectSessionDirectory = getEmailProjectSessionDirectory(
				args.resourceTmpPath,
				args.tmpPath
			);
			if (emailProjectSessionDirectory !== undefined) {
				await mkdir(emailProjectSessionDirectory, { recursive: true });
				diskServices.push({
					location: "project",
					bindingName: `${EMAIL_DISK_BINDING_NAME}_PROJECT`,
					serviceName: `${EMAIL_DISK_SERVICE_NAME}:project`,
					path: emailProjectSessionDirectory,
				});
			}
		}

		const services: Service[] = diskServices.map(({ serviceName, path }) => ({
			name: serviceName,
			disk: {
				path,
				writable: true,
			},
		}));

		let hasRemote = false;
		for (const [name, binding] of sendEmailBindings) {
			if (getRemoteProxyConnectionString(binding, args.options.dev)) {
				hasRemote = true;
				continue;
			}

			// The local send-email worker reads these config values from env
			// under their original snake_case names, so map the renamed config
			// fields back and only include the ones that are present.
			const config: Record<string, unknown> = {};
			if (binding.destinationAddress !== undefined) {
				config.destination_address = binding.destinationAddress;
			}
			if (binding.allowedDestinationAddresses !== undefined) {
				config.allowed_destination_addresses =
					binding.allowedDestinationAddresses;
			}
			if (binding.allowedSenderAddresses !== undefined) {
				config.allowed_sender_addresses = binding.allowedSenderAddresses;
			}

			services.push({
				name: getUserBindingServiceName(SERVICE_SEND_EMAIL_WORKER_PREFIX, name),
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
						...diskServices.map(({ bindingName, serviceName }) => ({
							name: bindingName,
							service: { name: serviceName },
						})),
						{
							name: "email_disk_services",
							json: JSON.stringify(diskServices),
						},
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

	getExtensions({ options }: { options: ParsedWorkerOptions[] }) {
		if (
			!options.some(
				(o) => getEnvBindingsOfType(o.config, "send-email").length > 0
			)
		) {
			return [];
		}

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
