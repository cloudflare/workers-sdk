import assert from "assert";
import { randomUUID } from "crypto";
import { LocalRuntimeController } from "../api/startDevWorker/LocalRuntimeController";
import registerHotKeys from "../cli-hotkeys";
import { logger } from "../logger";
import openInBrowser from "../open-in-browser";
import { openInspector } from "./inspect";
import type { DevEnv } from "../api";

export default function registerDevHotKeys(
	devEnv: DevEnv,
	args: { forceLocal?: boolean }
) {
	const unregisterHotKeys = registerHotKeys([
		{
			keys: ["b"],
			label: "open a browser",
			handler: async () => {
				const { url } = await devEnv.proxy.ready.promise;
				await openInBrowser(url.href);
			},
		},
		{
			keys: ["d"],
			label: "open devtools",
			handler: async () => {
				const { inspectorUrl } = await devEnv.proxy.ready.promise;

				assert(inspectorUrl, "Error: no inspectorUrl available");

				// TODO: refactor this function to accept a whole URL (not just .port and assuming .hostname)
				await openInspector(
					parseInt(inspectorUrl.port),
					devEnv.config.latestConfig?.name
				);
			},
		},
		{
			keys: ["l"],
			disabled: () => args.forceLocal ?? false,
			handler: async () => {
				await devEnv.config.patch({
					dev: {
						...devEnv.config.latestConfig?.dev,
						remote: !devEnv.config.latestConfig?.dev?.remote,
					},
				});
			},
		},
		{
			keys: ["c"],
			label: "clear console",
			handler: async () => {
				logger.console("clear");
			},
		},
		{
			keys: ["x", "q", "ctrl+c"],
			label: "to exit",
			handler: async () => {
				await devEnv.teardown();
			},
		},
		{
			keys: ["r"],
			// omitting the label means it won't be printed but is still enabled
			// label: "rebuild container",
			handler: async () => {
				if (
					!devEnv.config.latestConfig?.dev?.enableContainers ||
					!devEnv.config.latestConfig?.containers?.length
				) {
					return;
				}
				const newContainerBuildId = randomUUID().slice(0, 8);
				// cleanup any existing containers
				devEnv.runtimes.map(async (runtime) => {
					if (runtime instanceof LocalRuntimeController) {
						await runtime.cleanupContainers();
					}
				});

				// updating the build ID will trigger a rebuild of the containers
				await devEnv.config.patch({
					dev: { containerBuildId: newContainerBuildId },
				});
			},
		},
	]);

	return unregisterHotKeys;
}
