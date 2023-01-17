import { getAssetFromKV } from '@cloudflare/kv-asset-handler';

addEventListener('fetch', event => {
	event.respondWith(handleEvent(event));
});

async function handleEvent(event) {
	try {
		return await getAssetFromKV(event);
	} catch (e) {
		let pathname = new URL(event.request.url).pathname;
		return new Response(`"${pathname}" not found`, {
			status: 404,
			statusText: 'not found',
		});
	}
}
