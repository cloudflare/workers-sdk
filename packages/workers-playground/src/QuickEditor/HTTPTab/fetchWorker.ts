import type { PreviewHash } from "../useDraftWorker";

export function fetchWorker(
	init: string,
	input: Omit<RequestInit, "headers"> & { headers: [string, string][] },
	previewHash: PreviewHash
): ReturnType<typeof fetch> {
	const proxyUrl = new URL(previewHash.previewUrl);
	const token = proxyUrl.searchParams.get("token") as string;

	return fetch(`${proxyUrl.origin}${init}`, {
		...input,
		headers: [
			...(input?.headers ?? [])
				.filter(([name]) => name)
				.map<[string, string]>(([n, v]) => [`cf-ew-raw-${n}`, v]),
			["X-CF-Token", token],
			["cf-raw-http", "true"],
		],
	});
}
