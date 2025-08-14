import { fetch } from "undici";

export function fetchText(
	url: string,
	timeout?: number
): Promise<string | null> {
	const signal =
		timeout !== undefined ? AbortSignal.timeout(timeout) : undefined;
	return fetch(url, {
		headers: { "MF-Disable-Pretty-Error": "true" },
		signal,
	})
		.then((r) => r.text())
		.catch(() => null);
}
