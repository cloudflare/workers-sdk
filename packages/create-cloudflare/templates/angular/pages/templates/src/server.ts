import { AngularAppEngine, createRequestHandler } from '@angular/ssr';

// When running in wrangler dev, allow localhost SSR.
// `process.env.NODE_ENV` is statically replaced at build time by wrangler:
// - `wrangler dev` sets it to "development"
// - `wrangler deploy` sets it to "production"
const angularApp = new AngularAppEngine({
	allowedHosts: process.env['NODE_ENV'] === 'development' ? ['localhost'] : [],
});

/**
 * This is a request handler used by the Angular CLI (dev-server and during build).
 */
export const reqHandler = createRequestHandler(async (req) => {
	const res = await angularApp.handle(req);

	return res ?? new Response('Page not found.', { status: 404 });
});


export default { fetch: reqHandler };
