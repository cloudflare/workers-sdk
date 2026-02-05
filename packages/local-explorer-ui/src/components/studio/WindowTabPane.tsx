import { useCallback } from "react";
import { useStudioContext } from "./Context";
import { StudioWindowTab } from "./WindowTab";
import type { StudioWindowTabItem } from "./WindowTab";

export function StudioWindowTabPane() {
	const {
		tabs,
		openStudioTab,
		selectedTabKey,
		setSelectedTabKey,
		setStudioTabs,
		updateStudioTabStatus,
	} = useStudioContext();

	const onNewQuery = useCallback(() => {
		openStudioTab({ type: "query", id: window.crypto.randomUUID() });
	}, [openStudioTab]);

	const onDoubleClick = useCallback(
		(tab: StudioWindowTabItem) => {
			updateStudioTabStatus(tab.identifier, { isTemp: false });
		},
		[updateStudioTabStatus]
	);

	return (
		<StudioWindowTab
			tabs={tabs}
			selectedTabKey={selectedTabKey}
			onTabsChange={setStudioTabs}
			onSelectedTabChange={setSelectedTabKey}
			onNewClicked={onNewQuery}
			onDoubleClick={onDoubleClick}
		/>
	);
}
