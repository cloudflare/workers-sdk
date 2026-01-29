import { stripVTControlCharacters } from "node:util";
import { brandColor, dim, white } from "@cloudflare/cli/colors";
import {
	getBindingTypeFriendlyName,
	UserError,
} from "@cloudflare/workers-utils";
import chalk from "chalk";
import { getFlag } from "../experimental-flags";
import { logger } from "../logger";
import type { Binding, StartDevWorkerInput } from "../api/startDevWorker/types";
import type {
	CfTailConsumer,
	ContainerApp,
	WorkerMetadataBinding,
} from "@cloudflare/workers-utils";
import type { WorkerRegistry } from "miniflare";

/**
 * Tracks whether we have already explained the connected status
 */
let isConnectedStatusExplained = false;

/**
 * Print all the bindings a worker would have access to.
 * Accepts either:
 * - StartDevWorkerInput["bindings"] format (Record<string, Binding>)
 * - WorkerMetadataBinding[] format (array from API responses)
 */
export function printBindings(
	bindings: StartDevWorkerInput["bindings"] | WorkerMetadataBinding[],
	tailConsumers: CfTailConsumer[] = [],
	streamingTailConsumers: CfTailConsumer[] = [],
	containers: ContainerApp[] = [],
	context: {
		log?: (message: string) => void;
		registry?: WorkerRegistry | null;
		local?: boolean;
		isMultiWorker?: boolean;
		remoteBindingsDisabled?: boolean;
		name?: string;
		provisioning?: boolean;
		warnIfNoBindings?: boolean;
		unsafeMetadata?: Record<string, unknown>;
	} = {}
) {
	let hasConnectionStatus = false;

	const log = context.log ?? logger.log;
	const isMultiWorker = context.isMultiWorker ?? getFlag("MULTIWORKER");
	const getMode = createGetMode({
		isProvisioning: context.provisioning,
		isLocalDev: context.local,
	});
	const truncate = (item: string | Record<string, unknown>, maxLength = 40) => {
		const s = typeof item === "string" ? item : JSON.stringify(item);
		if (s.length < maxLength) {
			return s;
		}

		return `${s.substring(0, maxLength - 3)}...`;
	};

	const output: {
		name: string;
		type: string;
		value: string | undefined | symbol;
		mode: string | undefined;
	}[] = [];

	if (bindings) {
		// Check if bindings is an array (WorkerMetadataBinding[]) or a record (StartDevWorkerInput["bindings"])
		if (Array.isArray(bindings)) {
			// WorkerMetadataBinding[] format
			for (const binding of bindings) {
				const entry = getMetadataBindingOutputEntry(
					binding,
					truncate,
					getMode,
					context
				);
				if (entry) {
					if (entry.hasConnectionStatus) {
						hasConnectionStatus = true;
					}
					output.push({
						name: entry.name,
						type: entry.type,
						value: entry.value,
						mode: entry.mode,
					});
				}
			}
		} else {
			// Record<string, Binding> format
			for (const [bindingName, binding] of Object.entries(bindings)) {
				const entry = getBindingOutputEntry(
					bindingName,
					binding,
					truncate,
					getMode,
					context
				);
				if (entry) {
					if (entry.hasConnectionStatus) {
						hasConnectionStatus = true;
					}
					output.push({
						name: entry.name,
						type: entry.type,
						value: entry.value,
						mode: entry.mode,
					});
				}
			}
		}
	}

	// Handle unsafe.metadata entries (these are printed as "Unsafe Metadata" bindings)
	if (context.unsafeMetadata !== undefined) {
		for (const [key, value] of Object.entries(context.unsafeMetadata)) {
			output.push({
				name: key,
				type: getBindingTypeFriendlyName("unsafe_"),
				value: JSON.stringify(value),
				mode: getMode({ isSimulatedLocally: false }),
			});
		}
	}

	if (output.length === 0) {
		if (context.warnIfNoBindings) {
			if (context.name && isMultiWorker) {
				log(`No bindings found for ${chalk.blue(context.name)}`);
			} else {
				log("No bindings found.");
			}
		}
	} else {
		let title: string;
		if (context.provisioning) {
			title = `${chalk.red("Experimental:")} The following bindings need to be provisioned:`;
		} else if (context.name && isMultiWorker) {
			title = `${chalk.blue(context.name)} has access to the following bindings:`;
		} else {
			title = "Your Worker has access to the following bindings:";
		}

		const headings = {
			binding: "Binding",
			resource: "Resource",
			mode: "Mode",
		} as const;

		const maxValueLength = Math.max(
			...output.map((b) =>
				typeof b.value === "symbol" ? "inherited".length : b.value?.length ?? 0
			)
		);
		const maxNameLength = Math.max(...output.map((b) => b.name.length));
		const maxTypeLength = Math.max(
			...output.map((b) => b.type.length),
			headings.resource.length
		);
		const maxModeLength = Math.max(
			...output.map((b) =>
				b.mode ? stripVTControlCharacters(b.mode).length : headings.mode.length
			)
		);

		const hasMode = output.some((b) => b.mode);
		const bindingPrefix = `env.`;
		const bindingLength =
			bindingPrefix.length +
			maxNameLength +
			" (".length +
			maxValueLength +
			")".length;

		const columnGapSpaces = 6;
		const columnGapSpacesWrapped = 4;

		const shouldWrap =
			bindingLength +
				columnGapSpaces +
				maxTypeLength +
				columnGapSpaces +
				maxModeLength >=
			process.stdout.columns;

		log(title);
		const columnGap = shouldWrap
			? " ".repeat(columnGapSpacesWrapped)
			: " ".repeat(columnGapSpaces);

		log(
			`${padEndAnsi(dim(headings.binding), shouldWrap ? bindingPrefix.length + maxNameLength : bindingLength)}${columnGap}${padEndAnsi(dim(headings.resource), maxTypeLength)}${columnGap}${hasMode ? dim(headings.mode) : ""}`
		);

		for (const binding of output) {
			const bindingValue = dim(
				typeof binding.value === "symbol"
					? chalk.italic("inherited")
					: binding.value ?? ""
			);
			const bindingString = padEndAnsi(
				`${white(`env.${binding.name}`)}${binding.value && !shouldWrap ? ` (${bindingValue})` : ""}`,
				shouldWrap ? bindingPrefix.length + maxNameLength : bindingLength
			);

			const suffix = shouldWrap
				? binding.value
					? `\n  ${bindingValue}`
					: ""
				: "";

			log(
				`${bindingString}${columnGap}${brandColor(binding.type.padEnd(maxTypeLength))}${columnGap}${hasMode ? binding.mode : ""}${suffix}`
			);
		}
		log("");
	}
	let title: string;
	if (context.name && isMultiWorker) {
		title = `${chalk.blue(context.name)} is sending Tail events to the following Workers:`;
	} else {
		title = "Your Worker is sending Tail events to the following Workers:";
	}

	const allTailConsumers = [
		...(tailConsumers ?? []).map((c) => ({
			service: c.service,
			streaming: false,
		})),
		...(streamingTailConsumers ?? []).map((c) => ({
			service: c.service,
			streaming: true,
		})),
	];
	if (allTailConsumers.length > 0) {
		log(
			`${title}\n${allTailConsumers
				.map(({ service, streaming }) => {
					const displayName = `${service}${streaming ? ` (streaming)` : ""}`;
					if (context.local && context.registry !== null) {
						const registryDefinition = context.registry?.[service];
						hasConnectionStatus = true;

						if (registryDefinition) {
							return `- ${displayName} ${chalk.green("[connected]")}`;
						} else {
							return `- ${displayName} ${chalk.red("[not connected]")}`;
						}
					} else {
						return `- ${displayName}`;
					}
				})
				.join("\n")}`
		);
	}

	if (containers.length > 0 && !context.provisioning) {
		let containersTitle = "The following containers are available:";
		if (context.name && isMultiWorker) {
			containersTitle = `The following containers are available from ${chalk.blue(context.name)}:`;
		}

		logger.log(
			`${containersTitle}\n${containers
				.map((c) => {
					return `- ${c.name} (${c.image})`;
				})
				.join("\n")}`
		);
		logger.log();
	}

	if (hasConnectionStatus && !isConnectedStatusExplained) {
		log(
			dim(
				`\nService bindings, Durable Object bindings, and Tail consumers connect to other Wrangler or Vite dev processes running locally, with their connection status indicated by ${chalk.green("[connected]")} or ${chalk.red("[not connected]")}. For more details, refer to https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/#local-development\n`
			)
		);
		isConnectedStatusExplained = true;
	}
}

