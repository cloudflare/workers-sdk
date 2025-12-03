import { generateContainerBuildId } from "@cloudflare/containers-shared";
import { LocalRuntimeController } from "../api/startDevWorker/LocalRuntimeController";
import registerHotKeys from "../cli-hotkeys";
import { logger } from "../logger";
import openInBrowser from "../open-in-browser";
import { debounce } from "../utils/debounce";
import { openInspector } from "./inspect";
import type { DevEnv } from "../api";

export default function registerDevHotKeys(
	devEnvs: DevEnv[],
	args: {
		forceLocal?: boolean;
		experimentalTailLogs: boolean;
		remote: boolean;
	},
	render = true
) {
	const primaryDevEnv = devEnvs[0];
	const unregisterHotKeys = registerHotKeys(
		[
			{
				keys: ["b"],
				label: "open a browser",
				handler: async () => {
					const { url } = await primaryDevEnv.proxy.ready.promise;
					await openInBrowser(url.href);
				},
			},
			{
				keys: ["d"],
				label: "open devtools",
				// Don't display this hotkey if we're in a VSCode debug session
				disabled:
					!!process.env.VSCODE_INSPECTOR_OPTIONS ||
					(args.remote && args.experimentalTailLogs),
				handler: async () => {
					const { inspectorUrl } = await primaryDevEnv.proxy.ready.promise;

					if (!inspectorUrl) {
						logger.warn("DevTools is not available while in a debug terminal");
					} else {
						// TODO: refactor this function to accept a whole URL (not just .port and assuming .hostname)
						await openInspector(
							parseInt(inspectorUrl.port),
							primaryDevEnv.config.latestConfig?.name
						);
					}
				},
			},
			{
				keys: ["r"],
				label: "rebuild container(s)",
				disabled: () => {
					return devEnvs.every(
						(devEnv) =>
							!devEnv.config.latestConfig?.dev?.enableContainers ||
							!devEnv.config.latestConfig?.containers?.length
					);
				},
				handler: debounce(async () => {
					for (const devEnv of devEnvs) {
						devEnv.runtimes.forEach((runtime) => {
							if (runtime instanceof LocalRuntimeController) {
								if (runtime.containerBeingBuilt) {
									// Let's abort the image built so that we
									// can restart the build process
									runtime.containerBeingBuilt.abort();
									runtime.containerBeingBuilt.abortRequested = true;
								}
							}
						});
						// cleanup any existing containers

						devEnv.runtimes.map((runtime) => {
							if (runtime instanceof LocalRuntimeController) {
								runtime.cleanupContainers();
							}
						});

						const newContainerBuildId = generateContainerBuildId();

						// updating the build ID will trigger a rebuild of the containers
						await devEnv.config.patch({
							dev: {
								...devEnv.config.latestConfig?.dev,
								containerBuildId: newContainerBuildId,
							},
						});
					}
				}, 250),
			},
			{
				keys: ["l"],
				disabled: () => args.forceLocal ?? false,
				handler: async () => {
					await primaryDevEnv.config.patch({
						dev: {
							...primaryDevEnv.config.latestConfig?.dev,
							remote: !primaryDevEnv.config.latestConfig?.dev?.remote,
						},
					});
				},
			},
			{
				keys: ["c"],
				label: "clear console",
				handler: async () => {
					const someContainerIsBeingBuilt = primaryDevEnv.runtimes.some(
						(runtime) =>
							runtime instanceof LocalRuntimeController &&
							runtime.containerBeingBuilt
					);
					if (!someContainerIsBeingBuilt) {
						// Containers builds have their own complex logs (with progress updates)
						// that get in the way of the logger clearing, so not to break things
						// we don't clear the console when a container is being built
						logger.console("clear");
					}
				},
			},
			{
				keys: ["x", "q", "ctrl+c"],
				label: "to exit",
				handler: async () => {
					primaryDevEnv.runtimes.forEach((runtime) => {
						if (runtime instanceof LocalRuntimeController) {
							if (runtime.containerBeingBuilt) {
								// Let's abort the image built so that we
								// can then exit the dev process
								runtime.containerBeingBuilt.abort();
								runtime.containerBeingBuilt.abortRequested = true;
							}
						}
					});
					await primaryDevEnv.teardown();
				},
			},
		],
		render
	);

	return unregisterHotKeys;
}
