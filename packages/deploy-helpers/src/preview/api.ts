import { fetchResult } from "../shared/context";
import type {
	CfWorkerInit,
	CacheOptions,
	CfPlacement,
	CfUserLimits,
	Config,
	Observability,
} from "@cloudflare/workers-utils";

export interface Binding {
	type: string;
	text?: string;
	json?: unknown;
	namespace_id?: string;
	workflow_name?: string;
	destination_address?: string;
	allowed_destination_addresses?: string[];
	allowed_sender_addresses?: string[];
	queue_name?: string;
	delivery_delay?: number;
	database_id?: string;
	database_name?: string;
	bucket_name?: string;
	index_name?: string;
	id?: string;
	service?: string;
	dataset?: string;
	namespace?: string;
	outbound?: {
		worker: {
			service: string;
			environment?: string;
		};
		params?: Array<{ name: string }>;
	};
	certificate_id?: string;
	pipeline?: string;
	stream?: string;
	store_id?: string;
	secret_name?: string;
	simple?: {
		limit: number;
		period: 10 | 60;
	};
	service_id?: string;
	staging?: boolean;
	enable_timer?: boolean;
	app_id?: string;
	entrypoint?: string;
	class_name?: string;
	script_name?: string;
}

export type EnvBindings = Record<string, Binding>;

export interface PreviewResource {
	id: string;
	name: string;
	slug: string;
	urls?: string[];
	worker_name: string;
	tags?: string[];
	observability?: Observability;
	logpush?: boolean;
	tail_consumers?: Array<{ name: string }>;
	created_on: string;
	updated_on: string;
}

export interface DeploymentResource {
	id: string;
	preview_id: string;
	preview_name: string;
	migration_tag?: string;
	urls?: string[];
	compatibility_date?: string;
	compatibility_flags?: string[];
	limits?: CfUserLimits;
	placement?: CfPlacement;
	cache?: CacheOptions;
	annotations?: {
		"workers/commit_sha"?: string;
		"workers/message"?: string;
		"workers/pull_request_number"?: string;
		"workers/pull_request_url"?: string;
		"workers/repository_url"?: string;
		"workers/tag"?: string;
	};
	env?: EnvBindings;
	created_on: string;
}

export type CreatePreviewDeploymentRequestParams = {
	main_module?: string;
	modules?: Array<{
		name: string;
		content_type: string;
		content_base64: string;
	}>;
	assets?: {
		jwt: string;
		config: {
			html_handling?: string;
			not_found_handling?: string;
			run_worker_first?: string[] | boolean;
		};
	};
	compatibility_date?: string;
	compatibility_flags?: string[];
	annotations?: {
		"workers/commit_sha"?: string;
		"workers/message"?: string;
		"workers/pull_request_number"?: string;
		"workers/pull_request_url"?: string;
		"workers/repository_url"?: string;
		"workers/tag"?: string;
	};
	migrations?: CfWorkerInit["migrations"];
	limits?: CfUserLimits;
	placement?: CfPlacement;
	cache?: CacheOptions;
	env?: EnvBindings;
	containers?: Array<{ class_name: string }>;
};

export type CreatePreviewRequestParams = {
	name: string;
	observability?: Observability;
	logpush?: boolean;
	tail_consumers?: Array<{ name: string }>;
};

export type UpdatePreviewRequestParams = Omit<
	CreatePreviewRequestParams,
	"name"
>;

export type PreviewRequestOptions = {
	ignoreBaseConfig?: boolean;
};

export type PreviewDefaults = {
	observability?: Observability;
	logpush?: boolean;
	limits?: CfUserLimits;
	placement?: CfPlacement;
	cache?: CacheOptions;
	tail_consumers?: Array<{ name: string }>;
	env?: EnvBindings;
};

export type PreviewDefaultsPatch = Partial<Omit<PreviewDefaults, "env">> & {
	env?: Record<string, Binding | null>;
};

type WorkerPreviewDefaultsResource = {
	preview_defaults?: PreviewDefaults;
};

export type PreviewBaseConfig = {
	observability?: Observability;
	logpush?: boolean;
	limits?: CfUserLimits;
	placement?: CfPlacement;
	cache?: CacheOptions;
	tail_consumers?: Array<{ name: string }>;
	env?: EnvBindings;
};

export type PreviewBaseConfigPatch = Partial<Omit<PreviewBaseConfig, "env">> & {
	env?: Record<string, Binding | null>;
};

type WorkerPreviewBaseConfigResource = {
	previews_base_config?: PreviewBaseConfig;
};

/** Create an undeployed Worker that can own Preview resources. */
export async function createPreviewParentWorker(
	config: Config,
	accountId: string,
	workerName: string,
	workersDevEnabled: boolean,
	previewsEnabled: boolean
): Promise<void> {
	await fetchResult(config, `/accounts/${accountId}/workers/workers`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			name: workerName,
			subdomain: {
				enabled: workersDevEnabled,
				previews_enabled: previewsEnabled,
			},
		}),
	});
}

