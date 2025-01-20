import { page, viteTestUrl } from "./index";

export async function getTextResponse(path = "/"): Promise<string> {
	const response = await getResponse(path);
	return response.text();
}

export async function getJsonResponse(
	path = "/"
): Promise<null | Record<string, unknown>> {
	const response = await getResponse(path);
	return response.json();
}

async function getResponse(path = "/") {
	const url = `${viteTestUrl}${path}`;

	const response = page.waitForResponse(url);
	await page.goto(url);
	return response;
}
