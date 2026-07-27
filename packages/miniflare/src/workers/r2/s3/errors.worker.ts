function xmlEscape(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

/**
 * https://docs.aws.amazon.com/AmazonS3/latest/API/ErrorResponses.html
 * Unlike success documents, R2's <Error> documents carry no xmlns.
 * `extraFields` are appended after <Message> in entry order (e.g.
 * SignatureDoesNotMatch's debug fields).
 *
 * Hand-built rather than with common.worker's XMLBuilder: R2 escapes `'` as
 * `&apos;` in error messages, which fast-xml-parser's entity processing
 * does not reproduce.
 */
export function errorResponse(
	status: number,
	code: string,
	message: string,
	extraFields: Record<string, string> = {}
) {
	const extra = Object.entries(extraFields)
		.map(([name, value]) => `<${name}>${xmlEscape(value)}</${name}>`)
		.join("");
	const body = `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${xmlEscape(message)}</Message>${extra}</Error>`;
	return new Response(body, {
		status,
		headers: { "Content-Type": "application/xml" },
	});
}

export const noSuchBucket = () =>
	errorResponse(404, "NoSuchBucket", "The specified bucket does not exist.");

export const notImplemented = (message: string) =>
	errorResponse(501, "NotImplemented", message);

export const routeNotFound = () =>
	errorResponse(404, "RouteNotFound", "No route matches this url.");
