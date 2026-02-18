import { TableIcon } from "@phosphor-icons/react";
import { StudioTableExplorerTab } from "./Tabs/TableExplorer";
import type { Icon } from "@phosphor-icons/react";
import type { ReactElement } from "react";

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

const RegisteredTabDefinition = [TableTab];

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
