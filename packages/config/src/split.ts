/**
 * Full-fidelity inverse of {@link convertToWranglerConfig} (plus wrangler's
 * `convertToolingConfig`).
 *
 * Takes a Wrangler `RawConfig` (snake_case — the shape of `wrangler.jsonc`)
 * and splits it into the two new-format config objects:
 *
 *   - `worker`  → the runtime config authored in `cloudflare.config.ts`
 *                 via `defineWorker` (`@cloudflare/config` `UserConfig`).
 *   - `tooling` → the bundling / dev-server config authored in
 *                 `wrangler.config.ts` via `defineWranglerConfig`.
 *
 * Every branch here mirrors a branch in the forward converter, reversed, so
 * that `convertToWranglerConfig(splitRawConfig(raw).worker)` round-trips the
 * runtime fields and `convertToolingConfig(splitRawConfig(raw).tooling)`
 * round-trips the tooling fields. The binding `env` entries are emitted as
 * plain type-tagged objects (e.g. `{ type: "kv", id }`), which are exactly
 * what the `bindings.*` builders produce and what the input schema accepts.
 *
 * The objects are deliberately plain ordered `Record`s (not typed
 * `UserConfig`) so a serializer can print them verbatim; the field shapes
 * are validated end-to-end by the round-trip tests.
 */
import type { RawConfig } from "@cloudflare/workers-utils";

export interface NewConfigSplit {
	/** Runtime config → `cloudflare.config.ts` (`defineWorker`). */
	worker: Record<string, unknown>;
	/** Tooling config → `wrangler.config.ts` (`defineWranglerConfig`). */
	tooling: Record<string, unknown>;
}

/**
 * Top-level `RawConfig` fields that carry real configuration but have no
 * representation in the new programmatic config format, so {@link splitRawConfig}
 * does not translate them (they are dropped). Callers that convert a user's
 * existing config — most notably the autoconfig migration flow — should surface
 * these via {@link getUnsupportedConfigFields} so the loss is visible rather
 * than silent.
 *
 * Keep this in sync with {@link splitRawConfig}: when support for one of these
 * lands in the converter, remove it from this list.
 */
const UNSUPPORTED_RAW_CONFIG_FIELDS = [
	"site",
	"route",
	"previews",
	"workflows",
	"cloudchamber",
	"containers",
	"unsafe_hello_world",
] as const satisfies readonly (keyof RawConfig)[];

/**
 * Return the names of fields present in `raw` that {@link splitRawConfig} does
 * not translate to the new config format (and would therefore silently drop).
 * Returns an empty array when the config is fully representable.
 */
export function getUnsupportedConfigFields(raw: RawConfig): string[] {
	return UNSUPPORTED_RAW_CONFIG_FIELDS.filter((field) => {
		const value = raw[field];
		if (value === undefined) {
			return false;
		}
		// An empty array binding (e.g. `workflows: []`) carries no config.
		if (Array.isArray(value) && value.length === 0) {
			return false;
		}
		return true;
	});
}

type Obj = Record<string, unknown>;

/** Assign `value` to `obj[key]` only when it is not `undefined`. */
function set(obj: Obj, key: string, value: unknown): void {
	if (value !== undefined) {
		obj[key] = value;
	}
}

/** Strip keys whose value is `undefined` (mirrors the forward converter). */
function omitUndefined<T extends Obj>(obj: T): T {
	const out: Obj = {};
	for (const [key, value] of Object.entries(obj)) {
		if (value !== undefined) {
			out[key] = value;
		}
	}
	return out as T;
}

/**
 * Split a `RawConfig` into the runtime (`cloudflare.config.ts`) and tooling
 * (`wrangler.config.ts`) new-format config objects.
 */
export function splitRawConfig(raw: RawConfig): NewConfigSplit {
	const worker: Obj = {};
	const tooling: Obj = {};

	convertTopLevel(raw, worker);
	const env = convertBindings(raw, worker, tooling);
	convertExports(raw, worker);
	const triggers = convertTriggersAndDomains(raw, worker);
	convertTailConsumers(raw, worker);

	// `env` / `triggers` are attached last so they read after the scalar
	// top-level fields in the generated file.
	if (Object.keys(env).length > 0) {
		worker.env = env;
	}
	if (triggers.length > 0) {
		worker.triggers = triggers;
	}

	convertTooling(raw, tooling);

	return { worker, tooling };
}

