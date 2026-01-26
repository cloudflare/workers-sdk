import { stripVTControlCharacters } from "node:util";
import { brandColor, dim, white } from "@cloudflare/cli/colors";
import { friendlyBindingNames, UserError } from "@cloudflare/workers-utils";
import chalk from "chalk";
import { getFlag } from "../experimental-flags";
import { logger } from "../logger";
import type {
	CfTailConsumer,
	CfWorkerInit,
	ContainerApp,
} from "@cloudflare/workers-utils";
import type { WorkerRegistry } from "miniflare";

/**
 * Tracks whether we have already explained the connected status
 */
let isConnectedStatusExplained = false;

/**
 * Print all the bindings a worker using a given config would have access to
 */
export function printBindings(
	bindings: Partial<CfWorkerInit["bindings"]>,
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

	const {
		data_blobs,
		durable_objects,
		workflows,
		kv_namespaces,
		send_email,
		queues,
		d1_databases,
		vectorize,
		hyperdrive,
		r2_buckets,
		logfwdr,
		secrets_store_secrets,
		services,
		vpc_services,
		analytics_engine_datasets,
		text_blobs,
		browser,
		images,
		ai,
		version_metadata,
		unsafe,
		vars,
		wasm_modules,
		dispatch_namespaces,
		mtls_certificates,
		pipelines,
		ratelimits,
		assets,
		unsafe_hello_world,
		media,
	} = bindings;

	if (data_blobs !== undefined && Object.keys(data_blobs).length > 0) {
		output.push(
			...Object.entries(data_blobs).map(([key, value]) => ({
				name: key,
				type: friendlyBindingNames.data_blobs,
				value: typeof value === "string" ? truncate(value) : "<Buffer>",
				mode: getMode({ isSimulatedLocally: true }),
			}))
		);
	}

	if (durable_objects !== undefined && durable_objects.bindings.length > 0) {
		output.push(
			...durable_objects.bindings.map(({ name, class_name, script_name }) => {
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
					type: friendlyBindingNames.durable_objects,
					value: value,
					mode,
				};
			})
		);
	}

	if (workflows !== undefined && workflows.length > 0) {
		output.push(
			...workflows.map(({ class_name, script_name, binding, remote }) => {
				let value = class_name;
				if (script_name) {
					value += ` (defined in ${script_name})`;
				}

				return {
					name: binding,
					type: friendlyBindingNames.workflows,
					value: value,
					mode: getMode({
						isSimulatedLocally:
							script_name && !context.remoteBindingsDisabled ? !remote : true,
					}),
				};
			})
		);
	}

	if (kv_namespaces !== undefined && kv_namespaces.length > 0) {
		output.push(
			...kv_namespaces.map(({ binding, id, remote }) => {
				return {
					name: binding,
					type: friendlyBindingNames.kv_namespaces,
					value: id,
					mode: getMode({
						isSimulatedLocally: context.remoteBindingsDisabled || !remote,
					}),
				};
			})
		);
	}

	if (send_email !== undefined && send_email.length > 0) {
		output.push(
			...send_email.map((emailBinding) => {
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
					type: friendlyBindingNames.send_email,
					value,
					mode: getMode({
						isSimulatedLocally:
							context.remoteBindingsDisabled || !emailBinding.remote,
					}),
				};
			})
		);
	}

	if (queues !== undefined && queues.length > 0) {
		output.push(
			...queues.map(({ binding, queue_name, remote }) => {
				return {
					name: binding,
					type: friendlyBindingNames.queues,
					value: queue_name,
					mode: getMode({
						isSimulatedLocally: context.remoteBindingsDisabled || !remote,
					}),
				};
			})
		);
	}

	if (d1_databases !== undefined && d1_databases.length > 0) {
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
						type: friendlyBindingNames.d1_databases,
						mode: getMode({
							isSimulatedLocally: context.remoteBindingsDisabled || !remote,
						}),
						value,
					};
				}
			)
		);
	}

	if (vectorize !== undefined && vectorize.length > 0) {
		output.push(
			...vectorize.map(({ binding, index_name, remote }) => {
				return {
					name: binding,
					type: friendlyBindingNames.vectorize,
					value: index_name,
					mode: getMode({
						isSimulatedLocally:
							remote && !context.remoteBindingsDisabled ? false : undefined,
					}),
				};
			})
		);
	}

	if (hyperdrive !== undefined && hyperdrive.length > 0) {
		output.push(
			...hyperdrive.map(({ binding, id }) => {
				return {
					name: binding,
					type: friendlyBindingNames.hyperdrive,
					value: id,
					mode: getMode({ isSimulatedLocally: true }),
				};
			})
		);
	}

	if (vpc_services !== undefined && vpc_services.length > 0) {
		output.push(
			...vpc_services.map(({ binding, service_id, remote }) => {
				return {
					name: binding,
					type: friendlyBindingNames.vpc_services,
					value: service_id,
					mode: getMode({
						isSimulatedLocally:
							remote && !context.remoteBindingsDisabled ? false : undefined,
					}),
				};
			})
		);
	}

	if (r2_buckets !== undefined && r2_buckets.length > 0) {
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
					type: friendlyBindingNames.r2_buckets,
					value: value,
					mode: getMode({
						isSimulatedLocally: context.remoteBindingsDisabled || !remote,
					}),
				};
			})
		);
	}

	if (logfwdr !== undefined && logfwdr.bindings.length > 0) {
		output.push(
			...logfwdr.bindings.map(({ name, destination }) => {
				return {
					name: name,
					type: friendlyBindingNames.logfwdr,
					value: destination,
					mode: getMode(),
				};
			})
		);
	}

	if (secrets_store_secrets !== undefined && secrets_store_secrets.length > 0) {
		output.push(
			...secrets_store_secrets.map(({ binding, store_id, secret_name }) => {
				return {
					name: binding,
					type: friendlyBindingNames.secrets_store_secrets,
					value: `${store_id}/${secret_name}`,
					mode: getMode({ isSimulatedLocally: true }),
				};
			})
		);
	}

	if (unsafe_hello_world !== undefined && unsafe_hello_world.length > 0) {
		output.push(
			...unsafe_hello_world.map(({ binding, enable_timer }) => {
				return {
					name: binding,
					type: friendlyBindingNames.unsafe_hello_world,
					value: enable_timer ? `Timer enabled` : `Timer disabled`,
					mode: getMode({ isSimulatedLocally: true }),
				};
			})
		);
	}

	if (services !== undefined && services.length > 0) {
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
					type: friendlyBindingNames.services,
					value,
					mode,
				};
			})
		);
	}

	if (
		analytics_engine_datasets !== undefined &&
		analytics_engine_datasets.length > 0
	) {
		output.push(
			...analytics_engine_datasets.map(({ binding, dataset }) => {
				return {
					name: binding,
					type: friendlyBindingNames.analytics_engine_datasets,
					value: dataset ?? binding,
					mode: getMode({ isSimulatedLocally: true }),
				};
			})
		);
	}

	if (text_blobs !== undefined && Object.keys(text_blobs).length > 0) {
		output.push(
			...Object.entries(text_blobs).map(([key, value]) => ({
				name: key,
				type: friendlyBindingNames.text_blobs,
				value: truncate(value),
				mode: getMode({ isSimulatedLocally: true }),
			}))
		);
	}

	if (browser !== undefined) {
		output.push({
			name: browser.binding,
			type: friendlyBindingNames.browser,
			value: undefined,
			mode: getMode({
				isSimulatedLocally: context.remoteBindingsDisabled || !browser.remote,
			}),
		});
	}

	if (images !== undefined) {
		output.push({
			name: images.binding,
			type: friendlyBindingNames.images,
			value: undefined,
			mode: getMode({
				isSimulatedLocally: context.remoteBindingsDisabled || !images.remote,
			}),
		});
	}

	if (media !== undefined) {
		output.push({
			name: media.binding,
			type: friendlyBindingNames.media,
			value: undefined,
			mode: getMode({
				isSimulatedLocally:
					(media.remote === true || media.remote === undefined) &&
					!context.remoteBindingsDisabled
						? false
						: undefined,
			}),
		});
	}

	if (ai !== undefined) {
		output.push({
			name: ai.binding,
			type: friendlyBindingNames.ai,
			value: ai.staging ? `staging` : undefined,
			mode: getMode({
				isSimulatedLocally:
					(ai.remote === true || ai.remote === undefined) &&
					!context.remoteBindingsDisabled
						? false
						: undefined,
			}),
		});
	}

	if (pipelines?.length) {
		output.push(
			...pipelines.map(({ binding, pipeline, remote }) => ({
				name: binding,
				type: friendlyBindingNames.pipelines,
				value: pipeline,
				mode: getMode({
					isSimulatedLocally: context.remoteBindingsDisabled || !remote,
				}),
			}))
		);
	}

	if (ratelimits !== undefined && ratelimits.length > 0) {
		output.push(
			...ratelimits.map(({ name, namespace_id, simple }) => ({
				name: name,
				namespace_id: namespace_id,
				type: friendlyBindingNames.ratelimits,
				value: `${simple.limit} requests/${simple.period}s`,
				mode: getMode({ isSimulatedLocally: true }),
			}))
		);
	}

	if (assets !== undefined) {
		output.push({
			name: assets.binding,
			type: friendlyBindingNames.assets,
			value: undefined,
			mode: getMode({ isSimulatedLocally: true }),
		});
	}

	if (version_metadata !== undefined) {
		output.push({
			name: version_metadata.binding,
			type: friendlyBindingNames.version_metadata,
			value: undefined,
			mode: getMode({ isSimulatedLocally: true }),
		});
	}

	if (unsafe?.bindings !== undefined && unsafe.bindings.length > 0) {
		output.push(
			...unsafe.bindings.map((binding) => ({
				name: binding.name,
				type:
					"dev" in binding && binding.dev
						? binding.dev.plugin.name
						: friendlyBindingNames.unsafe,
				value: binding.type,
				mode: getMode({
					isSimulatedLocally: !!("dev" in binding && binding.dev),
				}),
			}))
		);
	}

	if (vars !== undefined && Object.keys(vars).length > 0) {
		output.push(
			...Object.entries(vars).map(([key, value]) => {
				let parsedValue;
				if (typeof value === "string") {
					parsedValue = `"${truncate(value)}"`;
				} else if (typeof value === "object") {
					parsedValue = truncate(JSON.stringify(value));
				} else {
					parsedValue = `${truncate(`${value}`)}`;
				}
				return {
					name: key,
					type: friendlyBindingNames.vars,
					value: parsedValue,
					mode: getMode({ isSimulatedLocally: true }),
				};
			})
		);
	}

	if (wasm_modules !== undefined && Object.keys(wasm_modules).length > 0) {
		output.push(
			...Object.entries(wasm_modules).map(([key, value]) => ({
				name: key,
				type: friendlyBindingNames.wasm_modules,
				value: typeof value === "string" ? truncate(value) : "<Wasm>",
				mode: getMode({ isSimulatedLocally: true }),
			}))
		);
	}

	if (dispatch_namespaces !== undefined && dispatch_namespaces.length > 0) {
		output.push(
			...dispatch_namespaces.map(({ binding, namespace, outbound, remote }) => {
				return {
					name: binding,
					type: friendlyBindingNames.dispatch_namespaces,
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

	if (mtls_certificates !== undefined && mtls_certificates.length > 0) {
		output.push(
			...mtls_certificates.map(({ binding, certificate_id, remote }) => {
				return {
					name: binding,
					type: friendlyBindingNames.mtls_certificates,
					value: certificate_id,
					mode: getMode({
						isSimulatedLocally:
							remote && !context.remoteBindingsDisabled ? false : undefined,
					}),
				};
			})
		);
	}

	if (unsafe?.metadata !== undefined) {
		output.push(
			...Object.entries(unsafe.metadata).map(([key, value]) => ({
				name: key,
				type: friendlyBindingNames.unsafe,
				value: JSON.stringify(value),
				mode: getMode({ isSimulatedLocally: false }),
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
	type: keyof typeof friendlyBindingNames,
	remote: boolean | undefined,
	supports: "remote-and-local" | "local" | "remote" | "always-remote"
) {
	if (remote === true && supports === "local") {
		throw new UserError(
			`${friendlyBindingNames[type]} bindings do not support accessing remote resources.`,
			{
				telemetryMessage: true,
			}
		);
	}
	if (remote === false && supports === "remote") {
		throw new UserError(
			`${friendlyBindingNames[type]} bindings do not support local development. You may be able to set \`remote: true\` for the binding definition in your configuration file to access a remote version of the resource.`,
			{
				telemetryMessage: true,
			}
		);
	}
	if (remote === undefined && supports === "remote") {
		logger.warn(
			`${friendlyBindingNames[type]} bindings do not support local development, and so parts of your Worker may not work correctly. You may be able to set \`remote: true\` for the binding definition in your configuration file to access a remote version of the resource.`
		);
	}
	if (remote === undefined && supports === "always-remote") {
		logger.warn(
			`${friendlyBindingNames[type]} bindings always access remote resources, and so may incur usage charges even in local dev. To suppress this warning, set \`remote: true\` for the binding definition in your configuration file.`
		);
	}
}
