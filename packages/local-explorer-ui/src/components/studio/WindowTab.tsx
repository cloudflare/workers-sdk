import { cn } from "@cloudflare/kumo";
import { CircleIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
} from "react";
import type { Icon } from "@phosphor-icons/react";

export interface StudioWindowTabItem {
	key: string;
	identifier: string;
	title: React.ReactNode;
	component: JSX.Element;
	icon: Icon;
	type?: string;
	isDirty?: boolean;
	isTemp?: boolean;
}

export interface StudioWindowTabProps {
	tabs: StudioWindowTabItem[];
	/** The key of the currently selected (active) tab */
	selectedTabKey?: string;
	/**
	 * Called when the tab list changes — either due to closing a tab
	 * or reordering tabs via drag-and-drop.
	 */
	onTabsChange?: React.Dispatch<React.SetStateAction<StudioWindowTabItem[]>>;
	/** Called when a different tab is selected by the user.*/
	onSelectedTabChange: (newSelectedKey: string) => void;

	onNewClicked?: () => void;
	onDoubleClick?: (tab: StudioWindowTabItem) => void;
}

type BeforeTabClosingHandler = (tab: StudioWindowTabItem) => boolean;

/**
 * A window tab component that allows users to switch between tabs without unmounting,
 * preserving each tab’s interactive state. Supports tab closing and drag-to-reorder functionality.
 */
export function StudioWindowTab({
	tabs,
	onTabsChange,
	selectedTabKey,
	onSelectedTabChange,
	onNewClicked,
	onDoubleClick,
}: StudioWindowTabProps) {
	const beforeClosingHandlersRef = useRef(
		new Map<string, BeforeTabClosingHandler>()
	);

	return (
		<div className="w-full h-full flex flex-col">
			<div className="relative shrink-0 grow-0 overflow-x-auto bg-neutral-100 dark:bg-neutral-900 flex">
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
							key={tab.key}
							tab={tab}
							index={tabIndex}
							selected={tab.key === selectedTabKey}
							onClick={() => onSelectedTabChange(tab.key)}
							onClose={onTabsChange ? handleTabClose : undefined}
							onDoubleClick={() => {
								onDoubleClick?.(tab);
							}}
						/>
					);
				})}
				{onNewClicked && <StudioWindowTabMenu onClick={onNewClicked} />}
				<div
					style={{ height: 40 }}
					className="border-neutral-200 dark:border-neutral-800 border-b grow"
				></div>
			</div>
			<div className="relative grow">
				{tabs.map((tab) => (
					<StudioTabContentWrapper
						key={tab.key}
						tab={tab}
						selectedTabKey={selectedTabKey}
						onTabsChange={onTabsChange}
						beforeClosingHandlersRef={beforeClosingHandlersRef}
					/>
				))}
			</div>
		</div>
	);
}

// Provide per-tab context (dirty state, close handler) to the tab content.
// Only render the content if the tab is selected.
function StudioTabContentWrapper({
	tab,
	selectedTabKey,
	onTabsChange,
	beforeClosingHandlersRef,
}: {
	tab: StudioWindowTabItem;
	selectedTabKey?: string;
	onTabsChange?: React.Dispatch<React.SetStateAction<StudioWindowTabItem[]>>;
	beforeClosingHandlersRef: React.MutableRefObject<
		Map<string, BeforeTabClosingHandler>
	>;
}) {
	const tabKey = tab.key;

	const setBeforeTabClosingHandler = useCallback(
		(handler: BeforeTabClosingHandler) => {
			beforeClosingHandlersRef.current.set(tabKey, handler);
		},
		[beforeClosingHandlersRef, tabKey]
	);

	// Update the dirty state for this tab, only if it changes.
	const setDirtyState = useCallback(
		(newDirtyState) => {
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
				setDirtyState,
				setBeforeTabClosingHandler,
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

function StudioWindowTabMenu({ onClick }: { onClick: () => void }) {
	const className = useMemo(() => {
		return cn(
			"flex gap-2 relative px-2", // display style
			"bg-neutral-100 dark:bg-neutral-900", // background color
			"border-b border-neutral-200 dark:border-neutral-800", // border style
			"items-center text-left text-xs text-neutral-500" // text style
		);
	}, []);

	return (
		<div
			className={className}
			onClick={onClick}
			style={{ position: "sticky", right: 0 }}
		>
			<div className="flex px-2 py-1.5 items-center gap-2 cursor-pointer hover:text-black dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors rounded-md">
				<PlusIcon /> New
			</div>
		</div>
	);
}

function StudioWindowTabItemRenderer({
	tab,
	selected,
	onClick,
	onClose,
	onDoubleClick,
}: {
	tab: StudioWindowTabItem;
	selected?: boolean;
	index: number;
	onClick: () => void;
	onClose?: () => void;
	onDoubleClick?: () => void;
}) {
	const isDirty = tab.isDirty;
	const isTemp = tab.isTemp;
	const [isHovered, setIsHovered] = useState(false);
	const [isCloseHovered, setIsCloseHovered] = useState(false);

	const className = useMemo(() => {
		return cn(
			"flex gap-2 relative px-2", // display style
			"border-b border-r border-neutral-200 dark:border-neutral-800", // border style
			"items-center text-left text-xs ", // text style
			"cursor-pointer hover:text-black dark:hover:text-white", // hover style
			"select-none",
			selected
				? "border-b-transparent! bg-white dark:bg-black"
				: "bg-neutral-100 dark:bg-neutral-900 text-neutral-500", // selected style
			isTemp && "italic",
			isDirty && "not-italic"
		);
	}, [isDirty, selected, isTemp]);

	const shouldShowDirtyIcon = !isCloseHovered && isDirty;
	const shouldShowCloseIcon = !shouldShowDirtyIcon && (selected || isHovered);

	return (
		<div
			style={{
				maxWidth: 300,
				minWidth: 170,
				height: 40,
			}}
			onMouseLeave={() => setIsHovered(false)}
			onMouseEnter={() => setIsHovered(true)}
			className={className}
			onClick={onClick}
			onDoubleClick={onDoubleClick}
		>
			<tab.icon className="w-4 h-4" />
			<div className={cn("line-clamp-1 grow")}>{tab.title}</div>
			{onClose && (
				<div
					className={cn(
						"ml-2 flex h-5 w-5 items-center justify-center rounded hover:bg-accent"
					)}
					onMouseLeave={() => setIsCloseHovered(false)}
					onMouseEnter={() => setIsCloseHovered(true)}
					onClick={(e) => {
						e.stopPropagation();
						onClose?.();
					}}
				>
					{shouldShowCloseIcon && (
						<XIcon className={"h-3 w-3 shrink-0 grow-0"} />
					)}
					{shouldShowDirtyIcon && (
						<CircleIcon
							weight="fill"
							className={"h-3 w-3 shrink-0 grow-0 text-muted"}
						/>
					)}
				</div>
			)}
		</div>
	);
}

const StudioCurrentWindowTabContext = createContext<
	| {
			identifier: string;
			isTabActive: boolean;
			setDirtyState: (dirtyState: boolean) => void;
			setBeforeTabClosingHandler: (handler: BeforeTabClosingHandler) => void;
	  }
	| undefined
>(undefined);

export function useStudioCurrentWindowTab() {
	const context = useContext(StudioCurrentWindowTabContext);
	if (!context) {
		throw new Error("Cannot useStudioCurrentWindowTab outside StudioWindowTab");
	}

	return context;
}
