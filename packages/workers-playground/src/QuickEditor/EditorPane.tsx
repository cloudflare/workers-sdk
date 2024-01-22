import { Div } from "@cloudflare/elements";
import { useContext } from "react";
import FrameErrorBoundary from "./FrameErrorBoundary";
import { ServiceContext } from "./QuickEditor";
import { VSCodeEditor } from "./VSCodeEditor";

export default function EditorPane() {
	const draftWorker = useContext(ServiceContext);
	return (
		<Div display="grid" gridTemplateRows={`1fr`} height="100%">
			<FrameErrorBoundary
				fallback={"Failed to load the code editor. Please reload the page."}
			>
				<VSCodeEditor
					content={
						draftWorker?.service
							? {
									name: "workers-playground",
									entrypoint: draftWorker?.service?.entrypoint,
									files: draftWorker?.service?.modules,
							  }
							: undefined
					}
					onChange={({ entrypoint, files }) =>
						draftWorker.preview({ entrypoint, modules: files })
					}
				/>
			</FrameErrorBoundary>
		</Div>
	);
}
