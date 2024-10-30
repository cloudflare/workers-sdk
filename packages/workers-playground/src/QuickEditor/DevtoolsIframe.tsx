import { DragContext, Frame } from "@cloudflare/workers-editor-shared";
import { useContext } from "react";
import FrameErrorBoundary from "./FrameErrorBoundary";
import { ServiceContext } from "./QuickEditor";
import type React from "react";

// This URL is hard-coded to ensure specific versions of playground use specific versions of cloudflare-devtools -- enabling rollbacks to work as expected
// Change the hash subdomain to a specific deployment from https://dash.cloudflare.com/e35fd947284363a46fd7061634477114/pages/view/cloudflare-devtools
const devtoolsHost = "https://3e6204c5.devtools.devprod.cloudflare.dev";

function getDevtoolsIframeUrl(inspectorUrl: string) {
	const url = new URL(`${devtoolsHost}/js_app`);
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
