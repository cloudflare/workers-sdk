import { startMockNpmRegistry } from "@cloudflare/mock-npm-registry";
import exitHook from "exit-hook";

/**
 * This Vitest global setup function starts a mock NPM registry and registers an exit hook to stop it when the tests are done.
 */
export default async function globalSetup() {
	let stopMockNpmRegistry: (() => void) | undefined =
		await startMockNpmRegistry("create-cloudflare");
	const onExit = () => {
		stopMockNpmRegistry?.();
		stopMockNpmRegistry = undefined;
	};
	exitHook(onExit);
	return onExit;
}
