import { execSync } from "node:child_process";
import {
	configFileName,
	getWorkersCIBranchName,
	UserError,
} from "@cloudflare/workers-utils";
import { parseConfigPlacement } from "../utils/placement";
import type { Binding, EnvBindings, PreviewDefaults } from "./api";
import type { Config, PreviewsConfig } from "@cloudflare/workers-utils";

export function getBranchName(): string | undefined {
	const workersCIBranch = getWorkersCIBranchName();
	if (workersCIBranch) {
		return workersCIBranch;
	}

	const githubBranch =
		process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME;
	if (githubBranch) {
		return githubBranch;
	}

	const gitlabBranch = process.env.CI_COMMIT_REF_NAME;
	if (gitlabBranch) {
		return gitlabBranch;
	}

	try {
		execSync(`git rev-parse --is-inside-work-tree`, { stdio: "ignore" });
		return execSync(`git rev-parse --abbrev-ref HEAD`).toString().trim();
	} catch {
		return undefined;
	}
}

export function shouldUseCIMetadataFallback(): boolean {
	return process.env.CI === "1" || process.env.CI === "true";
}

export function getHeadCommitRef(): string | undefined {
	try {
		execSync(`git rev-parse --is-inside-work-tree`, { stdio: "ignore" });
		return execSync(`git rev-parse --short HEAD`).toString().trim();
	} catch {
		return undefined;
	}
}

export function getHeadCommitMessage(): string | undefined {
	try {
		execSync(`git rev-parse --is-inside-work-tree`, { stdio: "ignore" });
		return execSync(`git log -1 --format=%B`).toString().trim();
	} catch {
		return undefined;
	}
}

export function resolveWorkerName(
	args: { workerName?: string; "worker-name"?: string },
	config: Config
): string {
	const workerName = args.workerName ?? args["worker-name"] ?? config.name;
	if (!workerName) {
		throw new UserError(
			`Required Worker name missing. Please specify the Worker name in your ${configFileName(
				config.configPath
			)} file, or pass it with --worker-name <worker-name>.`
		);
	}

	return workerName;
}

/**
 * Get a human-readable display value for a binding.
 * Used by both preview deployment and Previews settings formatting.
 */
export function getBindingValue(binding: Binding): string {
	switch (binding.type) {
		case "plain_text":
			return `"${binding.text}"`;
		case "secret_text":
			return "********";
		case "kv_namespace":
			return String(binding.namespace_id ?? "");
		case "d1":
			return binding.database_name ?? String(binding.database_id ?? "");
		case "r2_bucket":
			return String(binding.bucket_name ?? "");
		case "service":
			return binding.entrypoint
				? `${binding.service}#${binding.entrypoint}`
				: String(binding.service ?? "");
		case "durable_object_namespace":
			return binding.script_name
				? `${binding.class_name} (${binding.script_name})`
				: String(binding.class_name ?? "");
		case "workflow":
			return binding.workflow_name ?? String(binding.class_name ?? "");
		case "queue":
			return String(binding.queue_name ?? "");
		case "vectorize":
			return String(binding.index_name ?? "");
		case "hyperdrive":
			return String(binding.id ?? "");
		case "analytics_engine":
			return String(binding.dataset ?? "");
		case "dispatch_namespace":
			return String(binding.namespace ?? "");
		case "mtls_certificate":
			return String(binding.certificate_id ?? "");
		case "pipelines":
			return String(binding.pipeline ?? "");
		case "secrets_store_secret":
			return binding.secret_name
				? `${binding.store_id}/${binding.secret_name}`
				: String(binding.store_id ?? "");
		case "artifacts":
			return String(binding.namespace ?? "");
		case "ratelimit":
			return String(binding.namespace_id ?? "");
		case "vpc_service":
			return String(binding.service_id ?? "");
		case "send_email":
			return String(binding.destination_address ?? "");
		default:
			return "";
	}
}

