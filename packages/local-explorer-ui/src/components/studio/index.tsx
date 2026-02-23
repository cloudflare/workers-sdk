import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLeaveGuard } from "../../hooks/leave-guard";
import { StudioContextProvider } from "./Context";
import { StudioContextMenuProvider } from "./ContextMenu";
import { ModalProvider } from "./Modal";
import { StudioTabDefinitionList } from "./TabRegister";
import { StudioWindowTabPane } from "./WindowTab/Pane";
import type {
	IStudioDriver,
	StudioResource,
	StudioSchemas,
} from "../../types/studio";
import type { StudioContextValue } from "./Context";
import type { StudioTabDefinitionMetadata, TabDefinition } from "./TabRegister";
import type { StudioWindowTabItem } from "./WindowTab/types";

/**
 * Default schema name for SQLite/D1 databases
 */
const DEFAULT_SCHEMA_NAME = "main";

interface StudioProps {
	/**
	 * The studio driver used to make requests to the database.
	 */
	driver: IStudioDriver;
	/**
	 * Table name to open initially (assumes 'main' schema)
	 */
	initialTable?: string;
	/**
	 * Metadata about the current studio resource.
	 */
	resource: StudioResource;
}

export function Studio({
	driver,
	initialTable,
	resource,
}: StudioProps): JSX.Element {
	// Track whether we've already opened the initial table
	const hasOpenedInitialTable = useRef<boolean>(false);

	const [schemas, setSchemas] = useState<StudioSchemas | null>(null);
	const [loadingSchema, setLoadingSchema] = useState(true);
	const [tabs, setTabs] = useState<StudioWindowTabItem[]>(() => [
		// TODO: Re-add `StudioQueryTab` default tab
	]);

	const [selectedTabKey, setSelectedTabKey] = useState<string>(
		// Automatically select the first tab
		() => tabs[0]?.key ?? ""
	);

	const selectedTabKeyRef = useRef(selectedTabKey);
	selectedTabKeyRef.current = selectedTabKey;

	const refreshSchema = useCallback(async () => {
		setLoadingSchema(true);

		try {
			const driverSchemas = await driver.schemas();
			setSchemas(driverSchemas);
		} catch (error) {
			console.error(error);
		} finally {
			setLoadingSchema(false);
		}
	}, [driver]);

	useEffect((): void => {
		void refreshSchema();
	}, [refreshSchema]);

	/**
	 * Utility to close a tab given its identifier
	 */
	const closeStudioTab = useCallback((tabIdentifier: string) => {
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
			if (
				selectedTabKeyRef.current === matchedTab.key &&
				filteredTabs.length > 0
			) {
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
	}, []);

	/**
	 * Utility to open a tab given its identifier
	 */
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

				// Open existing tab if exist
				const foundMatchedTab = prevTabs.find(
					(tab) => tab.identifier === identifier
				);
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
						component: tabTypeDefinition.makeComponent(data),
						icon: tabTypeDefinition.icon,
						identifier,
						isTemp: isTemporary,
						key: newTabKey,
						title: tabTypeDefinition.makeTitle(data),
					} satisfies StudioWindowTabItem,
				];
			});
		},
		[setSelectedTabKey]
	);

	/**
	 * Updates the status properties (e.g. `isDirty`, `isTemp`) of an existing studio tab.
	 */
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
	useEffect((): void => {
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
			(i) => i.type === "table" && i.name === initialTable
		);
		if (tableExists) {
			openStudioTab({
				schemaName: DEFAULT_SCHEMA_NAME,
				tableName: initialTable,
				type: "table",
			});
			hasOpenedInitialTable.current = true;
			return;
		}

		console.warn(
			`Table "${initialTable}" not found in schema "${DEFAULT_SCHEMA_NAME}"`
		);
		hasOpenedInitialTable.current = true;
	}, [initialTable, loadingSchema, openStudioTab, schemas]);

	/**
	 * Replaces an existing studio tab with a new one built from the provided
	 * `StudioTabDefinitionMetadata`.
	 *
	 * The target tab is located by its string `identifier`. If no matching tab
	 * is found, the tab list is unchanged.
	 */
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
				// TODO: Remove assertion once tab definitions are registered
				const tabTypeDefinition = StudioTabDefinitionList[
					data.type
				] as TabDefinition<StudioTabDefinitionMetadata>;
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

	/**
	 * Prevent the user from accidentally leaving the page if there
	 * are any tabs with unsaved changes.
	 */
	const hasDirtyState = tabs.some((tab) => tab.isDirty);

	useLeaveGuard({
		enabled: hasDirtyState,
		onBeforeLeave: () =>
			"You have unsaved changes. Are you sure you want to leave?",
	});

	const contextValues = useMemo(
		() => ({
			closeStudioTab,
			driver,
			loadingSchema,
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
		}),
		[
			closeStudioTab,
			driver,
			loadingSchema,
			openStudioTab,
			refreshSchema,
			replaceStudioTab,
			resource,
			schemas,
			selectedTabKey,
			setSelectedTabKey,
			setTabs,
			tabs,
			updateStudioTabStatus,
		]
	);

	return (
		<ModalProvider>
			<StudioContextMenuProvider>
				<StudioContextProvider value={contextValues}>
					<div className="relative w-full h-full overflow-hidden">
						<StudioWindowTabPane />
					</div>
				</StudioContextProvider>
			</StudioContextMenuProvider>
		</ModalProvider>
	);
}
