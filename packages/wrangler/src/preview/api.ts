import { fetchResult } from "../cfetch";
import type {
	CfWorkerInit,
	Config,
	CfPlacement,
	CfUserLimits,
	Observability,
} from "@cloudflare/workers-utils";

export interface Binding {
	type: string;
	text?: string;
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
	store_id?: string;
	secret_name?: string;
	simple?: {
		limit: number;
		period: 10 | 60;
	};
	service_id?: string;
	staging?: boolean;
	enable_timer?: boolean;
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
		"workers/message"?: string;
		"workers/tag"?: string;
	};
	migrations?: CfWorkerInit["migrations"];
	limits?: CfUserLimits;
	placement?: CfPlacement;
	env?: EnvBindings;
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
	ignoreDefaults?: boolean;
};

export type PreviewDefaults = {
	observability?: Observability;
	logpush?: boolean;
	limits?: CfUserLimits;
	placement?: CfPlacement;
	tail_consumers?: Array<{ name: string }>;
	env?: EnvBindings;
};

export type PreviewDefaultsPatch = Partial<Omit<PreviewDefaults, "env">> & {
	env?: Record<string, Binding | null>;
};

type WorkerPreviewDefaultsResource = {
	preview_defaults?: PreviewDefaults;
};

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
	const queryParams = options?.ignoreDefaults
		? new URLSearchParams({ ignore_defaults: "true" })
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
	request: UpdatePreviewRequestParams,
	options?: PreviewRequestOptions
): Promise<PreviewResource> {
	const queryParams = options?.ignoreDefaults
		? new URLSearchParams({ ignore_defaults: "true" })
		: undefined;

	return fetchResult<PreviewResource>(
		config,
		`/accounts/${accountId}/workers/workers/${workerName}/previews/${encodeURIComponent(
			previewIdentifier
		)}`,
		{
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(request),
		},
		queryParams
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
	deploymentIdentifier: string
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
	request: Partial<CreatePreviewDeploymentRequestParams>,
	options?: PreviewRequestOptions
): Promise<DeploymentResource> {
	const queryParams = options?.ignoreDefaults
		? new URLSearchParams({ ignore_defaults: "true" })
		: undefined;

	return fetchResult<DeploymentResource>(
		config,
		`/accounts/${accountId}/workers/workers/${workerName}/previews/${encodeURIComponent(
			previewIdentifier
		)}/deployments`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(request),
		},
		queryParams
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
