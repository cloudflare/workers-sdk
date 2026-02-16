import { page, viteTestUrl } from "./index";

export async function getTextResponse(
	path = "/",
	hostname?: string
): Promise<string> {
	const response = await getResponse(path, hostname);
	return response.text();
}

export async function getJsonResponse(
	path = "/",
	hostname?: string
): Promise<null | Record<string, unknown> | Array<unknown>> {
	const response = await getResponse(path, hostname);
	const text = await response.text();
	try {
		return JSON.parse(text);
	} catch {
		throw new Error("Invalid JSON response:\n" + text);
	}
}

export async function getResponse(path = "/", hostname?: string) {
	let url: string;
	if (hostname) {
		const base = new URL(viteTestUrl);
		url = `${base.protocol}//${hostname}:${base.port}${path}`;
	} else {
		url = `${viteTestUrl}${path}`;
	}
	const response = page.waitForResponse(url);
	await page.goto(url);
	return response;
}