/**
 * Helper function to get the output entry for a single binding.
 */
function getBindingOutputEntry(
	bindingName: string,
	binding: Binding,
	truncate: (
		item: string | Record<string, unknown>,
		maxLength?: number
	) => string,
	getMode: ReturnType<typeof createGetMode>,
	context: {
		registry?: WorkerRegistry | null;
		local?: boolean;
		remoteBindingsDisabled?: boolean;
		name?: string;
	}
): {
	name: string;
	type: string;
	value: string | undefined | symbol;
	mode: string | undefined;
	hasConnectionStatus?: boolean;
} | null {
	const friendlyName = getBindingTypeFriendlyName(binding.type);

	switch (binding.type) {
		case "plain_text":
			return {
				name: bindingName,
				type: friendlyName,
				value: `"${truncate(binding.value)}"`,
				mode: getMode({ isSimulatedLocally: true }),
			};

		case "json":
			return {
				name: bindingName,
				type: friendlyName,
				value: truncate(JSON.stringify(binding.value)),
				mode: getMode({ isSimulatedLocally: true }),
			};

		case "kv_namespace":
			return {
				name: bindingName,
				type: friendlyName,
				value: binding.id,
				mode: getMode({
					isSimulatedLocally: context.remoteBindingsDisabled || !binding.remote,
				}),
			};

		case "send_email": {
			const destination_address =
				"destination_address" in binding
					? (binding.destination_address as string | undefined)
					: undefined;
			const allowed_destination_addresses =
				"allowed_destination_addresses" in binding
					? (binding.allowed_destination_addresses as string[] | undefined)
					: undefined;
			const allowed_sender_addresses =
				"allowed_sender_addresses" in binding
					? (binding.allowed_sender_addresses as string[] | undefined)
					: undefined;
			let value =
				destination_address ||
				allowed_destination_addresses?.join(", ") ||
				"unrestricted";

			if (allowed_sender_addresses) {
				value += ` - senders: ${allowed_sender_addresses.join(", ")}`;
			}
			return {
				name: bindingName,
				type: friendlyName,
				value,
				mode: getMode({
					isSimulatedLocally: context.remoteBindingsDisabled || !binding.remote,
				}),
			};
		}

		case "wasm_module": {
			const path = "path" in binding.source ? binding.source.path : undefined;
			return {
				name: bindingName,
				type: friendlyName,
				value: path ? truncate(path) : "<Wasm>",
				mode: getMode({ isSimulatedLocally: true }),
			};
		}

		case "text_blob":
			return {
				name: bindingName,
				type: friendlyName,
				value:
					"contents" in binding.source
						? truncate(binding.source.contents)
						: "path" in binding.source
							? truncate(binding.source.path)
							: undefined,
				mode: getMode({ isSimulatedLocally: true }),
			};

		case "browser":
			return {
				name: bindingName,
				type: friendlyName,
				value: undefined,
				mode: getMode({
					isSimulatedLocally: context.remoteBindingsDisabled || !binding.remote,
				}),
			};

		case "ai":
			return {
				name: bindingName,
				type: friendlyName,
				value: binding.staging ? `staging` : undefined,
				mode: getMode({
					isSimulatedLocally:
						(binding.remote === true || binding.remote === undefined) &&
						!context.remoteBindingsDisabled
							? false
							: undefined,
				}),
			};

		case "images":
			return {
				name: bindingName,
				type: friendlyName,
				value: undefined,
				mode: getMode({
					isSimulatedLocally: context.remoteBindingsDisabled || !binding.remote,
				}),
			};

		case "version_metadata":
			return {
				name: bindingName,
				type: friendlyName,
				value: undefined,
				mode: getMode({ isSimulatedLocally: true }),
			};

		case "data_blob": {
			const path = "path" in binding.source ? binding.source.path : undefined;
			return {
				name: bindingName,
				type: friendlyName,
				value: path ? truncate(path) : "<Buffer>",
				mode: getMode({ isSimulatedLocally: true }),
			};
		}

		case "durable_object_namespace": {
			let value = binding.class_name;
			let mode = undefined;
			let hasConnectionStatus = false;

			if (binding.script_name) {
				if (context.local && context.registry !== null) {
					const registryDefinition = context.registry?.[binding.script_name];

					hasConnectionStatus = true;
					if (
						registryDefinition &&
						registryDefinition.durableObjects.some(
							(d) => d.className === binding.class_name
						)
					) {
						value += `, defined in ${binding.script_name}`;
						mode = getMode({ isSimulatedLocally: true, connected: true });
					} else {
						value += `, defined in ${binding.script_name}`;
						mode = getMode({ isSimulatedLocally: true, connected: false });
					}
				} else {
					value += `, defined in ${binding.script_name}`;
					mode = getMode({ isSimulatedLocally: true });
				}
			} else {
				mode = getMode({ isSimulatedLocally: true });
			}

			return {
				name: bindingName,
				type: friendlyName,
				value,
				mode,
				hasConnectionStatus,
			};
		}

		case "workflow": {
			let value = binding.class_name;
			if (binding.script_name) {
				value += ` (defined in ${binding.script_name})`;
			}

			return {
				name: bindingName,
				type: friendlyName,
				value,
				mode: getMode({
					isSimulatedLocally:
						binding.script_name && !context.remoteBindingsDisabled
							? !binding.remote
							: true,
				}),
			};
		}

		case "queue":
			return {
				name: bindingName,
				type: friendlyName,
				value: binding.queue_name,
				mode: getMode({
					isSimulatedLocally: context.remoteBindingsDisabled || !binding.remote,
				}),
			};

		case "r2_bucket": {
			const value =
				typeof binding.bucket_name === "symbol"
					? binding.bucket_name
					: binding.bucket_name
						? `${binding.bucket_name}${binding.jurisdiction ? ` (${binding.jurisdiction})` : ""}`
						: undefined;

			return {
				name: bindingName,
				type: friendlyName,
				value,
				mode: getMode({
					isSimulatedLocally: context.remoteBindingsDisabled || !binding.remote,
				}),
			};
		}

		case "d1": {
			const value =
				typeof binding.database_id === "symbol"
					? binding.database_id
					: binding.preview_database_id ??
						binding.database_name ??
						binding.database_id;

			return {
				name: bindingName,
				type: friendlyName,
				value,
				mode: getMode({
					isSimulatedLocally: context.remoteBindingsDisabled || !binding.remote,
				}),
			};
		}

		case "vectorize":
			return {
				name: bindingName,
				type: friendlyName,
				value: binding.index_name,
				mode: getMode({
					isSimulatedLocally:
						binding.remote && !context.remoteBindingsDisabled
							? false
							: undefined,
				}),
			};

		case "hyperdrive":
			return {
				name: bindingName,
				type: friendlyName,
				value: binding.id,
				mode: getMode({ isSimulatedLocally: true }),
			};

		case "service": {
			let value = binding.service;
			let mode = undefined;
			let hasConnectionStatus = false;

			if (binding.entrypoint) {
				value += `#${binding.entrypoint}`;
			}

			if (binding.remote) {
				mode = getMode({ isSimulatedLocally: false });
			} else if (context.local && context.registry !== null) {
				const isSelfBinding = binding.service === context.name;

				if (isSelfBinding) {
					hasConnectionStatus = true;
					mode = getMode({ isSimulatedLocally: true, connected: true });
				} else {
					const registryDefinition = context.registry?.[binding.service];
					hasConnectionStatus = true;

					if (
						registryDefinition &&
						(!binding.entrypoint ||
							registryDefinition.entrypointAddresses?.[binding.entrypoint])
					) {
						mode = getMode({ isSimulatedLocally: true, connected: true });
					} else {
						mode = getMode({ isSimulatedLocally: true, connected: false });
					}
				}
			}

			return {
				name: bindingName,
				type: friendlyName,
				value,
				mode,
				hasConnectionStatus,
			};
		}

		case "fetcher":
			return {
				name: bindingName,
				type: friendlyName,
				value: undefined,
				mode: getMode({ isSimulatedLocally: true }),
			};

		case "analytics_engine":
			return {
				name: bindingName,
				type: friendlyName,
				value: binding.dataset ?? bindingName,
				mode: getMode({ isSimulatedLocally: true }),
			};

		case "dispatch_namespace":
			return {
				name: bindingName,
				type: friendlyName,
				value: binding.outbound
					? `${binding.namespace} (outbound -> ${binding.outbound.service})`
					: binding.namespace,
				mode: getMode({
					isSimulatedLocally:
						binding.remote && !context.remoteBindingsDisabled
							? false
							: undefined,
				}),
			};

		case "mtls_certificate":
			return {
				name: bindingName,
				type: friendlyName,
				value: binding.certificate_id,
				mode: getMode({
					isSimulatedLocally:
						binding.remote && !context.remoteBindingsDisabled
							? false
							: undefined,
				}),
			};

		case "pipeline":
			return {
				name: bindingName,
				type: friendlyName,
				value: binding.pipeline,
				mode: getMode({
					isSimulatedLocally: context.remoteBindingsDisabled || !binding.remote,
				}),
			};

		case "secrets_store_secret":
			return {
				name: bindingName,
				type: friendlyName,
				value: `${binding.store_id}/${binding.secret_name}`,
				mode: getMode({ isSimulatedLocally: true }),
			};

		case "logfwdr":
			return {
				name: bindingName,
				type: friendlyName,
				value: binding.destination,
				mode: getMode(),
			};

		case "unsafe_hello_world": {
			const enableTimer =
				"enable_timer" in binding ? binding.enable_timer : false;
			return {
				name: bindingName,
				type: friendlyName,
				value: enableTimer ? `Timer enabled` : `Timer disabled`,
				mode: getMode({ isSimulatedLocally: true }),
			};
		}

		case "ratelimit":
			return {
				name: bindingName,
				type: friendlyName,
				value: `${binding.simple.limit} requests/${binding.simple.period}s`,
				mode: getMode({ isSimulatedLocally: true }),
			};

		case "worker_loader":
			return {
				name: bindingName,
				type: friendlyName,
				value: undefined,
				mode: getMode({ isSimulatedLocally: true }),
			};

		case "vpc_service":
			return {
				name: bindingName,
				type: friendlyName,
				value: binding.service_id,
				mode: getMode({
					isSimulatedLocally:
						binding.remote && !context.remoteBindingsDisabled
							? false
							: undefined,
				}),
			};

		case "media":
			return {
				name: bindingName,
				type: friendlyName,
				value: undefined,
				mode: getMode({
					isSimulatedLocally:
						(binding.remote === true || binding.remote === undefined) &&
						!context.remoteBindingsDisabled
							? false
							: undefined,
				}),
			};

		case "assets":
			return {
				name: bindingName,
				type: friendlyName,
				value: undefined,
				mode: getMode({ isSimulatedLocally: true }),
			};

		default:
			// Handle unsafe_* bindings and any other unknown types
			if (binding.type.startsWith("unsafe_")) {
				// Strip the "unsafe_" prefix to show the original type name
				const originalType = binding.type.slice("unsafe_".length);
				return {
					name: bindingName,
					type: friendlyName,
					value: originalType,
					mode: getMode({ isSimulatedLocally: false }),
				};
			}
			return null;
	}
}

