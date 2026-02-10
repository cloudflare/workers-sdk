import { z } from "zod";
import { PreviewError } from "./errors";

const APIResponse = <T extends z.ZodTypeAny>(resultSchema: T) =>
	z.union([
		z.object({
			success: z.literal(true),
			result: resultSchema,
		}),
		z.object({
			success: z.literal(false),
			result: z.null().optional(),
			errors: z.array(
				z.object({
					code: z.number(),
					message: z.string(),
				})
			),
		}),
	]);

const PreviewSession = APIResponse(
	z.object({
		exchange_url: z.string(),
		token: z.string(),
	})
);

type PreviewSession = z.infer<typeof PreviewSession>;

const UploadToken = z.object({
	token: z.string(),
	inspector_websocket: z.string(),
	prewarm: z.string(),
});

type UploadToken = z.infer<typeof UploadToken>;

const UploadResult = APIResponse(
	z.object({
		preview_token: z.string(),
		tail_url: z.string(),
	})
);
export type UploadResult = z.infer<typeof UploadResult>;

export type RealishPreviewConfig = {
	uploadConfigToken: UploadToken;
	previewSession: PreviewSession["result"];
};

async function cloudflareFetch(
	apiToken: string,
	v4Endpoint: string,
	init?: Parameters<typeof fetch>[1]
) {
	const url = `https://api.cloudflare.com/client/v4${v4Endpoint}`;
	const request = new Request(url, init);
	request.headers.set("Authorization", `Bearer ${apiToken}`);
	return fetch(request);
}

async function initialiseSubdomainPreview(
	accountId: string,
	apiToken: string
): Promise<{
	exchange_url: string;
	token: string;
}> {
	const response = await cloudflareFetch(
		apiToken,
		`/accounts/${accountId}/workers/subdomain/edge-preview`
	);
	const json = await response.json();
	const session = PreviewSession.parse(json);

	if (!session.result) {
		throw new PreviewError(
			session?.errors?.[0].message ?? "Preview Session failed to initialise"
		);
	}
	return session.result;
}

async function exchangeToken(url: string): Promise<UploadToken> {
	const response = await fetch(url);
	const json = await response.json();
	return UploadToken.parse(json);
}

export async function setupTokens(
	accountId: string,
	apiToken: string
): Promise<RealishPreviewConfig> {
	const previewSession = await initialiseSubdomainPreview(accountId, apiToken);
	const uploadConfigToken = await exchangeToken(previewSession.exchange_url);
	return {
		previewSession,
		uploadConfigToken,
	};
}

export async function doUpload(
	accountId: string,
	apiToken: string,
	config: RealishPreviewConfig,
	name: string,
	worker: FormData
) {
	const upload = await cloudflareFetch(
		apiToken,
		`/accounts/${accountId}/workers/scripts/${name}/edge-preview`,
		{
			method: "POST",
			headers: {
				"User-Agent": "workers-playground",
				"cf-preview-upload-config-token": config.uploadConfigToken?.token ?? "",
			},
			body: worker,
		}
	);
	const result = UploadResult.parse(await upload.json());
	if (result.success === false) {
		throw new PreviewError(result?.errors?.[0]?.message ?? "Preview failed");
	}
	return result;
}
