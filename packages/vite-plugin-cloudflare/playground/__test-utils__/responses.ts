import { viteTestUrl } from "./index";

export async function getTextResponse(path = "/"): Promise<string> {
	const response = await getResponse(path);
	return response.text();
}

export async function getJsonResponse(path = "/"): Promise<unknown> {
	const response = await getResponse(path);
	return response.json();
}

export async function getResponse(path = "/"): Promise<Response> {
	return fetch(`${viteTestUrl}${path}`);
}
