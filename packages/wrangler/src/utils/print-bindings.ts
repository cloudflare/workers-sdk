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
 * Legacy binding type order - matches the original printBindings processing order
 * to minimize test snapshot diffs during migration.
 * This order is based on the sequence of if-statements in the original code.
 */
const LEGACY_BINDING_TYPE_ORDER: string[] = [
	"data_blob",
	"durable_object_namespace",
	"workflow",
	"kv_namespace",
	"send_email",
	"queue",
	"d1",
	"vectorize",
	"hyperdrive",
	"vpc_service",
	"r2_bucket",
	"logfwdr",
	"secrets_store_secret",
	"unsafe_hello_world",
	"service",
	"analytics_engine",
	"text_blob",
	"browser",
	"images",
	"media",
	"ai",
	"pipeline",
	"pipelines", // metadata format uses plural
	"ratelimit",
	"assets",
	"version_metadata",
	// unsafe_* bindings (except unsafe_hello_world which is above) come after version_metadata
	"__UNSAFE_PLACEHOLDER__", // marker for other unsafe_* types
	// vars (plain_text, json, secret_text all use this position - see VAR_TYPES)
	"plain_text",
	"wasm_module",
	"dispatch_namespace",
	"mtls_certificate",
	"worker_loader",
	"inherit",
];

// Types that were all "vars" in the original and should sort together
const VAR_TYPES = new Set(["plain_text", "json", "secret_text"]);

/**
 * Get the sort order for a binding type, handling unsafe_* types specially.
 * Also treats plain_text, json, and secret_text as equivalent (all are "vars" in the original).
 */