// ─── top-level ──────────────────────────────────────────────────────────────

function convertTopLevel(raw: RawConfig, worker: Obj): void {
	set(worker, "name", raw.name);
	set(worker, "entrypoint", raw.main);
	set(worker, "accountId", raw.account_id);
	set(worker, "compatibilityDate", raw.compatibility_date);
	set(worker, "compatibilityFlags", raw.compatibility_flags);
	set(worker, "workersDev", raw.workers_dev);
	set(worker, "previewUrls", raw.preview_urls);
	set(worker, "logpush", raw.logpush);
	if (raw.compliance_region !== undefined) {
		worker.complianceRegion =
			raw.compliance_region === "fedramp_high" ? "fedramp-high" : "public";
	}
	set(worker, "firstPartyWorker", raw.first_party_worker);
	set(worker, "placement", raw.placement);
	if (raw.limits !== undefined) {
		const limits: Obj = {};
		set(limits, "cpuMs", raw.limits.cpu_ms);
		set(limits, "subrequests", raw.limits.subrequests);
		worker.limits = limits;
	}
	if (raw.observability !== undefined) {
		worker.observability = convertObservability(raw.observability);
	}
	if (raw.cache !== undefined) {
		worker.cache = { enabled: raw.cache.enabled };
	}
	const unsafe = convertUnsafeTopLevel(raw.unsafe);
	if (unsafe !== undefined) {
		worker.unsafe = unsafe;
	}
}

function convertObservability(o: NonNullable<RawConfig["observability"]>): Obj {
	const out: Obj = {};
	set(out, "enabled", o.enabled);
	set(out, "headSamplingRate", o.head_sampling_rate);
	if (o.logs !== undefined) {
		const logs: Obj = {};
		set(logs, "enabled", o.logs.enabled);
		set(logs, "headSamplingRate", o.logs.head_sampling_rate);
		set(logs, "invocationLogs", o.logs.invocation_logs);
		set(logs, "persist", o.logs.persist);
		set(logs, "destinations", o.logs.destinations);
		out.logs = logs;
	}
	if (o.traces !== undefined) {
		const traces: Obj = {};
		set(traces, "enabled", o.traces.enabled);
		set(traces, "headSamplingRate", o.traces.head_sampling_rate);
		set(traces, "persist", o.traces.persist);
		set(traces, "destinations", o.traces.destinations);
		out.traces = traces;
	}
	return out;
}

function convertUnsafeTopLevel(unsafe: RawConfig["unsafe"]): Obj | undefined {
	if (unsafe === undefined) {
		return undefined;
	}
	const out: Obj = {};
	set(out, "metadata", unsafe.metadata);
	if (unsafe.capnp) {
		if ("compiled_schema" in unsafe.capnp && unsafe.capnp.compiled_schema) {
			out.capnp = { compiledSchema: unsafe.capnp.compiled_schema };
		} else if ("base_path" in unsafe.capnp && unsafe.capnp.base_path) {
			out.capnp = {
				basePath: unsafe.capnp.base_path,
				sourceSchemas: unsafe.capnp.source_schemas ?? [],
			};
		}
	}
	// An unsafe block containing only `bindings` (handled in convertBindings)
	// produces an empty object here — drop it.
	return Object.keys(out).length > 0 ? out : undefined;
}

// ─── bindings + assets ────────────────────────────────────────────────────

