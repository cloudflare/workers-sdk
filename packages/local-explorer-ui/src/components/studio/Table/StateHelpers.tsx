import { FlowArrowIcon, KeyIcon, SigmaIcon } from "@phosphor-icons/react";
import { StudioTableState } from "./TableState";
import type {
	IStudioDriver,
	StudioColumnTypeHint,
	StudioResultRow,
	StudioResultSet,
	StudioSchemas,
	StudioTableColumn,
	StudioTableIndex,
	StudioTableSchema,
} from "../../../types/studio";
import type { StudioTableHeaderInput } from "./TableState";

export function createStudioSimpleTableState(
	headers: string[],
	data: Record<string, unknown>[]
) {
	return new StudioTableState(
		headers.map((header) => ({
			name: header,
			display: {
				initialSize: 150,
				text: header,
			},
			sticky: false,
			metadata: {
				isPrimaryKey: false,
			},
			setting: {
				readonly: true,
				resizable: true,
			},
			store: new Map(),
		})),
		data
	);
}

interface StudioTableStateFromResultOptions {
	result: StudioResultSet;
	tableSchema?: StudioTableSchema;
	schemas?: StudioSchemas;
	driver?: IStudioDriver;
	rowNumberOffset?: number;
}

export interface StudioResultHeaderMetadata {
	from?: {
		schema: string;
		table: string;
		column: string;
	};
	isPrimaryKey: boolean;
	referenceTo?: {
		schema: string;
		table: string;
		column: string;
	};
	indexes?: StudioTableIndex[];
	originalType?: string;
	typeHint: StudioColumnTypeHint;
	columnSchema?: StudioTableColumn;
}

/**
 * Builds a table header configuration from a query result,
 * enriching it with metadata and applying multiple transformations.
 */
export function createStudioTableStateFromResult(
	props: StudioTableStateFromResultOptions
) {
	const r = new StudioTableState<StudioResultHeaderMetadata>(
		buildTableResultHeader(props),
		props.result.rows.map((row) => ({ ...row }))
	);

	r.rowNumberOffset = props.rowNumberOffset ?? 0;
	const maxRowNumber = r.getRowsCount() + r.rowNumberOffset;
	r.gutterColumnWidth = Math.max(40, 10 + maxRowNumber.toString().length * 10);

	return r;
}

function buildTableResultHeader(
	props: StudioTableStateFromResultOptions
): StudioTableHeaderInput<StudioResultHeaderMetadata>[] {
	const { result, driver, tableSchema } = props;

	const headers = result.headers.map((column) => {
		return {
			store: new Map(),
			name: column.name,
			display: {
				text: column.displayName,
			},
			setting: {
				readonly: true,
				resizable: true,
			},
			metadata: {
				originalType: column.columnType,
			},
		} as StudioTableHeaderInput<StudioResultHeaderMetadata>;
	});

	pipeWithTableSchema(headers, props);
	pipeEditableTable(headers, props);
	pipeVirtualColumnAsReadOnly(headers);

	headers.forEach((header) => {
		if (driver) {
			header.metadata.typeHint = driver.getColumnTypeHint(
				header.metadata.originalType
			);
		}

		if (tableSchema) {
			// Increase the width of the ranking column to accommodate longer scores.
			if (tableSchema.fts5 && header.name === "rank") {
				header.display.initialSize = 220;
			}
		}
	});

	pipeCalculateInitialSize(headers, props);
	pipeColumnIcon(headers);

	return headers;
}

/**
 * Estimates an initial column width based on up to 100 row samples.
 * Wider strings result in wider columns, bounded between 150 and 500 pixels.
 */
function pipeCalculateInitialSize(
	headers: StudioTableHeaderInput<StudioResultHeaderMetadata>[],
	{ result }: StudioTableStateFromResultOptions
) {
	for (const header of headers) {
		// Skip if the initial size is already set
		if (header.display.initialSize !== undefined) {
			continue;
		}

		let maxSize = 0;

		if (header.metadata?.typeHint === "NUMBER") {
			header.display.initialSize = 100;
			continue;
		}

		for (let i = 0; i < Math.min(result.rows.length, 100); i++) {
			const row = result.rows[i] as StudioResultRow;
			const cell = row[header.name ?? ""];

			if (typeof cell === "string") {
				maxSize = Math.max(maxSize, cell.length * 8);
			} else if (typeof cell === "number") {
				maxSize = Math.max(maxSize, 100);
			}
		}

		header.display.initialSize = Math.min(500, Math.max(150, maxSize));
	}
}

/**
 * Adds schema-related metadata to each column header,
 * including column type, primary key, and foreign key references.
 */
