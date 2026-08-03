import { getLocalExplorerEnabledFromEnv } from "@cloudflare/workers-utils";
import { CorePaths } from "miniflare";
import { isAgentSession } from "../detect-agent";
import { createPlugin } from "../utils";
import type * as vite from "vite";

/**
 * Plugin that prints the Local Explorer API URL and useful routes when
 * the dev server is started by a headless AI agent. This allows agents
 * to discover and call the Local Explorer API programmatically.
 *
 * The hint is printed by patching `server.bindCLIShortcuts` so it
 * appears after both the server URLs and the keyboard shortcut hints.
 */
export const agentHintPlugin = createPlugin("agent-hint", () => {
	return {
		configureServer(viteDevServer) {
			maybeAddAgentHint(viteDevServer, "dev");
		},
		configurePreviewServer(vitePreviewServer) {
			maybeAddAgentHint(vitePreviewServer, "preview");
		},
	};
});

/**
 * If the session is a headless AI agent with Local Explorer enabled,
 * patches `server.bindCLIShortcuts` to print the explorer API hint
 * after the shortcut hints have been printed.
 *
 * @param server - The Vite dev or preview server
 * @param mode - Whether this is a "dev" or "preview" session
 */
export function maybeAddAgentHint(
	server: vite.ViteDevServer | vite.PreviewServer,
	mode: "dev" | "preview"
): void {
	if (
		process.stdin.isTTY ||
		!getLocalExplorerEnabledFromEnv() ||
		!isAgentSession()
	) {
		return;
	}

	const originalBindCLIShortcuts = server.bindCLIShortcuts.bind(server);
	server.bindCLIShortcuts = (options?: vite.BindCLIShortcutsOptions) => {
		originalBindCLIShortcuts(options);
		if (options?.print) {
			printLocalExplorerAgentHint(server, mode);
		}
	};
}

/**
 * Prints the Local Explorer API URL and useful routes to stdout so that
 * headless AI agents can discover and call them programmatically.
 *
 * Keep the message in sync with the wrangler copy in
 * packages/wrangler/src/dev/start-dev.ts.
 *
 * @param server - The Vite dev or preview server (must have `resolvedUrls` populated)
 * @param mode - Whether this is a "dev" or "preview" session
 */
function printLocalExplorerAgentHint(
	server: vite.ViteDevServer | vite.PreviewServer,
	mode: "dev" | "preview"
): void {
	const url = server.resolvedUrls?.local[0];
	if (!url) {
		return;
	}

	const explorerApiUrl = new URL(`${CorePaths.EXPLORER}/api`, url).href;

	server.config.logger.info(
		[
			"",
			`The Cloudflare Vite plugin detected this ${mode} session is running in an AI agent.`,
			`The Local Explorer API is available at ${explorerApiUrl}`,
			`Useful routes:`,
			`  GET ${explorerApiUrl}/local/workers - local Workers and bindings`,
			`  GET ${explorerApiUrl}/storage/kv/namespaces - KV namespaces`,
			`  GET ${explorerApiUrl}/d1/database - D1 databases`,
			`  GET ${explorerApiUrl}/r2/buckets - R2 buckets`,
			`  GET ${explorerApiUrl}/workers/durable_objects/namespaces - Durable Object namespaces`,
			`  GET ${explorerApiUrl}/workflows - Workflows`,
			`  POST ${explorerApiUrl}/local/observability/query - run a read-only SQL query (SELECT/WITH only) over captured request traces and console logs. Tables: spans, logs (read attributes via json(attributes)). Example:`,
			`    curl -X POST ${explorerApiUrl}/local/observability/query -H 'Content-Type: application/json' -d '{"sql":"SELECT service, name, outcome, duration_ms FROM spans WHERE parent_id IS NULL LIMIT 20"}'`,
			`If the routes above don't cover what you need, fetch the full OpenAPI schema (large - use only as a last resort):`,
			`  GET ${explorerApiUrl} - OpenAPI schema`,
			"",
		].join("\n")
	);
}