function getBindingTypeSortOrder(type: string): number {
	// Treat all var types as the same for sorting (they were one group in the original)
	const effectiveType = VAR_TYPES.has(type) ? "plain_text" : type;

	const order = LEGACY_BINDING_TYPE_ORDER.indexOf(effectiveType);
	if (order !== -1) {
		return order;
	}
	// Handle unsafe_* types (except unsafe_hello_world which is explicit in the list)
	if (type.startsWith("unsafe_")) {
		return LEGACY_BINDING_TYPE_ORDER.indexOf("__UNSAFE_PLACEHOLDER__");
	}
	// Unknown types go to the end
	return Infinity;
}

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
			// WorkerMetadataBinding[] format - sort by legacy type order to match original behavior
			const sortedBindings = [...bindings].sort((a, b) => {
				const orderA = getBindingTypeSortOrder(a.type);
				const orderB = getBindingTypeSortOrder(b.type);
				return orderA - orderB;
			});
			for (const binding of sortedBindings) {
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
			// Record<string, Binding> format - sort by legacy type order only, preserving config order within types
			const sortedEntries = Object.entries(bindings).sort((a, b) => {
				const orderA = getBindingTypeSortOrder(a[1].type);
				const orderB = getBindingTypeSortOrder(b[1].type);
				return orderA - orderB;
			});
			for (const [bindingName, binding] of sortedEntries) {
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

		log(
			`${containersTitle}\n${containers
				.map((c) => {
					return `- ${c.name} (${c.image})`;
				})
				.join("\n")}`
		);
		log("");
	}

	if (context.unsafeMetadata !== undefined) {
		log("The following unsafe metadata will be attached to your Worker:");
		log(JSON.stringify(context.unsafeMetadata, null, 2));
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
	let value: string | undefined | symbol;
	let mode: string | undefined;
	let hasConnectionStatus: boolean | undefined;

	// Helper for standard remote check pattern
	const standardRemoteMode = () =>
		getMode({
			isSimulatedLocally:
				context.remoteBindingsDisabled ||
				!("remote" in binding && binding.remote),
		});
	// Helper for remote-default pattern (undefined when not explicitly remote)
	const remoteDefaultMode = () =>
		getMode({
			isSimulatedLocally:
				"remote" in binding && binding.remote && !context.remoteBindingsDisabled
					? false
					: undefined,
		});

	// Compute value and mode based on binding type
	if (binding.type === "plain_text") {
		// String vars are wrapped in quotes for display (matching original behavior)
		value = `"${truncate(binding.value)}"`;
		mode = getMode({ isSimulatedLocally: true });
	} else if (binding.type === "json") {
		value = truncate(JSON.stringify(binding.value));
		mode = getMode({ isSimulatedLocally: true });
	} else if (binding.type === "secret_text") {
		// Secret values show "(hidden)" - from .dev.vars or .env files
		value = `"(hidden)"`;
		mode = getMode({ isSimulatedLocally: true });
	} else if (binding.type === "kv_namespace") {
		value = binding.id;
		mode = standardRemoteMode();
	} else if (binding.type === "send_email") {
		const dest =
			("destination_address" in binding
				? (binding.destination_address as string)
				: null) ||
			("allowed_destination_addresses" in binding
				? (binding.allowed_destination_addresses as string[])?.join(", ")
				: null) ||
			"unrestricted";
		const senders =
			"allowed_sender_addresses" in binding
				? (binding.allowed_sender_addresses as string[])
				: null;
		value = senders ? `${dest} - senders: ${senders.join(", ")}` : dest;
		mode = standardRemoteMode();
	} else if (binding.type === "wasm_module") {
		const path = "path" in binding.source ? binding.source.path : undefined;
		value = path ? truncate(path) : "<Wasm>";
		mode = getMode({ isSimulatedLocally: true });
	} else if (binding.type === "text_blob") {
		value =
			"contents" in binding.source
				? truncate(binding.source.contents)
				: "path" in binding.source
					? truncate(binding.source.path)
					: undefined;
		mode = getMode({ isSimulatedLocally: true });
	} else if (binding.type === "data_blob") {
		const path = "path" in binding.source ? binding.source.path : undefined;
		value = path ? truncate(path) : "<Buffer>";
		mode = getMode({ isSimulatedLocally: true });
	} else if (
		binding.type === "version_metadata" ||
		binding.type === "worker_loader" ||
		binding.type === "assets"
	) {
		value = undefined;
		mode = getMode({ isSimulatedLocally: true });
	} else if (binding.type === "fetcher") {
		// Fetcher bindings are internal implementation details (like ASSETS for pages)
		// and should not be displayed to users
		return null;
	} else if (binding.type === "browser" || binding.type === "images") {
		value = undefined;
		mode = standardRemoteMode();
	} else if (binding.type === "ai" || binding.type === "media") {
		value = binding.type === "ai" && binding.staging ? "staging" : undefined;
		mode = getMode({
			isSimulatedLocally:
				(binding.remote === true || binding.remote === undefined) &&
				!context.remoteBindingsDisabled
					? false
					: undefined,
		});
	} else if (binding.type === "queue") {
		value = binding.queue_name;
		mode = standardRemoteMode();
	} else if (binding.type === "r2_bucket") {
		value =
			typeof binding.bucket_name === "symbol"
				? binding.bucket_name
				: binding.bucket_name
					? `${binding.bucket_name}${binding.jurisdiction ? ` (${binding.jurisdiction})` : ""}`
					: undefined;
		mode = standardRemoteMode();
	} else if (binding.type === "d1") {
		// Display priority: preview_database_id, then database_name, then database_id
		// This matches the original behavior for user-friendly display
		value =
			typeof binding.database_id === "symbol"
				? binding.database_id
				: binding.preview_database_id ??
					binding.database_name ??
					binding.database_id;
		mode = standardRemoteMode();
	} else if (binding.type === "hyperdrive") {
		value = binding.id;
		mode = getMode({ isSimulatedLocally: true });
	} else if (binding.type === "analytics_engine") {
		value = binding.dataset ?? bindingName;
		mode = getMode({ isSimulatedLocally: true });
	} else if (binding.type === "secrets_store_secret") {
		value = `${binding.store_id}/${binding.secret_name}`;
		mode = getMode({ isSimulatedLocally: true });
	} else if (binding.type === "ratelimit") {
		value = `${binding.simple.limit} requests/${binding.simple.period}s`;
		mode = getMode({ isSimulatedLocally: true });
	} else if (binding.type === "unsafe_hello_world") {
		const enableTimer =
			"enable_timer" in binding ? binding.enable_timer : false;
		value = enableTimer ? "Timer enabled" : "Timer disabled";
		mode = getMode({ isSimulatedLocally: true });
	} else if (binding.type === "pipeline") {
		value = binding.pipeline;
		mode = standardRemoteMode();
	} else if (binding.type === "vectorize") {
		value = binding.index_name;
		mode = remoteDefaultMode();
	} else if (binding.type === "dispatch_namespace") {
		value = binding.outbound
			? `${binding.namespace} (outbound -> ${binding.outbound.service})`
			: binding.namespace;
		mode = remoteDefaultMode();
	} else if (binding.type === "mtls_certificate") {
		value = binding.certificate_id;
		mode = remoteDefaultMode();
	} else if (binding.type === "vpc_service") {
		value = binding.service_id;
		mode = remoteDefaultMode();
	} else if (binding.type === "logfwdr") {
		value = binding.destination;
		mode = getMode();
	} else if (binding.type === "workflow") {
		value = binding.script_name
			? `${binding.class_name} (defined in ${binding.script_name})`
			: binding.class_name;
		mode = getMode({
			isSimulatedLocally:
				binding.script_name && !context.remoteBindingsDisabled
					? !binding.remote
					: true,
		});
	} else if (binding.type === "durable_object_namespace") {
		value = binding.class_name;
		if (binding.script_name) {
			value += `, defined in ${binding.script_name}`;
			if (context.local && context.registry !== null) {
				const reg = context.registry?.[binding.script_name];
				hasConnectionStatus = true;
				const connected =
					reg?.durableObjects.some((d) => d.className === binding.class_name) ??
					false;
				mode = getMode({ isSimulatedLocally: true, connected });
			} else {
				mode = getMode({ isSimulatedLocally: true });
			}
		} else {
			mode = getMode({ isSimulatedLocally: true });
		}
	} else if (binding.type === "service") {
		value = binding.entrypoint
			? `${binding.service}#${binding.entrypoint}`
			: binding.service;
		if (binding.remote) {
			mode = getMode({ isSimulatedLocally: false });
		} else if (context.local && context.registry !== null) {
			hasConnectionStatus = true;
			const isSelf = binding.service === context.name;
			const reg = context.registry?.[binding.service];
			const connected =
				isSelf ||
				(reg !== undefined &&
					(!binding.entrypoint ||
						!!reg.entrypointAddresses?.[binding.entrypoint]));
			mode = getMode({ isSimulatedLocally: true, connected });
		}
	} else if (binding.type.startsWith("unsafe_")) {
		value = binding.type.slice("unsafe_".length);
		mode = getMode({ isSimulatedLocally: false });
	} else {
		return null;
	}

	return {
		name: bindingName,
		type: friendlyName,
		value,
		mode,
		...(hasConnectionStatus !== undefined && { hasConnectionStatus }),
	};
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
