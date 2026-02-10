import { assertNever } from "./assert-never";
import type { RawConfig } from "./config";
import type { WorkerMetadataBinding } from "./types";

/**
 * Maps a set of bindings defined as worker metadata bindings (straight from the Cloudflare API) to bindings defined in the local format.
 *
 * @param bindings The set of worker metadata bindings to convert
 * @param accountId The ID of the account
 * @param complianceConfig The compliance region configuration
 * @returns A RawConfig object with its bindings populated based on the provided bindings
 */
export function mapWorkerMetadataBindings(
	bindings: WorkerMetadataBinding[]
): RawConfig {
	return (
		bindings
			.filter((binding) => (binding.type as string) !== "secret_text")
			// Combine the same types into {[type]: [binding]}
			.reduce((configObj, binding) => {
				// Some types have different names in wrangler.toml
				// I want the type safety of the binding being destructured after the case narrowing the union but type is unused

				switch (binding.type) {
					case "plain_text":
						{
							configObj.vars = {
								...(configObj.vars ?? {}),
								[binding.name]: binding.text,
							};
						}
						break;
					case "json":
						{
							configObj.vars = {
								...(configObj.vars ?? {}),
								name: binding.name,
								json: binding.json,
							};
						}
						break;
					case "kv_namespace":
						{
							configObj.kv_namespaces = [
								...(configObj.kv_namespaces ?? []),
								{ id: binding.namespace_id, binding: binding.name },
							];
						}
						break;
					case "durable_object_namespace":
						{
							configObj.durable_objects = {
								bindings: [
									...(configObj.durable_objects?.bindings ?? []),
									{
										name: binding.name,
										class_name: binding.class_name,
										script_name: binding.script_name,
										environment: binding.environment,
									},
								],
							};
						}
						break;
					case "d1":
						{
							configObj.d1_databases = [
								...(configObj.d1_databases ?? []),
								{
									binding: binding.name,
									database_id: binding.id,
								},
							];
						}
						break;
					case "browser":
						{
							configObj.browser = {
								binding: binding.name,
							};
						}
						break;
					case "ai":
						{
							configObj.ai = {
								binding: binding.name,
							};
						}
						break;
					case "images":
						{
							configObj.images = {
								binding: binding.name,
							};
						}
						break;
					case "media":
						{
							configObj.media = {
								binding: binding.name,
							};
						}
						break;
					case "r2_bucket":
						{
							configObj.r2_buckets = [
								...(configObj.r2_buckets ?? []),
								{
									binding: binding.name,
									bucket_name: binding.bucket_name,
									jurisdiction: binding.jurisdiction,
								},
							];
						}
						break;
					case "secrets_store_secret":
						{
							configObj.secrets_store_secrets = [
								...(configObj.secrets_store_secrets ?? []),
								{
									binding: binding.name,
									store_id: binding.store_id,
									secret_name: binding.secret_name,
								},
							];
						}
						break;
					case "unsafe_hello_world": {
						configObj.unsafe_hello_world = [
							...(configObj.unsafe_hello_world ?? []),
							{
								binding: binding.name,
								enable_timer: binding.enable_timer,
							},
						];
						break;
					}
					case "service":
						{
							configObj.services = [
								...(configObj.services ?? []),
								{
									binding: binding.name,
									service: binding.service,
									environment: binding.environment,
									entrypoint: binding.entrypoint,
								},
							];
						}
						break;
					case "analytics_engine":
						{
							configObj.analytics_engine_datasets = [
								...(configObj.analytics_engine_datasets ?? []),
								{ binding: binding.name, dataset: binding.dataset },
							];
						}
						break;
					case "dispatch_namespace":
						{
							configObj.dispatch_namespaces = [
								...(configObj.dispatch_namespaces ?? []),
								{
									binding: binding.name,
									namespace: binding.namespace,
									...(binding.outbound && {
										outbound: {
											service: binding.outbound.worker.service,
											environment: binding.outbound.worker.environment,
											parameters:
												binding.outbound.params?.map((p) => p.name) ?? [],
										},
									}),
								},
							];
						}
						break;
					case "logfwdr":
						{
							configObj.logfwdr = {
								bindings: [
									...(configObj.logfwdr?.bindings ?? []),
									{ name: binding.name, destination: binding.destination },
								],
							};
						}
						break;
					case "wasm_module":
						{
							configObj.wasm_modules = {
								...(configObj.wasm_modules ?? {}),
								[binding.name]: binding.part,
							};
						}
						break;
					case "text_blob":
						{
							configObj.text_blobs = {
								...(configObj.text_blobs ?? {}),
								[binding.name]: binding.part,
							};
						}
						break;
					case "data_blob":
						{
							configObj.data_blobs = {
								...(configObj.data_blobs ?? {}),
								[binding.name]: binding.part,
							};
						}
						break;
					case "secret_text":
						// Ignore secrets
						break;
					case "version_metadata": {
						{
							configObj.version_metadata = {
								binding: binding.name,
							};
						}
						break;
					}
					case "send_email": {
						configObj.send_email = [
							...(configObj.send_email ?? []),
							{
								name: binding.name,
								destination_address: binding.destination_address,
								allowed_destination_addresses:
									binding.allowed_destination_addresses,
								allowed_sender_addresses: binding.allowed_sender_addresses,
							},
						];
						break;
					}
					case "queue":
						configObj.queues ??= { producers: [] };
						configObj.queues.producers = [
							...(configObj.queues.producers ?? []),
							{
								binding: binding.name,
								queue: binding.queue_name,
								delivery_delay: binding.delivery_delay,
							},
						];
						break;
					case "vectorize":
						configObj.vectorize = [
							...(configObj.vectorize ?? []),
							{
								binding: binding.name,
								index_name: binding.index_name,
							},
						];
						break;
					case "hyperdrive":
						configObj.hyperdrive = [
							...(configObj.hyperdrive ?? []),
							{
								binding: binding.name,
								id: binding.id,
							},
						];
						break;
					case "mtls_certificate":
						configObj.mtls_certificates = [
							...(configObj.mtls_certificates ?? []),
							{
								binding: binding.name,
								certificate_id: binding.certificate_id,
							},
						];
						break;
					case "pipelines":
						configObj.pipelines = [
							...(configObj.pipelines ?? []),
							{
								binding: binding.name,
								pipeline: binding.pipeline,
							},
						];
						break;
					case "assets":
						configObj.assets = {
							binding: binding.name,
							// Note: we currently don't get all the assets information from the
							//      API, so here we are only able to set the name of the binding
							//      hopefully in the future we can properly fully support the binding
						};
						break;
					case "inherit":
						configObj.unsafe = {
							bindings: [...(configObj.unsafe?.bindings ?? []), binding],
							metadata: configObj.unsafe?.metadata ?? undefined,
						};
						break;
					case "workflow":
						{
							configObj.workflows = [
								...(configObj.workflows ?? []),
								{
									binding: binding.name,
									name: binding.workflow_name,
									class_name: binding.class_name,
									script_name: binding.script_name,
								},
							];
						}
						break;
					case "worker_loader":
						{
							configObj.worker_loaders = [
								...(configObj.worker_loaders ?? []),
								{
									binding: binding.name,
								},
							];
						}
						break;
					case "ratelimit":
						{
							configObj.ratelimits = [
								...(configObj.ratelimits ?? []),
								{
									name: binding.name,
									namespace_id: binding.namespace_id,
									simple: {
										limit: binding.simple.limit,
										period: binding.simple.period,
									},
								},
							];
						}
						break;
					case "vpc_service":
						{
							configObj.vpc_services = [
								...(configObj.vpc_services ?? []),
								{
									binding: binding.name,
									service_id: binding.service_id,
								},
							];
						}
						break;
					default: {
						configObj.unsafe = {
							bindings: [...(configObj.unsafe?.bindings ?? []), binding],
							metadata: configObj.unsafe?.metadata ?? undefined,
						};
						assertNever(binding);
					}
				}

				return configObj;
			}, {} as RawConfig)
	);
}
