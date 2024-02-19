import { Loading } from "@cloudflare/component-loading";
import { Div } from "@cloudflare/elements";
import { theme } from "@cloudflare/style-const";
import { useContext, useMemo } from "react";
import FrameErrorBoundary, { FrameError } from "../FrameErrorBoundary";
import { ServiceContext } from "../QuickEditor";
import UrlBar from "./UrlBar";
import { useInjectSources } from "./useInjectSources";
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

	const { isLoading, frame, refresh, firstLoad } = useRefreshableIframe(
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
			{!firstLoad && !draftWorker?.previewError && (
				<Div
					zIndex={1000}
					p={2}
					position="relative"
					height="100%"
					display="flex"
					gap={2}
					backgroundColor="white"
					justifyContent={"center"}
					alignItems={"center"}
				>
					<Loading size="4x" />
				</Div>
			)}
			<Div
				flex="1"
				position="relative"
				borderTop="1px solid"
				borderColor="gray.7"
			>
				{draftWorker?.previewError && (
					<>
						<Div
							zIndex={100}
							position="absolute"
							height="100%"
							width="100%"
							backgroundColor={theme.colors.white}
							opacity={0.4}
						></Div>
						<FrameError>{draftWorker.previewError}</FrameError>
					</>
				)}

				{frame}
			</Div>
		</Div>
	);
}

export default () => (
	<FrameErrorBoundary fallback={"Invalid URL"}>
		<PreviewTab />
	</FrameErrorBoundary>
);
