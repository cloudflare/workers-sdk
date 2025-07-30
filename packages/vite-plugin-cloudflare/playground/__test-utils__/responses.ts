import { page, viteTestUrl } from "./index";

/** Common options to use with `vi.waitFor()` */
export const WAIT_FOR_OPTIONS = { timeout: 5_000, interval: 500 };

export async function getTextResponse(path = "/"): Promise<string> {
	const response = await getResponse(path);
	return response.text();
}

export async function getJsonResponse(
	path = "/"
): Promise<null | Record<string, unknown> | Array<unknown>> {
	const response = await getResponse(path);
	const text = await response.text();
	try {
		return JSON.parse(text);
	} catch {
		throw new Error("Invalid JSON response:\n" + text);
	}
}

export async function getResponse(path = "/") {
	const url = `${viteTestUrl}${path}`;
	const response = page.waitForResponse(url);
	await page.goto(url);
	return response;
}