export function extractConfigBindings(config: Config): EnvBindings {
	const previews = config.previews as PreviewsConfig | undefined;
	const env: EnvBindings = {};

	const vars = previews?.vars ?? {};
	for (const [name, value] of Object.entries(vars)) {
		env[name] = {
			type: "plain_text",
			text: typeof value === "string" ? value : JSON.stringify(value),
		};
	}

	for (const kv of previews?.kv_namespaces ?? []) {
		env[kv.binding] = { type: "kv_namespace", namespace_id: kv.id };
	}

	for (const d1 of previews?.d1_databases ?? []) {
		env[d1.binding] = {
			type: "d1",
			database_id: d1.database_id,
			database_name: d1.database_name,
		};
	}

	for (const r2 of previews?.r2_buckets ?? []) {
		env[r2.binding] = { type: "r2_bucket", bucket_name: r2.bucket_name };
	}

	for (const service of previews?.services ?? []) {
		env[service.binding] = {
			type: "service",
			service: service.service,
			entrypoint: service.entrypoint,
		};
	}

	for (const doBinding of previews?.durable_objects?.bindings ?? []) {
		env[doBinding.name] = {
			type: "durable_object_namespace",
			class_name: doBinding.class_name,
			script_name: doBinding.script_name,
		};
	}

	for (const workflow of previews?.workflows ?? []) {
		env[workflow.binding] = {
			type: "workflow",
			workflow_name: workflow.name,
			class_name: workflow.class_name,
			script_name: workflow.script_name,
		};
	}

	for (const email of previews?.send_email ?? []) {
		env[email.name] = {
			type: "send_email",
			destination_address: email.destination_address,
			allowed_destination_addresses: email.allowed_destination_addresses,
			allowed_sender_addresses: email.allowed_sender_addresses,
		};
	}

	for (const queue of previews?.queues?.producers ?? []) {
		env[queue.binding] = {
			type: "queue",
			queue_name: queue.queue,
			delivery_delay: queue.delivery_delay,
		};
	}

	for (const vectorize of previews?.vectorize ?? []) {
		env[vectorize.binding] = {
			type: "vectorize",
			index_name: vectorize.index_name,
		};
	}

	for (const hyperdrive of previews?.hyperdrive ?? []) {
		env[hyperdrive.binding] = { type: "hyperdrive", id: hyperdrive.id };
	}

	for (const dataset of previews?.analytics_engine_datasets ?? []) {
		env[dataset.binding] = {
			type: "analytics_engine",
			dataset: dataset.dataset,
		};
	}

	for (const dispatch of previews?.dispatch_namespaces ?? []) {
		env[dispatch.binding] = {
			type: "dispatch_namespace",
			namespace: dispatch.namespace,
			...(dispatch.outbound && {
				outbound: {
					worker: {
						service: dispatch.outbound.service,
						environment: dispatch.outbound.environment,
					},
					params: dispatch.outbound.parameters?.map((parameter) => ({
						name: parameter,
					})),
				},
			}),
		};
	}

	for (const certificate of previews?.mtls_certificates ?? []) {
		env[certificate.binding] = {
			type: "mtls_certificate",
			certificate_id: certificate.certificate_id,
		};
	}

	for (const pipeline of previews?.pipelines ?? []) {
		env[pipeline.binding] = { type: "pipelines", pipeline: pipeline.pipeline };
	}

	for (const secret of previews?.secrets_store_secrets ?? []) {
		env[secret.binding] = {
			type: "secrets_store_secret",
			store_id: secret.store_id,
			secret_name: secret.secret_name,
		};
	}

	for (const artifact of previews?.artifacts ?? []) {
		env[artifact.binding] = {
			type: "artifacts",
			namespace: artifact.namespace,
		};
	}

	for (const ratelimit of previews?.ratelimits ?? []) {
		env[ratelimit.name] = {
			type: "ratelimit",
			namespace_id: ratelimit.namespace_id,
			simple: ratelimit.simple,
		};
	}

	for (const loader of previews?.worker_loaders ?? []) {
		env[loader.binding] = { type: "worker_loader" };
	}

	for (const vpc of previews?.vpc_services ?? []) {
		env[vpc.binding] = { type: "vpc_service", service_id: vpc.service_id };
	}

	if (previews?.browser) {
		env[previews.browser.binding] = { type: "browser" };
	}

	if (previews?.ai) {
		env[previews.ai.binding] = { type: "ai", staging: previews.ai.staging };
	}

	if (previews?.images) {
		env[previews.images.binding] = { type: "images" };
	}

	if (previews?.stream) {
		env[previews.stream.binding] = { type: "stream" };
	}

	if (previews?.media) {
		env[previews.media.binding] = { type: "media" };
	}

	if (previews?.version_metadata) {
		env[previews.version_metadata.binding] = { type: "version_metadata" };
	}

	return env;
}

export function assemblePreviewScriptSettings(config: Config) {
	const previews = config.previews;
	const result: Record<string, unknown> = {};

	const observability = previews?.observability ?? config.observability;
	if (observability !== undefined) {
		result.observability = observability;
	}

	const logpush = previews?.logpush ?? config.logpush;
	if (logpush !== undefined) {
		result.logpush = logpush;
	}

	if (previews?.tail_consumers !== undefined) {
		result.tail_consumers = previews.tail_consumers.map((tc) => ({
			name: tc.service,
		}));
	}

	return result;
}

export function assemblePreviewDefaults(config: Config): PreviewDefaults {
	const previews = config.previews as PreviewsConfig | undefined;
	const previewDefaults: PreviewDefaults = {
		...assemblePreviewScriptSettings(config),
	};

	const previewEnv = extractConfigBindings(config);
	if (Object.keys(previewEnv).length > 0) {
		previewDefaults.env = previewEnv;
	}

	if (previews?.limits || config.limits) {
		previewDefaults.limits = previews?.limits ?? config.limits;
	}

	if (config.placement) {
		previewDefaults.placement = parseConfigPlacement(config);
	}

	return previewDefaults;
}
