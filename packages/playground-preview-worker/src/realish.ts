import { z } from 'zod';

const PreviewSession = z.object({
	result: z.object({
		exchange_url: z.string(),
		token: z.string(),
	}),
});

type PreviewSession = z.infer<typeof PreviewSession>;

const UploadToken = z.object({
	token: z.string(),
	inspector_websocket: z.string(),
	prewarm: z.string(),
});

type UploadToken = z.infer<typeof UploadToken>;

const UploadResult = z.object({
	result: z.object({
		preview_token: z.string(),
	}),
});

export type UploadResult = z.infer<typeof UploadResult>;

export type RealishPreviewConfig = {
	uploadConfigToken: UploadToken;
	previewSession: PreviewSession['result'];
};

async function cloudflareFetch(apiToken: string, v4Endpoint: string, init?: Parameters<typeof fetch>[1]) {
	const url = `https://api.cloudflare.com/client/v4${v4Endpoint}`;
	const request = new Request(url, init);
	request.headers.set('Authorization', `Bearer ${apiToken}`);
	return fetch(request);
}

async function initialiseSubdomainPreview(accountId: string, apiToken: string): Promise<PreviewSession['result']> {
	return cloudflareFetch(apiToken, `/accounts/${accountId}/workers/subdomain/edge-preview`)
		.then((response) => response.json())
		.then(PreviewSession.parse)
		.then((s) => s.result);
}

async function exchangeToken(url: string): Promise<UploadToken> {
	return fetch(url)
		.then((response) => response.json())
		.then(UploadToken.parse);
}

export async function setupTokens(accountId: string, apiToken: string): Promise<RealishPreviewConfig> {
	const previewSession = await initialiseSubdomainPreview(accountId, apiToken);
	const uploadConfigToken = await exchangeToken(previewSession.exchange_url);
	return {
		previewSession,
		uploadConfigToken,
	};
}

export async function doUpload(accountId: string, apiToken: string, config: RealishPreviewConfig, name: string, worker: FormData) {
	return cloudflareFetch(apiToken, `/accounts/${accountId}/workers/scripts/${name}/edge-preview`, {
		method: 'POST',
		headers: { 'User-Agent': 'workers-playground', 'cf-preview-upload-config-token': config.uploadConfigToken?.token ?? '' },
		body: worker,
	})
		.then((response) => response.json())
		.then(UploadResult.parse);
}
