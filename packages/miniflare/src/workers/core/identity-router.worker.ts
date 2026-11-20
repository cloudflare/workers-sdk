import { WorkerEntrypoint } from "cloudflare:workers";

interface Env {
	ISSUER_ORIGIN: string;
	WBA_DIRECTORY_DOMAIN: string;
	CALLBACK_URL: string;
	LIVE_PROVIDER: boolean;
	ROUTES?: Record<string, string>;
	[key: string]: unknown;
	DISCOVERY: Fetcher;
	BROKER: Fetcher;
	FIXTURE: Fetcher;
}
export class Limiter extends WorkerEntrypoint {
	async limit() {
		return { success: true };
	}
}
async function route(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	if (["as.identity.local", "api.identity.local"].includes(url.hostname)) {
		return env.FIXTURE.fetch(request);
	}
	if (
		url.pathname === "/cdn-cgi/local/identity/authorize" &&
		url.origin === new URL(env.CALLBACK_URL).origin
	) {
		return env.FIXTURE.fetch(
			new Request(`https://as.identity.local/authorize${url.search}`, request)
		);
	}
	if (
		url.origin === env.ISSUER_ORIGIN ||
		url.hostname === env.WBA_DIRECTORY_DOMAIN ||
		url.hostname.endsWith(`.${env.WBA_DIRECTORY_DOMAIN}`)
	) {
		return env.DISCOVERY.fetch(request);
	}
	if (url.origin + url.pathname === env.CALLBACK_URL) {
		return env.BROKER.fetch(request);
	}
	const worker = env.ROUTES?.[url.origin];
	if (worker) {
		return (env[worker] as Fetcher).fetch(request);
	}
	if (url.hostname.endsWith(".local.test")) {
		throw new Error(
			`There is no Worker in this local graph for ${url.origin}. Add that Worker to this Miniflare instance.`
		);
	}
	if (env.LIVE_PROVIDER) {
		return fetch(request);
	}
	throw new Error(
		"Local identity services cannot contact a live provider in deterministic mode. Set MINIFLARE_IDENTITY_LIVE_PROVIDER=1 for explicit live qualification; configure MINIFLARE_IDENTITY_CALLBACK_URL for browser consent. Local credentials never fall back to production identity services."
	);
}
export class LocalRouter extends WorkerEntrypoint<Env> {
	fetch(request: Request) {
		return route(request, this.env);
	}
}
export default { fetch: route } satisfies ExportedHandler<Env>;
