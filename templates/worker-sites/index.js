import { getAssetFromKV, mapRequestToAsset, NotFoundError, MethodNotAllowedError } from '@cloudflare/kv-asset-handler';
import manifestJSON from '__STATIC_CONTENT_MANIFEST';
const assetManifest = JSON.parse(manifestJSON);

/**
 * The DEBUG flag will do two things that help during development:
 * 1. we will skip caching on the edge, which makes it easier to
 *    debug.
 * 2. we will return an error message on exception in your Response rather
 *    than the default 404.html page.
 */
const DEBUG = false;

export default {
	async fetch(request, env, ctx) {
		let options = {};

		/**
		 * You can add custom logic to how we fetch your assets
		 * by configuring the function `mapRequestToAsset`
		 */
		// options.mapRequestToAsset = handlePrefix(/^\/docs/)

		try {
			if (DEBUG) {
				// customize caching
				options.cacheControl = {
					bypassCache: true,
				};
			}

			const page = await getAssetFromKV({
				request, waitUntil(promise) {
					return ctx.waitUntil(promise)
				},
			},
				{
					ASSET_NAMESPACE: env.__STATIC_CONTENT,
					ASSET_MANIFEST: assetManifest
				}
			);

			// allow headers to be altered
			const response = new Response(page.body, page);

			response.headers.set('X-XSS-Protection', '1; mode=block');
			response.headers.set('X-Content-Type-Options', 'nosniff');
			response.headers.set('X-Frame-Options', 'DENY');
			response.headers.set('Referrer-Policy', 'unsafe-url');
			response.headers.set('Feature-Policy', 'none');

			return response;
		} catch (e) {
			if (!DEBUG && e instanceof NotFoundError) {
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

/**
 * Here's one example of how to modify a request to
 * remove a specific prefix, in this case `/docs` from
 * the url. This can be useful if you are deploying to a
 * route on a zone, or if you only want your static content
 * to exist at a specific path.
 * @param {string} prefix
 * @returns {(request: Request) => Request}
 */
function handlePrefix(prefix) {
	return request => {
		// compute the default (e.g. / -> index.html)
		let defaultAssetKey = mapRequestToAsset(request);
		let url = new URL(defaultAssetKey.url);

		// strip the prefix from the path for lookup
		url.pathname = url.pathname.replace(prefix, '/');

		// inherit all other props from the default request
		return new Request(url.toString(), defaultAssetKey);
	};
}
