import React, { createContext, useEffect } from "react";
import { Div } from "@cloudflare/elements";
import { useDraftWorker } from "./useDraftWorker";

import EditorPane from "./EditorPane";
import SplitPane from "./SplitPane";
import ToolsPane from "./ToolsPane";
import { TopBar } from "./TopBar";
import { BACKGROUND_GRAY } from "./constants";
import { theme } from "@cloudflare/style-const";
import { createComponent } from "@cloudflare/style-container";

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
	const workerHash = window.location.hash.slice(1);

	const [previewUrl, setPreviewUrl] = React.useState<string>(`/`);

	const [initialWorkerContentHash, setInitialHash] = React.useState(workerHash);

	useEffect(() => {
		if (initialWorkerContentHash === "") {
			setInitialHash(
				"LYVwNgLglgDghgJwgegGYHsHALQBM4RwDcABAEbogB2+CAngLzbMutvvsDMAbAOwCcAFgAc-AIyCADACZO0-pP6dJvYYLHDuAVkkbe3AFwdjJtjwEjxU2fMXLV6zTr3cAsACgAwuioQApr7YACJQAM4w6KFQ0D4GJBhYeATEJFRwwH4MAERQNH4AHgB0AFahWaSoUGAB6Zk5eUWlWR7evgEQ2AAqdDB+cXAwMGBQAMYEUD7IxXAAbnChIwiwEADUwOi44H4eHlDAEUgkAO5+YCPoGfEIFyRZJ2cXfoUAFhDAYFnu7sgAVD-uJB+JAAAhAen5cH5UCQAN4AeTIxT8IwgAF8SABRKgzEjuH7IL4FA4QEiQ1BwcAkmEAki037-WmMoHA+AIdKwgBKfgAjiA-KE0SQEDy+QLcYzaczWeyYViZuiAjMaUyQdLgLCMflkSAYlRWv58oKUfllZKQcKICAEFRQpz+REbX5UabAQSJag-BARs8ABTC3n8iAAGhIipDxoAlLCXYzzjb0NVCmB0ABzH1ZAASp2TJE8yZAuFQYEQfhIAHVMABrPwIUIAQiyUYljJjtNbQs9VqoqT8RxIXPCPlCfh993OGRD1Ob05Izz8cEhtbiU5nq6ycf8gTBvSycSyBpQr3en1XEudq9REdNzudHlM9+M5iEogkMjkCiUKjUGm0umE+haHxNw6EJByiXU4gSHB8EIUg0gybIx0eF43g+CoqhqBC7lOccniPD5ALaQJul6OID2QIY4FyHZ3AAHjrII4U8ToAE0AAUMVnVCAD46PwkhiyoFNsgCLJeL4+dcF4iVaIyQgSG9RBhwgbIAFVOgAMWwYQxNNWTPTgLiIBgbARSgGZsgADWwVSAEFsG8fZxjIaosgUoD2myABJDEGAhFM-F0mS5MM+C6hmKBe2JNyN08u4oFwCBngYSEIpGPxsCOBKkpDXJoigOAwGwBZCsyMRCkkILGVo6AIGqbi80oQti2FcsqxrW02OLOgU2uahcFo5BavqvThioSsOzAbIBToapQjnT03OeYVUGyV5jNCAxkGQJCMkKVKYGuXBChGfNmpLfa-BmZAZsTEZQjKXjBrnBdxNoihcDoaTqtwcyFOLB7shGKAEBGEBoke9taL2FMSFCUG1ogDatp2nDkIOo6TrOosLtS5BgdB8GIFCQpQhmFM3OQb7aUG36ZmpkhZKoqgGZkmG4YRrJ1pgTbtt2p4MY2LGmpx4VLuu5MU3QUnyZigHQmySX0Ep1nqpgbiyzRjI6xIVThxIJKwhILq4B6vqaAN9ADcDUklhmUtDIrBBqwQcNhQIB3ST8dZLbh54SxIHwxr8EM4Ato4527d3Pq9oZ0DodsJV+4UUTAOhfaS0t-NLMh0+U6AhJIEAYBIQzGoLUWHZGc5qAgQpBvVqHnjEDX-ZJI3HfahAAH5npbqH1ds3NsZa0snZdkgjYAKVmOAAGVFmWdzIRIOhKGOJZ-ANtvZzD3A5tXygEGOPwyDh6I-AAcltDNOk6NiDbZVBKhGUkQeROr09yRPGXL87hWvqGXAAUBLoDGLqW0iBKAW0zscTAYBcChzAMmLKhc14gF9smcBpZzgr1OpEUsEArboOPgEXARdhy1knt2TAi4f60iIR2QcMCraZ3VOsVqvJRiVjTg3VWNNm7cU6PQSeJISHDjAKgPu-DGbqzhN2EhAkoTt0gXDdIQwx5d23gQSetoEDUCoLkWGPht5G3Ak8EgLF15jG7BCaIoiBLmQdhbYchC5xMMpLaOcYt6GYl+iSWB8AkqlwoPbX2yABhQF9q42c6A+ywIKOo6obVnY1l3jQA+v1n41naEKSg-gSaWOsWHUuYBQhWzsQEucvjcGEKtjEiOBBAERAelAFyzjyFkCWGgo+PZDST0hIZRhwwPT1wogzQawBmZPWQB9L6Xxno8TvA+FZLAnyWFfDYD89hvxOD-ABLwHlAigRaflWI8RMDQWSHBWo2QQowTgOUeIGEwrZBcugMgzRDlEQ6CRPopdBjDHARMKgUxylUBojCLIUzcgAH11ibFcgYeokJGhlFRMs1ZKz1kvmsO+OwX5HC-hcMwDwQA"
			);
		}
	}, [initialWorkerContentHash]);

	function updateWorkerHash(hash: string) {
		history.replaceState(null, "", hash);
	}

	const draftWorker = useDraftWorker(
		initialWorkerContentHash,
		updateWorkerHash
	);

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
						paneStyle={{ backgroundColor: theme.colors.background }}
					>
						<EditorPane />
						<ToolsPane />
					</SplitPane>
				</Div>
			</ServiceContext.Provider>
		</FullScreenLayout>
	);
}
