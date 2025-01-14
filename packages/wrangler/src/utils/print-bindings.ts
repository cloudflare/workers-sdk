import chalk from "chalk";
import { getFlag } from "../experimental-flags";
import { logger } from "../logger";
import type { CfWorkerInit } from "../deployment-bundle/worker";
import type { WorkerRegistry } from "../dev-registry";

function addLocalSuffix(
	id: string | symbol | undefined,
	local: boolean = false
) {
	if (!id || typeof id === "symbol") {
		id = "";
	}

	return `${id}${local ? " (local)" : ""}`;
}

export const friendlyBindingNames: Record<
	keyof CfWorkerInit["bindings"],
	string
> = {
	data_blobs: "Data Blobs",
	durable_objects: "Durable Objects",
	kv_namespaces: "KV Namespaces",
	send_email: "Send Email",
	queues: "Queues",
	d1_databases: "D1 Databases",
	vectorize: "Vectorize Indexes",
	hyperdrive: "Hyperdrive Configs",
	r2_buckets: "R2 Buckets",
	logfwdr: "logfwdr",
	services: "Services",
	analytics_engine_datasets: "Analytics Engine Datasets",
	text_blobs: "Text Blobs",
	browser: "Browser",
	ai: "AI",
	version_metadata: "Worker Version Metadata",
	unsafe: "Unsafe Metadata",
	vars: "Vars",
	wasm_modules: "Wasm Modules",
	dispatch_namespaces: "Dispatch Namespaces",
	mtls_certificates: "mTLS Certificates",
	workflows: "Workflows",
	pipelines: "Pipelines",
	assets: "Assets",
} as const;

/**
 * Print all the bindings a worker using a given config would have access to
 */
