import { FatalError, UserError } from "@cloudflare/workers-utils";
import { fetchResult } from "../../cfetch";
import { performApiFetch } from "../../cfetch/internal";
import { createNamespace } from "../../core/create-command";
import {
	createWorkerUploadForm,
	fromMimeType,
} from "../../deployment-bundle/create-worker-upload-form";
import { getMetricsUsageHeaders } from "../../metrics";
import type { StartDevWorkerOptions } from "../../api";
import type {
	CfModule,
	CfTailConsumer,
	CfUserLimits,
	CfWorkerInit,
	WorkerMetadata as CfWorkerMetadata,
	CfWorkerSourceMap,
	Config,
	Observability,
	WorkerMetadataBinding,
} from "@cloudflare/workers-utils";
import type { SpecIterableIterator } from "undici";

export const versionsSecretNamespace = createNamespace({
	metadata: {
		description: "Generate a secret that can be referenced in a Worker",
		status: "stable",
		owner: "Workers: Authoring and Testing",
	},
});

// Shared code
export interface WorkerVersion {
	id: string;
	metadata: WorkerMetadata;
	number: number;
}

export interface WorkerMetadata {
	author_email: string;
	author_id: string;
	created_on: string;
	modified_on: string;
	source: string;
}

interface Annotations {
	"workers/message"?: string;
	"workers/tag"?: string;
	"workers/triggered_by"?: string;
}

export interface VersionDetails {
	id: string;
	metadata: WorkerMetadata;
	annotations?: Annotations;
	number: number;
	resources: {
		bindings: WorkerMetadataBinding[];
		script: {
			etag: string;
			handlers: string[];
			placement_mode?: "smart";
			last_deployed_from: string;
		};
		script_runtime: {
			compatibility_date?: string;
			compatibility_flags?: string[];
			usage_model: "bundled" | "unbound" | "standard";
			limits: CfUserLimits;
		};
	};
}

interface ScriptSettings {
	logpush: boolean;
	tail_consumers: CfTailConsumer[] | null;
	observability: Observability;
}

type CfUnsafeMetadata = Record<string, unknown>;

interface CopyLatestWorkerVersionArgs {
	config: Config;
	accountId: string;
	scriptName: string;
	versionId: string;
	secrets: { name: string; value: string; inherit?: boolean }[];
	versionMessage?: string;
	versionTag?: string;
	sendMetrics?: boolean;
	overrideAllSecrets?: boolean; // Used for delete - this will make sure we do not inherit any
	unsafeMetadata?: CfUnsafeMetadata | undefined;
}

// TODO: This is a naive implementation, replace later
export async function copyWorkerVersionWithNewSecrets({
	config,
	accountId,
	scriptName,
	versionId,
	secrets,
	versionMessage,
	versionTag,
	sendMetrics,
	unsafeMetadata,
	overrideAllSecrets,
}: CopyLatestWorkerVersionArgs) {
	// Grab the specific version info
	const versionInfo = await fetchResult<VersionDetails>(
		config,
		`/accounts/${accountId}/workers/scripts/${scriptName}/versions/${versionId}`
	);

	// Naive implementation ahead, don't worry too much about it -- we will replace it
	const { mainModule, modules, sourceMaps } = await parseModules(
		config,
		accountId,
		scriptName,
		versionId
	);

	// Grab the script settings
	const scriptSettings = await fetchResult<ScriptSettings>(
		config,
		`/accounts/${accountId}/workers/scripts/${scriptName}/script-settings`
	);

	const bindings: StartDevWorkerOptions["bindings"] = Object.fromEntries(
		versionInfo.resources.bindings
			// Filter out secrets because they're handled separately
			.filter((binding) => binding.type !== "secret_text")
			.map((binding) => {
				return [
					binding.name,
					{
						// Inherit all of the existing bindings. This will be sent to the API as "type": "inherit"
						// We inherit rather than just sending the actual bindings to reduce the risk of
						// something going wrong in the round trip from the API to Wrangler and back
						type: "inherit",
					},
				];
			})
	);

	// Add the new secrets
	for (const secret of secrets) {
		if (secret.inherit) {
			bindings[secret.name] = {
				type: "inherit",
			};
		} else {
			bindings[secret.name] = {
				type: "secret_text",
				value: secret.value,
			};
		}
	}

	// We don't ever want to remove secret_key
	const keepBindings: CfWorkerMetadata["keep_bindings"] = ["secret_key"];
	// If we aren't overriding all secrets then inherit them
	if (!overrideAllSecrets) {
		keepBindings.push("secret_text");
	}

	const worker: Omit<CfWorkerInit, "bindings"> = {
		name: scriptName,
		main: mainModule,
		modules,
		containers: config.containers,
		sourceMaps: sourceMaps,
		migrations: undefined,
		compatibility_date: versionInfo.resources.script_runtime.compatibility_date,
		compatibility_flags:
			versionInfo.resources.script_runtime.compatibility_flags,
		keepVars: false, // we're re-uploading everything
		keepSecrets: false, // handled in keepBindings
		keepBindings,
		logpush: scriptSettings.logpush,
		placement:
			versionInfo.resources.script.placement_mode === "smart"
				? { mode: "smart" }
				: undefined,
		tail_consumers: scriptSettings.tail_consumers ?? undefined,
		limits: versionInfo.resources.script_runtime.limits,
		annotations: {
			"workers/message": versionMessage,
			"workers/tag": versionTag,
		},
		keep_assets: true,
		assets: undefined,
		observability: scriptSettings.observability,
	};

	const body = createWorkerUploadForm(worker, bindings, {
		unsafe: { metadata: unsafeMetadata },
	});
	const result = await fetchResult<{
		available_on_subdomain: boolean;
		id: string | null;
		etag: string | null;
		deployment_id: string | null;
	}>(
		config,
		`/accounts/${accountId}/workers/scripts/${scriptName}/versions`,
		{
			method: "POST",
			body,
			headers: await getMetricsUsageHeaders(sendMetrics),
		},
		new URLSearchParams({
			include_subdomain_availability: "true",
			// pass excludeScript so the whole body of the
			// script doesn't get included in the response
			excludeScript: "true",
		})
	);

	return result;
}