/** Build the `env` record (binding name → type-tagged binding object). */
function convertBindings(raw: RawConfig, worker: Obj, tooling: Obj): Obj {
	const env: Obj = {};

	// Singleton bindings live at the RawConfig top level.
	if (raw.ai) {
		env[raw.ai.binding] = omitUndefined({ type: "ai", remote: raw.ai.remote });
	}
	if (raw.browser?.binding) {
		env[raw.browser.binding] = omitUndefined({
			type: "browser",
			remote: raw.browser.remote,
		});
	}
	if (raw.images?.binding) {
		env[raw.images.binding] = omitUndefined({
			type: "images",
			remote: raw.images.remote,
		});
	}
	if (raw.media?.binding) {
		env[raw.media.binding] = omitUndefined({
			type: "media",
			remote: raw.media.remote,
		});
	}
	if (raw.stream?.binding) {
		env[raw.stream.binding] = omitUndefined({
			type: "stream",
			remote: raw.stream.remote,
		});
	}
	if (raw.websearch?.binding) {
		env[raw.websearch.binding] = omitUndefined({
			type: "web-search",
			remote: raw.websearch.remote,
		});
	}
	if (raw.version_metadata?.binding) {
		env[raw.version_metadata.binding] = { type: "version-metadata" };
	}

	for (const b of raw.kv_namespaces ?? []) {
		env[b.binding] = omitUndefined({ type: "kv", id: b.id, remote: b.remote });
	}
	for (const b of raw.d1_databases ?? []) {
		env[b.binding] = omitUndefined({
			type: "d1",
			id: b.database_id,
			name: b.database_name,
			remote: b.remote,
		});
	}
	for (const b of raw.r2_buckets ?? []) {
		env[b.binding] = omitUndefined({
			type: "r2",
			name: b.bucket_name,
			jurisdiction: b.jurisdiction,
			remote: b.remote,
		});
	}
	for (const b of raw.vectorize ?? []) {
		env[b.binding] = omitUndefined({
			type: "vectorize",
			name: b.index_name,
			remote: b.remote,
		});
	}
	for (const b of raw.mtls_certificates ?? []) {
		env[b.binding] = omitUndefined({
			type: "mtls-certificate",
			id: b.certificate_id,
			remote: b.remote,
		});
	}
	for (const b of raw.hyperdrive ?? []) {
		env[b.binding] = omitUndefined({
			type: "hyperdrive",
			id: b.id,
			localConnectionString: b.localConnectionString,
		});
	}
	for (const b of raw.pipelines ?? []) {
		env[b.binding] = omitUndefined({
			type: "pipeline",
			name: b.stream,
			remote: b.remote,
		});
	}
	for (const b of raw.flagship ?? []) {
		env[b.binding] = omitUndefined({
			type: "flagship",
			id: b.app_id,
			remote: b.remote,
		});
	}
	for (const b of raw.ai_search ?? []) {
		env[b.binding] = omitUndefined({
			type: "ai-search",
			name: b.instance_name,
			remote: b.remote,
		});
	}
	for (const b of raw.ai_search_namespaces ?? []) {
		env[b.binding] = omitUndefined({
			type: "ai-search-namespace",
			namespace: b.namespace,
			remote: b.remote,
		});
	}
	for (const b of raw.agent_memory ?? []) {
		env[b.binding] = omitUndefined({
			type: "agent-memory",
			namespace: b.namespace,
			remote: b.remote,
		});
	}
	for (const b of raw.analytics_engine_datasets ?? []) {
		env[b.binding] = omitUndefined({
			type: "analytics-engine-dataset",
			name: b.dataset,
		});
	}
	for (const b of raw.artifacts ?? []) {
		env[b.binding] = omitUndefined({
			type: "artifacts",
			namespace: b.namespace,
			remote: b.remote,
		});
	}
	for (const b of raw.dispatch_namespaces ?? []) {
		const entry: Obj = { type: "dispatch-namespace", namespace: b.namespace };
		if (b.outbound) {
			entry.outbound = omitUndefined({
				workerName: b.outbound.service,
				parameters: b.outbound.parameters,
			});
		}
		set(entry, "remote", b.remote);
		env[b.binding] = entry;
	}
	for (const b of raw.secrets_store_secrets ?? []) {
		env[b.binding] = {
			type: "secrets-store-secret",
			storeId: b.store_id,
			secretName: b.secret_name,
		};
	}
	for (const b of raw.send_email ?? []) {
		env[b.name] = omitUndefined({
			type: "send-email",
			destinationAddress: b.destination_address,
			allowedDestinationAddresses: b.allowed_destination_addresses,
			allowedSenderAddresses: b.allowed_sender_addresses,
			remote: b.remote,
		});
	}
	for (const b of raw.vpc_services ?? []) {
		env[b.binding] = omitUndefined({
			type: "vpc-service",
			id: b.service_id,
			remote: b.remote,
		});
	}
	for (const b of raw.vpc_networks ?? []) {
		if ("tunnel_id" in b && b.tunnel_id !== undefined) {
			env[b.binding] = omitUndefined({
				type: "vpc-network",
				tunnelId: b.tunnel_id,
				remote: b.remote,
			});
		} else if ("network_id" in b && b.network_id !== undefined) {
			env[b.binding] = omitUndefined({
				type: "vpc-network",
				networkId: b.network_id,
				remote: b.remote,
			});
		}
	}
	for (const b of raw.worker_loaders ?? []) {
		env[b.binding] = { type: "worker-loader" };
	}
	for (const b of raw.ratelimits ?? []) {
		env[b.name] = {
			type: "rate-limit",
			namespace: b.namespace_id,
			simple: b.simple,
		};
	}
	for (const b of raw.services ?? []) {
		env[b.binding] = omitUndefined({
			type: "worker",
			workerName: b.service,
			exportName: b.entrypoint,
			props: b.props,
			remote: b.remote,
		});
	}
	for (const b of raw.durable_objects?.bindings ?? []) {
		env[b.name] = omitUndefined({
			type: "durable-object",
			workerName: b.script_name,
			exportName: b.class_name,
		});
	}
	for (const b of raw.queues?.producers ?? []) {
		env[b.binding] = omitUndefined({
			type: "queue",
			name: b.queue,
			deliveryDelay: b.delivery_delay,
			remote: b.remote,
		});
	}
	for (const b of raw.logfwdr?.bindings ?? []) {
		env[b.name] = { type: "logfwdr", destination: b.destination };
	}
	for (const b of raw.unsafe?.bindings ?? []) {
		const { name, type, ...rest } = b as {
			name: string;
			type: string;
			[key: string]: unknown;
		};
		env[name] = omitUndefined({ type: `unsafe:${type}`, ...rest });
	}

	// vars: strings become `text` bindings, everything else `json`.
	for (const [name, value] of Object.entries(raw.vars ?? {})) {
		env[name] =
			typeof value === "string"
				? { type: "text", value }
				: { type: "json", value };
	}
	// Declared required secrets become `secret` bindings.
	for (const name of raw.secrets?.required ?? []) {
		env[name] = { type: "secret" };
	}

	// Assets: runtime fields go on the worker, `directory` is tooling.
	if (raw.assets !== undefined) {
		if (raw.assets.binding) {
			env[raw.assets.binding] = { type: "assets" };
		}
		const runtimeAssets: Obj = {};
		set(runtimeAssets, "htmlHandling", raw.assets.html_handling);
		set(runtimeAssets, "notFoundHandling", raw.assets.not_found_handling);
		set(runtimeAssets, "runWorkerFirst", raw.assets.run_worker_first);
		if (Object.keys(runtimeAssets).length > 0) {
			worker.assets = runtimeAssets;
		}
		set(tooling, "assetsDirectory", raw.assets.directory);
	}

	return env;
}

