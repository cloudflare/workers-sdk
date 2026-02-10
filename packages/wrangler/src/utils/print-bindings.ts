import { stripVTControlCharacters } from "node:util";
import { brandColor, dim, white } from "@cloudflare/cli/colors";
import {
	getBindingTypeFriendlyName,
	UserError,
} from "@cloudflare/workers-utils";
import chalk from "chalk";
import {
	convertCfWorkerInitBindingsToBindings,
	extractBindingsOfType,
	isUnsafeBindingType,
} from "../api/startDevWorker/utils";
import { getFlag } from "../experimental-flags";
import { logger } from "../logger";
import type { Binding, StartDevWorkerInput } from "../api/startDevWorker/types";
import type {
	CfSendEmailBindings,
	CfTailConsumer,
	CfWorkerInit,
	ContainerApp,
} from "@cloudflare/workers-utils";
import type { WorkerRegistry } from "miniflare";

/**
 * Tracks whether we have already explained the connected status
 */
let isConnectedStatusExplained = false;

type PrintContext = {
	log?: (message: string) => void;
	registry?: WorkerRegistry | null;
	local?: boolean;
	isMultiWorker?: boolean;
	remoteBindingsDisabled?: boolean;
	name?: string;
	provisioning?: boolean;
	warnIfNoBindings?: boolean;
	unsafeMetadata?: Record<string, unknown>;
};

/**
 * Print all the bindings a worker using a given config would have access to
 */
export function printBindings(
	bindings: Partial<CfWorkerInit["bindings"]>,
	tailConsumers: CfTailConsumer[] = [],
	streamingTailConsumers: CfTailConsumer[] = [],
	containers: ContainerApp[] = [],
	context: Omit<PrintContext, "unsafeMetadata"> = {}
) {
	return printFlatBindings(
		convertCfWorkerInitBindingsToBindings(bindings),
		tailConsumers,
		streamingTailConsumers,
		containers,
		{ ...context, unsafeMetadata: bindings.unsafe?.metadata }
	);
}

/**
 * Print all the bindings a worker would have access to.
 * Accepts StartDevWorkerInput["bindings"] format
 */
