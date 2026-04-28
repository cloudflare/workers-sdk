import { useCallback, useEffect, useState } from "react";
import { useStudioContext } from "../Context";
import { SkeletonBlock } from "../SkeletonBlock";
import { StudioTableSchemaEditor } from "../Table/SchemaEditor";
import { useStudioCurrentWindowTab } from "../WindowTab/Context";
import type {
	StudioTableSchema,
	StudioTableSchemaChange,
} from "../../../types/studio";

interface StudioEditTableTabProps {
	schemaName?: string;
	tableName?: string;
}

const LAYOUT_CLASSES = "overflow-auto w-full h-full bg-kumo-base";

export function StudioCreateUpdateTableTab({
	schemaName,
	tableName,
}: StudioEditTableTabProps): JSX.Element {
	const { driver, refreshSchema, replaceStudioTab } = useStudioContext();
	const { identifier: tabIdentifier } = useStudioCurrentWindowTab();

	const [loading, setLoading] = useState<boolean>(!!schemaName && !!tableName);
	const [value, setValue] = useState<StudioTableSchemaChange>({
		columns: [],
		constraints: [],
		indexes: [],
		name: {
			new: "",
			old: "",
		},
		schemaName: "main",
	});

	// Determines if the editor is in create mode (no previous table name)
	const isCreateMode = !value.name.old;

	useEffect((): void => {
		async function updateValue(): Promise<void> {
			if (!schemaName || !tableName) {
				return;
			}

			try {
				const tableSchema = await driver.tableSchema(schemaName, tableName);
				setValue(transformTableSchematableSchema(tableSchema));
			} catch (err) {
				console.error(err);
			} finally {
				setLoading(false);
			}
		}

		void updateValue();
	}, [driver, schemaName, tableName]);

	const onSaveChange = useCallback(
		async (statements: string[]): Promise<void> => {
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
					schemaName: value.schemaName,
					tableName: value.name.new,
					type: "edit-table",
				},
				{
					withoutReplaceComponent: true,
				}
			);

			refreshSchema();
		},
		[value, driver, refreshSchema, tabIdentifier, replaceStudioTab]
	);

	if (loading) {
		return (
			<div className={LAYOUT_CLASSES}>
				<div className="p-4">
					<SkeletonBlock />
				</div>
			</div>
		);
	}

	return (
		<div className={LAYOUT_CLASSES}>
			<StudioTableSchemaEditor
				disabledAddColumn={!isCreateMode && !driver.isSupportEditTable}
				driver={driver}
				highlightSchemaChanges={!isCreateMode} // Highlight diffs only in edit mode
				onChange={setValue}
				onSaveChange={onSaveChange}
				readOnlyExistingColumns={!isCreateMode} // Prevent editing existing columns in edit mode
				value={value}
			/>
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

			const existingPkConstraint = constraintsList.find(
				(constraint) => constraint.primaryKey === true
			);
			if (existingPkConstraint) {
				existingPkConstraint.primaryColumns?.push(columnCopy.name);
				return columnCopy;
			}

			constraintsList.unshift({
				primaryKey: true,
				primaryColumns: [columnCopy.name],
			});
		}

		return columnCopy;
	});

	return {
		columns: columnList.map((column) => ({
			key: window.crypto.randomUUID(),
			new: structuredClone(column),
			old: structuredClone(column),
		})),
		constraints: constraintsList.map((constraint) => ({
			key: window.crypto.randomUUID(),
			new: structuredClone(constraint),
			old: structuredClone(constraint),
		})),
		indexes: tableSchema.indexes ?? [],
		name: {
			old: tableSchema.tableName ?? null,
			new: tableSchema.tableName ?? null,
		},
		schemaName: tableSchema.schemaName,
	};
}
