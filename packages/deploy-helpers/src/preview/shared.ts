import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
	configFileName,
	getDurableObjectExports,
	getWorkersCIBranchName,
	UserError,
} from "@cloudflare/workers-utils";
import { parseConfigPlacement } from "../deploy/helpers/placement";
import { shortHash, truncateWithSuffix } from "../shared/names";
import type { Binding, EnvBindings, PreviewDefaults } from "./api";
import type { Config, PreviewsConfig } from "@cloudflare/workers-utils";

const MAX_CONTAINER_APP_NAME_LENGTH = 253;

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

/**
 * Detects the current commit's full SHA from well-known CI provider
 * environment variables (GitHub Actions, GitLab CI, CircleCI), falling back
 * to a generic `COMMIT_SHA` env var for providers without dedicated support.
 */
export function getCommitSha(): string | undefined {
	return (
		process.env.GITHUB_SHA ||
		process.env.CI_COMMIT_SHA ||
		process.env.CIRCLE_SHA1 ||
		process.env.COMMIT_SHA ||
		undefined
	);
}

/**
 * Normalizes a repository URL into a canonical `https://` form suitable for
 * display and for sending to the API as the `workers/repository_url`
 * annotation.
 *
 * Repository URLs collected from CI env vars or `git config` can arrive in
 * several different shapes depending on the provider and remote protocol,
 * e.g. `git@github.com:org/repo.git` (SCP-like SSH), `ssh://git@host/org/repo`,
 * or `https://user:token@host/org/repo.git` (HTTPS with embedded credentials
 * or a `.git` suffix). This strips embedded credentials, query strings, and
 * hash fragments, drops the `.git` suffix, and converts SSH remotes to their
 * `https://` equivalent, so the same repository always normalizes to the
 * same, safe-to-share URL regardless of how it was originally configured.
 */
function normalizeRepositoryUrl(repositoryUrl: string): string | undefined {
	const trimmed = repositoryUrl.trim();
	if (!trimmed) {
		return undefined;
	}

	const scpLikeSshMatch = trimmed.match(/^git@([^:]+):(.+)$/);
	if (scpLikeSshMatch) {
		const [, host, pathname] = scpLikeSshMatch;
		return `https://${host}/${pathname.replace(/\.git$/, "")}`;
	}

	try {
		const url = new URL(trimmed);
		if (url.protocol === "ssh:" && url.username === "git") {
			return `https://${url.host}${url.pathname.replace(/\.git$/, "")}`;
		}

		if (url.protocol !== "https:" && url.protocol !== "http:") {
			return undefined;
		}

		url.username = "";
		url.password = "";
		url.search = "";
		url.hash = "";
		url.pathname = url.pathname.replace(/\.git$/, "");
		return url.toString().replace(/\/$/, "");
	} catch {
		return undefined;
	}
}

/**
 * Detects the current repository's URL from well-known CI provider
 * environment variables (GitLab CI, CircleCI, Buildkite, Bitbucket, GitHub
 * Actions, and a generic `REPOSITORY_URL` fallback), or from the local git
 * remote when running in CI and no env var matched.
 *
 * The local git remote fallback is intentionally gated behind
 * {@link shouldUseCIMetadataFallback}: unlike the env var checks, it shells
 * out to read the developer's `git config`, so it's only attempted in CI to
 * avoid uploading a local machine's repository details on every
 * `wrangler preview` run outside CI.
 */
