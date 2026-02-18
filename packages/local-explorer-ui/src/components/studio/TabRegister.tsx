import { BinocularsIcon, PencilIcon, TableIcon } from "@phosphor-icons/react";
import { StudioTableExplorerTab } from "./Tabs/TableExplorer";
import type { Icon } from "@phosphor-icons/react";
import type { ReactElement } from "react";

const QueryTab: TabDefinition<{ id: string; type: "query" }> = {
	icon: BinocularsIcon,
	makeComponent: () => <></>,
	makeIdentifier: (tab) => `query/${tab.id}`,
	makeTitle: () => "Query",
	type: "query",
};

const TableTab: TabDefinition<{
	schemaName: string;
	tableName: string;
	type: "table";
}> = {
	icon: TableIcon,
	makeComponent: ({ schemaName, tableName }) => (
		<StudioTableExplorerTab schemaName={schemaName} tableName={tableName} />
	),
	makeIdentifier: (tab) => `table/${tab.schemaName}.${tab.tableName}`,
	makeTitle: ({ tableName }) => tableName,
	type: "table",
};

const EditTableTab: TabDefinition<{
	schemaName: string;
	tableName: string;
	type: "edit-table";
}> = {
	icon: PencilIcon,
	makeComponent: () => <></>,
	makeIdentifier: (tab) => `edit-table/${tab.schemaName}.${tab.tableName}`,
	makeTitle: ({ tableName }) => tableName,
	type: "edit-table",
};

const NewTableTab: TabDefinition<{
	type: "create-table";
}> = {
	icon: PencilIcon,
	makeComponent: () => <></>,
	makeIdentifier: () => `create-table`,
	makeTitle: () => "Create table",
	type: "create-table",
};

const RegisteredTabDefinition = [QueryTab, TableTab, EditTableTab, NewTableTab];

export interface TabDefinition<T extends { type: string }> {
	icon: Icon;
	makeComponent: (data: T) => ReactElement;
	makeIdentifier: (data: T) => string;
	makeTitle: (data: T) => string;
	type: T["type"];
}

type ExtractGeneric<T> = T extends TabDefinition<infer U> ? U : never;

export type StudioTabDefinitionMetadata = ExtractGeneric<
	(typeof RegisteredTabDefinition)[number]
>;

export const StudioTabDefinitionList = RegisteredTabDefinition.reduce(
	(a, b) => {
		a[b.type] = b as TabDefinition<StudioTabDefinitionMetadata>;
		return a;
	},
	{} as Record<
		StudioTabDefinitionMetadata["type"],
		TabDefinition<StudioTabDefinitionMetadata>
	>
);
