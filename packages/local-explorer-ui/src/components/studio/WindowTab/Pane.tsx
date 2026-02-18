import { useCallback } from "react";
import { useStudioContext } from "../Context";
import { StudioWindowTab } from ".";
import type { StudioWindowTabItem } from "./types";

export function StudioWindowTabPane(): JSX.Element {
	const {
		handleUserTabChange,
		openStudioTab,
		selectedTabKey,
		setStudioTabs,
		tabs,
		updateStudioTabStatus,
	} = useStudioContext();

	const onNewQuery = useCallback(() => {
		openStudioTab({
			id: window.crypto.randomUUID(),
			type: "query",
		});
	}, [openStudioTab]);

	const onDoubleClick = useCallback(
		(tab: StudioWindowTabItem) => {
			updateStudioTabStatus(tab.identifier, {
				isTemp: false,
			});
		},
		[updateStudioTabStatus]
	);

	return (
		<StudioWindowTab
			onDoubleClick={onDoubleClick}
			onNewClicked={onNewQuery}
			onSelectedTabChange={handleUserTabChange}
			onTabsChange={setStudioTabs}
			selectedTabKey={selectedTabKey}
			tabs={tabs}
		/>
	);
}
