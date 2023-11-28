import { getAssetFromKV, NotFoundError, MethodNotAllowedError } from '@cloudflare/kv-asset-handler';
import manifestJSON from '__STATIC_CONTENT_MANIFEST';
const assetManifest = JSON.parse(manifestJSON);

// eslint-disable-next-line import/no-anonymous-default-export
export default {
	async fetch(request, env, ctx) {
		try {
			return await getAssetFromKV({
				request,
				waitUntil(promise) {
					return ctx.waitUntil(promise)
				},
			},
				{
					ASSET_NAMESPACE: env.__STATIC_CONTENT,
					ASSET_MANIFEST: assetManifest
				}
			);
		} catch (e) {
			if (e instanceof NotFoundError) {
				let pathname = new URL(request.url).pathname;
				return new Response(`"${pathname}" not found`, {
					status: 404,
					statusText: 'not found',
				});
			} else if (e instanceof MethodNotAllowedError) {
				let method = request.method;
				return new Response(`Method ${method} not allowed for accessing static assets`, {
					status: 405,
					statusText: 'Method Not Allowed',
				});
			} else {
				return new Response('An unexpected error occured', { status: 500 })
			}
		}
	},
};
