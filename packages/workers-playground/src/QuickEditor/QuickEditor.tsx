import { Div } from "@cloudflare/elements";
import {
	isDarkMode,
	observeDarkMode,
	theme as styleTheme,
} from "@cloudflare/style-const";
import { createComponent } from "@cloudflare/style-container";
import { BACKGROUND_GRAY, SplitPane } from "@cloudflare/workers-editor-shared";
import React, { createContext, useEffect, useState } from "react";
import defaultHashes from "./defaultHashes";
import EditorPane from "./EditorPane";
import ToolsPane from "./ToolsPane";
import { TopBar } from "./TopBar";
import { compressTextWorker, useDraftWorker } from "./useDraftWorker";

type DraftWorkerWithPreviewUrl = ReturnType<typeof useDraftWorker> & {
	previewUrl: string;
	setPreviewUrl: React.Dispatch<React.SetStateAction<string>>;
};

export const ServiceContext = createContext<DraftWorkerWithPreviewUrl>(
	// QuickEditor is lazy loaded, & useDraftWorker() will be available in local component state
	{} as DraftWorkerWithPreviewUrl
);

function FullScreenLayout({ children }: { children: React.ReactNode }) {
	return (
		<Div
			display="flex"
			flexDirection="column"
			position="fixed"
			top={0}
			right={0}
			bottom={0}
			left={0}
		>
			{children}
		</Div>
	);
}

const BrandDiv = createComponent(({ theme }) => ({
	height: theme.space[1],
	background: `linear-gradient(180deg, #F63 17.19%, #F6821F 66.67%)`,
}));

export default function QuickEditor() {
	const [_, setDarkMode] = useState(isDarkMode());
	useEffect(() => {
		observeDarkMode(() => setDarkMode(isDarkMode()));
	}, []);

	const [previewUrl, setPreviewUrl] = React.useState(`/`);

	const [initialWorkerContentHash, setInitialHash] = React.useState(
		window.location.hash.slice(1)
	);

	const draftWorker = useDraftWorker(initialWorkerContentHash);

	useEffect(() => {
		function updateWorkerHash(hash: string) {
			history.replaceState(null, "", hash);
		}

		const hash = draftWorker.previewHash?.serialised;

		if (hash) {
			updateWorkerHash(`/playground#${hash}`);
		}
	}, [draftWorker.previewHash?.serialised]);

	useEffect(() => {
		if (initialWorkerContentHash === "") {
			const suffix = location.pathname.slice("/playground".length);

			const workerDefinition =
				suffix in defaultHashes
					? defaultHashes[suffix as keyof typeof defaultHashes]
					: defaultHashes["/"];

			const today = new Date();
			const year = String(today.getUTCFullYear());
			const month = String(today.getUTCMonth() + 1).padStart(2, "0");
			const date = String(today.getUTCDate()).padStart(2, "0");

			workerDefinition.worker = workerDefinition.worker.replace(
				"$REPLACE_COMPAT_DATE",
				`${year}-${month}-${date}`
			);

			void compressTextWorker(
				workerDefinition.contentType,
				workerDefinition.worker
			).then(setInitialHash);
		}
	}, [initialWorkerContentHash]);

	return (
		<FullScreenLayout>
			<BrandDiv />

			<ServiceContext.Provider
				value={{
					...draftWorker,
					previewUrl,
					setPreviewUrl,
				}}
			>
				<TopBar />
				<Div position="relative" flex="1">
					<SplitPane
						split="vertical"
						defaultSize="60%"
						minSize={50}
						maxSize={-50}
						style={{ backgroundColor: BACKGROUND_GRAY }}
						paneStyle={{ backgroundColor: styleTheme.colors.background }}
					>
						<EditorPane />
						<ToolsPane />
					</SplitPane>
				</Div>
			</ServiceContext.Provider>
		</FullScreenLayout>
	);
}
