import { useCallback, useEffect, useState } from "react";
import { SkeletonBlock } from "../../utils/studio/stubs/ui/SkeletonBlock";
import { useStudioContext } from "./Context";
import { StudioTableSchemaEditor } from "./TableSchemaEditor";
import { useStudioCurrentWindowTab } from "./WindowTab";
import type {
	StudioTableSchema,
	StudioTableSchemaChange,
} from "../../types/studio";

interface StudioEditTableTabProps {
	schemaName?: string;
	tableName?: string;
}

export function StudioCreateUpdateTableTab({
	schemaName,
	tableName,
}: StudioEditTableTabProps) {
	const { driver, refreshSchema, replaceStudioTab } = useStudioContext();
	const [loading, setLoading] = useState(!!schemaName && !!tableName);
	const { identifier: tabIdentifier } = useStudioCurrentWindowTab();

	const [value, setValue] = useState<StudioTableSchemaChange>({
		schemaName: "main",
		name: {
			new: "",
			old: "",
		},
		columns: [],
		constraints: [],
		indexes: [],
	});

	// Determines if the editor is in create mode (no previous table name)
	const isCreateMode = !value.name.old;

	useEffect(() => {
		if (!schemaName || !tableName) {
			return;
		}

		driver
			.tableSchema(schemaName, tableName)
			.then((tableSchema) => {
				setValue(transformTableSchematableSchema(tableSchema));
			})
			.catch(console.error)
			.finally(() => setLoading(false));
	}, [driver, schemaName, tableName]);

	const onSaveChange = useCallback(
		async (statements: string[]) => {
			if (!value.schemaName || !value.name.new) {
				return;
			}

			await driver.transaction(statements);

			setValue(
				transformTableSchematableSchema(
					await driver.tableSchema(value.schemaName, value.name.new)
				)
			);

			replaceStudioTab(
				tabIdentifier,
				{
					type: "edit-table",
					schemaName: value.schemaName,
					tableName: value.name.new,
				},
				{
					withoutReplaceComponent: true,
				}
			);

			refreshSchema();
		},
		[value, driver, refreshSchema, tabIdentifier, replaceStudioTab]
	);

	return (
		<div className="overflow-auto w-full h-full bg-surface">
			{!loading ? (
				<StudioTableSchemaEditor
					driver={driver}
					value={value}
					onChange={setValue}
					highlightSchemaChanges={!isCreateMode} // Highlight diffs only in edit mode
					readOnlyExistingColumns={!isCreateMode} // Prevent editing existing columns in edit mode
					onSaveChange={onSaveChange}
					disabledAddColumn={!driver.isSupportEditTable}
				/>
			) : (
				<div className="p-4">
					<SkeletonBlock />
				</div>
			)}
		</div>
	);
}

function transformTableSchematableSchema(tableSchema: StudioTableSchema) {
	const constraintsList = structuredClone(tableSchema.constraints ?? []);

	const columnList = tableSchema.columns.map((column) => {
		const columnCopy = { ...column };

		/**
		 * Promote primary key and foreign key constraints from column-level to table-level.
		 *
		 * In SQLite, constraints like PRIMARY KEY and FOREIGN KEY can be defined at the column level:
		 *
		 *   CREATE TABLE <table_name> (
		 *     <column_name> <type> PRIMARY KEY
		 *   );
		 *
		 * For consistency and simplicity in our editor, we convert these to table-level constraints:
		 *
		 *   CREATE TABLE <table_name> (
		 *     <column_name> <type>,
		 *     PRIMARY KEY (<column_name>, ...)
		 *   );
		 *
		 * Table-level constraints are more flexible (e.g., allowing composite keys),
		 * and this approach allows us to handle all constraints in a single, unified way in the UI logic.
		 */
		if (columnCopy.constraint?.primaryKey) {
			delete columnCopy.constraint.primaryKey;
			delete columnCopy.constraint.primaryKeyConflict;
			delete columnCopy.constraint.primaryKeyOrder;
			delete columnCopy.constraint.primaryColumns;

			constraintsList.unshift({
				primaryKey: true,
				primaryColumns: [columnCopy.name],
			});
		}

		return columnCopy;
	});

	return {
		schemaName: tableSchema.schemaName,
		name: {
			old: tableSchema.tableName ?? null,
			new: tableSchema.tableName ?? null,
		},
		columns: columnList.map((column) => ({
			key: window.crypto.randomUUID(),
			old: structuredClone(column),
			new: structuredClone(column),
		})),
		constraints: constraintsList.map((constraint) => ({
			key: window.crypto.randomUUID(),
			old: structuredClone(constraint),
			new: structuredClone(constraint),
		})),
		indexes: tableSchema.indexes ?? [],
	};
}
