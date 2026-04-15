import { APIError } from "@cloudflare/workers-utils";
import { performApiFetch } from "../cfetch";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

interface FetchOptions {
	method?: "GET" | "POST" | "DELETE";
	queryParams?: Record<string, string | number | boolean>;
}

/**
 * Parse error message from Browser Run API response.
 */
function parseErrorMessage(text: string): string {
	try {
		const errorJson = JSON.parse(text);
		if (errorJson.errors && Array.isArray(errorJson.errors)) {
			return errorJson.errors
				.map((e: { message?: string }) => e.message || JSON.stringify(e))
				.join(", ");
		} else if (errorJson.error) {
			return errorJson.error;
		} else if (errorJson.message) {
			return errorJson.message;
		}
	} catch {
		// Use raw text as error message
	}
	return text;
}

/**
 * Fetch from the Browser Run Devtools API.
 *
 * The Browser Run Devtools API returns raw JSON responses (not wrapped in the
 * standard Cloudflare API envelope with `success`, `result`, `errors` fields).
 * This function handles that difference.
 */
export async function fetchBrowserRendering<ResponseType>(
	config: ComplianceConfig,
	resource: string,
	options: FetchOptions = {}
): Promise<ResponseType> {
	const { method = "GET", queryParams } = options;

	// Build URL with query params
	let url = resource;
	if (queryParams && Object.keys(queryParams).length > 0) {
		const params = new URLSearchParams();
		for (const [key, value] of Object.entries(queryParams)) {
			params.append(key, String(value));
		}
		url = `${resource}?${params.toString()}`;
	}

	const response = await performApiFetch(config, url, { method });
	const text = await response.text();

	if (!response.ok) {
		const errorMessage = parseErrorMessage(text);
		throw new APIError({
			text: `Browser Run API error: ${errorMessage}`,
			notes: [{ text: `${method} ${url} -> ${response.status}` }],
			status: response.status,
		});
	}

	try {
		// Browser Run API returns raw JSON, not wrapped in { success, result }
		return JSON.parse(text) as ResponseType;
	} catch {
		throw new APIError({
			text: "Received a malformed response from the Browser Run API",
			notes: [
				{ text: text.length > 100 ? `${text.substring(0, 100)}...` : text },
				{ text: `${method} ${url} -> ${response.status}` },
			],
			status: response.status,
		});
	}
}