export function printBindings(
	bindings: Partial<CfWorkerInit["bindings"]>,
	context: {
		registry?: WorkerRegistry | null;
		local?: boolean;
		name?: string;
		provisioning?: boolean;
	} = {}
) {
	let hasConnectionStatus = false;
	const truncate = (item: string | Record<string, unknown>) => {
		const s = typeof item === "string" ? item : JSON.stringify(item);
		const maxLength = 40;
		if (s.length < maxLength) {
			return s;
		}

		return `${s.substring(0, maxLength - 3)}...`;
	};

	const output: {
		name: string;
		entries: { key: string; value: string | boolean }[];
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
		services,
		analytics_engine_datasets,
		text_blobs,
		browser,
		ai,
		version_metadata,
		unsafe,
		vars,
		wasm_modules,
		dispatch_namespaces,
		mtls_certificates,
		pipelines,
	} = bindings;

	if (data_blobs !== undefined && Object.keys(data_blobs).length > 0) {
		output.push({
			name: friendlyBindingNames.data_blobs,
			entries: Object.entries(data_blobs).map(([key, value]) => ({
				key,
				value: typeof value === "string" ? truncate(value) : "<Buffer>",
			})),
		});
	}

	if (durable_objects !== undefined && durable_objects.bindings.length > 0) {
		output.push({
			name: friendlyBindingNames.durable_objects,
			entries: durable_objects.bindings.map(
				({ name, class_name, script_name }) => {
					let value = class_name;
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
								value += ` (defined in ${script_name} ${chalk.green("[connected]")})`;
							} else {
								value += ` (defined in ${script_name} ${chalk.red("[not connected]")})`;
							}
						} else {
							value += ` (defined in ${script_name})`;
						}
					}

					return {
						key: name,
						value: addLocalSuffix(value, context.local),
					};
				}
			),
		});
	}

	if (workflows !== undefined && workflows.length > 0) {
		output.push({
			name: friendlyBindingNames.workflows,
			entries: workflows.map(({ class_name, script_name, binding }) => {
				let value = class_name;
				if (script_name) {
					value += ` (defined in ${script_name})`;
				}

				return {
					key: binding,
					value,
				};
			}),
		});
	}

	if (kv_namespaces !== undefined && kv_namespaces.length > 0) {
		output.push({
			name: friendlyBindingNames.kv_namespaces,
			entries: kv_namespaces.map(({ binding, id }) => {
				return {
					key: binding,
					value: addLocalSuffix(id, context.local),
				};
			}),
		});
	}

	if (send_email !== undefined && send_email.length > 0) {
		output.push({
			name: friendlyBindingNames.send_email,
			entries: send_email.map(
				({ name, destination_address, allowed_destination_addresses }) => {
					return {
						key: name,
						value:
							destination_address ||
							allowed_destination_addresses?.join(", ") ||
							"unrestricted",
					};
				}
			),
		});
	}

	if (queues !== undefined && queues.length > 0) {
		output.push({
			name: friendlyBindingNames.queues,
			entries: queues.map(({ binding, queue_name }) => {
				return {
					key: binding,
					value: addLocalSuffix(queue_name, context.local),
				};
			}),
		});
	}

	if (d1_databases !== undefined && d1_databases.length > 0) {
		output.push({
			name: friendlyBindingNames.d1_databases,
			entries: d1_databases.map(
				({ binding, database_name, database_id, preview_database_id }) => {
					const remoteDatabaseId =
						typeof database_id === "string" ? database_id : null;
					let databaseValue =
						remoteDatabaseId && database_name
							? `${database_name} (${remoteDatabaseId})`
							: remoteDatabaseId ?? database_name;

					//database_id is local when running `wrangler dev --local`
					if (preview_database_id && database_id !== "local") {
						databaseValue = `${databaseValue ? `${databaseValue}, ` : ""}Preview: (${preview_database_id})`;
					}
					return {
						key: binding,
						value: addLocalSuffix(databaseValue, context.local),
					};
				}
			),
		});
	}

	if (vectorize !== undefined && vectorize.length > 0) {
		output.push({
			name: friendlyBindingNames.vectorize,
			entries: vectorize.map(({ binding, index_name }) => {
				return {
					key: binding,
					value: index_name,
				};
			}),
		});
	}

	if (hyperdrive !== undefined && hyperdrive.length > 0) {
		output.push({
			name: friendlyBindingNames.hyperdrive,
			entries: hyperdrive.map(({ binding, id }) => {
				return {
					key: binding,
					value: addLocalSuffix(id, context.local),
				};
			}),
		});
	}

	if (r2_buckets !== undefined && r2_buckets.length > 0) {
		output.push({
			name: friendlyBindingNames.r2_buckets,
			entries: r2_buckets.map(({ binding, bucket_name, jurisdiction }) => {
				let name = typeof bucket_name === "string" ? bucket_name : "";

				if (jurisdiction !== undefined) {
					name += ` (${jurisdiction})`;
				}

				return {
					key: binding,
					value: addLocalSuffix(name, context.local),
				};
			}),
		});
	}

	if (logfwdr !== undefined && logfwdr.bindings.length > 0) {
		output.push({
			name: friendlyBindingNames.logfwdr,
			entries: logfwdr.bindings.map((binding) => {
				return {
					key: binding.name,
					value: binding.destination,
				};
			}),
		});
	}

	if (services !== undefined && services.length > 0) {
		output.push({
			name: friendlyBindingNames.services,
			entries: services.map(({ binding, service, entrypoint }) => {
				let value = service;
				if (entrypoint) {
					value += `#${entrypoint}`;
				}

				if (context.local && context.registry !== null) {
					const registryDefinition = context.registry?.[service];
					hasConnectionStatus = true;

					if (
						registryDefinition &&
						(!entrypoint ||
							registryDefinition.entrypointAddresses?.[entrypoint])
					) {
						value = value + " " + chalk.green("[connected]");
					} else {
						value = value + " " + chalk.red("[not connected]");
					}
				}
				return {
					key: binding,
					value,
				};
			}),
		});
	}

	if (
		analytics_engine_datasets !== undefined &&
		analytics_engine_datasets.length > 0
	) {
		output.push({
			name: friendlyBindingNames.analytics_engine_datasets,
			entries: analytics_engine_datasets.map(({ binding, dataset }) => {
				return {
					key: binding,
					value: dataset ?? binding,
				};
			}),
		});
	}

	if (text_blobs !== undefined && Object.keys(text_blobs).length > 0) {
		output.push({
			name: friendlyBindingNames.text_blobs,
			entries: Object.entries(text_blobs).map(([key, value]) => ({
				key,
				value: truncate(value),
			})),
		});
	}

	if (browser !== undefined) {
		output.push({
			name: friendlyBindingNames.browser,
			entries: [{ key: "Name", value: browser.binding }],
		});
	}

	if (ai !== undefined) {
		const entries: [{ key: string; value: string | boolean }] = [
			{ key: "Name", value: ai.binding },
		];
		if (ai.staging) {
			entries.push({ key: "Staging", value: ai.staging });
		}

		output.push({
			name: friendlyBindingNames.ai,
			entries: entries,
		});
	}

	if (pipelines?.length) {
		output.push({
			name: friendlyBindingNames.pipelines,
			entries: pipelines.map(({ binding, pipeline }) => ({
				key: binding,
				value: pipeline,
			})),
		});
	}

	if (version_metadata !== undefined) {
		output.push({
			name: friendlyBindingNames.version_metadata,
			entries: [{ key: "Name", value: version_metadata.binding }],
		});
	}

	if (unsafe?.bindings !== undefined && unsafe.bindings.length > 0) {
		output.push({
			name: friendlyBindingNames.unsafe,
			entries: unsafe.bindings.map(({ name, type }) => ({
				key: type,
				value: name,
			})),
		});
	}

	if (vars !== undefined && Object.keys(vars).length > 0) {
		output.push({
			name: friendlyBindingNames.vars,
			entries: Object.entries(vars).map(([key, value]) => {
				let parsedValue;
				if (typeof value === "string") {
					parsedValue = `"${truncate(value)}"`;
				} else if (typeof value === "object") {
					parsedValue = JSON.stringify(value, null, 1);
				} else {
					parsedValue = `${truncate(`${value}`)}`;
				}
				return {
					key,
					value: parsedValue,
				};
			}),
		});
	}

	if (wasm_modules !== undefined && Object.keys(wasm_modules).length > 0) {
		output.push({
			name: friendlyBindingNames.wasm_modules,
			entries: Object.entries(wasm_modules).map(([key, value]) => ({
				key,
				value: typeof value === "string" ? truncate(value) : "<Wasm>",
			})),
		});
	}

	if (dispatch_namespaces !== undefined && dispatch_namespaces.length > 0) {
		output.push({
			name: friendlyBindingNames.dispatch_namespaces,
			entries: dispatch_namespaces.map(({ binding, namespace, outbound }) => {
				return {
					key: binding,
					value: outbound
						? `${namespace} (outbound -> ${outbound.service})`
						: namespace,
				};
			}),
		});
	}

	if (mtls_certificates !== undefined && mtls_certificates.length > 0) {
		output.push({
			name: friendlyBindingNames.mtls_certificates,
			entries: mtls_certificates.map(({ binding, certificate_id }) => {
				return {
					key: binding,
					value: certificate_id,
				};
			}),
		});
	}

	if (unsafe?.metadata !== undefined) {
		output.push({
			name: friendlyBindingNames.unsafe,
			entries: Object.entries(unsafe.metadata).map(([key, value]) => ({
				key,
				value: JSON.stringify(value),
			})),
		});
	}

	if (output.length === 0) {
		return;
	}

	let title: string;
	if (context.provisioning) {
		title = "The following bindings need to be provisioned:";
	} else if (context.name && getFlag("MULTIWORKER")) {
		title = `${chalk.blue(context.name)} has access to the following bindings:`;
	} else {
		title = "Your worker has access to the following bindings:";
	}

	const message = [
		title,
		...output
			.map((bindingGroup) => {
				return [
					`- ${bindingGroup.name}:`,
					bindingGroup.entries.map(
						({ key, value }) => `  - ${key}${value ? ":" : ""} ${value}`
					),
				];
			})
			.flat(2),
	].join("\n");

	logger.log(message);

	if (hasConnectionStatus) {
		logger.once.info(
			`\nService bindings & durable object bindings connect to other \`wrangler dev\` processes running locally, with their connection status indicated by ${chalk.green("[connected]")} or ${chalk.red("[not connected]")}. For more details, refer to https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/#local-development\n`
		);
	}
}
