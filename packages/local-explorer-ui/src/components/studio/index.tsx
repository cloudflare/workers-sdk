import { BinocularsIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	getSavedQueries,
	useSavedQueries,
} from "../../utils/studio/saved-queries-api";
import sparrow from "../../utils/studio/stubs/sparrow";
import SplitPane from "../../utils/studio/stubs/SplitPane";
import { useLeaveGuard } from "../../utils/studio/stubs/useLeaveGuard";
import { StudioContextProvider } from "./Context";
import { StudioContextMenuProvider } from "./ContextMenu";
import { StudioQueryTab } from "./QueryTab";
import { StudioSidebarPane } from "./SidebarPane";
import { StudioTabDefinitionList } from "./tab-register";
import { DATA_STUDIO_TRACKING } from "./tracking";
import { StudioWindowTabPane } from "./WindowTabPane";
import type {
	IStudioDriver,
	StudioResource,
	StudioSavedQuery,
	StudioSchemas,
} from "../../types/studio";
import type { StudioContextValue } from "./Context";
import type { StudioTabDefinitionMetadata } from "./tab-register";
import type { StudioWindowTabItem } from "./WindowTab";

interface StudioProps {
	driver: IStudioDriver;
	resource: StudioResource;
	category?: string;
}

export function Studio({ driver, resource, category }: StudioProps) {
	const [schemas, setSchemas] = useState<StudioSchemas>();
	const [loadingSchema, setLoadingSchema] = useState(true);
	const [savedQueries, setSavedQueries] = useState<StudioSavedQuery[]>([]);
	const [loadingSavedQueries, setLoadingSavedQueries] = useState(true);
	const [tabs, setTabs] = useState<StudioWindowTabItem[]>(() => {
		return [
			{
				title: "Query",
				component: <StudioQueryTab />,
				icon: BinocularsIcon,
				identifier: "query-1",
				key: window.crypto.randomUUID(),
				type: "query",
			},
		];
	});

	// Automatically select the first tab
	const [selectedTabKey, setSelectedTabKey] = useState(() => {
		return tabs[0]?.key ?? "";
	});

	const isSavedQueriesEnabled = useSavedQueries();

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

	const refreshSavedQueries = useCallback(() => {
		if (!isSavedQueriesEnabled) {
			return;
		}

		setLoadingSavedQueries(true);

		getSavedQueries(resource)
			.then(setSavedQueries)
			.catch(console.error)
			.finally(() => {
				setLoadingSavedQueries(false);
			});
	}, [resource, isSavedQueriesEnabled]);

	useEffect(() => {
		refreshSchema();
		refreshSavedQueries();
	}, [refreshSchema, refreshSavedQueries]);

	// Tracking usage by category
	useEffect(() => {
		if (!category) {
			return;
		}

		sparrow.sendEvent(DATA_STUDIO_TRACKING.OPEN, { category });
	}, [category]);

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
							key: targetTab.key,
							identifier: newIdentifier,
							component: targetTab.component,
							icon: tabTypeDefinition.icon,
							title: tabTypeDefinition.makeTitle(data),
							isTemp: options?.isTemp,
						}
					: {
							key: newKey,
							identifier: newIdentifier,
							component: tabTypeDefinition.makeComponent(data),
							icon: tabTypeDefinition.icon,
							title: tabTypeDefinition.makeTitle(data),
							isTemp: options?.isTemp,
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
			refreshSchema,
			loadingSchema,
			schemas,
			driver,
			tabs,
			setStudioTabs: setTabs,
			selectedTabKey,
			setSelectedTabKey,
			closeStudioTab,
			savedQueries,
			loadingSavedQueries,
			refreshSavedQueries,
			resource,
			openStudioTab,
			replaceStudioTab,
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
		savedQueries,
		loadingSavedQueries,
		refreshSavedQueries,
		resource,
		openStudioTab,
		replaceStudioTab,
		updateStudioTabStatus,
	]);

	return (
		<StudioContextMenuProvider>
			<StudioContextProvider value={contextValues}>
				<div className="w-full h-full overflow-hidden">
					<SplitPane
						split="vertical"
						minSize={50}
						defaultSize={300}
						resizerClassName="!bg-neutral-300 dark:!bg-neutral-800 border-transparent"
					>
						<StudioSidebarPane />
						<StudioWindowTabPane />
					</SplitPane>
				</div>
			</StudioContextProvider>
		</StudioContextMenuProvider>
	);
}
