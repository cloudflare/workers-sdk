import { Button, DropdownMenu } from "@cloudflare/kumo";
import { CopyIcon, TableIcon, TextTIcon } from "@phosphor-icons/react";
import { useCallback } from "react";
import type { IStudioDriver } from "../../../types/studio";

export interface TableTarget {
	schemaName: string;
	tableName: string;
}

interface TableActionsDropdownProps {
	/**
	 * The currently selected table. When null/undefined, the dropdown trigger is disabled.
	 */
	currentTable: string | null | undefined;

	/**
	 * The database driver used to perform operations like fetching schema and dropping tables.
	 */
	driver: IStudioDriver;

	/**
	 * The schema name for the current table.
	 *
	 * @default 'main'
	 */
	schemaName?: string;
}

export function StudioTableActionsDropdown({
	currentTable,
	driver,
	schemaName = "main",
}: TableActionsDropdownProps): JSX.Element {
	const handleCopyTableName = useCallback(async (): Promise<void> => {
		if (!currentTable) {
			return;
		}

		await window.navigator.clipboard.writeText(currentTable);
	}, [currentTable]);

	const handleCopyTableSchema = useCallback(async (): Promise<void> => {
		if (!currentTable) {
			return;
		}

		const tableSchema = await driver.tableSchema(schemaName, currentTable);
		if (!tableSchema.createScript) {
			return;
		}

		await window.navigator.clipboard.writeText(tableSchema.createScript);
	}, [currentTable, driver, schemaName]);

	return (
		<>
			<DropdownMenu>
				<DropdownMenu.Trigger
					render={
						<Button
							aria-label="Copy"
							disabled={!currentTable}
							icon={CopyIcon}
							shape="square"
						/>
					}
				/>

				<DropdownMenu.Content>
					<DropdownMenu.Item
						className="space-x-2 cursor-pointer"
						icon={TextTIcon}
						onClick={handleCopyTableName}
					>
						Copy table name
					</DropdownMenu.Item>

					<DropdownMenu.Item
						className="space-x-2 cursor-pointer"
						icon={TableIcon}
						onClick={handleCopyTableSchema}
					>
						Copy table schema
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu>
		</>
	);
}
