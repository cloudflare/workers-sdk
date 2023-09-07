import { useContext, useMemo } from "react";
import { Div } from "@cloudflare/elements";
import { useInjectSources } from "./useInjectSources";
import UrlBar from "./UrlBar";
import { ServiceContext } from "../QuickEditor";
import FrameErrorBoundary, { FrameError } from "../FrameErrorBoundary";
import { useRefreshableIframe } from "./useRefreshableIframe";

export function getPreviewIframeUrl(edgePreview: string, previewUrl: string) {
	const url = new URL(edgePreview);
	url.searchParams.set("suffix", previewUrl);
	return url.href;
}

function PreviewTab() {
	const draftWorker = useContext(ServiceContext);

	const previewSrc = useMemo(() => {
		if (draftWorker?.previewHash !== undefined) {
			return getPreviewIframeUrl(
				draftWorker.previewHash.previewUrl,
				draftWorker?.previewUrl ?? ""
			);
		}
	}, [draftWorker?.previewHash, draftWorker?.previewUrl]);

	const onLoad = useInjectSources(
		draftWorker.service?.entrypoint,
		draftWorker.service?.modules
	);

	const { isLoading, frame, refresh } = useRefreshableIframe(
		previewSrc,
		onLoad
	);

	return (
		<Div display="flex" flexDirection="column" width="100%">
			<UrlBar
				onSubmit={(url) => {
					if (url === draftWorker?.previewUrl) {
						refresh();
					} else {
						draftWorker.setPreviewUrl(url);
					}
				}}
				loading={isLoading}
			/>
			<Div
				flex="1"
				position="relative"
				borderTop="1px solid"
				borderColor="gray.7"
			>
				{draftWorker?.previewError ? (
					<FrameError>{draftWorker.previewError}</FrameError>
				) : (
					frame
				)}
			</Div>
		</Div>
	);
}

export default () => (
	<FrameErrorBoundary fallback={"Invalid URL"}>
		<PreviewTab />
	</FrameErrorBoundary>
);
