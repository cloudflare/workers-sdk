// Fetches the public URL from the Miniflare loopback. This returns
// the publicUrl if one was set (e.g. Vite dev server URL), otherwise
// falls back to the runtime entry URL. Using the loopback means the
// binding always sees the latest value — even if the URL was
// updated after workerd started (e.g. when Vite bumps the port).
export async function getPublicUrl(loopback: Fetcher): Promise<URL> {
	const resp = await loopback.fetch("http://localhost/core/public-url");
	const url = (await resp.json()) as string | null;
	if (!url) {
		throw new Error(
			"Runtime entry URL is not available. This may be because the worker is not yet ready to accept requests."
		);
	}
	return new URL(url);
}
