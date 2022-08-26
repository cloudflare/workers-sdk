import type { WorkerMetadata } from "../../wrangler/src/create-worker-upload-form";

async function cfetch(path: string, options: RequestInit): Promise<Response> {
	console.log(path);
	return fetch(`https://api.cloudflare.com/client/v4${path}`, options);
}

export async function publish(
	scriptContent: string,
	options: {
		scriptId: string; // for "no name" workers, should we return an id?
		accountId: string;
		apiToken: string;
		namespace: string;
		tags: string[];
		format: "service-worker" | "module";
		compatibility_date: string;
		compatibility_flags: string[];
		// node compat?
		// crons?
	}
) {
	const {
		scriptId,
		accountId,
		apiToken,
		namespace,
		tags,
		format,
		compatibility_date,
		compatibility_flags,
	} = options;
	const formData = new FormData();
	const metadata: WorkerMetadata = {
		...(format === "service-worker"
			? { body_part: scriptId }
			: { main_module: scriptId }),
		bindings: [],
		...(compatibility_date && { compatibility_date }),
		...(compatibility_flags && { compatibility_flags }),
		...(tags && { tags }),
		keep_bindings: [],
		// ...(usage_model && { usage_model }),
	};

	formData.set("metadata", JSON.stringify(metadata));

	formData.set(
		scriptId,
		new File([scriptContent], scriptId, {
			type:
				format === "service-worker"
					? "application/javascript"
					: "application/javascript+module",
		})
	);

	return await cfetch(
		`/accounts/${accountId}/workers/dispatch/namespaces/${namespace}/scripts/${scriptId}`,
		{
			method: "PUT",
			body: formData,
			headers: {
				Authorization: `Bearer ${apiToken}`,
			},
		}
	);
}

export function getAllTags() {}

export function setTagsForScript() {}

export function setTagForScript() {}

export function deleteTagForScript() {}

export function getScriptsForTags() {}

export async function dev() {}
