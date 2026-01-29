import assert from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import { INHERIT_SYMBOL, UserError } from "@cloudflare/workers-utils";
import { FormData } from "undici";
import { handleUnsafeCapnp } from "./capnp";
import type { Binding, StartDevWorkerInput } from "../api/startDevWorker/types";
import type {
	AssetConfigMetadata,
	CfModuleType,
	CfWorkerInit,
	WorkerMetadata,
	WorkerMetadataBinding,
} from "@cloudflare/workers-utils";

export const moduleTypeMimeType: {
	[type in CfModuleType]: string | undefined;
} = {
	esm: "application/javascript+module",
	commonjs: "application/javascript",
	"compiled-wasm": "application/wasm",
	buffer: "application/octet-stream",
	text: "text/plain",
	python: "text/x-python",
	"python-requirement": "text/x-python-requirement",
};

function toMimeType(type: CfModuleType): string {
	const mimeType = moduleTypeMimeType[type];
	if (mimeType === undefined) {
		throw new TypeError("Unsupported module: " + type);
	}

	return mimeType;
}

export function fromMimeType(mimeType: string): CfModuleType {
	const moduleType = Object.keys(moduleTypeMimeType).find(
		(type) => moduleTypeMimeType[type as CfModuleType] === mimeType
	) as CfModuleType | undefined;
	if (moduleType === undefined) {
		throw new TypeError("Unsupported mime type: " + mimeType);
	}

	return moduleType;
}

/**
 * Creates a `FormData` upload from worker data and bindings.
 * Bindings are in the flat `StartDevWorkerInput["bindings"]` format (Record<string, Binding>).
 */
