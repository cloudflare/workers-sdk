import { isEqual } from "../../utils/is-equal";
import type {
	IStudioDriver,
	StudioTableColumn,
	StudioTableColumnConstraint,
	StudioTableSchemaChange,
} from "../../types/studio";

/**
 * Creates a shallow copy of an object with the specified keys removed.
 *
 * @param obj - The source object to copy from.
 * @param keys - The property names to exclude from the result.
 *
 * @returns A new object containing all properties of `obj` except those listed in `keys`.
 */
function omit<T extends object>(obj: T, keys: Array<string>): Partial<T> {
	const result = { ...obj };

	for (const key of keys) {
		delete result[key as keyof T];
	}

	return result;
}

/**
 * Ensures a string is wrapped in parentheses. If the string already
 * starts with `(` and ends with `)`, it is returned as-is.
 *
 * @param str - The string to wrap.
 *
 * @returns The parenthesised string.
 */
function wrapParen(str: string): string {
	if (str.length >= 2 && str.startsWith("(") && str.endsWith(")")) {
		return str;
	}

	return `(${str})`;
}

/**
 * Generates a column definition clause for use inside a CREATE TABLE
 * statement. Handles PRIMARY KEY, UNIQUE, NOT NULL, DEFAULT, GENERATED,
 * CHECK, and REFERENCES constraints.
 *
 * @param driver - The driver used for identifier and value escaping.
 * @param col - The column definition including name, type, and constraints.
 *
 * @returns The SQL column definition string.
 */
function generateCreateColumn(
	driver: IStudioDriver,
	col: StudioTableColumn
): string {
	const tokens: string[] = [driver.escapeId(col.name), col.type];

	if (col.constraint?.primaryKey) {
		tokens.push(
			[
				"PRIMARY KEY",
				col.constraint.primaryKeyOrder,
				col.constraint.primaryKeyConflict
					? `ON CONFLICT ${col.constraint.primaryKeyConflict}`
					: undefined,
				col.constraint.autoIncrement ? "AUTOINCREMENT" : undefined,
			]
				.filter(Boolean)
				.join(" ")
		);
	}

	if (col.constraint?.unique) {
		tokens.push(
			[
				"UNIQUE",
				col.constraint.uniqueConflict
					? `ON CONFLICT ${col.constraint.uniqueConflict}`
					: undefined,
			]
				.filter(Boolean)
				.join(" ")
		);
	}

	if (col.constraint?.notNull) {
		tokens.push(
			[
				"NOT NULL",
				col.constraint.notNullConflict
					? `ON CONFLICT ${col.constraint.notNullConflict}`
					: undefined,
			]
				.filter(Boolean)
				.join(" ")
		);
	}

	if (col.constraint?.defaultValue) {
		tokens.push(
			["DEFAULT", driver.escapeValue(col.constraint.defaultValue)].join(" ")
		);
	}

	if (col.constraint?.defaultExpression) {
		tokens.push(
			["DEFAULT", wrapParen(col.constraint.defaultExpression)].join(" ")
		);
	}

	if (col.constraint?.generatedExpression) {
		tokens.push(
			[
				"GENERATED ALWAYS AS",
				wrapParen(col.constraint.generatedExpression),
				col.constraint.generatedType,
			].join(" ")
		);
	}

	if (col.constraint?.checkExpression) {
		tokens.push("CHECK " + wrapParen(col.constraint.checkExpression));
	}

	const foreignTableName = col.constraint?.foreignKey?.foreignTableName;
	const foreignColumnName = (col.constraint?.foreignKey?.foreignColumns ?? [
		undefined,
	])[0];

	if (foreignTableName && foreignColumnName) {
		tokens.push(
			[
				"REFERENCES",
				driver.escapeId(foreignTableName) +
					`(${driver.escapeId(foreignColumnName)})`,
			].join(" ")
		);
	}

	return tokens.join(" ");
}

/**
 * Generates a table-level constraint clause (PRIMARY KEY, UNIQUE, CHECK,
 * or FOREIGN KEY) for use inside a CREATE TABLE statement.
 *
 * @param driver - The driver used for identifier escaping.
 * @param con - The constraint definition.
 *
 * @returns The SQL constraint clause string, or an empty string if unrecognised.
 */
function generateConstraintScript(
	driver: IStudioDriver,
	con: StudioTableColumnConstraint
) {
	if (con.primaryKey) {
		return `PRIMARY KEY (${con.primaryColumns
			?.map(driver.escapeId)
			.join(", ")})`;
	}

	if (con.unique) {
		return `UNIQUE (${con.uniqueColumns?.map(driver.escapeId).join(", ")})`;
	}

	if (con.checkExpression !== undefined) {
		return `CHECK (${con.checkExpression})`;
	}

	if (con.foreignKey) {
		return (
			`FOREIGN KEY (${con.foreignKey.columns
				?.map(driver.escapeId)
				.join(", ")}) ` +
			`REFERENCES ${driver.escapeId(con.foreignKey.foreignTableName ?? "")} ` +
			`(${con.foreignKey.foreignColumns?.map(driver.escapeId).join(", ")})`
		);
	}

	return "";
}

/**
 * Generates an array of SQL statements that apply a table schema change.
 *
 * When the change represents a new table (no `old` name), a single
 * `CREATE TABLE` statement is returned. Otherwise, one or more
 * `ALTER TABLE` statements are produced for column additions, drops,
 * renames, type changes, constraint additions, and table renames.
 *
 * @param driver - The driver used for identifier and value escaping.
 * @param change - The schema change descriptor containing old/new column and constraint definitions.
 *
 * @returns An array of SQL statements to apply the change.
 */
export function buildSQLiteSchemaDiffStatement(
	driver: IStudioDriver,
	change: StudioTableSchemaChange
): string[] {
	const isCreateScript = !change.name.old;

	const lines: string[] = [];

	for (const col of change.columns) {
		if (col.new === null) {
			lines.push(`DROP COLUMN ${driver.escapeId(col.old?.name ?? "")}`);
		} else if (col.old === null) {
			if (isCreateScript) {
				lines.push(generateCreateColumn(driver, col.new));
			} else {
				lines.push("ADD " + generateCreateColumn(driver, col.new));
			}
		} else {
			// check if there is rename
			if (col.new.name !== col.old.name) {
				lines.push(
					`RENAME COLUMN ${driver.escapeId(col.old.name)} TO ${driver.escapeId(
						col.new.name
					)}`
				);
			}

			// check if there is any changed except name
			if (!isEqual(omit(col.old, ["name"]), omit(col.new, ["name"]))) {
				lines.push(
					`ALTER COLUMN ${driver.escapeId(
						col.new.name
					)} TO ${generateCreateColumn(driver, col.new)}`
				);
			}
		}
	}

	for (const con of change.constraints) {
		if (con.new) {
			if (isCreateScript) {
				lines.push(generateConstraintScript(driver, con.new));
			}
		}
	}

	if (!isCreateScript) {
		if (change.name.new !== change.name.old) {
			lines.push(`RENAME TO ${driver.escapeId(change.name.new ?? "")}`);
		}
	}

	if (isCreateScript) {
		return [
			`CREATE TABLE ${driver.escapeId(
				change.schemaName ?? "main"
			)}.${driver.escapeId(change.name.new || "no_table_name")}(\n${lines
				.map((line) => "  " + line)
				.join(",\n")}\n)`,
		];
	}

	const alter = `ALTER TABLE ${driver.escapeId(
		change.schemaName ?? "main"
	)}.${driver.escapeId(change.name.old ?? "")} `;
	return lines.map((line) => alter + line);
}
