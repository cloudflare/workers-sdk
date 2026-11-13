import { startMockNpmRegistry } from "@cloudflare/mock-npm-registry";
import exitHook from "exit-hook";

/**
 * This Vitest global setup function starts a mock NPM registry and registers an exit hook to stop it when the tests are done.
 */
export default async function globalSetup() {
	let stopMockNpmRegistry: (() => void) | undefined =
		await startMockNpmRegistry(
			"create-cloudflare",
			"@cloudflare/vitest-plugin",
			"@cloudflare/vite-plugin",
			// C3 installs `wrangler@latest` (and templates use `wrangler@^4`), so
			// publish it at its real version to test the local copy.
			"wrangler"
		);
	const onExit = () => {
		stopMockNpmRegistry?.();
		stopMockNpmRegistry = undefined;
	};
	exitHook(onExit);
	return onExit;
}
