import type { Icon } from "@phosphor-icons/react";
import type { ReactElement } from "react";

const RegisteredTabDefinition = [
	// TODO: Add query, table, edit table and new table tab definitions
] as Array<
	TabDefinition<{
		id?: string;
		schemaName?: string;
		tableName?: string;
		type: string;
	}>
>;

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
