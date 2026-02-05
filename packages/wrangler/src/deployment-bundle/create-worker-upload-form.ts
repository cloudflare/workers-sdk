import assert from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import { INHERIT_SYMBOL, UserError } from "@cloudflare/workers-utils";
import { FormData } from "undici";
import { handleUnsafeCapnp } from "./capnp";
import type { Binding, StartDevWorkerInput } from "../api/startDevWorker/types";
import type {
	AssetConfigMetadata,
	CfCapnp,
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
	worker: Omit<CfWorkerInit, "bindings" | "rawBindings">,
	bindings: StartDevWorkerInput["bindings"],
	options?: {
		dryRun?: true;
		unsafe?: { metadata?: Record<string, unknown>; capnp?: CfCapnp };
	}
): FormData {
	const formData = new FormData();
	const {
		main,
		sourceMaps,
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

	const metadataBindings: WorkerMetadataBinding[] = [];

	for (const [binding, config] of Object.entries(bindings ?? {})) {
		switch (config.type) {
			case "plain_text": {
				metadataBindings.push({
					name: binding,
					type: "plain_text",
					text: config.value,
				});
				break;
			}
			case "secret_text": {
				metadataBindings.push({
					name: binding,
					type: "secret_text",
					text: config.value,
				});
				break;
			}
			case "json": {
				metadataBindings.push({
					name: binding,
					type: "json",
					json: config.value,
				});
				break;
			}
			case "kv_namespace": {
				let id = config.id;
				// If we're doing a dry run there's no way to know whether or not a KV namespace
				// is inheritable or requires provisioning (since that would require hitting the API).
				// As such, _assume_ any undefined IDs are inheritable when doing a dry run.
				// When this Worker is actually deployed, some may be provisioned at the point of deploy
				if (options?.dryRun) {
					id ??= INHERIT_SYMBOL;
				}

				if (id === undefined) {
					throw new UserError(`${binding} bindings must have an "id" field`);
				}

				if (id === INHERIT_SYMBOL) {
					metadataBindings.push({
						name: binding,
						type: "inherit",
					});
				} else {
					metadataBindings.push({
						name: binding,
						type: "kv_namespace",
						namespace_id: id,
						raw: config.raw,
					});
				}
				break;
			}
			case "send_email": {
				const destination_address =
					"destination_address" in config
						? (config.destination_address as string | undefined)
						: undefined;
				const allowed_destination_addresses =
					"allowed_destination_addresses" in config
						? (config.allowed_destination_addresses as string[] | undefined)
						: undefined;
				const allowed_sender_addresses =
					"allowed_sender_addresses" in config
						? (config.allowed_sender_addresses as string[] | undefined)
						: undefined;
				metadataBindings.push({
					name: binding,
					type: "send_email",
					destination_address,
					allowed_destination_addresses,
					allowed_sender_addresses,
				});
				break;
			}
			case "durable_object_namespace": {
				metadataBindings.push({
					name: binding,
					type: "durable_object_namespace",
					class_name: config.class_name,
					...(config.script_name && { script_name: config.script_name }),
					...(config.environment && { environment: config.environment }),
				});
				break;
			}
			case "workflow": {
				metadataBindings.push({
					type: "workflow",
					name: binding,
					workflow_name: config.name,
					class_name: config.class_name,
					script_name: config.script_name,
					raw: config.raw,
				});
				break;
			}
			case "queue": {
				metadataBindings.push({
					type: "queue",
					name: binding,
					queue_name: config.queue_name,
					delivery_delay: config.delivery_delay,
					raw: config.raw,
				});
				break;
			}
			case "r2_bucket": {
				let bucketName = config.bucket_name;
				if (options?.dryRun) {
					bucketName ??= INHERIT_SYMBOL;
				}
				if (bucketName === undefined) {
					throw new UserError(
						`${binding} bindings must have a "bucket_name" field`
					);
				}
				if (bucketName === INHERIT_SYMBOL) {
					metadataBindings.push({
						name: binding,
						type: "inherit",
					});
				} else {
					metadataBindings.push({
						name: binding,
						type: "r2_bucket",
						bucket_name: bucketName,
						jurisdiction: config.jurisdiction,
						raw: config.raw,
					});
				}
				break;
			}
			case "d1": {
				let databaseId = config.database_id;
				if (options?.dryRun) {
					databaseId ??= INHERIT_SYMBOL;
				}
				if (databaseId === undefined) {
					throw new UserError(
						`${binding} bindings must have a "database_id" field`
					);
				}
				if (databaseId === INHERIT_SYMBOL) {
					metadataBindings.push({
						name: binding,
						type: "inherit",
					});
				} else {
					metadataBindings.push({
						name: binding,
						type: "d1",
						id: databaseId,
						internalEnv: config.database_internal_env,
						raw: config.raw,
					});
				}
				break;
			}
			case "vectorize": {
				metadataBindings.push({
					name: binding,
					type: "vectorize",
					index_name: config.index_name,
					raw: config.raw,
				});
				break;
			}
			case "hyperdrive": {
				metadataBindings.push({
					name: binding,
					type: "hyperdrive",
					id: config.id,
				});
				break;
			}
			case "secrets_store_secret": {
				metadataBindings.push({
					name: binding,
					type: "secrets_store_secret",
					store_id: config.store_id,
					secret_name: config.secret_name,
				});
				break;
			}
			case "unsafe_hello_world": {
				// The binding type overlaps with `unsafe_${string}`, so we need to cast
				const helloWorldBinding = config as Extract<
					Binding,
					{ type: "unsafe_hello_world" }
				>;
				metadataBindings.push({
					name: binding,
					type: "unsafe_hello_world",
					enable_timer: helloWorldBinding.enable_timer,
				});
				break;
			}
			case "ratelimit": {
				metadataBindings.push({
					name: binding,
					type: "ratelimit",
					namespace_id: config.namespace_id,
					simple: config.simple,
				});
				break;
			}
			case "vpc_service": {
				metadataBindings.push({
					name: binding,
					type: "vpc_service",
					service_id: config.service_id,
				});
				break;
			}
			case "service": {
				metadataBindings.push({
					name: binding,
					type: "service",
					service: config.service,
					cross_account_grant: config.cross_account_grant,
					...(config.environment && { environment: config.environment }),
					...(config.entrypoint && { entrypoint: config.entrypoint }),
					...(config.props && { props: config.props }),
				});
				break;
			}
			case "analytics_engine": {
				metadataBindings.push({
					name: binding,
					type: "analytics_engine",
					dataset: config.dataset,
				});
				break;
			}
			case "dispatch_namespace": {
				metadataBindings.push({
					name: binding,
					type: "dispatch_namespace",
					namespace: config.namespace,
					...(config.outbound && {
						outbound: {
							worker: {
								service: config.outbound.service,
								environment: config.outbound.environment,
							},
							params: config.outbound.parameters?.map((p) => ({ name: p })),
						},
					}),
				});
				break;
			}
			case "mtls_certificate": {
				metadataBindings.push({
					name: binding,
					type: "mtls_certificate",
					certificate_id: config.certificate_id,
				});
				break;
			}
			case "pipeline": {
				metadataBindings.push({
					name: binding,
					type: "pipelines",
					pipeline: config.pipeline,
				});
				break;
			}
			case "worker_loader": {
				metadataBindings.push({
					name: binding,
					type: "worker_loader",
				});
				break;
			}
			case "logfwdr": {
				metadataBindings.push({
					name: binding,
					type: "logfwdr",
					destination: config.destination,
				});
				break;
			}
			case "wasm_module": {
				metadataBindings.push({
					name: binding,
					type: "wasm_module",
					part: binding,
				});
				const source = config.source;
				const content =
					"contents" in source
						? source.contents
						: readFileSync(source.path as string);
				formData.set(
					binding,
					new File(
						[content],
						"path" in source ? source.path ?? binding : binding,
						{
							type: "application/wasm",
						}
					)
				);
				break;
			}
			case "browser": {
				metadataBindings.push({
					name: binding,
					type: "browser",
					raw: config.raw,
				});
				break;
			}
			case "ai": {
				metadataBindings.push({
					name: binding,
					staging: config.staging,
					type: "ai",
					raw: config.raw,
				});
				break;
			}
			case "images": {
				metadataBindings.push({
					name: binding,
					type: "images",
					raw: config.raw,
				});
				break;
			}
			case "media": {
				metadataBindings.push({
					name: binding,
					type: "media",
				});
				break;
			}
			case "version_metadata": {
				metadataBindings.push({
					name: binding,
					type: "version_metadata",
				});
				break;
			}
			case "assets": {
				metadataBindings.push({
					name: binding,
					type: "assets",
				});
				break;
			}
			case "text_blob": {
				metadataBindings.push({
					name: binding,
					type: "text_blob",
					part: binding,
				});
				const source = config.source;
				if (binding !== "__STATIC_CONTENT_MANIFEST") {
					if ("contents" in source) {
						formData.set(
							binding,
							new File([source.contents], source.path ?? binding, {
								type: "text/plain",
							})
						);
					} else {
						formData.set(
							binding,
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
					name: binding,
					type: "data_blob",
					part: binding,
				});
				const source = config.source;
				const content =
					"contents" in source
						? source.contents
						: readFileSync(source.path as string);
				formData.set(
					binding,
					new File(
						[content],
						"path" in source ? source.path ?? binding : binding,
						{
							type: "application/octet-stream",
						}
					)
				);
				break;
			}

			default: {
				// Handle unsafe_* bindings (excluding unsafe_hello_world which is handled above)
				if (config.type.startsWith("unsafe_")) {
					const { type, ...data } = config;
					metadataBindings.push({
						name: binding,
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
		// Each modules-format worker has a virtual file system for module
		// resolution. For example, uploading modules with names `1.mjs`,
		// `a/2.mjs` and `a/b/3.mjs`, creates virtual directories `a` and `a/b`.
		// `1.mjs` is in the virtual root directory.
		//
		// The above code adds the `__STATIC_CONTENT_MANIFEST` module to the root
		// directory. This means `import manifest from "__STATIC_CONTENT_MANIFEST"`
		// will only work if the importing module is also in the root. If the
		// importing module was `a/b/3.mjs` for example, the import would need to
		// be `import manifest from "../../__STATIC_CONTENT_MANIFEST"`.
		//
		// When Wrangler bundles all user code, this isn't a problem, as code is
		// only ever uploaded to the root. However, once `--no-bundle` or
		// `find_additional_modules` is enabled, the user controls the directory
		// structure.
		//
		// To fix this, if we've got a modules-format worker, we add stub modules
		// in each subdirectory that re-export the manifest module from the root.
		// This allows the manifest to be imported as `__STATIC_CONTENT_MANIFEST`
		// in every directory, whilst avoiding duplication of the manifest.

		// Collect unique subdirectories
		const subDirs = new Set(
			modules.map((module) => path.posix.dirname(module.name))
		);
		for (const subDir of subDirs) {
			// Ignore `.` as it's not a subdirectory, and we don't want to
			// register the manifest module in the root twice.
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
		// This is a service-worker format worker.
		for (const module of Object.values([...(modules || [])])) {
			if (module.name === "__STATIC_CONTENT_MANIFEST") {
				// Add the manifest to the form data.
				formData.set(
					module.name,
					new File([module.content], module.name, {
						type: "text/plain",
					})
				);
				// And then remove it from the modules collection
				modules = modules?.filter((m) => m !== module);
			} else if (
				module.type === "compiled-wasm" ||
				module.type === "text" ||
				module.type === "buffer"
			) {
				// Convert all wasm/text/data modules into `wasm_module`/`text_blob`/`data_blob` bindings.
				// The "name" of the module is a file path. We use it
				// to instead be a "part" of the body, and a reference
				// that we can use inside our source. This identifier has to be a valid
				// JS identifier, so we replace all non alphanumeric characters
				// with an underscore.
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

				// Add the module to the form data.
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
				// And then remove it from the modules collection
				modules = modules?.filter((m) => m !== module);
			}
		}
	}

	let capnpSchemaOutputFile: string | undefined;
	if (options?.unsafe?.capnp) {
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
