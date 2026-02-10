import { BinocularsIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ModalProvider } from "../../utils/studio/stubs/modal";
import SplitPane from "../../utils/studio/stubs/SplitPane";
import { useLeaveGuard } from "../../utils/studio/stubs/useLeaveGuard";
import { StudioContextProvider } from "./Context";
import { StudioContextMenuProvider } from "./ContextMenu";
import { StudioQueryTab } from "./QueryTab";
import { StudioSidebarPane } from "./SidebarPane";
import { StudioTabDefinitionList } from "./tab-register";
import { StudioWindowTabPane } from "./WindowTabPane";
import type {
	IStudioDriver,
	StudioResource,
	StudioSchemas,
} from "../../types/studio";
import type { StudioContextValue } from "./Context";
import type { StudioTabDefinitionMetadata } from "./tab-register";
import type { StudioWindowTabItem } from "./WindowTab";

/** Default schema name for SQLite/D1 databases */
const DEFAULT_SCHEMA_NAME = "main";

interface StudioProps {
	category?: string;
	driver: IStudioDriver;
	/** Table name to open initially (assumes 'main' schema) */
	initialTable?: string;
	/** Callback when the active table changes (for URL sync) */
	onTableChange?: (tableName: string | null) => void;
	resource: StudioResource;
}