function pipeWithTableSchema(
	headers: StudioTableHeaderInput<StudioResultHeaderMetadata>[],
	{ tableSchema }: StudioTableStateFromResultOptions
) {
	if (!tableSchema) {
		return;
	}

	for (const header of headers) {
		const columnSchema = tableSchema.columns.find(
			(c) => c.name.toLowerCase() === header.name.toLowerCase()
		);

		header.metadata.columnSchema = columnSchema;
		header.metadata.originalType = columnSchema?.type;

		header.metadata.from = {
			schema: tableSchema.schemaName,
			table: tableSchema.tableName as string,
			column: header.name,
		};

		if (
			tableSchema.pk
				.map((p) => p.toLowerCase())
				.includes(header.name.toLowerCase())
		) {
			header.metadata.isPrimaryKey = true;
		}

		if (
			columnSchema &&
			columnSchema.constraint?.foreignKey &&
			columnSchema.constraint.foreignKey.foreignColumns
		) {
			header.metadata.referenceTo = {
				schema: columnSchema.constraint.foreignKey.foreignSchemaName as string,
				table: columnSchema.constraint.foreignKey.foreignTableName as string,
				column: columnSchema.constraint.foreignKey.foreignColumns[0] as string,
			};
		}

		if (tableSchema.constraints) {
			for (const constraint of tableSchema.constraints) {
				if (constraint.foreignKey && constraint.foreignKey.columns) {
					const foundIndex = constraint.foreignKey.columns.indexOf(header.name);
					if (foundIndex !== -1) {
						header.metadata.referenceTo = {
							schema: constraint.foreignKey.foreignSchemaName as string,
							table: constraint.foreignKey.foreignTableName as string,
							column: constraint.foreignKey.columns[foundIndex] as string,
						};
					}
				}
			}
		}

		// Binding the indexes to meta
		header.metadata.indexes = (tableSchema.indexes || []).filter((index) =>
			index.columns.some(
				(col) => col.toLowerCase() === header.name.toLowerCase()
			)
		);
	}
}

/**
 * Determines which columns are editable based on primary key coverage.
 * A table is editable only if all PK columns are present in the result.
 * Adds metadata so editable columns can be toggled appropriately.
 */
function pipeEditableTable(
	headers: StudioTableHeaderInput<StudioResultHeaderMetadata>[],
	{ schemas }: StudioTableStateFromResultOptions
) {
	const tables: {
		schema: string;
		table: string;
		columns: string[];
		pkColumns: string[];
	}[] = [];

	for (const header of headers) {
		const from = header.metadata.from;

		if (from && header.metadata.isPrimaryKey) {
			const table = tables.find(
				(t) => t.schema === from.schema && t.table === from.table
			);

			if (table) {
				table.columns.push(from.column);
			} else if (schemas) {
				const pkColumns =
					schemas[from.schema]?.find((t) => t.tableName === from.table)
						?.tableSchema?.pk ?? [];

				tables.push({
					schema: from.schema,
					table: from.table,
					columns: [from.column],
					pkColumns,
				});
			}
		}
	}

	for (const table of tables) {
		let editable = false;
		const matchedColumns = table.columns.filter((c) =>
			table.pkColumns.includes(c)
		);

		// Mark table as editable if all primary key columns are matched
		if (matchedColumns.length === table.pkColumns.length) {
			editable = true;
		}

		// In SQLite, we can use rowid as a primary key if there is no primary key
		if (
			!editable &&
			table.pkColumns.length === 0 &&
			table.columns.length === 1 &&
			table.columns[0] === "rowid"
		) {
			editable = true;
		}

		// If the table is editable, we will mark the whole columns that belongs to
		// that table as editable.
		if (editable) {
			for (const header of headers) {
				const from = header.metadata.from;

				if (
					from &&
					from.schema === table.schema &&
					from.table === table.table
				) {
					header.setting.readonly = false;
				}
			}
		}
	}
}

/**
 * Marks virtual (generated) columns as read-only.
 * These are not meant to be edited by users.
 */
function pipeVirtualColumnAsReadOnly(
	headers: StudioTableHeaderInput<StudioResultHeaderMetadata>[]
) {
	for (const header of headers) {
		if (header.metadata.columnSchema?.constraint?.generatedExpression) {
			header.setting.readonly = true;
		}
	}
}

function pipeColumnIcon(
	headers: StudioTableHeaderInput<StudioResultHeaderMetadata>[]
) {
	for (const header of headers) {
		const hasPrimaryKey = header.metadata.isPrimaryKey;
		const indexes = header.metadata.indexes || [];
		const hasUniqueIndex = indexes.some((idx) => idx.type === "UNIQUE");
		const hasKeyIndex = indexes.some((idx) => idx.type === "KEY");

		const hasIcon =
			hasPrimaryKey ||
			hasUniqueIndex ||
			hasKeyIndex ||
			header.metadata.referenceTo ||
			header.metadata.columnSchema?.constraint?.generatedExpression;

		if (!hasIcon) {
			continue;
		}

		const iconStack = (
			<div className="shrink-0 mr-1 flex items-center gap-1">
				{hasPrimaryKey && (
					<KeyIcon
						weight="duotone"
						className="text-green-600 dark:text-green-400 size-3.5"
					/>
				)}
				{hasUniqueIndex && (
					<KeyIcon
						weight="duotone"
						className="text-orange-600 dark:text-orange-400 size-3.5"
					/>
				)}
				{hasKeyIndex && (
					<KeyIcon
						weight="duotone"
						className="text-blue-600 dark:text-blue-400 size-3.5"
					/>
				)}
				{header.metadata.referenceTo && (
					<FlowArrowIcon className="text-blue-600 dark:text-blue-400 shrink-0 size-3.5" />
				)}
				{header.metadata.columnSchema?.constraint?.generatedExpression && (
					<SigmaIcon className="text-purple-600 dark:text-purple-400 shrink-0 size-3.5" />
				)}
			</div>
		);

		header.display.iconElement = iconStack;
	}
}