export function createWorkerUploadForm(
	worker: Omit<CfWorkerInit, "bindings">,
	bindings: StartDevWorkerInput["bindings"],
	options?: {
		dryRun?: true;
		unsafe?: { metadata?: Record<string, unknown>; capnp?: unknown };
	}
): FormData {
	const formData = new FormData();
	const {
		main,
		sourceMaps,
		rawBindings,
		migrations,
		compatibility_date,
		compatibility_flags,
		keepVars,
		keepSecrets,
		keepBindings,
		logpush,
		placement,
		tail_consumers,
		streaming_tail_consumers,
		limits,
		annotations,
		keep_assets,
		assets,
		observability,
	} = worker;

	const assetConfig: AssetConfigMetadata = {
		html_handling: assets?.assetConfig?.html_handling,
		not_found_handling: assets?.assetConfig?.not_found_handling,
		run_worker_first: assets?.run_worker_first,
		_redirects: assets?._redirects,
		_headers: assets?._headers,
	};

	// short circuit if static assets upload only
	if (assets && !assets.routerConfig.has_user_worker) {
		formData.set(
			"metadata",
			JSON.stringify({
				assets: {
					jwt: assets.jwt,
					config: assetConfig,
				},
				...(annotations && { annotations }),
				...(compatibility_date && { compatibility_date }),
				...(compatibility_flags && { compatibility_flags }),
			})
		);
		return formData;
	}

	let { modules } = worker;
	const metadataBindings: WorkerMetadataBinding[] = rawBindings ?? [];

	// Process flat bindings format
	for (const [name, binding] of Object.entries(bindings ?? {})) {
		switch (binding.type) {
			case "plain_text": {
				metadataBindings.push({
					name,
					type: "plain_text",
					text: binding.value,
				});
				break;
			}
			case "secret_text": {
				metadataBindings.push({
					name,
					type: "secret_text",
					text: binding.value,
				});
				break;
			}
			case "json": {
				metadataBindings.push({
					name,
					type: "json",
					json: binding.value,
				});
				break;
			}
			case "kv_namespace": {
				let id = binding.id;
				if (options?.dryRun) {
					id ??= INHERIT_SYMBOL;
				}
				if (id === undefined) {
					throw new UserError(`${name} bindings must have an "id" field`);
				}
				if (id === INHERIT_SYMBOL) {
					metadataBindings.push({ name, type: "inherit" });
				} else {
					metadataBindings.push({
						name,
						type: "kv_namespace",
						namespace_id: id,
						raw: binding.raw,
					});
				}
				break;
			}
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
				metadataBindings.push({
					name,
					type: "send_email",
					destination_address,
					allowed_destination_addresses,
					allowed_sender_addresses,
				});
				break;
			}
			case "durable_object_namespace": {
				metadataBindings.push({
					name,
					type: "durable_object_namespace",
					class_name: binding.class_name,
					...(binding.script_name && { script_name: binding.script_name }),
					...(binding.environment && { environment: binding.environment }),
				});
				break;
			}
			case "workflow": {
				metadataBindings.push({
					type: "workflow",
					name,
					workflow_name: binding.name,
					class_name: binding.class_name,
					script_name: binding.script_name,
					raw: binding.raw,
				});
				break;
			}
			case "queue": {
				metadataBindings.push({
					type: "queue",
					name,
					queue_name: binding.queue_name,
					delivery_delay: binding.delivery_delay,
					raw: binding.raw,
				});
				break;
			}
			case "r2_bucket": {
				let bucketName = binding.bucket_name;
				if (options?.dryRun) {
					bucketName ??= INHERIT_SYMBOL;
				}
				if (bucketName === undefined) {
					throw new UserError(
						`${name} bindings must have a "bucket_name" field`
					);
				}
				if (bucketName === INHERIT_SYMBOL) {
					metadataBindings.push({ name, type: "inherit" });
				} else {
					metadataBindings.push({
						name,
						type: "r2_bucket",
						bucket_name: bucketName,
						jurisdiction: binding.jurisdiction,
						raw: binding.raw,
					});
				}
				break;
			}
			case "d1": {
				let databaseId = binding.database_id;
				if (options?.dryRun) {
					databaseId ??= INHERIT_SYMBOL;
				}
				if (databaseId === undefined) {
					throw new UserError(
						`${name} bindings must have a "database_id" field`
					);
				}
				if (databaseId === INHERIT_SYMBOL) {
					metadataBindings.push({ name, type: "inherit" });
				} else {
					metadataBindings.push({
						name,
						type: "d1",
						id: databaseId,
						internalEnv: binding.database_internal_env,
						raw: binding.raw,
					});
				}
				break;
			}
			case "vectorize": {
				metadataBindings.push({
					name,
					type: "vectorize",
					index_name: binding.index_name,
					raw: binding.raw,
				});
				break;
			}
			case "hyperdrive": {
				metadataBindings.push({
					name,
					type: "hyperdrive",
					id: binding.id,
				});
				break;
			}
			case "secrets_store_secret": {
				metadataBindings.push({
					name,
					type: "secrets_store_secret",
					store_id: binding.store_id,
					secret_name: binding.secret_name,
				});
				break;
			}
			case "unsafe_hello_world": {
				// The binding type overlaps with `unsafe_${string}`, so we need to cast
				const helloWorldBinding = binding as Extract<
					Binding,
					{ type: "unsafe_hello_world" }
				>;
				metadataBindings.push({
					name,
					type: "unsafe_hello_world",
					enable_timer: helloWorldBinding.enable_timer,
				});
				break;
			}
			case "ratelimit": {
				metadataBindings.push({
					name,
					type: "ratelimit",
					namespace_id: binding.namespace_id,
					simple: binding.simple,
				});
				break;
			}
			case "vpc_service": {
				metadataBindings.push({
					name,
					type: "vpc_service",
					service_id: binding.service_id,
				});
				break;
			}
			case "service": {
				metadataBindings.push({
					name,
					type: "service",
					service: binding.service,
					cross_account_grant: binding.cross_account_grant,
					...(binding.environment && { environment: binding.environment }),
					...(binding.entrypoint && { entrypoint: binding.entrypoint }),
					...(binding.props && { props: binding.props }),
				});
				break;
			}
			case "analytics_engine": {
				metadataBindings.push({
					name,
					type: "analytics_engine",
					dataset: binding.dataset,
				});
				break;
			}
			case "dispatch_namespace": {
				metadataBindings.push({
					name,
					type: "dispatch_namespace",
					namespace: binding.namespace,
					...(binding.outbound && {
						outbound: {
							worker: {
								service: binding.outbound.service,
								environment: binding.outbound.environment,
							},
							params: binding.outbound.parameters?.map((p) => ({ name: p })),
						},
					}),
				});
				break;
			}
			case "mtls_certificate": {
				metadataBindings.push({
					name,
					type: "mtls_certificate",
					certificate_id: binding.certificate_id,
				});
				break;
			}
			case "pipeline": {
				metadataBindings.push({
					name,
					type: "pipelines",
					pipeline: binding.pipeline,
				});
				break;
			}
			case "worker_loader": {
				metadataBindings.push({
					name,
					type: "worker_loader",
				});
				break;
			}
			case "logfwdr": {
				metadataBindings.push({
					name,
					type: "logfwdr",
					destination: binding.destination,
				});
				break;
			}
			case "wasm_module": {
				metadataBindings.push({
					name,
					type: "wasm_module",
					part: name,
				});
				const source = binding.source;
				const content =
					"contents" in source
						? source.contents
						: readFileSync(source.path as string);
				formData.set(
					name,
					new File([content], "path" in source ? source.path ?? name : name, {
						type: "application/wasm",
					})
				);
				break;
			}
			case "browser": {
				metadataBindings.push({
					name,
					type: "browser",
					raw: binding.raw,
				});
				break;
			}
			case "ai": {
				metadataBindings.push({
					name,
					staging: binding.staging,
					type: "ai",
					raw: binding.raw,
				});
				break;
			}
			case "images": {
				metadataBindings.push({
					name,
					type: "images",
					raw: binding.raw,
				});
				break;
			}
			case "media": {
				metadataBindings.push({
					name,
					type: "media",
				});
				break;
			}
			case "version_metadata": {
				metadataBindings.push({
					name,
					type: "version_metadata",
				});
				break;
			}
			case "assets": {
				metadataBindings.push({
					name,
					type: "assets",
				});
				break;
			}
			case "text_blob": {
				metadataBindings.push({
					name,
					type: "text_blob",
					part: name,
				});
				const source = binding.source;
				if (name !== "__STATIC_CONTENT_MANIFEST") {
					if ("contents" in source) {
						formData.set(
							name,
							new File([source.contents], source.path ?? name, {
								type: "text/plain",
							})
						);
					} else {
						formData.set(
							name,
							new File([readFileSync(source.path)], source.path, {
								type: "text/plain",
							})
						);
					}
				}
				break;
			}
			case "data_blob": {
				metadataBindings.push({
					name,
					type: "data_blob",
					part: name,
				});
				const source = binding.source;
				const content =
					"contents" in source
						? source.contents
						: readFileSync(source.path as string);
				formData.set(
					name,
					new File([content], "path" in source ? source.path ?? name : name, {
						type: "application/octet-stream",
					})
				);
				break;
			}
			case "fetcher": {
				// Fetcher bindings are handled separately (not uploaded to API)
				break;
			}
			default: {
				// Handle unsafe_* bindings (excluding unsafe_hello_world which is handled above)
				if (binding.type.startsWith("unsafe_")) {
					const { type, ...data } = binding;
					metadataBindings.push({
						name,
						type: type.slice("unsafe_".length),
						...data,
					} as WorkerMetadataBinding);
				}
				break;
			}
		}
	}

	const manifestModuleName = "__STATIC_CONTENT_MANIFEST";
	const hasManifest = modules?.some(({ name }) => name === manifestModuleName);
	if (hasManifest && main.type === "esm") {
		assert(modules !== undefined);
		const subDirs = new Set(
			modules.map((module) => path.posix.dirname(module.name))
		);
		for (const subDir of subDirs) {
			if (subDir === ".") {
				continue;
			}
			const relativePath = path.posix.relative(subDir, manifestModuleName);
			const filePath = path.posix.join(subDir, manifestModuleName);
			modules.push({
				name: filePath,
				filePath,
				content: `export { default } from ${JSON.stringify(relativePath)};`,
				type: "esm",
			});
		}
	}

	if (main.type === "commonjs") {
		for (const module of Object.values([...(modules || [])])) {
			if (module.name === "__STATIC_CONTENT_MANIFEST") {
				formData.set(
					module.name,
					new File([module.content], module.name, {
						type: "text/plain",
					})
				);
				modules = modules?.filter((m) => m !== module);
			} else if (
				module.type === "compiled-wasm" ||
				module.type === "text" ||
				module.type === "buffer"
			) {
				const name = module.name.replace(/[^a-zA-Z0-9_$]/g, "_");
				metadataBindings.push({
					name,
					type:
						module.type === "compiled-wasm"
							? "wasm_module"
							: module.type === "text"
								? "text_blob"
								: "data_blob",
					part: name,
				});
				formData.set(
					name,
					new File([module.content], module.name, {
						type:
							module.type === "compiled-wasm"
								? "application/wasm"
								: module.type === "text"
									? "text/plain"
									: "application/octet-stream",
					})
				);
				modules = modules?.filter((m) => m !== module);
			}
		}
	}

	let capnpSchemaOutputFile: string | undefined;
	if (options?.unsafe?.capnp) {
		// @ts-expect-error capnp handling
		const capnpOutput = handleUnsafeCapnp(options.unsafe.capnp);
		capnpSchemaOutputFile = `./capnp-${Date.now()}.compiled`;
		formData.set(
			capnpSchemaOutputFile,
			new File([capnpOutput], capnpSchemaOutputFile, {
				type: "application/octet-stream",
			})
		);
	}

	let keep_bindings: WorkerMetadata["keep_bindings"] = undefined;
	if (keepVars) {
		keep_bindings ??= [];
		keep_bindings.push("plain_text", "json");
	}
	if (keepSecrets) {
		keep_bindings ??= [];
		keep_bindings.push("secret_text", "secret_key");
	}
	if (keepBindings) {
		keep_bindings ??= [];
		keep_bindings.push(...keepBindings);
	}

	const metadata: WorkerMetadata = {
		...(main.type !== "commonjs"
			? { main_module: main.name }
			: { body_part: main.name }),
		bindings: metadataBindings,
		containers:
			worker.containers === undefined
				? undefined
				: worker.containers.map((c) => ({ class_name: c.class_name })),

		...(compatibility_date && { compatibility_date }),
		...(compatibility_flags && {
			compatibility_flags,
		}),
		...(migrations && { migrations }),
		capnp_schema: capnpSchemaOutputFile,
		...(keep_bindings && { keep_bindings }),
		...(logpush !== undefined && { logpush }),
		...(placement && { placement }),
		...(tail_consumers && { tail_consumers }),
		...(streaming_tail_consumers && { streaming_tail_consumers }),
		...(limits && { limits }),
		...(annotations && { annotations }),
		...(keep_assets !== undefined && { keep_assets }),
		...(assets && {
			assets: {
				jwt: assets.jwt,
				config: assetConfig,
			},
		}),
		...(observability && { observability }),
	};

	if (options?.unsafe?.metadata !== undefined) {
		for (const key of Object.keys(options.unsafe.metadata)) {
			metadata[key] = options.unsafe.metadata[key];
		}
	}

	formData.set("metadata", JSON.stringify(metadata));

	if (main.type === "commonjs" && modules && modules.length > 0) {
		throw new TypeError(
			"More than one module can only be specified when type = 'esm'"
		);
	}

	for (const module of [main].concat(modules || [])) {
		formData.set(
			module.name,
			new File([module.content], module.name, {
				type: toMimeType(module.type ?? main.type ?? "esm"),
			})
		);
	}

	for (const sourceMap of sourceMaps || []) {
		formData.set(
			sourceMap.name,
			new File([sourceMap.content], sourceMap.name, {
				type: "application/source-map",
			})
		);
	}

	return formData;
}
