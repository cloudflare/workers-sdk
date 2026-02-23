import { useRef } from "react";
import { StudioTabContentWrapper } from "./ContentWrapper";
import { StudioWindowTabItemRenderer } from "./ItemRenderer";
import { StudioWindowTabMenu } from "./MenuProps";
import type { BeforeTabClosingHandler, StudioWindowTabItem } from "./types";

export interface StudioWindowTabProps {
	onDoubleClick?: (tab: StudioWindowTabItem) => void;
	onNewClicked?: () => void;
	/**
	 * Called when a different tab is selected by the user.
	 */
	onSelectedTabChange: (newSelectedKey: string) => void;
	/**
	 * Called when the tab list changes — either due to closing a tab or reordering tabs via drag-and-drop.
	 */
	onTabsChange?: React.Dispatch<React.SetStateAction<StudioWindowTabItem[]>>;
	/**
	 * The key of the currently selected (active) tab.
	 */
	selectedTabKey?: string;
	tabs: StudioWindowTabItem[];
}

/**
 * A window tab component that allows users to switch between tabs without unmounting,
 * preserving each tab’s interactive state. Supports tab closing and drag-to-reorder functionality.
 */
export function StudioWindowTab({
	onDoubleClick,
	onNewClicked,
	onSelectedTabChange,
	onTabsChange,
	selectedTabKey,
	tabs,
}: StudioWindowTabProps): JSX.Element {
	const beforeClosingHandlersRef = useRef(
		new Map<string, BeforeTabClosingHandler>()
	);

	return (
		<div className="w-full h-full flex flex-col">
			<div className="relative shrink-0 grow-0 overflow-x-auto bg-surface-secondary flex">
				{tabs.map((tab, tabIndex) => {
					// Handles tab closure. If the closed tab is the currently active one,
					// automatically select the nearest remaining tab to preserve continuity.
					const handleTabClose = () => {
						if (!onTabsChange) {
							return;
						}

						// Run any registered "before close" handler (e.g., unsaved changes check)
						const beforeClosingHandler = beforeClosingHandlersRef.current.get(
							tab.key
						);
						if (beforeClosingHandler) {
							const canClose = beforeClosingHandler(tab);
							if (!canClose) {
								return;
							}
						}

						// Clean up the handler since the tab is being removed
						beforeClosingHandlersRef.current.delete(tab.key);

						const foundIndex = tabs.findIndex((t) => t.key === tab.key);
						const newTabs = tabs.filter((t) => t.key !== tab.key);

						onTabsChange(newTabs);

						if (selectedTabKey === tab.key && newTabs.length > 0) {
							const newSelectedIndex = Math.min(newTabs.length - 1, foundIndex);
							const newSelectedTab = newTabs[newSelectedIndex];
							if (newSelectedTab) {
								onSelectedTabChange(newSelectedTab.key);
							}
						}
					};

					return (
						<StudioWindowTabItemRenderer
							index={tabIndex}
							key={tab.key}
							onClick={() => onSelectedTabChange(tab.key)}
							onClose={onTabsChange ? handleTabClose : undefined}
							onDoubleClick={(): void => {
								onDoubleClick?.(tab);
							}}
							selected={tab.key === selectedTabKey}
							tab={tab}
						/>
					);
				})}

				{onNewClicked && <StudioWindowTabMenu onClick={onNewClicked} />}

				<div className="border-border border-b grow h-10" />
			</div>

			<div className="relative grow">
				{tabs.map((tab) => (
					<StudioTabContentWrapper
						beforeClosingHandlersRef={beforeClosingHandlersRef}
						key={tab.key}
						onTabsChange={onTabsChange}
						selectedTabKey={selectedTabKey}
						tab={tab}
					/>
				))}
			</div>
		</div>
	);
}
