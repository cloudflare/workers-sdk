import { fetch } from "undici";

export const fetchWithETag = async (
	url: string,
	cachedETags: Record<string, string>
) => {
	const response = await fetch(url, {
		headers: { "if-none-match": cachedETags[url] ?? "" },
	});
	cachedETags[url] = response.headers.get("etag") ?? "";
	return { response, cachedETags };
};
