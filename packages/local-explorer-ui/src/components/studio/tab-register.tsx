import { BinocularsIcon, PencilIcon, TableIcon } from "@phosphor-icons/react";
import { StudioCreateUpdateTableTab } from "./CreateUpdateTableTab";
import { StudioQueryTab } from "./QueryTab";
import { StudioTableExplorerTab } from "./TableExplorerTab";
import type { Icon } from "@phosphor-icons/react";
import type { ReactElement } from "react";

// --------------------------------------
// Tab-specific implementations
// --------------------------------------
const QueryTab: TabDefinition<{ type: "query"; id: string }> = {
	type: "query",
	icon: BinocularsIcon,
	makeTitle: () => "Query",
	makeIdentifier: (tab) => `query/${tab.id}`,
	makeComponent: () => {
		return <StudioQueryTab />;
	},
};

const TableTab: TabDefinition<{
	type: "table";
	schemaName: string;
	tableName: string;
}> = {
	type: "table",
	icon: TableIcon,
	makeTitle: ({ tableName }) => tableName,
	makeIdentifier: (tab) => `table/${tab.schemaName}.${tab.tableName}`,
	makeComponent: ({ schemaName, tableName }) => {
		return (
			<StudioTableExplorerTab schemaName={schemaName} tableName={tableName} />
		);
	},
};

const EditTableTab: TabDefinition<{
	type: "edit-table";
	schemaName: string;
	tableName: string;
}> = {
	type: "edit-table",
	icon: PencilIcon,
	makeTitle: ({ tableName }) => tableName,
	makeIdentifier: (tab) => `edit-table/${tab.schemaName}.${tab.tableName}`,
	makeComponent: ({ schemaName, tableName }) => {
		return (
			<StudioCreateUpdateTableTab
				schemaName={schemaName}
				tableName={tableName}
			/>
		);
	},
};

const NewTableTab: TabDefinition<{ type: "create-table" }> = {
	type: "create-table",
	icon: PencilIcon,
	makeTitle: () => "Create table",
	makeIdentifier: () => `create-table`,
	makeComponent: () => {
		return <StudioCreateUpdateTableTab />;
	},
};

const SavedQueryTab: TabDefinition<{
	type: "saved-query";
	savedQueryId: string;
	query: string;
	name: string;
}> = {
	type: "saved-query",
	icon: BinocularsIcon,
	makeTitle: ({ name }) => name || "Saved Query",
	makeIdentifier: (tab) => `saved-query/${tab.savedQueryId}`,
	makeComponent: ({ savedQueryId, query }) => {
		return <StudioQueryTab query={query} savedQueryId={savedQueryId} />;
	},
};

// -------------------------------------------------------
// Tab registry
// --------------------------------------------------------
const RegisteredTabDefinition = [
	QueryTab,
	TableTab,
	EditTableTab,
	NewTableTab,
	SavedQueryTab,
];

// -----------------------------
// Core tab definition interface
// -----------------------------
interface TabDefinition<T extends { type: string }> {
	type: T["type"];
	icon: Icon;
	makeTitle: (data: T) => string;
	makeIdentifier: (data: T) => string;
	makeComponent: (data: T) => ReactElement;
}

// --------------------------------------
// Utility types
// --------------------------------------
type ExtractGeneric<T> = T extends TabDefinition<infer U> ? U : never;

export type StudioTabDefinitionMetadata = ExtractGeneric<
	(typeof RegisteredTabDefinition)[number]
>;

export const StudioTabDefinitionList = RegisteredTabDefinition.reduce(
	(a, b) => {
		a[b.type] = b as any;
		return a;
	},
	{} as Record<
		StudioTabDefinitionMetadata["type"],
		TabDefinition<StudioTabDefinitionMetadata>
	>
);
