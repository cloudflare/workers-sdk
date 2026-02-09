import {
	CopyIcon,
	EyeIcon,
	GearIcon,
	TableIcon,
	TextboxIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useCallback, useMemo, useState } from "react";
import { useModal } from "../../utils/studio/stubs/modal";
import { useStudioContext } from "./Context";
import { useStudioContextMenu } from "./ContextMenu";
import { StudioDropTableModal } from "./DropTableModal";
import { StudioTreeView } from "./TreeView";
import type { StudioSchemaItem, StudioSchemas } from "../../types/studio";
import type { StudioTreeViewItem } from "./TreeView";
import type { DropdownItemBuilderProps } from "@cloudflare/kumo";

export function StudioSidebarPane() {
	const { schemas, loadingSchema } = useStudioContext();
	const [searchText] = useState("");

	return (
		<div className="flex flex-col h-full w-full overflow-hidden">
			{/* <div className="px-4 flex gap-2 pt-4">
				<InputGroup className="w-full h-8">
					<InputGroup.Label>
						<MagnifyingGlassIcon size={16} />
					</InputGroup.Label>
					<InputGroup.Input
						label="Search"
						onValueChange={setSearchText}
						placeholder="Search"
						value={searchText}
					/>
				</InputGroup>

				<Button
					disabled={loadingSchema}
					shape="square"
					className="size-8"
					onClick={refreshSchema}
				>
					<ArrowsClockwiseIcon
						size={16}
						className={loadingSchema ? "animate-spin" : ""}
					/>
				</Button>

				<Button
					icon={PlusIcon}
					shape="square"
					className="size-8"
					onClick={() => {
						openStudioTab({
							type: "create-table",
						});
					}}
				/>
			</div> */}

			<div className="overflow-hidden grow flex">
				{schemas ? (
					<StudioResourceTreeView schemas={schemas} searchText={searchText} />
				) : (
					<>
						{loadingSchema ? (
							<StudioResourceLoadingState />
						) : (
							<div className="p-4 w-full text-center text-muted">
								No schemas found
							</div>
						)}
					</>
				)}
			</div>
		</div>
	);
}

function StudioResourceLoadingState() {
	return (
		<div className="flex flex-col px-2 grow">
			<div className="h-8 w-full flex gap-1 items-center">
				<div className="bg-surface-tertiary rounded h-4 grow"></div>
			</div>
			<div className="h-8 w-full flex gap-1 items-center">
				<div className="bg-surface-tertiary rounded h-4 grow"></div>
			</div>
			<div className="h-8 w-full flex gap-1 items-center">
				<div className="bg-surface-tertiary rounded h-4 grow"></div>
			</div>
		</div>
	);
}

interface StudioResourceTreeViewProps {
	schemas: StudioSchemas;
	searchText: string;
}

function StudioResourceTreeView({
	schemas,
	searchText,
}: StudioResourceTreeViewProps) {
	const {
		driver,
		refreshSchema,
		closeStudioTab,
		openStudioTab,
		selectedTabKey,
		tabs,
		updateStudioTabStatus,
	} = useStudioContext();

	const { openContextMenu } = useStudioContextMenu();
	const { openModal } = useModal();

	const items = useMemo(() => {
		// SQLite uses a single default schema named "main", so we flatten it here.
		// This logic may change in the future when we support databases like MySQL or PostgreSQL,
		// or when handling multiple attached schemas.
		const schemaItems = buildTreeItemsFromSchemas(schemas)[0]?.children ?? [];
		return schemaItems;
	}, [schemas]);

	const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(
		() => new Set()
	);

	// Derive the sidebar selection from the currently active tab.
	// This ensures the sidebar always reflects the actual tab state,
	// including when tabs are closed or switched via the tab bar.
	const selectedKey = useMemo(() => {
		const activeTab = tabs.find((tab) => tab.key === selectedTabKey);
		if (!activeTab) {
			return "";
		}

		// Table tab identifiers have the format: "table/{schemaName}.{tableName}"
		const tableMatch = activeTab.identifier.match(/^table\/([^.]+)\.(.+)$/);
		if (tableMatch) {
			const schemaName = tableMatch[1];
			const tableName = tableMatch[2];
			return `${schemaName}-${tableName}`;
		}

		return "";
	}, [tabs, selectedTabKey]);

	const filterCallback = useCallback(
		(item: StudioTreeViewItem<StudioSchemaItem>) => {
			if (!searchText) {
				return true;
			}
			return item.name.toLowerCase().indexOf(searchText.toLowerCase()) >= 0;
		},
		[searchText]
	);

	const onResourceDoubleClick = useCallback(
		(item: StudioTreeViewItem<StudioSchemaItem>) => {
			if (item.data.type === "table" || item.data.type === "view") {
				updateStudioTabStatus(
					{
						type: "table",
						schemaName: item.data.schemaName,
						tableName: item.data.name,
					},
					{
						isTemp: false,
					}
				);
			}
		},
		[updateStudioTabStatus]
	);

	const handleSelectChange = (item: StudioTreeViewItem<StudioSchemaItem>) => {
		if (item.data.type === "table" || item.data.type === "view") {
			openStudioTab(
				{
					type: "table",
					schemaName: item.data.schemaName,
					tableName: item.data.name,
				},
				true
			);
		}
	};

	const onContextMenu = useCallback(
		(item: StudioTreeViewItem<StudioSchemaItem>, event: React.MouseEvent) => {
			const contextMenuList: DropdownItemBuilderProps[] = [
				{
					type: "button",
					icon: CopyIcon,
					label: item.data.type === "table" ? "Copy table name" : "Copy name",
					onClick: () => {
						window.navigator.clipboard.writeText(item.data.name);
					},
				},
			];

			if (item.data.tableSchema?.createScript) {
				contextMenuList.push({
					type: "button",
					label: "Copy table schema",
					onClick: () => {
						window.navigator.clipboard.writeText(
							item.data.tableSchema?.createScript ?? ""
						);
					},
				});
			}

			if (item.data.type === "table") {
				contextMenuList.push({ type: "divider" });
				contextMenuList.push({
					type: "button",
					label: "Explore Data",
					onClick: () => {
						openStudioTab({
							type: "table",
							schemaName: item.data.schemaName,
							tableName: item.data.name,
						});
					},
				});
				contextMenuList.push({
					type: "button",
					label: driver.isSupportEditTable
						? "Edit table schema"
						: "View table schema",
					onClick: () => {
						openStudioTab({
							type: "edit-table",
							schemaName: item.data.schemaName,
							tableName: item.data.name,
						});
					},
				});
			}

			if (item.data.type === "table" && driver.isSupportDropTable) {
				contextMenuList.push({ type: "divider" });
				contextMenuList.push({
					icon: TrashIcon,
					type: "button",
					label: "Delete",
					onClick: () => {
						openModal(StudioDropTableModal, {
							onClose: () => {},
							onConfirm: async () => {
								await driver.dropTable(item.data.schemaName, item.data.name);
								const tableIdentifer = `table-${item.data.name}`;
								closeStudioTab(tableIdentifer);
								refreshSchema();
							},
							schemaName: item.data.schemaName,
							tableName: item.data.name,
						});
					},
					destructiveAction: true,
				});
			}

			openContextMenu(event, contextMenuList);
		},
		[
			openContextMenu,
			driver,
			openModal,
			refreshSchema,
			closeStudioTab,
			openStudioTab,
		]
	);

	return (
		<StudioTreeView
			full
			highlight={searchText}
			items={items as StudioTreeViewItem<StudioSchemaItem>[]}
			filter={filterCallback}
			selectedKey={selectedKey}
			onSelectChange={handleSelectChange}
			collapsedKeys={collapsedKeys}
			onCollapsedChange={setCollapsedKeys}
			onDoubleClick={onResourceDoubleClick}
			onContextMenu={onContextMenu}
		/>
	);
}

