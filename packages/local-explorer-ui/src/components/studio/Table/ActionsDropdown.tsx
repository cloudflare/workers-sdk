import { Button, DropdownMenu, useKumoToastManager } from "@cloudflare/kumo";
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
	const toasts = useKumoToastManager();

	const handleCopyTableName = useCallback(async (): Promise<void> => {
		if (!currentTable) {
			return;
		}

		await window.navigator.clipboard.writeText(currentTable);
		toasts.add({
			title: "Copied",
			description: "Table name copied to clipboard",
		});
	}, [currentTable, toasts]);

	const handleCopyTableSchema = useCallback(async (): Promise<void> => {
		if (!currentTable) {
			return;
		}

		const tableSchema = await driver.tableSchema(schemaName, currentTable);
		if (!tableSchema.createScript) {
			return;
		}

		await window.navigator.clipboard.writeText(tableSchema.createScript);
		toasts.add({
			title: "Copied",
			description: "Table schema copied to clipboard",
		});
	}, [currentTable, driver, schemaName, toasts]);

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
						className="cursor-pointer space-x-2"
						icon={TextTIcon}
						onClick={handleCopyTableName}
					>
						Copy table name
					</DropdownMenu.Item>

					<DropdownMenu.Item
						className="cursor-pointer space-x-2"
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