export async function getPreview(
	config: Config,
	accountId: string,
	workerName: string,
	previewIdentifier: string
): Promise<PreviewResource> {
	return fetchResult<PreviewResource>(
		config,
		`/accounts/${accountId}/workers/workers/${workerName}/previews/${encodeURIComponent(
			previewIdentifier
		)}`
	);
}

export async function createPreview(
	config: Config,
	accountId: string,
	workerName: string,
	request: CreatePreviewRequestParams,
	options?: PreviewRequestOptions
): Promise<PreviewResource> {
	const queryParams = options?.ignoreBaseConfig
		? new URLSearchParams({ ignore_base_config: "true" })
		: undefined;

	return fetchResult<PreviewResource>(
		config,
		`/accounts/${accountId}/workers/workers/${workerName}/previews`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(request),
		},
		queryParams
	);
}

export async function editPreview(
	config: Config,
	accountId: string,
	workerName: string,
	previewIdentifier: string,
	request: UpdatePreviewRequestParams
): Promise<PreviewResource> {
	return fetchResult<PreviewResource>(
		config,
		`/accounts/${accountId}/workers/workers/${workerName}/previews/${encodeURIComponent(
			previewIdentifier
		)}`,
		{
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(request),
		}
	);
}

export async function deletePreview(
	config: Config,
	accountId: string,
	workerName: string,
	previewIdentifier: string
): Promise<void> {
	await fetchResult(
		config,
		`/accounts/${accountId}/workers/workers/${workerName}/previews/${encodeURIComponent(
			previewIdentifier
		)}`,
		{
			method: "DELETE",
		}
	);
}

export async function getPreviewDeployment(
	config: Config,
	accountId: string,
	workerName: string,
	previewIdentifier: string,
	deploymentIdentifier = "latest"
): Promise<DeploymentResource> {
	return fetchResult<DeploymentResource>(
		config,
		`/accounts/${accountId}/workers/workers/${workerName}/previews/${encodeURIComponent(
			previewIdentifier
		)}/deployments/${encodeURIComponent(deploymentIdentifier)}`
	);
}

export async function createPreviewDeployment(
	config: Config,
	accountId: string,
	workerName: string,
	previewIdentifier: string,
	request: Partial<CreatePreviewDeploymentRequestParams>
): Promise<DeploymentResource> {
	return fetchResult<DeploymentResource>(
		config,
		`/accounts/${accountId}/workers/workers/${workerName}/previews/${encodeURIComponent(
			previewIdentifier
		)}/deployments`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(request),
		}
	);
}

export async function patchPreviewDeployment(
	config: Config,
	accountId: string,
	workerName: string,
	previewIdentifier: string,
	env: Record<string, Binding | null>,
	annotations?: {
		"workers/message"?: string;
		"workers/tag"?: string;
	},
	deploymentIdentifier = "latest"
): Promise<DeploymentResource> {
	return fetchResult<DeploymentResource>(
		config,
		`/accounts/${accountId}/workers/workers/${workerName}/previews/${encodeURIComponent(
			previewIdentifier
		)}/deployments/${encodeURIComponent(deploymentIdentifier)}`,
		{
			method: "PATCH",
			headers: { "Content-Type": "application/merge-patch+json" },
			body: JSON.stringify({ env, annotations }),
		}
	);
}

export async function getWorkerPreviewDefaults(
	config: Config,
	accountId: string,
	workerName: string
): Promise<PreviewDefaults> {
	const worker = await fetchResult<WorkerPreviewDefaultsResource>(
		config,
		`/accounts/${accountId}/workers/workers/${workerName}`
	);
	return worker.preview_defaults ?? {};
}

export async function editWorkerPreviewDefaults(
	config: Config,
	accountId: string,
	workerName: string,
	previewDefaults: PreviewDefaultsPatch
): Promise<PreviewDefaults> {
	const worker = await fetchResult<WorkerPreviewDefaultsResource>(
		config,
		`/accounts/${accountId}/workers/workers/${workerName}`,
		{
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ preview_defaults: previewDefaults }),
		}
	);

	return worker.preview_defaults ?? {};
}

export async function getPreviewBaseConfig(
	config: Config,
	accountId: string,
	workerName: string
): Promise<PreviewBaseConfig> {
	const worker = await fetchResult<WorkerPreviewBaseConfigResource>(
		config,
		`/accounts/${accountId}/workers/workers/${workerName}`
	);
	return worker.previews_base_config ?? {};
}

export async function patchPreviewBaseConfig(
	config: Config,
	accountId: string,
	workerName: string,
	previewBaseConfig: PreviewBaseConfigPatch
): Promise<PreviewBaseConfig> {
	const worker = await fetchResult<WorkerPreviewBaseConfigResource>(
		config,
		`/accounts/${accountId}/workers/workers/${workerName}`,
		{
			method: "PATCH",
			headers: { "Content-Type": "application/merge-patch+json" },
			body: JSON.stringify({ previews_base_config: previewBaseConfig }),
		}
	);

	return worker.previews_base_config ?? {};
}