export function printFlatBindings(
	bindings: StartDevWorkerInput["bindings"],
	tailConsumers: CfTailConsumer[] = [],
	streamingTailConsumers: CfTailConsumer[] = [],
	containers: ContainerApp[] = [],
	context: PrintContext = {}
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

	// Extract bindings by type
	const data_blobs = extractBindingsOfType("data_blob", bindings);
	const durable_objects = extractBindingsOfType(
		"durable_object_namespace",
		bindings
	);
	const workflows = extractBindingsOfType("workflow", bindings);
	const kv_namespaces = extractBindingsOfType("kv_namespace", bindings);
	const send_email = extractBindingsOfType("send_email", bindings);
	const queues = extractBindingsOfType("queue", bindings);
	const d1_databases = extractBindingsOfType("d1", bindings);
	const vectorize = extractBindingsOfType("vectorize", bindings);
	const hyperdrive = extractBindingsOfType("hyperdrive", bindings);
	const r2_buckets = extractBindingsOfType("r2_bucket", bindings);
	const logfwdr = extractBindingsOfType("logfwdr", bindings);
	const secrets_store_secrets = extractBindingsOfType(
		"secrets_store_secret",
		bindings
	);
	const services = extractBindingsOfType("service", bindings);
	const vpc_services = extractBindingsOfType("vpc_service", bindings);
	const analytics_engine_datasets = extractBindingsOfType(
		"analytics_engine",
		bindings
	);
	const text_blobs = extractBindingsOfType("text_blob", bindings);
	const browser = extractBindingsOfType("browser", bindings);
	const images = extractBindingsOfType("images", bindings);
	const ai = extractBindingsOfType("ai", bindings);
	const version_metadata = extractBindingsOfType("version_metadata", bindings);
	// Extract all vars (plain_text, json, secret_text) together to preserve insertion order
	const vars = Object.entries(bindings ?? {})
		.filter(
			([_, binding]) =>
				binding.type === "plain_text" ||
				binding.type === "json" ||
				binding.type === "secret_text"
		)
		.map(([name, binding]) => ({
			binding: name,
			...(binding as
				| Extract<Binding, { type: "plain_text" }>
				| Extract<Binding, { type: "json" }>
				| Extract<Binding, { type: "secret_text" }>),
		}));
	const wasm_modules = extractBindingsOfType("wasm_module", bindings);
	const dispatch_namespaces = extractBindingsOfType(
		"dispatch_namespace",
		bindings
	);
	const mtls_certificates = extractBindingsOfType("mtls_certificate", bindings);
	const pipelines = extractBindingsOfType("pipeline", bindings);
	const ratelimits = extractBindingsOfType("ratelimit", bindings);
	const assets = extractBindingsOfType("assets", bindings);
	const unsafe_hello_world = extractBindingsOfType(
		"unsafe_hello_world",
		bindings
	);
	const media = extractBindingsOfType("media", bindings);
	const worker_loaders = extractBindingsOfType("worker_loader", bindings);

	// Extract generic unsafe bindings (type starts with "unsafe_" but isn't "unsafe_hello_world")
	const unsafe_bindings = Object.entries(bindings ?? {})
		.filter(
			([_, binding]) =>
				isUnsafeBindingType(binding.type) &&
				binding.type !== "unsafe_hello_world"
		)
		.map(([name, binding]) => ({ name, ...binding }));

	if (data_blobs.length > 0) {
		output.push(
			...data_blobs.map(({ binding, source }) => ({
				name: binding,
				type: getBindingTypeFriendlyName("data_blob"),
				value: "contents" in source ? "<Buffer>" : truncate(source.path),
				mode: getMode({ isSimulatedLocally: true }),
			}))
		);
	}

	if (durable_objects.length > 0) {
		output.push(
			...durable_objects.map(({ name, class_name, script_name }) => {
				let value = class_name;
				let mode = undefined;
				if (script_name) {
					if (context.local && context.registry !== null) {
						const registryDefinition = context.registry?.[script_name];

						hasConnectionStatus = true;
						if (
							registryDefinition &&
							registryDefinition.durableObjects.some(
								(d) => d.className === class_name
							)
						) {
							value += `, defined in ${script_name}`;
							mode = getMode({ isSimulatedLocally: true, connected: true });
						} else {
							value += `, defined in ${script_name}`;
							mode = getMode({ isSimulatedLocally: true, connected: false });
						}
					} else {
						value += `, defined in ${script_name}`;
						mode = getMode({ isSimulatedLocally: true });
					}
				} else {
					mode = getMode({ isSimulatedLocally: true });
				}

				return {
					name,
					type: getBindingTypeFriendlyName("durable_object_namespace"),
					value: value,
					mode,
				};
			})
		);
	}

	if (workflows.length > 0) {
		output.push(
			...workflows.map(({ class_name, script_name, binding, remote }) => {
				let value = class_name;
				if (script_name) {
					value += ` (defined in ${script_name})`;
				}

				return {
					name: binding,
					type: getBindingTypeFriendlyName("workflow"),
					value: value,
					mode: getMode({
						isSimulatedLocally:
							script_name && !context.remoteBindingsDisabled ? !remote : true,
					}),
				};
			})
		);
	}

	if (kv_namespaces.length > 0) {
		output.push(
			...kv_namespaces.map(({ binding, id, remote }) => {
				return {
					name: binding,
					type: getBindingTypeFriendlyName("kv_namespace"),
					value: id,
					mode: getMode({
						isSimulatedLocally: context.remoteBindingsDisabled || !remote,
					}),
				};
			})
		);
	}

	if (send_email.length > 0) {
		output.push(
			...send_email.map((emailBinding: CfSendEmailBindings) => {
				const destination_address =
					"destination_address" in emailBinding
						? emailBinding.destination_address
						: undefined;
				const allowed_destination_addresses =
					"allowed_destination_addresses" in emailBinding
						? emailBinding.allowed_destination_addresses
						: undefined;
				const allowed_sender_addresses =
					"allowed_sender_addresses" in emailBinding
						? emailBinding.allowed_sender_addresses
						: undefined;
				let value =
					destination_address ||
					allowed_destination_addresses?.join(", ") ||
					"unrestricted";

				if (allowed_sender_addresses) {
					value += ` - senders: ${allowed_sender_addresses.join(", ")}`;
				}
				return {
					name: emailBinding.name,
					type: getBindingTypeFriendlyName("send_email"),
					value,
					mode: getMode({
						isSimulatedLocally:
							context.remoteBindingsDisabled || !emailBinding.remote,
					}),
				};
			})
		);
	}

	if (queues.length > 0) {
		output.push(
			...queues.map(({ binding, queue_name, remote }) => {
				return {
					name: binding,
					type: getBindingTypeFriendlyName("queue"),
					value: queue_name,
					mode: getMode({
						isSimulatedLocally: context.remoteBindingsDisabled || !remote,
					}),
				};
			})
		);
	}

	if (d1_databases.length > 0) {
		output.push(
			...d1_databases.map(
				({
					binding,
					database_name,
					database_id,
					preview_database_id,
					remote,
				}) => {
					const value =
						typeof database_id == "symbol"
							? database_id
							: preview_database_id ?? database_name ?? database_id;

					return {
						name: binding,
						type: getBindingTypeFriendlyName("d1"),
						mode: getMode({
							isSimulatedLocally: context.remoteBindingsDisabled || !remote,
						}),
						value,
					};
				}
			)
		);
	}

	if (vectorize.length > 0) {
		output.push(
			...vectorize.map(({ binding, index_name, remote }) => {
				return {
					name: binding,
					type: getBindingTypeFriendlyName("vectorize"),
					value: index_name,
					mode: getMode({
						isSimulatedLocally:
							remote && !context.remoteBindingsDisabled ? false : undefined,
					}),
				};
			})
		);
	}

	if (hyperdrive.length > 0) {
		output.push(
			...hyperdrive.map(({ binding, id }) => {
				return {
					name: binding,
					type: getBindingTypeFriendlyName("hyperdrive"),
					value: id,
					mode: getMode({ isSimulatedLocally: true }),
				};
			})
		);
	}

	if (vpc_services.length > 0) {
		output.push(
			...vpc_services.map(({ binding, service_id, remote }) => {
				return {
					name: binding,
					type: getBindingTypeFriendlyName("vpc_service"),
					value: service_id,
					mode: getMode({
						isSimulatedLocally:
							remote && !context.remoteBindingsDisabled ? false : undefined,
					}),
				};
			})
		);
	}

	if (r2_buckets.length > 0) {
		output.push(
			...r2_buckets.map(({ binding, bucket_name, jurisdiction, remote }) => {
				const value =
					typeof bucket_name === "symbol"
						? bucket_name
						: bucket_name
							? `${bucket_name}${jurisdiction ? ` (${jurisdiction})` : ""}`
							: undefined;

				return {
					name: binding,
					type: getBindingTypeFriendlyName("r2_bucket"),
					value: value,
					mode: getMode({
						isSimulatedLocally: context.remoteBindingsDisabled || !remote,
					}),
				};
			})
		);
	}

	if (logfwdr.length > 0) {
		output.push(
			...logfwdr.map(({ name, destination }) => {
				return {
					name,
					type: getBindingTypeFriendlyName("logfwdr"),
					value: destination,
					mode: getMode(),
				};
			})
		);
	}

	if (secrets_store_secrets.length > 0) {
		output.push(
			...secrets_store_secrets.map(({ binding, store_id, secret_name }) => {
				return {
					name: binding,
					type: getBindingTypeFriendlyName("secrets_store_secret"),
					value: `${store_id}/${secret_name}`,
					mode: getMode({ isSimulatedLocally: true }),
				};
			})
		);
	}

	if (unsafe_hello_world.length > 0) {
		output.push(
			...unsafe_hello_world.map(({ binding, enable_timer }) => {
				return {
					name: binding,
					type: getBindingTypeFriendlyName("unsafe_hello_world"),
					value: enable_timer ? `Timer enabled` : `Timer disabled`,
					mode: getMode({ isSimulatedLocally: true }),
				};
			})
		);
	}

	if (services.length > 0) {
		output.push(
			...services.map(({ binding, service, entrypoint, remote }) => {
				let value = service;
				let mode = undefined;

				if (entrypoint) {
					value += `#${entrypoint}`;
				}

				if (remote) {
					mode = getMode({ isSimulatedLocally: false });
				} else if (context.local && context.registry !== null) {
					const isSelfBinding = service === context.name;

					if (isSelfBinding) {
						hasConnectionStatus = true;
						mode = getMode({ isSimulatedLocally: true, connected: true });
					} else {
						const registryDefinition = context.registry?.[service];
						hasConnectionStatus = true;

						if (
							registryDefinition &&
							(!entrypoint ||
								registryDefinition.entrypointAddresses?.[entrypoint])
						) {
							mode = getMode({ isSimulatedLocally: true, connected: true });
						} else {
							mode = getMode({ isSimulatedLocally: true, connected: false });
						}
					}
				}

				return {
					name: binding,
					type: getBindingTypeFriendlyName("service"),
					value,
					mode,
				};
			})
		);
	}

	if (analytics_engine_datasets.length > 0) {
		output.push(
			...analytics_engine_datasets.map(({ binding, dataset }) => {
				return {
					name: binding,
					type: getBindingTypeFriendlyName("analytics_engine"),
					value: dataset ?? binding,
					mode: getMode({ isSimulatedLocally: true }),
				};
			})
		);
	}

	if (text_blobs.length > 0) {
		output.push(
			...text_blobs.map(({ binding, source }) => ({
				name: binding,
				type: getBindingTypeFriendlyName("text_blob"),
				value:
					"contents" in source
						? truncate(source.contents)
						: "path" in source
							? truncate(source.path)
							: undefined,
				mode: getMode({ isSimulatedLocally: true }),
			}))
		);
	}

	if (browser.length > 0) {
		output.push(
			...browser.map(({ binding, remote }) => ({
				name: binding,
				type: getBindingTypeFriendlyName("browser"),
				value: undefined,
				mode: getMode({
					isSimulatedLocally: context.remoteBindingsDisabled || !remote,
				}),
			}))
		);
	}

	if (images.length > 0) {
		output.push(
			...images.map(({ binding, remote }) => ({
				name: binding,
				type: getBindingTypeFriendlyName("images"),
				value: undefined,
				mode: getMode({
					isSimulatedLocally: context.remoteBindingsDisabled || !remote,
				}),
			}))
		);
	}

	if (media.length > 0) {
		output.push(
			...media.map(({ binding, remote }) => ({
				name: binding,
				type: getBindingTypeFriendlyName("media"),
				value: undefined,
				mode: getMode({
					isSimulatedLocally:
						(remote === true || remote === undefined) &&
						!context.remoteBindingsDisabled
							? false
							: undefined,
				}),
			}))
		);
	}

	if (ai.length > 0) {
		output.push(
			...ai.map(({ binding, staging, remote }) => ({
				name: binding,
				type: getBindingTypeFriendlyName("ai"),
				value: staging ? `staging` : undefined,
				mode: getMode({
					isSimulatedLocally:
						(remote === true || remote === undefined) &&
						!context.remoteBindingsDisabled
							? false
							: undefined,
				}),
			}))
		);
	}

	if (pipelines.length > 0) {
		output.push(
			...pipelines.map(({ binding, pipeline, remote }) => ({
				name: binding,
				type: getBindingTypeFriendlyName("pipeline"),
				value: pipeline,
				mode: getMode({
					isSimulatedLocally: context.remoteBindingsDisabled || !remote,
				}),
			}))
		);
	}

	if (ratelimits.length > 0) {
		output.push(
			...ratelimits.map(({ name, simple }) => ({
				name,
				type: getBindingTypeFriendlyName("ratelimit"),
				value: `${simple.limit} requests/${simple.period}s`,
				mode: getMode({ isSimulatedLocally: true }),
			}))
		);
	}

	if (assets.length > 0) {
		output.push(
			...assets.map(({ binding }) => ({
				name: binding,
				type: getBindingTypeFriendlyName("assets"),
				value: undefined,
				mode: getMode({ isSimulatedLocally: true }),
			}))
		);
	}

	if (version_metadata.length > 0) {
		output.push(
			...version_metadata.map(({ binding }) => ({
				name: binding,
				type: getBindingTypeFriendlyName("version_metadata"),
				value: undefined,
				mode: getMode({ isSimulatedLocally: true }),
			}))
		);
	}
	if (unsafe_bindings.length > 0) {
		output.push(
			...unsafe_bindings.map((binding) => {
				const dev = "dev" in binding ? binding.dev : undefined;
				// Strip the "unsafe_" prefix to get the original binding type for display
				const originalType = binding.type.slice("unsafe_".length);
				return {
					name: binding.name,
					type: dev
						? dev.plugin.name
						: getBindingTypeFriendlyName(binding.type),
					value: originalType,
					mode: getMode({
						isSimulatedLocally: !!dev,
					}),
				};
			})
		);
	}

	if (vars.length > 0) {
		output.push(
			...vars.map(({ binding, type: varType, value: varValue }) => {
				let parsedValue;
				if (varType === "plain_text") {
					parsedValue = `"${truncate(varValue)}"`;
				} else if (varType === "json") {
					parsedValue = truncate(JSON.stringify(varValue));
				} else {
					parsedValue = `"(hidden)"`;
				}
				return {
					name: binding,
					type: getBindingTypeFriendlyName(varType),
					value: parsedValue,
					mode: getMode({ isSimulatedLocally: true }),
				};
			})
		);
	}

	if (wasm_modules.length > 0) {
		output.push(
			...wasm_modules.map(({ binding, source }) => ({
				name: binding,
				type: getBindingTypeFriendlyName("wasm_module"),
				value: "contents" in source ? "<Wasm>" : truncate(source.path),
				mode: getMode({ isSimulatedLocally: true }),
			}))
		);
	}

	if (dispatch_namespaces.length > 0) {
		output.push(
			...dispatch_namespaces.map(({ binding, namespace, outbound, remote }) => {
				return {
					name: binding,
					type: getBindingTypeFriendlyName("dispatch_namespace"),
					value: outbound
						? `${namespace} (outbound -> ${outbound.service})`
						: namespace,
					mode: getMode({
						isSimulatedLocally:
							remote && !context.remoteBindingsDisabled ? false : undefined,
					}),
				};
			})
		);
	}

	if (mtls_certificates.length > 0) {
		output.push(
			...mtls_certificates.map(({ binding, certificate_id, remote }) => {
				return {
					name: binding,
					type: getBindingTypeFriendlyName("mtls_certificate"),
					value: certificate_id,
					mode: getMode({
						isSimulatedLocally:
							remote && !context.remoteBindingsDisabled ? false : undefined,
					}),
				};
			})
		);
	}

	if (worker_loaders.length > 0) {
		output.push(
			...worker_loaders.map(({ binding }) => ({
				name: binding,
				type: getBindingTypeFriendlyName("worker_loader"),
				value: undefined,
				mode: getMode({ isSimulatedLocally: true }),
			}))
		);
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
				.map((c) => `- ${c.name} (${c.image})`)
				.join("\n")}`
		);
		log("");
	}

	if (context.unsafeMetadata) {
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