export function Studio({
	// category,
	driver,
	initialTable,
	onTableChange,
	resource,
}: StudioProps) {
	// Track whether we've already opened the initial table
	const hasOpenedInitialTable = useRef(false);
	const [schemas, setSchemas] = useState<StudioSchemas>();
	const [loadingSchema, setLoadingSchema] = useState(true);
	const [tabs, setTabs] = useState<StudioWindowTabItem[]>(() => {
		return [
			{
				component: <StudioQueryTab />,
				icon: BinocularsIcon,
				identifier: "query-1",
				key: window.crypto.randomUUID(),
				title: "Query",
				type: "query",
			},
		];
	});

	// Automatically select the first tab
	const [selectedTabKey, setSelectedTabKey] = useState(
		() => tabs[0]?.key ?? ""
	);

	const refreshSchema = useCallback(() => {
		setLoadingSchema(true);

		driver
			.schemas()
			.then(setSchemas)
			.catch(console.error)
			.finally(() => {
				setLoadingSchema(false);
			});
	}, [driver]);

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect -- Triggers async schema fetch on mount; setState occurs inside async .then(), not synchronously
		refreshSchema();
	}, [refreshSchema]);

	// Utility to close a tab given its identifier
	const closeStudioTab = useCallback(
		(tabIdentifier: string) => {
			setTabs((previousTabs) => {
				// Find the index of the tab matching the identifier
				const matchedTabIndex = previousTabs.findIndex(
					(tab) => tab.identifier === tabIdentifier
				);

				const matchedTab = previousTabs[matchedTabIndex];
				if (!matchedTab) {
					return previousTabs;
				}

				// Remove the matched tab from the list
				const filteredTabs = previousTabs.filter((tab) => tab !== matchedTab);

				// If the closed tab was the selected one, update selection
				if (selectedTabKey === matchedTab.key && filteredTabs.length > 0) {
					const newSelectedIndex = Math.min(
						filteredTabs.length - 1,
						matchedTabIndex
					);

					const newSelectedTab = filteredTabs[newSelectedIndex];
					if (newSelectedTab) {
						setSelectedTabKey(newSelectedTab.key);
					}
				}

				return filteredTabs;
			});
		},
		[selectedTabKey]
	);

	// Utility to close a tab given tabs
	const openStudioTab = useCallback<StudioContextValue["openStudioTab"]>(
		(data: StudioTabDefinitionMetadata, isTemporary?: boolean) => {
			setTabs((prevTabs) => {
				// Getting tab setting
				const tabTypeDefinition = StudioTabDefinitionList[data.type];

				if (!tabTypeDefinition) {
					console.error("Trying to open unknown tab type", data);
					return prevTabs;
				}

				const identifier = tabTypeDefinition.makeIdentifier(data);

				const foundMatchedTab = prevTabs.find(
					(tab) => tab.identifier === identifier
				);

				// Open existing tab if exist
				if (foundMatchedTab) {
					setSelectedTabKey(foundMatchedTab.key);
					return prevTabs;
				}

				const newTabKey = window.crypto.randomUUID();
				setSelectedTabKey(newTabKey);

				// Check if there is any temporary, we will replace instead of adding new tab
				const tempTab = prevTabs.find((tab) => tab.isTemp && !tab.isDirty);

				if (tempTab) {
					return prevTabs.map((tab) => {
						if (tab === tempTab) {
							return {
								...tab,
								key: newTabKey,
								identifier,
								component: tabTypeDefinition.makeComponent(data),
								icon: tabTypeDefinition.icon,
								title: tabTypeDefinition.makeTitle(data),
								isTemp: isTemporary,
							} as StudioWindowTabItem;
						}
						return tab;
					});
				}

				return [
					...prevTabs,
					{
						key: newTabKey,
						identifier,
						component: tabTypeDefinition.makeComponent(data),
						icon: tabTypeDefinition.icon,
						title: tabTypeDefinition.makeTitle(data),
						isTemp: isTemporary,
					} as StudioWindowTabItem,
				];
			});
		},
		[setSelectedTabKey]
	);

	const updateStudioTabStatus = useCallback<
		StudioContextValue["updateStudioTabStatus"]
	>((identifierParam, status) => {
		setTabs((prev) => {
			const identifier =
				typeof identifierParam === "string"
					? identifierParam
					: StudioTabDefinitionList[identifierParam.type]?.makeIdentifier(
							identifierParam
						);

			if (!identifier) {
				console.error("Unable to resolve tab identifier", identifierParam);
				return prev;
			}

			return prev.map((tab) =>
				tab.identifier === identifier ? { ...tab, ...status } : tab
			);
		});
	}, []);

	// Open initial table from URL param after schemas load (only once)
	useEffect(() => {
		if (
			hasOpenedInitialTable.current ||
			!initialTable ||
			!schemas ||
			loadingSchema
		) {
			return;
		}

		// Check if the table exists in the main schema
		const mainSchema = schemas[DEFAULT_SCHEMA_NAME];
		const tableExists = mainSchema?.some(
			(item) => item.type === "table" && item.name === initialTable
		);

		if (tableExists) {
			// eslint-disable-next-line react-hooks/set-state-in-effect -- One-time initialization to open initial table tab from URL params
			openStudioTab({
				schemaName: DEFAULT_SCHEMA_NAME,
				tableName: initialTable,
				type: "table",
			});
			hasOpenedInitialTable.current = true;
		} else {
			console.warn(
				`Table "${initialTable}" not found in schema "${DEFAULT_SCHEMA_NAME}"`
			);
			hasOpenedInitialTable.current = true;
		}
	}, [initialTable, schemas, loadingSchema, openStudioTab]);

	// Sync selected tab to URL (call onTableChange when active table changes)
	useEffect(() => {
		if (!onTableChange) {
			return;
		}

		// Find the currently selected tab
		const selectedTab = tabs.find((tab) => tab.key === selectedTabKey);
		if (!selectedTab) {
			return;
		}

		// Check if the selected tab is a table tab
		// Table tab identifiers have the format: "table/{schemaName}.{tableName}"
		const tableMatch = selectedTab.identifier.match(/^table\/[^.]+\.(.+)$/);
		if (tableMatch) {
			const tableName = tableMatch[1];
			onTableChange(tableName ?? null);
		} else {
			onTableChange(null);
		}
	}, [selectedTabKey, tabs, onTableChange]);

	const replaceStudioTab = useCallback<StudioContextValue["replaceStudioTab"]>(
		(
			identifier: string,
			data: StudioTabDefinitionMetadata,
			options?: { withoutReplaceComponent?: boolean; isTemp?: boolean }
		) => {
			setTabs((prev) => {
				const targetTab = prev.find((tab) => tab.identifier === identifier);
				if (!targetTab) {
					return prev;
				}

				// Getting tab setting
				const tabTypeDefinition = StudioTabDefinitionList[data.type];
				const newIdentifier = tabTypeDefinition.makeIdentifier(data);
				const newKey = window.crypto.randomUUID();

				const newTabValue = options?.withoutReplaceComponent
					? {
							component: targetTab.component,
							icon: tabTypeDefinition.icon,
							identifier: newIdentifier,
							isTemp: options?.isTemp,
							key: targetTab.key,
							title: tabTypeDefinition.makeTitle(data),
						}
					: {
							component: tabTypeDefinition.makeComponent(data),
							icon: tabTypeDefinition.icon,
							identifier: newIdentifier,
							isTemp: options?.isTemp,
							key: newKey,
							title: tabTypeDefinition.makeTitle(data),
						};

				if (!options?.withoutReplaceComponent) {
					setSelectedTabKey(newKey);
				}

				return prev.map((tab) => {
					if (tab === targetTab) {
						return newTabValue;
					}

					return tab;
				});
			});
		},
		[setSelectedTabKey]
	);

	// Prevent the user from accidentally leaving the page
	// if there are any tabs with unsaved changes.
	const hasDirtyState = tabs.some((tab) => tab.isDirty);

	useLeaveGuard({
		enabled: hasDirtyState,
		onBeforeLeave: () => {
			return "You have unsaved changes. Are you sure you want to leave?";
		},
	});

	const contextValues = useMemo(() => {
		return {
			closeStudioTab,
			driver,
			loadingSchema,
			onTableChange,
			openStudioTab,
			refreshSchema,
			replaceStudioTab,
			resource,
			schemas,
			selectedTabKey,
			setSelectedTabKey,
			setStudioTabs: setTabs,
			tabs,
			updateStudioTabStatus,
		};
	}, [
		schemas,
		refreshSchema,
		loadingSchema,
		tabs,
		driver,
		setTabs,
		selectedTabKey,
		setSelectedTabKey,
		closeStudioTab,
		resource,
		openStudioTab,
		replaceStudioTab,
		updateStudioTabStatus,
		onTableChange,
	]);

	return (
		<ModalProvider>
			<StudioContextMenuProvider>
				<StudioContextProvider value={contextValues}>
					<div className="relative w-full h-full overflow-hidden">
						<SplitPane
							defaultSize={300}
							minSize={50}
							resizerClassName="!bg-resizer border-transparent"
							split="horizontal"
						>
							<StudioSidebarPane />
							<StudioWindowTabPane />
						</SplitPane>
					</div>
				</StudioContextProvider>
			</StudioContextMenuProvider>
		</ModalProvider>
	);
}
