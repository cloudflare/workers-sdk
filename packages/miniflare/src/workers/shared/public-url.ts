// Fetches the configured `publicUrl` of the Miniflare instance via the
// loopback service, falling back to the runtime entry URL. Resolving at
// request time means workers see the latest value even after workerd
// restarts or the host server's port changes (e.g. Vite port-bump).
export async function getPublicUrl(loopback: Fetcher): Promise<URL> {
	const resp = await loopback.fetch("http://localhost/core/public-url");
	const url = (await resp.json()) as string | null;
	if (!url) {
		throw new Error("Miniflare public URL is not available.");
	}
	return new URL(url);
}
