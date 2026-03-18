import { fetchResult } from "./fetch";
import { createProxyWorkerUploadForm } from "./upload-form";
import type { AuthCredentials, PreviewSession, PreviewToken } from "../types";
import type { Binding } from "@cloudflare/workers-utils";

/**
 * Upload the ProxyServerWorker to the edge-preview API and get a preview token.
 * This is the second of two API calls needed to set up a remote preview.
 *
 * The worker is uploaded with `minimal_mode: true`, which tells the edge to
 * provide raw bindings (pass-through to the real resources).
 */
export async function createPreviewToken(
	auth: AuthCredentials,
	session: PreviewSession,
	bindings: Record<string, Binding>,
	workerName: string,
	complianceRegion?: string,
	abortSignal?: AbortSignal
): Promise<PreviewToken> {
	const url = `/accounts/${auth.accountId}/workers/scripts/${encodeURIComponent(workerName)}/edge-preview`;

	const formData = createProxyWorkerUploadForm(bindings);
	formData.set(
		"wrangler-session-config",
		JSON.stringify({ workers_dev: true, minimal_mode: true })
	);

	const { preview_token } = await fetchResult<{
		preview_token: string;
		tail_url: string;
	}>(
		auth,
		url,
		{
			method: "POST",
			body: formData,
			headers: {
				"cf-preview-upload-config-token": session.value,
			},
		},
		complianceRegion,
		abortSignal
	);

	return {
		value: preview_token,
		host: session.host,
	};
}
