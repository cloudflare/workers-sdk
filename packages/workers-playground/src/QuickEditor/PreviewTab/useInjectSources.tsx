import { useCallback } from "react";
import {
	Channel,
	FromErrorPage,
	SourcesLoadedMessage,
	ToErrorPage,
} from "../ipc";
import { TypedModule } from "../useDraftWorker";

function getFilesFromModules(modules: Record<string, TypedModule>) {
	return Object.entries(modules)
		.filter(
			([path, m]) =>
				path.endsWith(".js") ||
				m.type === "application/javascript" ||
				m.type === "application/javascript+module"
		)
		.map(([path, m]) => ({
			path,
			contents: m.contents,
		}));
}

export function useInjectSources(
	entrypoint: string | undefined,
	modules: Record<string, TypedModule> | undefined
): (frame: HTMLIFrameElement) => void {
	return useCallback(
		(frame) => {
			// Create a new channel on every load, since they'll be sent to the iframe and can't be used on the next load.
			const errorPage = Channel<ToErrorPage, FromErrorPage>(
				new MessageChannel()
			);
			try {
				frame.contentWindow?.postMessage("PORT", "*", [errorPage.remote]);
			} catch (e) {
				console.error("new load", e);
			}

			errorPage.onMessage((data) => {
				if (!entrypoint || !modules) {
					return;
				}
				if (data.type === "RequestSources") {
					const files = getFilesFromModules(modules);

					const message: SourcesLoadedMessage = {
						type: "SourcesLoaded",
						body: {
							name: "workers playground",
							entrypoint,
							files,
							internalLines: 0,
						},
					};
					errorPage.postMessage(message);
				}
			});
		},
		[entrypoint, modules]
	);
}
