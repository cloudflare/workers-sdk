import registerHotKeys from "../cli-hotkeys";
import { logger } from "../logger";
import openInBrowser from "../open-in-browser";
import { openInspector } from "./inspect";
import type { DevEnv } from "../api";

export default function registerDevHotKeys(
	devEnvs: DevEnv[],
	args: { forceLocal?: boolean }
) {
	const primaryDevEnv = devEnvs[0];
	const unregisterHotKeys = registerHotKeys([
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
			handler: async () => {
				const { inspectorUrl } = await primaryDevEnv.proxy.ready.promise;

				// TODO: refactor this function to accept a whole URL (not just .port and assuming .hostname)
				await openInspector(
					parseInt(inspectorUrl.port),
					primaryDevEnv.config.latestConfig?.name
				);
			},
		},
		{
			keys: ["l"],
			disabled: () => args.forceLocal ?? false,
			label: () =>
				`turn ${primaryDevEnv.config.latestConfig?.dev?.remote ? "on" : "off"} local mode`,
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
				logger.console("clear");
			},
		},
		{
			keys: ["x", "q", "ctrl+c"],
			label: "to exit",
			handler: async () => {
				unregisterHotKeys();
				await Promise.allSettled(devEnvs.map((devEnv) => devEnv.teardown()));
			},
		},
	]);

	return unregisterHotKeys;
}