// ─── exports (durable objects) ────────────────────────────────────────────

/**
 * Derive `exports` (Durable Object classes defined by this Worker) from the
 * `migrations` array. SQLite-backed classes (`new_sqlite_classes`) use
 * `storage: "sqlite"`; the rest (`new_classes`) use `storage: "legacy-kv"`.
 *
 * The migrations are replayed in order so the result is the *current* class
 * set rather than the union of every class ever declared: `renamed_classes`
 * move a class's entry to its new name (preserving storage) and
 * `deleted_classes` drop it. This avoids emitting `exports` for classes that
 * a later migration renamed away or deleted, which would otherwise produce a
 * config that no longer matches the Worker's actual exports.
 *
 * The migration *history* itself (tags, the rename/delete operations) has no
 * representation in the declarative new format; only the resulting class set
 * is preserved.
 */
function convertExports(raw: RawConfig, worker: Obj): void {
	const migrations = raw.migrations;
	if (!migrations || migrations.length === 0) {
		return;
	}
	const exportsObj: Obj = {};
	for (const migration of migrations) {
		for (const className of migration.new_sqlite_classes ?? []) {
			exportsObj[className] = { type: "durable-object", storage: "sqlite" };
		}
		for (const className of migration.new_classes ?? []) {
			exportsObj[className] = { type: "durable-object", storage: "legacy-kv" };
		}
		for (const { from, to } of migration.renamed_classes ?? []) {
			if (from in exportsObj) {
				exportsObj[to] = exportsObj[from];
				delete exportsObj[from];
			}
		}
		for (const className of migration.deleted_classes ?? []) {
			delete exportsObj[className];
		}
	}
	if (Object.keys(exportsObj).length > 0) {
		worker.exports = exportsObj;
	}
}