function buildTreeItemsFromSchemas(
	schemas: StudioSchemas
): StudioTreeViewItem<StudioSchemaItem>[] {
	return Object.entries(schemas).map(([schemaName, schemaItems]) => {
		return {
			key: schemaName,
			name: schemaName,
			icon: TableIcon,
			data: {
				type: "schema",
				name: schemaName,
				schemaName,
			},
			children: sortTreeItems(
				groupTriggerByTable(buildTreeItemsFromSchema(schemaItems))
			),
		};
	});
}

function buildTreeItemsFromSchema(
	schemaItems: StudioSchemaItem[]
): StudioTreeViewItem<StudioSchemaItem>[] {
	return schemaItems
		.map((schemaItem) => {
			if (schemaItem.type === "table") {
				if (schemaItem.tableSchema?.fts5) {
					return {
						data: schemaItem,
						name: schemaItem.name,
						key: `${schemaItem.schemaName}-${schemaItem.name}`,
						icon: TextboxIcon,
						iconColor: "text-red-500",
					};
				}

				return {
					data: schemaItem,
					name: schemaItem.name,
					key: `${schemaItem.schemaName}-${schemaItem.name}`,
					icon: TableIcon,
				};
			} else if (schemaItem.type === "view") {
				return {
					data: schemaItem,
					name: schemaItem.name,
					key: `${schemaItem.schemaName}-${schemaItem.name}`,
					icon: EyeIcon,
				};
			} else if (schemaItem.type === "trigger") {
				return {
					data: schemaItem,
					name: schemaItem.name,
					key: `${schemaItem.schemaName}-${schemaItem.name}`,
					icon: GearIcon,
				};
			}

			// Ignore for unhandled resource
			return null;
		})
		.filter(Boolean) as StudioTreeViewItem<StudioSchemaItem>[];
}

function sortTreeItems(items: StudioTreeViewItem<StudioSchemaItem>[]) {
	return items.sort((a, b) => a.name.localeCompare(b.name));
}

function groupTriggerByTable(
	items: StudioTreeViewItem<StudioSchemaItem>[]
): StudioTreeViewItem<StudioSchemaItem>[] {
	const triggers = items.filter((item) => item.data.type === "trigger");

	// Grouping the trigger by table name
	const triggerByTable = triggers.reduce(
		(acc, trigger) => {
			const table = trigger.data.tableName ?? "";
			acc[table] = [...(acc[table] ?? []), trigger];
			return acc;
		},
		{} as Record<string, StudioTreeViewItem<StudioSchemaItem>[]>
	);

	// Remove the trigger from top level list
	const list = items.filter((item) => item.data.type !== "trigger");

	// Append the triggers into table
	for (const item of list) {
		if (item.data.type === "table" && triggerByTable[item.data.name]) {
			item.children = [
				...(item.children ?? []),
				...(triggerByTable[item.name] ?? []),
			];
		}
	}

	return list;
}