export function getRepositoryUrl(): string | undefined {
	const repositoryUrl =
		process.env.CI_PROJECT_URL ||
		process.env.CI_REPOSITORY_URL ||
		process.env.CIRCLE_REPOSITORY_URL ||
		process.env.BUILDKITE_REPO ||
		process.env.BITBUCKET_GIT_HTTP_ORIGIN ||
		process.env.BITBUCKET_GIT_SSH_ORIGIN ||
		process.env.REPOSITORY_URL;
	if (repositoryUrl) {
		return normalizeRepositoryUrl(repositoryUrl);
	}

	if (process.env.GITHUB_REPOSITORY) {
		const githubServerUrl =
			process.env.GITHUB_SERVER_URL || "https://github.com";
		return normalizeRepositoryUrl(
			`${githubServerUrl.replace(/\/$/, "")}/${process.env.GITHUB_REPOSITORY}`
		);
	}

	// Only fall back to the local git remote when running in CI. Unlike the
	// env var checks above (which only match known CI-published values),
	// this shells out to the developer's local git config, so we don't want
	// to do that for local, non-CI `wrangler preview` runs.
	if (!shouldUseCIMetadataFallback()) {
		return undefined;
	}

	try {
		execSync(`git rev-parse --is-inside-work-tree`, { stdio: "ignore" });
		return normalizeRepositoryUrl(
			execSync(`git config --get remote.origin.url`).toString()
		);
	} catch {
		return undefined;
	}
}

/**
 * The pull/merge request number and URL detected from the current CI
 * environment. Either field may be missing depending on what the detected
 * CI provider exposes.
 */
export type PullRequestMetadata = {
	number?: string;
	url?: string;
};

/**
 * Normalizes a pull/merge request number into a trimmed string, so callers
 * don't need to handle the mix of numeric (e.g. a parsed JSON field) and
 * string (e.g. an env var) representations that the various CI providers use.
 */
function normalizePullRequestNumber(number: string | number | undefined) {
	if (number === undefined) {
		return undefined;
	}

	const normalizedNumber = String(number).trim();
	return normalizedNumber ? normalizedNumber : undefined;
}

/**
 * Detects pull request metadata from a GitHub Actions environment.
 *
 * Prefers the `pull_request` event payload at `GITHUB_EVENT_PATH` (available
 * for `pull_request`/`pull_request_target`-triggered workflows), which
 * directly provides the PR number and URL. Falls back to parsing the PR
 * number out of `GITHUB_REF` (formatted `refs/pull/<number>/merge`) and
 * building the URL from `GITHUB_REPOSITORY`/`GITHUB_SERVER_URL`, which covers
 * other trigger types where a `pull_request` payload isn't available.
 */