// ─── triggers + domains ────────────────────────────────────────────────────

function convertTriggersAndDomains(raw: RawConfig, worker: Obj): Obj[] {
	const triggers: Obj[] = [];
	const domains: string[] = [];

	for (const route of raw.routes ?? []) {
		if (typeof route === "string") {
			triggers.push({ type: "fetch", pattern: route });
		} else if ("custom_domain" in route && route.custom_domain) {
			domains.push(route.pattern);
		} else if ("zone_name" in route && route.zone_name !== undefined) {
			triggers.push({
				type: "fetch",
				pattern: route.pattern,
				zone: route.zone_name,
			});
		} else if ("zone_id" in route && route.zone_id !== undefined) {
			triggers.push({
				type: "fetch",
				pattern: route.pattern,
				zone: route.zone_id,
			});
		} else {
			triggers.push({ type: "fetch", pattern: route.pattern });
		}
	}

	for (const cron of raw.triggers?.crons ?? []) {
		triggers.push({ type: "scheduled", schedule: cron });
	}

	for (const c of raw.queues?.consumers ?? []) {
		triggers.push(
			omitUndefined({
				type: "queue",
				name: c.queue,
				deadLetterQueue: c.dead_letter_queue,
				maxBatchSize: c.max_batch_size,
				maxBatchTimeout: c.max_batch_timeout,
				maxConcurrency: c.max_concurrency,
				maxRetries: c.max_retries,
				retryDelay: c.retry_delay,
				visibilityTimeoutMs: c.visibility_timeout_ms,
			})
		);
	}

	if (domains.length > 0) {
		worker.domains = domains;
	}

	return triggers;
}

// ─── tail consumers ────────────────────────────────────────────────────────

function convertTailConsumers(raw: RawConfig, worker: Obj): void {
	const consumers: Obj[] = [];
	for (const c of raw.tail_consumers ?? []) {
		consumers.push({ workerName: c.service, streaming: false });
	}
	for (const c of raw.streaming_tail_consumers ?? []) {
		consumers.push({ workerName: c.service, streaming: true });
	}
	if (consumers.length > 0) {
		worker.tailConsumers = consumers;
	}
}

// ─── tooling (wrangler.config.ts) ──────────────────────────────────────────

function convertTooling(raw: RawConfig, tooling: Obj): void {
	set(tooling, "noBundle", raw.no_bundle);
	set(tooling, "minify", raw.minify);
	set(tooling, "keepNames", raw.keep_names);
	set(tooling, "alias", raw.alias);
	set(tooling, "define", raw.define);
	set(tooling, "findAdditionalModules", raw.find_additional_modules);
	set(tooling, "preserveFileNames", raw.preserve_file_names);
	set(tooling, "baseDir", raw.base_dir);
	set(tooling, "rules", raw.rules);
	set(tooling, "wasmModules", raw.wasm_modules);
	set(tooling, "textBlobs", raw.text_blobs);
	set(tooling, "dataBlobs", raw.data_blobs);
	set(tooling, "tsconfig", raw.tsconfig);
	set(tooling, "jsxFactory", raw.jsx_factory);
	set(tooling, "jsxFragment", raw.jsx_fragment);
	if (raw.python_modules !== undefined) {
		tooling.pythonModules = omitUndefined({
			exclude: raw.python_modules.exclude,
		});
	}
	set(tooling, "uploadSourceMaps", raw.upload_source_maps);
	if (raw.build !== undefined) {
		const build = omitUndefined({
			command: raw.build.command,
			cwd: raw.build.cwd,
			watchDir: raw.build.watch_dir,
		});
		if (Object.keys(build).length > 0) {
			tooling.build = build;
		}
	}
	if (raw.dev !== undefined) {
		const dev = omitUndefined({
			ip: raw.dev.ip,
			port: raw.dev.port,
			inspectorPort: raw.dev.inspector_port,
			inspectorIp: raw.dev.inspector_ip,
			localProtocol: raw.dev.local_protocol,
			upstreamProtocol: raw.dev.upstream_protocol,
			host: raw.dev.host,
			enableContainers: raw.dev.enable_containers,
			containerEngine: raw.dev.container_engine,
		});
		if (Object.keys(dev).length > 0) {
			tooling.dev = dev;
		}
	}
	set(tooling, "sendMetrics", raw.send_metrics);
}