/**
 * Helper function to get the output entry for a WorkerMetadataBinding.
 * WorkerMetadataBinding is the format returned by the Cloudflare API.
 */
function getMetadataBindingOutputEntry(
	binding: WorkerMetadataBinding,
	truncate: (
		item: string | Record<string, unknown>,
		maxLength?: number
	) => string,
	getMode: ReturnType<typeof createGetMode>,
	context: {
		registry?: WorkerRegistry | null;
		local?: boolean;
		remoteBindingsDisabled?: boolean;
		name?: string;
	}
): {
	name: string;
	type: string;
	value: string | undefined | symbol;
	mode: string | undefined;
	hasConnectionStatus?: boolean;
} | null {
	const friendlyName = getBindingTypeFriendlyName(binding.type);

	switch (binding.type) {
		case "inherit":
			return {
				name: binding.name,
				type: friendlyName,
				value: undefined,
				mode: getMode(),
			};

		case "plain_text":
			return {
				name: binding.name,
				type: friendlyName,
				value: `"${truncate(binding.text)}"`,
				mode: getMode({ isSimulatedLocally: true }),
			};

		case "secret_text":
			return {
				name: binding.name,
				type: "Secret",
				value: undefined,
				mode: getMode({ isSimulatedLocally: true }),
			};

		case "json":
			return {
				name: binding.name,
				type: friendlyName,
				value: truncate(JSON.stringify(binding.json)),
				mode: getMode({ isSimulatedLocally: true }),
			};

		case "kv_namespace":
			return {
				name: binding.name,
				type: friendlyName,
				value: binding.namespace_id,
				mode: getMode({ isSimulatedLocally: context.remoteBindingsDisabled }),
			};

		case "send_email": {
			let value =
				binding.destination_address ||
				binding.allowed_destination_addresses?.join(", ") ||
				"unrestricted";

			if (binding.allowed_sender_addresses) {
				value += ` - senders: ${binding.allowed_sender_addresses.join(", ")}`;
			}
			return {
				name: binding.name,
				type: friendlyName,
				value,
				mode: getMode({ isSimulatedLocally: context.remoteBindingsDisabled }),
			};
		}

		case "wasm_module":
			return {
				name: binding.name,
				type: friendlyName,
				value: binding.part ? truncate(binding.part) : "<Wasm>",
				mode: getMode({ isSimulatedLocally: true }),
			};

		case "text_blob":
			return {
				name: binding.name,
				type: friendlyName,
				value: binding.part ? truncate(binding.part) : undefined,
				mode: getMode({ isSimulatedLocally: true }),
			};

		case "browser":
			return {
				name: binding.name,
				type: friendlyName,
				value: undefined,
				mode: getMode({ isSimulatedLocally: context.remoteBindingsDisabled }),
			};

		case "ai":
			return {
				name: binding.name,
				type: friendlyName,
				value: binding.staging ? `staging` : undefined,
				mode: getMode({ isSimulatedLocally: false }),
			};

		case "images":
			return {
				name: binding.name,
				type: friendlyName,
				value: undefined,
				mode: getMode({ isSimulatedLocally: context.remoteBindingsDisabled }),
			};

		case "version_metadata":
			return {
				name: binding.name,
				type: friendlyName,
				value: undefined,
				mode: getMode({ isSimulatedLocally: true }),
			};

		case "data_blob":
			return {
				name: binding.name,
				type: friendlyName,
				value: binding.part ? truncate(binding.part) : "<Buffer>",
				mode: getMode({ isSimulatedLocally: true }),
			};

		case "media":
			return {
				name: binding.name,
				type: friendlyName,
				value: undefined,
				mode: getMode({ isSimulatedLocally: false }),
			};

		case "durable_object_namespace": {
			let value = binding.class_name;
			let mode = undefined;
			let hasConnectionStatus = false;

			if (binding.script_name) {
				if (context.local && context.registry !== null) {
					const registryDefinition = context.registry?.[binding.script_name];

					hasConnectionStatus = true;
					if (
						registryDefinition &&
						registryDefinition.durableObjects.some(
							(d) => d.className === binding.class_name
						)
					) {
						value += `, defined in ${binding.script_name}`;
						mode = getMode({ isSimulatedLocally: true, connected: true });
					} else {
						value += `, defined in ${binding.script_name}`;
						mode = getMode({ isSimulatedLocally: true, connected: false });
					}
				} else {
					value += `, defined in ${binding.script_name}`;
					mode = getMode({ isSimulatedLocally: true });
				}
			} else {
				mode = getMode({ isSimulatedLocally: true });
			}

			return {
				name: binding.name,
				type: friendlyName,
				value,
				mode,
				hasConnectionStatus,
			};
		}

		case "workflow": {
			let value = binding.class_name;
			if (binding.script_name) {
				value += ` (defined in ${binding.script_name})`;
			}

			return {
				name: binding.name,
				type: friendlyName,
				value,
				mode: getMode({ isSimulatedLocally: true }),
			};
		}

		case "queue":
			return {
				name: binding.name,
				type: friendlyName,
				value: binding.queue_name,
				mode: getMode({ isSimulatedLocally: context.remoteBindingsDisabled }),
			};

		case "r2_bucket": {
			const value = binding.bucket_name
				? `${binding.bucket_name}${binding.jurisdiction ? ` (${binding.jurisdiction})` : ""}`
				: undefined;

			return {
				name: binding.name,
				type: friendlyName,
				value,
				mode: getMode({ isSimulatedLocally: context.remoteBindingsDisabled }),
			};
		}

		case "d1":
			return {
				name: binding.name,
				type: friendlyName,
				value: binding.id,
				mode: getMode({ isSimulatedLocally: context.remoteBindingsDisabled }),
			};

		case "vectorize":
			return {
				name: binding.name,
				type: friendlyName,
				value: binding.index_name,
				mode: getMode({ isSimulatedLocally: false }),
			};

		case "hyperdrive":
			return {
				name: binding.name,
				type: friendlyName,
				value: binding.id,
				mode: getMode({ isSimulatedLocally: true }),
			};

		case "service": {
			let value = binding.service;
			let mode = undefined;
			let hasConnectionStatus = false;

			if (binding.entrypoint) {
				value += `#${binding.entrypoint}`;
			}

			if (context.local && context.registry !== null) {
				const isSelfBinding = binding.service === context.name;

				if (isSelfBinding) {
					hasConnectionStatus = true;
					mode = getMode({ isSimulatedLocally: true, connected: true });
				} else {
					const registryDefinition = context.registry?.[binding.service];
					hasConnectionStatus = true;

					if (
						registryDefinition &&
						(!binding.entrypoint ||
							registryDefinition.entrypointAddresses?.[binding.entrypoint])
					) {
						mode = getMode({ isSimulatedLocally: true, connected: true });
					} else {
						mode = getMode({ isSimulatedLocally: true, connected: false });
					}
				}
			}

			return {
				name: binding.name,
				type: friendlyName,
				value,
				mode,
				hasConnectionStatus,
			};
		}

		case "analytics_engine":
			return {
				name: binding.name,
				type: friendlyName,
				value: binding.dataset ?? binding.name,
				mode: getMode({ isSimulatedLocally: true }),
			};

		case "dispatch_namespace":
			return {
				name: binding.name,
				type: friendlyName,
				value: binding.outbound
					? `${binding.namespace} (outbound -> ${binding.outbound.worker.service})`
					: binding.namespace,
				mode: getMode({ isSimulatedLocally: false }),
			};

		case "mtls_certificate":
			return {
				name: binding.name,
				type: friendlyName,
				value: binding.certificate_id,
				mode: getMode({ isSimulatedLocally: false }),
			};

		case "pipelines":
			return {
				name: binding.name,
				type: friendlyName,
				value: binding.pipeline,
				mode: getMode({ isSimulatedLocally: context.remoteBindingsDisabled }),
			};

		case "secrets_store_secret":
			return {
				name: binding.name,
				type: friendlyName,
				value: `${binding.store_id}/${binding.secret_name}`,
				mode: getMode({ isSimulatedLocally: true }),
			};

		case "logfwdr":
			return {
				name: binding.name,
				type: friendlyName,
				value: binding.destination,
				mode: getMode(),
			};

		case "unsafe_hello_world":
			return {
				name: binding.name,
				type: friendlyName,
				value: binding.enable_timer ? `Timer enabled` : `Timer disabled`,
				mode: getMode({ isSimulatedLocally: true }),
			};

		case "ratelimit":
			return {
				name: binding.name,
				type: friendlyName,
				value: `${binding.simple.limit} requests/${binding.simple.period}s`,
				mode: getMode({ isSimulatedLocally: true }),
			};

		case "worker_loader":
			return {
				name: binding.name,
				type: friendlyName,
				value: undefined,
				mode: getMode({ isSimulatedLocally: true }),
			};

		case "vpc_service":
			return {
				name: binding.name,
				type: friendlyName,
				value: binding.service_id,
				mode: getMode({ isSimulatedLocally: false }),
			};

		case "assets":
			return {
				name: binding.name,
				type: friendlyName,
				value: undefined,
				mode: getMode({ isSimulatedLocally: true }),
			};

		default: {
			// Handle any unknown types - this should be unreachable but provides a fallback
			const unknownBinding = binding as { name: string; type: string };
			return {
				name: unknownBinding.name,
				type: friendlyName,
				value: unknownBinding.type,
				mode: getMode(),
			};
		}
	}
}

