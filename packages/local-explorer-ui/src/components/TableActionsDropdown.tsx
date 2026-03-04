import { Button, DropdownMenu } from "@cloudflare/kumo";
import {
	CopyIcon,
	DotsThreeIcon,
	PencilIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import { DropTableConfirmationModal } from "./studio/Modal/DropTableConfirmation";
import type { IStudioDriver } from "../types/studio";
import type { StudioRef } from "./studio";

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
	 * Callback invoked after a table is successfully deleted.
	 * Use this to refresh the table list and navigate away from the deleted table.
	 */
	onTableDeleted?: () => void;

	/**
	 * The schema name for the current table.
	 *
	 * @default 'main'
	 */
	schemaName?: string;

	/**
	 * Reference to the Studio component for opening tabs.
	 */
	studioRef: React.RefObject<StudioRef | null>;
}

export interface TableTarget {
	schemaName: string;
	tableName: string;
}

export function TableActionsDropdown({
	currentTable,
	driver,
	onTableDeleted,
	schemaName = "main",
	studioRef,
}: TableActionsDropdownProps): JSX.Element {
	const [deleteTarget, setDeleteTarget] = useState<TableTarget | null>(null);

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

	const handleEditSchema = useCallback((): void => {
		if (!currentTable) {
			return;
		}

		studioRef.current?.openEditTableTab(schemaName, currentTable);
	}, [currentTable, schemaName, studioRef]);

	const handleDeleteClick = useCallback((): void => {
		if (currentTable) {
			setDeleteTarget({ schemaName, tableName: currentTable });
		}
	}, [currentTable, schemaName]);

	const handleCloseModal = useCallback((): void => {
		setDeleteTarget(null);
	}, []);

	return (
		<>
			<DropdownMenu>
				<DropdownMenu.Trigger
					render={
						<Button
							aria-label="Table Options"
							disabled={!currentTable}
							icon={DotsThreeIcon}
							shape="square"
						/>
					}
				/>

				<DropdownMenu.Content>
					<DropdownMenu.Item
						className="space-x-2 cursor-pointer"
						icon={CopyIcon}
						onClick={handleCopyTableName}
					>
						Copy table name
					</DropdownMenu.Item>

					<DropdownMenu.Item
						className="space-x-2 cursor-pointer"
						icon={CopyIcon}
						onClick={handleCopyTableSchema}
					>
						Copy table schema
					</DropdownMenu.Item>

					<DropdownMenu.Separator />

					<DropdownMenu.Item
						className="space-x-2 cursor-pointer"
						icon={PencilIcon}
						onClick={handleEditSchema}
					>
						Edit Schema
					</DropdownMenu.Item>

					<DropdownMenu.Separator />

					<DropdownMenu.Item
						className="space-x-2 cursor-pointer"
						icon={TrashIcon}
						onClick={handleDeleteClick}
						variant="danger"
					>
						Delete Table
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu>

			{deleteTarget && (
				<DropTableConfirmationModal
					closeModal={handleCloseModal}
					driver={driver}
					isOpen={true}
					onSuccess={onTableDeleted}
					schemaName={deleteTarget.schemaName}
					tableName={deleteTarget.tableName}
				/>
			)}
		</>
	);
}
