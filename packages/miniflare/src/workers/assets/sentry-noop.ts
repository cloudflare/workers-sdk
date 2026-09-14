/**
 * Miniflare's asset services do not bind Sentry credentials, so this preserves
 * the production setup's credential-free behaviour without bundling Toucan.
 *
 * @returns `undefined`, matching production when credentials are absent.
 */
export function setupSentry(): undefined {
	return undefined;
}