// Exactly the same as String.padEnd, but doesn't miscount ANSI control characters
function padEndAnsi(str: string, length: number) {
	return (
		str + " ".repeat(Math.max(0, length - stripVTControlCharacters(str).length))
	);
}

/**
 * Creates a function for adding a suffix to the value of a binding in the console.
 *
 * The suffix is only for local dev so it can be used to determine whether a binding is
 * simulated locally or connected to a remote resource.
 */
function createGetMode({
	isProvisioning = false,
	isLocalDev = false,
}: {
	isProvisioning?: boolean;
	isLocalDev?: boolean;
}) {
	return function bindingMode({
		isSimulatedLocally,
		connected,
	}: {
		// Is this binding running locally?
		isSimulatedLocally?: boolean;
		// If this is an external service/tail/etc... binding, is it connected?
		//   true = connected via the dev registry
		//   false = trying to connect via the dev registry, but the target is not found
		//   undefined =  dev registry is disabled or the binding is in remote mode (which always implies connection)
		connected?: boolean;
	} = {}): string | undefined {
		if (isProvisioning || !isLocalDev) {
			return undefined;
		}
		if (isSimulatedLocally === undefined) {
			return dim("not supported");
		}

		return `${isSimulatedLocally ? chalk.blue("local") : chalk.yellow("remote")}${connected === undefined ? "" : connected ? chalk.green(" [connected]") : chalk.red(" [not connected]")}`;
	};
}

export function warnOrError(
	type: Binding["type"],
	remote: boolean | undefined,
	supports: "remote-and-local" | "local" | "remote" | "always-remote"
) {
	if (remote === true && supports === "local") {
		throw new UserError(
			`${getBindingTypeFriendlyName(type)} bindings do not support accessing remote resources.`,
			{
				telemetryMessage: true,
			}
		);
	}
	if (remote === false && supports === "remote") {
		throw new UserError(
			`${getBindingTypeFriendlyName(type)} bindings do not support local development. You may be able to set \`remote: true\` for the binding definition in your configuration file to access a remote version of the resource.`,
			{
				telemetryMessage: true,
			}
		);
	}
	if (remote === undefined && supports === "remote") {
		logger.warn(
			`${getBindingTypeFriendlyName(type)} bindings do not support local development, and so parts of your Worker may not work correctly. You may be able to set \`remote: true\` for the binding definition in your configuration file to access a remote version of the resource.`
		);
	}
	if (remote === undefined && supports === "always-remote") {
		logger.warn(
			`${getBindingTypeFriendlyName(type)} bindings always access remote resources, and so may incur usage charges even in local dev. To suppress this warning, set \`remote: true\` for the binding definition in your configuration file.`
		);
	}
}
