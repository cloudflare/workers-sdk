export type UrlOriginParts = Pick<URL, "protocol" | "hostname" | "port">;
export type UrlOriginAndPathnameParts = Pick<
	URL,
	"protocol" | "hostname" | "port" | "pathname"
>;

export function urlFromParts(
	parts: Partial<URL>,
	base = "http://localhost"
): URL {
	const url = new URL(base);

	Object.assign(url, parts);

	return url;
}