function getGitHubPullRequestMetadata(): PullRequestMetadata | undefined {
	if (process.env.GITHUB_EVENT_PATH) {
		try {
			const event = JSON.parse(
				readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")
			) as {
				pull_request?: { html_url?: string; number?: number };
			};
			const number = normalizePullRequestNumber(event.pull_request?.number);
			const url = event.pull_request?.html_url
				? normalizeRepositoryUrl(event.pull_request.html_url)
				: undefined;
			if (number || url) {
				return { number, url };
			}
		} catch {
			// Fall back to environment-derived metadata below.
		}
	}

	const refPullRequestNumber =
		process.env.GITHUB_REF?.match(/^refs\/pull\/(\d+)\//)?.[1];
	const number = normalizePullRequestNumber(refPullRequestNumber);
	if (!number || !process.env.GITHUB_REPOSITORY) {
		return undefined;
	}

	const githubServerUrl = process.env.GITHUB_SERVER_URL || "https://github.com";
	return {
		number,
		url: normalizeRepositoryUrl(
			`${githubServerUrl.replace(/\/$/, "")}/${process.env.GITHUB_REPOSITORY}/pull/${number}`
		),
	};
}

/**
 * Detects merge request metadata from a GitLab CI merge request pipeline,
 * using `CI_MERGE_REQUEST_IID` for the number and
 * `CI_MERGE_REQUEST_PROJECT_URL` (or `CI_PROJECT_URL` as a fallback) to build
 * the merge request URL.
 */
function getGitLabPullRequestMetadata(): PullRequestMetadata | undefined {
	const number = normalizePullRequestNumber(process.env.CI_MERGE_REQUEST_IID);
	const projectUrl =
		process.env.CI_MERGE_REQUEST_PROJECT_URL || process.env.CI_PROJECT_URL;
	if (!number || !projectUrl) {
		return undefined;
	}

	const normalizedProjectUrl = projectUrl
		.replace(/\.git$/, "")
		.replace(/\/$/, "");
	return {
		number,
		url: normalizeRepositoryUrl(
			`${normalizedProjectUrl}/-/merge_requests/${number}`
		),
	};
}

/**
 * Detects pull request metadata from generic, provider-agnostic env vars
 * (`PULL_REQUEST_URL`/`PR_URL`/`CHANGE_URL`/`CIRCLE_PULL_REQUEST` for the URL,
 * `PULL_REQUEST_NUMBER`/`PR_NUMBER`/`CHANGE_ID` for the number). These are
 * conventions used by some CI providers and custom pipelines, but aren't
 * officially documented, so this is a lower-confidence, best-effort fallback
 * checked before the provider-specific detectors.
 */
function getDirectPullRequestMetadata(): PullRequestMetadata | undefined {
	const directUrl =
		process.env.PULL_REQUEST_URL ||
		process.env.PR_URL ||
		process.env.CHANGE_URL ||
		process.env.CIRCLE_PULL_REQUEST;
	const number = normalizePullRequestNumber(
		process.env.PULL_REQUEST_NUMBER ||
			process.env.PR_NUMBER ||
			process.env.CHANGE_ID
	);
	const url = directUrl ? normalizeRepositoryUrl(directUrl) : undefined;

	if (number || url) {
		return { number, url };
	}

	return undefined;
}

/**
 * Detects the pull/merge request associated with the current CI run, trying
 * each supported source in order: direct/generic env vars, GitHub Actions,
 * then GitLab CI. This is best effort — if none of the sources match (e.g.
 * an unsupported CI provider, or running locally), the deployment proceeds
 * without pull request metadata.
 */
export function getPullRequestMetadata(): PullRequestMetadata | undefined {
	return (
		getDirectPullRequestMetadata() ??
		getGitHubPullRequestMetadata() ??
		getGitLabPullRequestMetadata()
	);
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
			)} file, or pass it with --worker-name <worker-name>.`,
			{ telemetryMessage: "preview command missing worker name" }
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
		case "json":
			return JSON.stringify(binding.json);
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
			return String(binding.stream ?? binding.pipeline ?? "");
		case "secrets_store_secret":
			return binding.secret_name
				? `${binding.store_id}/${binding.secret_name}`
				: String(binding.store_id ?? "");
		case "artifacts":
			return String(binding.namespace ?? "");
		case "flagship":
			return String(binding.app_id ?? "");
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
		// Non-string vars (arrays/objects/numbers/booleans) need the `json`
		// binding type so the Workers runtime parses them back into native JS
		// values. Coercing them to plain_text via JSON.stringify makes
		// `env[name]` a literal string at runtime, breaking any caller that
		// expects the shape declared in wrangler.jsonc — `wrangler deploy`
		// preserves the native shape via the `json` binding (see
		// `deployment-bundle/create-worker-upload-form.ts`), so previews
		// should match.
		env[name] =
			typeof value === "string"
				? { type: "plain_text", text: value }
				: { type: "json", json: value };
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
		// `cross_account_grant` is internal/non-public-facing, so we access it
		// through the runtime shape instead of the public type.
		const crossAccountGrant = (service as { cross_account_grant?: string })
			.cross_account_grant;
		env[service.binding] = {
			type: "service",
			service: service.service,
			entrypoint: service.entrypoint,
			...(crossAccountGrant !== undefined && {
				cross_account_grant: crossAccountGrant,
			}),
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

	// eslint-disable-next-line @typescript-eslint/no-deprecated -- kept for backward compatibility, forwards deprecated `pipeline` field alongside `stream`
	for (const { binding, stream, pipeline } of previews?.pipelines ?? []) {
		env[binding] = {
			type: "pipelines",
			...(stream && { stream }),
			...(pipeline && { pipeline }),
		};
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

	for (const flagship of previews?.flagship ?? []) {
		env[flagship.binding] = {
			type: "flagship",
			app_id: flagship.app_id,
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

	if (config.assets?.binding) {
		env[config.assets.binding] = { type: "assets" };
	}

	for (const binding of previews?.unsafe?.bindings ?? []) {
		const { name, type, ...rest } = binding;
		env[name] = { type, ...rest } as Binding;
	}

	return env;
}

/**
 * Returns the DO `class_name`s this script declares, through `migrations` or
 * through `exports`, resolving them in the same order as wrangler's own
 * `getDurableObjectClassNameToUseSQLiteMap`. Only the resulting names are
 * needed here; that helper stays the authority on whether the migration
 * sequence is valid, and it runs on this config immediately afterwards.
 */
function getDeclaredDOClassNames(config: Config): Set<string> {
	const declared = new Set<string>();

	for (const migration of config.migrations ?? []) {
		for (const className of migration.deleted_classes ?? []) {
			declared.delete(className);
		}
		for (const { from, to } of migration.renamed_classes ?? []) {
			declared.delete(from);
			declared.add(to);
		}
		for (const className of migration.new_classes ?? []) {
			declared.add(className);
		}
		for (const className of migration.new_sqlite_classes ?? []) {
			declared.add(className);
		}
	}

	// A `deleted`, `renamed`, or `transferred` export no longer names a class
	// this script implements.
	for (const [className, entry] of Object.entries(
		getDurableObjectExports(config.exports)
	)) {
		if (
			entry.state === undefined ||
			entry.state === "created" ||
			entry.state === "expecting-transfer"
		) {
			declared.add(className);
		}
	}

	return declared;
}

/**
 * Returns the DO `class_name`s whose containers this preview owns: the classes
 * the script declares through `migrations` or `exports`, plus the classes bound
 * in the preview without a `script_name`.
 *
 * A binding is not required. A Durable Object reached only through
 * `ctx.exports` is still implemented by this script, so its container belongs
 * to this preview. A class reachable only through a `script_name` binding is
 * implemented by another Worker, which owns its own container application.
 */
export function getPreviewOwnedContainerClassNames(
	config: Config,
	previews: PreviewsConfig | undefined
): Set<string> {
	const owned = getDeclaredDOClassNames(config);
	for (const binding of previews?.durable_objects?.bindings ?? []) {
		if (binding.script_name === undefined) {
			owned.add(binding.class_name);
		}
	}
	return owned;
}

/**
 * Compose the auto-generated container application name for a preview-scoped
 * container, in the form `{parentWorkerName}_{previewSlug}_{className}`.
 *
 * A container application name is capped at 253 characters and may not start
 * or end with a dash, contain consecutive dashes, or start with a digit. A
 * worker name is allowed all four, and the preview slug is derived from a
 * branch name, so the composed name is normalised here rather than passed
 * through.
 *
 * Wrangler looks an application up by name to choose between create and
 * modify, so a name must identify one preview container. Both normalising and
 * truncating can map two inputs onto one output, so either one earns a digest
 * of the composed name.
 */
export function previewContainerAppName(
	parentWorkerName: string,
	previewSlug: string,
	className: string
): string {
	const composed = `${parentWorkerName}_${previewSlug}_${className}`;
	const normalised = composed
		.replace(/[^A-Za-z0-9_-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "")
		// Prefix a letter rather than reject a name the Workers API accepted.
		.replace(/^(?=[0-9])/, "w");

	if (
		normalised === composed &&
		normalised.length <= MAX_CONTAINER_APP_NAME_LENGTH
	) {
		return normalised;
	}

	return truncateWithSuffix(
		normalised,
		`_${shortHash(composed)}`,
		MAX_CONTAINER_APP_NAME_LENGTH
	);
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

	if (previews?.cache !== undefined || config.cache !== undefined) {
		previewDefaults.cache = previews?.cache ?? config.cache;
	}

	if (config.placement) {
		previewDefaults.placement = parseConfigPlacement(config);
	}

	return previewDefaults;
}
