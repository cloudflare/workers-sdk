import { assertIsNotPreview, assertIsPreview } from "../context";
import { createPlugin, satisfiesMinimumViteVersion } from "../utils";

export const devPlugin = createPlugin("dev", (ctx) => ({
	async configureServer(viteDevServer) {
		const { configureDevServer } = await import("./dev");
		return configureDevServer(ctx, viteDevServer);
	},
}));

export const previewPlugin = createPlugin("preview", (ctx) => ({
	async configurePreviewServer(vitePreviewServer) {
		const { configurePreviewServer } = await import("./preview");
		return configurePreviewServer(ctx, vitePreviewServer);
	},
}));

export const shortcutsPlugin = createPlugin("shortcuts", (ctx) => {
	// This requires Vite 7.2.7 which fixes custom CLI shortcuts support
	// @see https://github.com/vitejs/vite/pull/21103
	const isCustomShortcutsSupported = satisfiesMinimumViteVersion("7.2.7");

	return {
		async configureServer(viteDevServer) {
			if (!isCustomShortcutsSupported) {
				return;
			}

			assertIsNotPreview(ctx);
			const { addShortcuts } = await import("./shortcuts");
			addShortcuts(viteDevServer, ctx);
		},
		async configurePreviewServer(vitePreviewServer) {
			if (!isCustomShortcutsSupported) {
				return;
			}

			assertIsPreview(ctx);
			const { addShortcuts } = await import("./shortcuts");
			addShortcuts(vitePreviewServer, ctx);
		},
	};
});

/**
 * Plugin that prints the Local Explorer API URL and useful routes when
 * the dev server is started by a headless AI agent. This allows agents
 * to discover and call the Local Explorer API programmatically.
 *
 * The hint is printed by patching `server.bindCLIShortcuts` so it
 * appears after both the server URLs and the keyboard shortcut hints.
 */
export const agentHintPlugin = createPlugin("agent-hint", () => ({
	async configureServer(viteDevServer) {
		const { maybeAddAgentHint } = await import("./agent-hint");
		maybeAddAgentHint(viteDevServer, "dev");
	},
	async configurePreviewServer(vitePreviewServer) {
		const { maybeAddAgentHint } = await import("./agent-hint");
		maybeAddAgentHint(vitePreviewServer, "preview");
	},
}));
