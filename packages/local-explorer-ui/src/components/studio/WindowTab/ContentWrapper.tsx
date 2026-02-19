import { cn } from "@cloudflare/kumo";
import { useCallback } from "react";
import { StudioCurrentWindowTabContext } from "./Context";
import type { BeforeTabClosingHandler, StudioWindowTabItem } from "./types";

interface StudioTabContentWrapperProps {
	beforeClosingHandlersRef: React.RefObject<
		Map<string, BeforeTabClosingHandler>
	>;
	onTabsChange?: React.Dispatch<React.SetStateAction<StudioWindowTabItem[]>>;
	selectedTabKey?: string;
	tab: StudioWindowTabItem;
}

// Provide per-tab context (dirty state, close handler) to the tab content.
// Only render the content if the tab is selected.
export function StudioTabContentWrapper({
	beforeClosingHandlersRef,
	onTabsChange,
	selectedTabKey,
	tab,
}: StudioTabContentWrapperProps): JSX.Element {
	const tabKey = tab.key;

	/**
	 * Registers a {@link BeforeTabClosingHandler} callback for this tab.
	 */
	const setBeforeTabClosingHandler = useCallback(
		(handler: BeforeTabClosingHandler): void => {
			beforeClosingHandlersRef.current.set(tabKey, handler);
		},
		[beforeClosingHandlersRef, tabKey]
	);

	/**
	 * Update the dirty state for this tab, only if it changes.
	 */
	const setDirtyState = useCallback(
		(newDirtyState: boolean): void => {
			if (!onTabsChange) {
				return;
			}

			const prevDirtyState = !!tab.isDirty; // Convert it to boolean
			if (newDirtyState !== prevDirtyState) {
				onTabsChange((prevTabs) => {
					return prevTabs.map((prevTab) => {
						if (prevTab.key !== tab.key) {
							return prevTab;
						}

						return {
							...prevTab,
							isDirty: newDirtyState,
						};
					});
				});
			}
		},
		[tab, onTabsChange]
	);

	return (
		<StudioCurrentWindowTabContext.Provider
			value={{
				identifier: tab.identifier,
				isTabActive: tab.key === selectedTabKey,
				setBeforeTabClosingHandler,
				setDirtyState,
			}}
		>
			<div
				className={cn("absolute bottom-0 top-0 right-0 left-0", {
					invisible: tab.key !== selectedTabKey,
				})}
			>
				{tab.component}
			</div>
		</StudioCurrentWindowTabContext.Provider>
	);
}
