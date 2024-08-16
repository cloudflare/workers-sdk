import assert from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import { File, FormData } from "undici";
import { handleUnsafeCapnp } from "./capnp";
import { stripExperimentalPrefixes } from "./node-compat";
import type {
	CfDurableObjectMigrations,
	CfModuleType,
	CfPlacement,
	CfTailConsumer,
	CfUserLimits,
	CfWorkerInit,
} from "./worker.js";
import type { Json } from "miniflare";

const moduleTypeMimeType: { [type in CfModuleType]: string | undefined } = {
	esm: "application/javascript+module",
	commonjs: "application/javascript",
	"compiled-wasm": "application/wasm",
	buffer: "application/octet-stream",
	text: "text/plain",
	python: "text/x-python",
	"python-requirement": "text/x-python-requirement",
	"nodejs-compat-module": undefined,
};

export function toMimeType(type: CfModuleType): string {
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

export type WorkerMetadataBinding =
	// If you add any new binding types here, also add it to safeBindings
	// under validateUnsafeBinding in config/validation.ts

	// Inherit is _not_ in safeBindings because it is here for API use only
	// wrangler supports this per type today through keep_bindings
	| { type: "inherit"; name: string }
	| { type: "plain_text"; name: string; text: string }
	| { type: "secret_text"; name: string; text: string }
	| { type: "json"; name: string; json: Json }
	| { type: "wasm_module"; name: string; part: string }
	| { type: "text_blob"; name: string; part: string }
	| { type: "browser"; name: string }
	| { type: "ai"; name: string; staging?: boolean }
	| { type: "version_metadata"; name: string }
	| { type: "data_blob"; name: string; part: string }
	| { type: "kv_namespace"; name: string; namespace_id: string }
	| {
			type: "send_email";
			name: string;
			destination_address?: string;
			allowed_destination_addresses?: string[];
	  }
	| {
			type: "durable_object_namespace";
			name: string;
			class_name: string;
			script_name?: string;
			environment?: string;
	  }
	| { type: "queue"; name: string; queue_name: string; delivery_delay?: number }
	| {
			type: "r2_bucket";
			name: string;
			bucket_name: string;
			jurisdiction?: string;
	  }
	| { type: "d1"; name: string; id: string; internalEnv?: string }
	| {
			type: "vectorize";
			name: string;
			index_name: string;
			internalEnv?: string;
	  }
	| { type: "hyperdrive"; name: string; id: string }
	| {
			type: "service";
			name: string;
			service: string;
			environment?: string;
			entrypoint?: string;
	  }
	| { type: "analytics_engine"; name: string; dataset?: string }
	| {
			type: "dispatch_namespace";
			name: string;
			namespace: string;
			outbound?: {
				worker: {
					service: string;
					environment?: string;
				};
				params?: { name: string }[];
			};
	  }
	| { type: "mtls_certificate"; name: string; certificate_id: string }
	| {
			type: "logfwdr";
			name: string;
			destination: string;
	  }
	| { type: "assets"; name: string };

// for PUT /accounts/:accountId/workers/scripts/:scriptName
export type WorkerMetadataPut = {
	/** The name of the entry point module. Only exists when the worker is in the ES module format */
	main_module?: string;
	/** The name of the entry point module. Only exists when the worker is in the service-worker format */
	body_part?: string;
	compatibility_date?: string;
	compatibility_flags?: string[];
	usage_model?: "bundled" | "unbound";
	migrations?: CfDurableObjectMigrations;
	capnp_schema?: string;
	bindings: WorkerMetadataBinding[];
	keep_bindings?: (
		| WorkerMetadataBinding["type"]
		| "secret_text"
		| "secret_key"
	)[];
	logpush?: boolean;
	placement?: CfPlacement;
	tail_consumers?: CfTailConsumer[];
	limits?: CfUserLimits;
	// experimental assets (EWC will expect 'assets')
	assets?: string;
	// Allow unsafe.metadata to add arbitrary properties at runtime
	[key: string]: unknown;
};

// for POST /accounts/:accountId/workers/:workerName/versions
export type WorkerMetadataVersionsPost = WorkerMetadataPut & {
	annotations?: Record<string, string>;
};

export type WorkerMetadata = WorkerMetadataPut | WorkerMetadataVersionsPost;

/**
 * Creates a `FormData` upload from a `CfWorkerInit`.
 */
export function createWorkerUploadForm(worker: CfWorkerInit): FormData {
	const formData = new FormData();
	const {
		main,
		sourceMaps,
		bindings,
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
		limits,
		annotations,
		experimental_assets_jwt,
	} = worker;

	// short circuit if static assets upload only
	if (main.name === "no-op-assets-worker.js" && experimental_assets_jwt) {
		formData.set(
			"metadata",
			JSON.stringify({ assets: experimental_assets_jwt })
		);
		return formData;
	}
	let { modules } = worker;

	const metadataBindings: WorkerMetadataBinding[] = rawBindings ?? [];

	Object.entries(bindings.vars || {})?.forEach(([key, value]) => {
		if (typeof value === "string") {
			metadataBindings.push({ name: key, type: "plain_text", text: value });
		} else {
			metadataBindings.push({ name: key, type: "json", json: value });
		}
	});

	bindings.kv_namespaces?.forEach(({ id, binding }) => {
		metadataBindings.push({
			name: binding,
			type: "kv_namespace",
			namespace_id: id,
		});
	});

	bindings.send_email?.forEach(
		({ name, destination_address, allowed_destination_addresses }) => {
			metadataBindings.push({
				name: name,
				type: "send_email",
				destination_address,
				allowed_destination_addresses,
			});
		}
	);

	bindings.durable_objects?.bindings.forEach(
		({ name, class_name, script_name, environment }) => {
			metadataBindings.push({
				name,
				type: "durable_object_namespace",
				class_name: class_name,
				...(script_name && { script_name }),
				...(environment && { environment }),
			});
		}
	);

	bindings.queues?.forEach(({ binding, queue_name, delivery_delay }) => {
		metadataBindings.push({
			type: "queue",
			name: binding,
			queue_name,
			delivery_delay,
		});
	});

	bindings.r2_buckets?.forEach(({ binding, bucket_name, jurisdiction }) => {
		metadataBindings.push({
			name: binding,
			type: "r2_bucket",
			bucket_name,
			jurisdiction,
		});
	});

	bindings.d1_databases?.forEach(
		({ binding, database_id, database_internal_env }) => {
			metadataBindings.push({
				name: binding,
				type: "d1",
				id: database_id,
				internalEnv: database_internal_env,
			});
		}
	);

	bindings.vectorize?.forEach(({ binding, index_name }) => {
		metadataBindings.push({
			name: binding,
			type: "vectorize",
			index_name: index_name,
		});
	});

	bindings.hyperdrive?.forEach(({ binding, id }) => {
		metadataBindings.push({
			name: binding,
			type: "hyperdrive",
			id: id,
		});
	});

	bindings.services?.forEach(
		({ binding, service, environment, entrypoint }) => {
			metadataBindings.push({
				name: binding,
				type: "service",
				service,
				...(environment && { environment }),
				...(entrypoint && { entrypoint }),
			});
		}
	);

	bindings.analytics_engine_datasets?.forEach(({ binding, dataset }) => {
		metadataBindings.push({
			name: binding,
			type: "analytics_engine",
			dataset,
		});
	});

	bindings.dispatch_namespaces?.forEach(({ binding, namespace, outbound }) => {
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

	bindings.mtls_certificates?.forEach(({ binding, certificate_id }) => {
		metadataBindings.push({
			name: binding,
			type: "mtls_certificate",
			certificate_id,
		});
	});

	bindings.logfwdr?.bindings.forEach(({ name, destination }) => {
		metadataBindings.push({
			name: name,
			type: "logfwdr",
			destination,
		});
	});

	for (const [name, source] of Object.entries(bindings.wasm_modules || {})) {
		metadataBindings.push({
			name,
			type: "wasm_module",
			part: name,
		});

		formData.set(
			name,
			new File(
				[typeof source === "string" ? readFileSync(source) : source],
				typeof source === "string" ? source : name,
				{
					type: "application/wasm",
				}
			)
		);
	}

	if (bindings.browser !== undefined) {
		metadataBindings.push({
			name: bindings.browser.binding,
			type: "browser",
		});
	}

	if (bindings.ai !== undefined) {
		metadataBindings.push({
			name: bindings.ai.binding,
			staging: bindings.ai.staging,
			type: "ai",
		});
	}

	if (bindings.version_metadata !== undefined) {
		metadataBindings.push({
			name: bindings.version_metadata.binding,
			type: "version_metadata",
		});
	}

	if (bindings.experimental_assets !== undefined) {
		metadataBindings.push({
			name: bindings.experimental_assets.binding,
			type: "assets",
		});
	}

	for (const [name, filePath] of Object.entries(bindings.text_blobs || {})) {
		metadataBindings.push({
			name,
			type: "text_blob",
			part: name,
		});

		if (name !== "__STATIC_CONTENT_MANIFEST") {
			formData.set(
				name,
				new File([readFileSync(filePath)], filePath, {
					type: "text/plain",
				})
			);
		}
	}

	for (const [name, source] of Object.entries(bindings.data_blobs || {})) {
		metadataBindings.push({
			name,
			type: "data_blob",
			part: name,
		});

		formData.set(
			name,
			new File(
				[typeof source === "string" ? readFileSync(source) : source],
				typeof source === "string" ? source : name,
				{
					type: "application/octet-stream",
				}
			)
		);
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

	if (bindings.unsafe?.bindings) {
		// @ts-expect-error unsafe bindings don't need to match a specific type here
		metadataBindings.push(...bindings.unsafe.bindings);
	}

	let capnpSchemaOutputFile: string | undefined;
	if (bindings.unsafe?.capnp) {
		const capnpOutput = handleUnsafeCapnp(bindings.unsafe.capnp);
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
		...(compatibility_date && { compatibility_date }),
		...(compatibility_flags && {
			compatibility_flags: stripExperimentalPrefixes(compatibility_flags),
		}),
		...(migrations && { migrations }),
		capnp_schema: capnpSchemaOutputFile,
		...(keep_bindings && { keep_bindings }),
		...(logpush !== undefined && { logpush }),
		...(placement && { placement }),
		...(tail_consumers && { tail_consumers }),
		...(limits && { limits }),
		...(annotations && { annotations }),
		...(experimental_assets_jwt && { assets: experimental_assets_jwt }),
	};

	if (bindings.unsafe?.metadata !== undefined) {
		for (const key of Object.keys(bindings.unsafe.metadata)) {
			metadata[key] = bindings.unsafe.metadata[key];
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
