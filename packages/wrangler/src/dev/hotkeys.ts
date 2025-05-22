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
			label: () =>
				`turn ${devEnv.config.latestConfig?.dev?.remote ? "on" : "off"} local mode`,
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
	]);

	return unregisterHotKeys;
}
