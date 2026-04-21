import { DropdownMenu } from "@cloudflare/kumo";
import {
	CaretUpDownIcon,
	CheckIcon,
	PlusIcon,
	TableIcon,
} from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import type { StudioRef } from "./studio";
import type { RefObject } from "react";

interface TableSelectProps {
	studioRef: RefObject<StudioRef | null>;
	tables: Array<{ label: string; value: string }>;
	selectedTable: string | undefined;
}

export function TableSelect({
	studioRef,
	tables,
	selectedTable,
}: TableSelectProps): JSX.Element {
	const navigate = useNavigate();

	const handleTableChange = useCallback(
		(tableName: string) => {
			void navigate({
				search: (prev) => ({ ...prev, table: tableName }),
				to: ".",
			});
		},
		[navigate]
	);

	const handleCreateTable = useCallback((): void => {
		studioRef.current?.openCreateTableTab();
	}, [studioRef]);

	return (
		<DropdownMenu>
			<DropdownMenu.Trigger
				render={
					<button
						className="-mx-1.5 inline-flex cursor-pointer items-center gap-1 rounded-md border-none bg-transparent p-2 text-sm text-kumo-default transition-colors hover:bg-kumo-fill data-[popup-open]:bg-kumo-fill"
						type="button"
					/>
				}
			>
				{selectedTable ?? "Select table"}
				<CaretUpDownIcon className="h-3.5 w-3.5 text-kumo-subtle" />
			</DropdownMenu.Trigger>

			<DropdownMenu.Content
				className="max-h-72 overflow-y-auto"
				style={{ zIndex: 50 }}
			>
				<DropdownMenu.Item icon={PlusIcon} onClick={handleCreateTable}>
					Create table
				</DropdownMenu.Item>

				<DropdownMenu.Separator />

				{tables.length > 0 ? (
					tables.map((table) => (
						<DropdownMenu.Item
							icon={selectedTable === table.value ? CheckIcon : TableIcon}
							key={table.value}
							onClick={() => handleTableChange(table.value)}
						>
							{table.label}
						</DropdownMenu.Item>
					))
				) : (
					<span className="flex w-full items-center justify-center gap-2 px-2 py-1.5 text-sm text-kumo-subtle">
						No tables
					</span>
				)}
			</DropdownMenu.Content>
		</DropdownMenu>
	);
}
