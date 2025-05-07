import { Div } from "@cloudflare/elements";
import { DragContext, Frame } from "@cloudflare/workers-editor-shared";
import { AttachAddon } from "@xterm/addon-attach";
import { FitAddon } from "@xterm/addon-fit";
import { useContext, useEffect, useRef } from "react";
import { useXTerm } from "react-xtermjs";
import FrameErrorBoundary from "./FrameErrorBoundary";
import { ServiceContext } from "./QuickEditor";
import type React from "react";

function getDevtoolsIframeUrl(inspectorUrl: string) {
	const devToolsUrl = import.meta.env.VITE_DEVTOOLS_PREVIEW_URL
		? `${import.meta.env.VITE_DEVTOOLS_PREVIEW_URL}/js_app`
		: "https://devtools.devprod.cloudflare.dev/js_app";

	const url = new URL(devToolsUrl);
	url.searchParams.set("wss", inspectorUrl.slice(5));

	url.searchParams.set("theme", "systemPreferred");
	url.searchParams.set("domain", "workers playground");
	return url.toString();
}

export function DevtoolsIframe() {
	const draftWorker = useContext(ServiceContext);
	const isPaneDragging = useContext(DragContext);
	const fit = useRef<FitAddon>();
	const attach = useRef<AttachAddon>();

	const { instance, ref } = useXTerm();
	useEffect(() => {
		function createTerminal(): void {
			if (!fit.current) {
				fit.current = new FitAddon();
			}

			instance?.loadAddon(fit.current);

			instance?.onResize((size: { cols: number; rows: number }) => {
				const cols = size.cols;
				const rows = size.rows;
				const url =
					"https://cloudedit-controller.devprod-playground.workers.dev/resize-terminal?cols=" +
					cols +
					"&rows=" +
					rows;

				void fetch(url, { method: "POST" });
			});

			fit.current.fit();

			const resizeObserver = new ResizeObserver(() => {
				fit.current?.fit();
			});
			if (ref.current) {
				resizeObserver.observe(ref.current);
			}

			const socket = new WebSocket(
				"wss://" +
					"cloudedit-controller.devprod-playground.workers.dev" +
					"/terminal/1234?cols=" +
					instance?.cols +
					"&rows=" +
					instance?.rows +
					"&token=" +
					"token"
			);
			console.log({ socket });
			socket.onopen = () => {
				attach.current = new AttachAddon(socket);
				instance?.loadAddon(attach.current);
			};
			socket.onclose = console.error;
			socket.onerror = console.error;
		}
		if (instance && ref) {
			return createTerminal();
		}
	}, [instance, ref]);

	return draftWorker?.devtoolsUrl ? (
		<Frame
			style={isPaneDragging ? { pointerEvents: "none" } : {}}
			src={getDevtoolsIframeUrl(draftWorker.devtoolsUrl)}
			sandbox="allow-scripts allow-same-origin"
		/>
	) : (
		<Div height="100%" backgroundColor="#101420" pt={2} pl={2} pb={2}>
			<div ref={ref} style={{ width: "100%", height: "100%" }} />
		</Div>
	);
}
const DevtoolsIframeWithErrorHandling: React.FC = () => (
	<FrameErrorBoundary
		fallback={"Failed to load DevTools. Please reload the page."}
	>
		<DevtoolsIframe />
	</FrameErrorBoundary>
);

export default DevtoolsIframeWithErrorHandling;
