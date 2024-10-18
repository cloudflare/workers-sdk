import { DragContext, Frame } from "@cloudflare/workers-editor-shared";
import { useContext } from "react";
import FrameErrorBoundary from "./FrameErrorBoundary";
import { ServiceContext } from "./QuickEditor";
import type React from "react";

function getDevtoolsIframeUrl(inspectorUrl: string) {
	const url = new URL(`https://devtools.devprod.cloudflare.dev/js_app`);
	url.searchParams.set("wss", inspectorUrl.slice(5));

	url.searchParams.set("theme", "systemPreferred");
	url.searchParams.set("domain", "workers playground");
	return url.toString();
}

export function DevtoolsIframe() {
	const draftWorker = useContext(ServiceContext);
	const isPaneDragging = useContext(DragContext);

	return draftWorker?.devtoolsUrl ? (
		<Frame
			style={isPaneDragging ? { pointerEvents: "none" } : {}}
			src={getDevtoolsIframeUrl(draftWorker.devtoolsUrl)}
			sandbox="allow-scripts allow-same-origin"
		/>
	) : null;
}
const DevtoolsIframeWithErrorHandling: React.FC = () => (
	<FrameErrorBoundary
		fallback={"Failed to load DevTools. Please reload the page."}
	>
		<DevtoolsIframe />
	</FrameErrorBoundary>
);

export default DevtoolsIframeWithErrorHandling;
