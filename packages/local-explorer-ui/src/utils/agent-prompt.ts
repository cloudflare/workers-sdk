const AGENT_PROMPT_TEMPLATE = `You have access to local Cloudflare services (KV, R2, D1, Durable Objects, and Workflows) for this app via the Explorer API.
API endpoint: {{apiEndpoint}}.
Fetch the OpenAPI schema from {{apiEndpoint}} to discover available operations. Use these endpoints to list, query, and manage local resources during development.`;

/**
 * Builds the fully-qualified Local Explorer API endpoint from a page origin and API path.
 */
export function getLocalExplorerApiEndpoint(
	origin: string,
	apiPath: string
): string {
	return `${origin}${apiPath}`;
}

/**
 * Creates the agent/LLM prompt text by injecting the resolved API endpoint into the template.
 */
export function createLocalExplorerPrompt(apiEndpoint: string): string {
	return AGENT_PROMPT_TEMPLATE.replaceAll("{{apiEndpoint}}", apiEndpoint);
}

/**
 * Copies text to the provided clipboard implementation.
 *
 * Defaults to `navigator.clipboard` in browser environments.
 */
export async function copyTextToClipboard(
	text: string,
	clipboard: Pick<Clipboard, "writeText"> = navigator.clipboard
): Promise<void> {
	await clipboard.writeText(text);
}
