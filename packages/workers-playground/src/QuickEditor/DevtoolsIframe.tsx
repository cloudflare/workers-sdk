import React, { useContext } from "react";

import { ServiceContext } from "./QuickEditor";
import Frame from "./Frame";
import FrameErrorBoundary from "./FrameErrorBoundary";

function getDevtoolsIframeUrl(inspectorUrl: string) {
	const url = new URL(`https://devtools.devprod.cloudflare.dev/js_app`);
	url.searchParams.set("wss", inspectorUrl.slice(5));

	url.searchParams.set("theme", "systemPreferred");
	url.searchParams.set("domain", "workers playground");
	return url.toString();
}

export function DevtoolsIframe() {
	const draftWorker = useContext(ServiceContext);

	return draftWorker?.devtoolsUrl ? (
		<Frame
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
