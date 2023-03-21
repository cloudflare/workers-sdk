import { getAssetFromKV } from '@cloudflare/kv-asset-handler';

// eslint-disable-next-line import/no-anonymous-default-export
export default {
	async fetch(request) {
		try {
			return await getAssetFromKV(request);
		} catch (e) {
			let pathname = new URL(request.url).pathname;
			return new Response(`"${pathname}" not found`, {
				status: 404,
				statusText: 'not found',
			});
		}
	},
};