async function parseModules(
	config: Config,
	accountId: string,
	scriptName: string,
	versionId: string
): Promise<{
	mainModule: CfModule;
	modules: CfModule[];
	sourceMaps: CfWorkerSourceMap[];
}> {
	// Pull the Worker content - https://developers.cloudflare.com/api/operations/worker-script-get-content
	const contentRes = await performApiFetch(
		config,
		`/accounts/${accountId}/workers/scripts/${scriptName}/content/v2?version=${versionId}`
	);
	if (
		contentRes.headers.get("content-type")?.startsWith("multipart/form-data")
	) {
		const formData = await contentRes.formData();

		// Workers Sites is not supported
		if (formData.get("__STATIC_CONTENT_MANIFEST") !== null) {
			throw new UserError(
				"Workers Sites does not support updating secrets through `wrangler versions secret put`. You must use `wrangler secret put` instead."
			);
		}

		// Load the main module and any additionals
		const entrypoint = contentRes.headers.get("cf-entrypoint");
		if (entrypoint === null) {
			throw new FatalError("Got modules without cf-entrypoint header");
		}

		const entrypointPart = formData.get(entrypoint) as File | null;
		if (entrypointPart === null) {
			throw new FatalError("Could not find entrypoint in form-data");
		}

		const mainModule: CfModule = {
			name: entrypointPart.name,
			filePath: "",
			content: Buffer.from<ArrayBuffer>(await entrypointPart.arrayBuffer()),
			type: fromMimeType(entrypointPart.type),
		};

		// Load all modules that are not the entrypoint or sourcemaps
		const modules = await Promise.all(
			Array.from(formData.entries() as SpecIterableIterator<[string, File]>)
				.filter(
					([name, file]) =>
						name !== entrypoint && file.type !== "application/source-map"
				)
				.map(
					async ([name, file]) =>
						({
							name,
							filePath: "",
							content: Buffer.from(await file.arrayBuffer()),
							type: fromMimeType(file.type),
						}) as CfModule
				)
		);

		// Load sourcemaps
		const sourceMaps = await Promise.all(
			Array.from(formData.entries() as SpecIterableIterator<[string, File]>)
				.filter(([_, file]) => file.type === "application/source-map")
				.map(
					async ([name, file]) =>
						({
							name,
							content: await file.text(),
						}) as CfWorkerSourceMap
				)
		);

		return { mainModule, modules, sourceMaps };
	} else {
		const contentType = contentRes.headers.get("content-type");
		if (contentType === null) {
			throw new FatalError(
				"No content-type header was provided for non-module Worker content"
			);
		}

		// good old Service Worker with no additional modules
		const content = await contentRes.text();

		const mainModule: CfModule = {
			name: "index.js",
			filePath: "",
			content,
			type: fromMimeType(contentType),
		};

		return { mainModule, modules: [], sourceMaps: [] };
	}
}
