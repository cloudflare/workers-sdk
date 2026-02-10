import assert from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import { INHERIT_SYMBOL, UserError } from "@cloudflare/workers-utils";
import { FormData } from "undici";
import {
	convertCfWorkerInitBindingsToBindings,
	extractBindingsOfType,
	isUnsafeBindingType,
} from "../api/startDevWorker/utils";
import { handleUnsafeCapnp } from "./capnp";
import type { StartDevWorkerInput } from "../api/startDevWorker/types";
import type {
	AssetConfigMetadata,
	CfCapnp,
	CfModuleType,
	CfSendEmailBindings,
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
 * Creates a `FormData` upload from Worker data and bindings
 */
export function createWorkerUploadForm(
	worker: CfWorkerInit,
	options?: { dryRun: true }
): FormData {
	const bindings = convertCfWorkerInitBindingsToBindings(worker.bindings);
	return createFlatWorkerUploadForm(worker, bindings, {
		dryRun: options?.dryRun,
		unsafe: worker.bindings.unsafe,
	});
}

export function createFlatWorkerUploadForm(
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

	const plain_text = extractBindingsOfType("plain_text", bindings);
	const json_bindings = extractBindingsOfType("json", bindings);
	const secret_text = extractBindingsOfType("secret_text", bindings);
	const kv_namespaces = extractBindingsOfType("kv_namespace", bindings);
	const send_email = extractBindingsOfType("send_email", bindings);
	const durable_objects = extractBindingsOfType(
		"durable_object_namespace",
		bindings
	);
	const workflows = extractBindingsOfType("workflow", bindings);
	const queues = extractBindingsOfType("queue", bindings);
	const r2_buckets = extractBindingsOfType("r2_bucket", bindings);
	const d1_databases = extractBindingsOfType("d1", bindings);
	const vectorize = extractBindingsOfType("vectorize", bindings);
	const hyperdrive = extractBindingsOfType("hyperdrive", bindings);
	const secrets_store_secrets = extractBindingsOfType(
		"secrets_store_secret",
		bindings
	);
	const unsafe_hello_world = extractBindingsOfType(
		"unsafe_hello_world",
		bindings
	);
	const ratelimits = extractBindingsOfType("ratelimit", bindings);
	const vpc_services = extractBindingsOfType("vpc_service", bindings);
	const services = extractBindingsOfType("service", bindings);
	const analytics_engine_datasets = extractBindingsOfType(
		"analytics_engine",
		bindings
	);
	const dispatch_namespaces = extractBindingsOfType(
		"dispatch_namespace",
		bindings
	);
	const mtls_certificates = extractBindingsOfType("mtls_certificate", bindings);
	const pipelines = extractBindingsOfType("pipeline", bindings);
	const worker_loaders = extractBindingsOfType("worker_loader", bindings);
	const logfwdr = extractBindingsOfType("logfwdr", bindings);
	const wasm_modules = extractBindingsOfType("wasm_module", bindings);
	const browser = extractBindingsOfType("browser", bindings)[0];
	const ai = extractBindingsOfType("ai", bindings)[0];
	const images = extractBindingsOfType("images", bindings)[0];
	const media = extractBindingsOfType("media", bindings)[0];
	const version_metadata = extractBindingsOfType(
		"version_metadata",
		bindings
	)[0];
	const assetsBinding = extractBindingsOfType("assets", bindings)[0];
	const text_blobs = extractBindingsOfType("text_blob", bindings);
	const data_blobs = extractBindingsOfType("data_blob", bindings);
	const inherit_bindings = extractBindingsOfType("inherit", bindings);

	inherit_bindings.forEach(({ binding }) => {
		metadataBindings.push({ name: binding, type: "inherit" });
	});

	plain_text.forEach(({ binding, value }) => {
		metadataBindings.push({ name: binding, type: "plain_text", text: value });
	});
	json_bindings.forEach(({ binding, value }) => {
		metadataBindings.push({ name: binding, type: "json", json: value });
	});
	secret_text.forEach(({ binding, value }) => {
		metadataBindings.push({ name: binding, type: "secret_text", text: value });
	});

	kv_namespaces.forEach(({ id, binding, raw }) => {
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
				raw,
			});
		}
	});

	send_email.forEach((emailBinding: CfSendEmailBindings) => {
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
		metadataBindings.push({
			name: emailBinding.name,
			type: "send_email",
			destination_address,
			allowed_destination_addresses,
			allowed_sender_addresses,
		});
	});

	durable_objects.forEach(({ name, class_name, script_name, environment }) => {
		metadataBindings.push({
			name,
			type: "durable_object_namespace",
			class_name: class_name,
			...(script_name && { script_name }),
			...(environment && { environment }),
		});
	});

	workflows.forEach(({ binding, name, class_name, script_name, raw }) => {
		metadataBindings.push({
			type: "workflow",
			name: binding,
			workflow_name: name,
			class_name,
			script_name,
			raw,
		});
	});

	queues.forEach(({ binding, queue_name, delivery_delay, raw }) => {
		metadataBindings.push({
			type: "queue",
			name: binding,
			queue_name,
			delivery_delay,
			raw,
		});
	});

	r2_buckets.forEach(({ binding, bucket_name, jurisdiction, raw }) => {
		if (options?.dryRun) {
			bucket_name ??= INHERIT_SYMBOL;
		}
		if (bucket_name === undefined) {
			throw new UserError(
				`${binding} bindings must have a "bucket_name" field`
			);
		}

		if (bucket_name === INHERIT_SYMBOL) {
			metadataBindings.push({
				name: binding,
				type: "inherit",
			});
		} else {
			metadataBindings.push({
				name: binding,
				type: "r2_bucket",
				bucket_name,
				jurisdiction,
				raw,
			});
		}
	});

	d1_databases.forEach(
		({ binding, database_id, database_internal_env, raw }) => {
			if (options?.dryRun) {
				database_id ??= INHERIT_SYMBOL;
			}
			if (database_id === undefined) {
				throw new UserError(
					`${binding} bindings must have a "database_id" field`
				);
			}

			if (database_id === INHERIT_SYMBOL) {
				metadataBindings.push({
					name: binding,
					type: "inherit",
				});
			} else {
				metadataBindings.push({
					name: binding,
					type: "d1",
					id: database_id,
					internalEnv: database_internal_env,
					raw,
				});
			}
		}
	);

	vectorize.forEach(({ binding, index_name, raw }) => {
		metadataBindings.push({
			name: binding,
			type: "vectorize",
			index_name: index_name,
			raw,
		});
	});

	hyperdrive.forEach(({ binding, id }) => {
		metadataBindings.push({
			name: binding,
			type: "hyperdrive",
			id: id,
		});
	});

	secrets_store_secrets.forEach(({ binding, store_id, secret_name }) => {
		metadataBindings.push({
			name: binding,
			type: "secrets_store_secret",
			store_id,
			secret_name,
		});
	});

	unsafe_hello_world.forEach(({ binding, enable_timer }) => {
		metadataBindings.push({
			name: binding,
			type: "unsafe_hello_world",
			enable_timer,
		});
	});

	ratelimits.forEach(({ name, namespace_id, simple }) => {
		metadataBindings.push({
			name,
			type: "ratelimit",
			namespace_id,
			simple,
		});
	});

	vpc_services.forEach(({ binding, service_id }) => {
		metadataBindings.push({
			name: binding,
			type: "vpc_service",
			service_id,
		});
	});

	services.forEach(
		({
			binding,
			service,
			environment,
			entrypoint,
			props,
			cross_account_grant,
		}) => {
			metadataBindings.push({
				name: binding,
				type: "service",
				service,
				cross_account_grant,
				...(environment && { environment }),
				...(entrypoint && { entrypoint }),
				...(props && { props }),
			});
		}
	);

	analytics_engine_datasets.forEach(({ binding, dataset }) => {
		metadataBindings.push({
			name: binding,
			type: "analytics_engine",
			dataset,
		});
	});

	dispatch_namespaces.forEach(({ binding, namespace, outbound }) => {
		metadataBindings.push({
			name: binding,
			type: "dispatch_namespace",
			namespace,
			...(outbound && {
				outbound: {
					worker: {
						service: outbound.service,
						environment: outbound.environment,
					},
					params: outbound.parameters?.map((p) => ({ name: p })),
				},
			}),
		});
	});

	mtls_certificates.forEach(({ binding, certificate_id }) => {
		metadataBindings.push({
			name: binding,
			type: "mtls_certificate",
			certificate_id,
		});
	});

	pipelines.forEach(({ binding, pipeline }) => {
		metadataBindings.push({
			name: binding,
			type: "pipelines",
			pipeline: pipeline,
		});
	});

	worker_loaders.forEach(({ binding }) => {
		metadataBindings.push({
			name: binding,
			type: "worker_loader",
		});
	});

	logfwdr.forEach(({ name, destination }) => {
		metadataBindings.push({
			name: name,
			type: "logfwdr",
			destination,
		});
	});

	wasm_modules.forEach(({ binding: name, source }) => {
		metadataBindings.push({
			name,
			type: "wasm_module",
			part: name,
		});

		formData.set(
			name,
			new File(
				[
					"contents" in source
						? source.contents
						: readFileSync(source.path as string),
				],
				"path" in source ? source.path ?? name : name,
				{ type: "application/wasm" }
			)
		);
	});

	if (browser !== undefined) {
		metadataBindings.push({
			name: browser.binding,
			type: "browser",
			raw: browser.raw,
		});
	}

	if (ai !== undefined) {
		metadataBindings.push({
			name: ai.binding,
			staging: ai.staging,
			type: "ai",
			raw: ai.raw,
		});
	}

	if (images !== undefined) {
		metadataBindings.push({
			name: images.binding,
			type: "images",
			raw: images.raw,
		});
	}

	if (media !== undefined) {
		metadataBindings.push({
			name: media.binding,
			type: "media",
		});
	}

	if (version_metadata !== undefined) {
		metadataBindings.push({
			name: version_metadata.binding,
			type: "version_metadata",
		});
	}

	if (assetsBinding !== undefined) {
		metadataBindings.push({
			name: assetsBinding.binding,
			type: "assets",
		});
	}

	text_blobs.forEach(({ binding: name, source }) => {
		metadataBindings.push({
			name,
			type: "text_blob",
			part: name,
		});

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
	});

	data_blobs.forEach(({ binding: name, source }) => {
		metadataBindings.push({
			name,
			type: "data_blob",
			part: name,
		});

		formData.set(
			name,
			new File(
				[
					"contents" in source
						? source.contents
						: readFileSync(source.path as string),
				],
				"path" in source ? source.path ?? name : name,
				{ type: "application/octet-stream" }
			)
		);
	});

	// Handle generic unsafe_* bindings (excluding unsafe_hello_world which is handled above)
	for (const [bindingName, config] of Object.entries(bindings ?? {})) {
		if (
			isUnsafeBindingType(config.type) &&
			config.type !== "unsafe_hello_world"
		) {
			const { type, ...data } = config;
			metadataBindings.push({
				name: bindingName,
				type: type.slice("unsafe_".length),
				...data,
			} as WorkerMetadataBinding);
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
