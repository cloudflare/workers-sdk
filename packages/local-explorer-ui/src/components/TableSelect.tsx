import { Select } from "@cloudflare/kumo/primitives/select";
import {
	CaretUpDownIcon,
	CheckIcon,
	PlusIcon,
	TableIcon,
} from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
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
	const [open, setOpen] = useState(false);

	const handleTableChange = useCallback(
		(tableName: string | null) => {
			if (tableName === null) {
				return;
			}

			void navigate({
				search: { table: tableName },
				to: ".",
			});
		},
		[navigate]
	);

	const handleCreateTable = useCallback((): void => {
		setOpen(false);
		studioRef.current?.openCreateTableTab();
	}, [studioRef]);

	return (
		<Select.Root
			key="table-select"
			onOpenChange={setOpen}
			onValueChange={handleTableChange}
			open={open}
			value={selectedTable}
		>
			<Select.Trigger className="-mx-1.5 inline-flex cursor-pointer items-center gap-1 rounded-md border-none bg-transparent p-2 text-sm text-text transition-colors hover:bg-border/50 data-popup-open:bg-border/50">
				{selectedTable ? <Select.Value /> : "Select table"}
				<Select.Icon>
					<CaretUpDownIcon className="h-3.5 w-3.5 text-text-secondary" />
				</Select.Icon>
			</Select.Trigger>

			<Select.Portal>
				<Select.Positioner
					align="start"
					alignItemWithTrigger={false}
					className="z-100"
					side="bottom"
					sideOffset={4}
				>
					<Select.Popup className="max-h-72 min-w-36 overflow-hidden rounded-lg border border-border bg-bg shadow-[0_4px_12px_rgba(0,0,0,0.15)] transition-[opacity,transform] duration-150 data-ending-style:-translate-y-1 data-ending-style:opacity-0 data-starting-style:-translate-y-1 data-starting-style:opacity-0">
						<div className="p-1">
							<button
								className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text transition-colors outline-none select-none hover:bg-bg-secondary dark:hover:bg-bg-tertiary"
								onClick={handleCreateTable}
								type="button"
							>
								<span className="flex w-4 items-center">
									<PlusIcon className="h-3.5 w-3.5" />
								</span>
								Create table
							</button>
						</div>

						<div className="mx-1 border-t border-border" />

						<Select.List className="p-1">
							{tables.length > 0 ? (
								tables.map((table) => {
									const Icon =
										selectedTable === table.value ? CheckIcon : TableIcon;

									return (
										<Select.Item
											className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text transition-colors outline-none select-none data-highlighted:bg-bg-secondary dark:data-highlighted:bg-bg-tertiary"
											key={table.value}
											value={table.value}
										>
											<span className="flex w-4 items-center">
												<Icon className="h-3.5 w-3.5" />
											</span>
											<Select.ItemText>{table.label}</Select.ItemText>
										</Select.Item>
									);
								})
							) : (
								<span className="flex w-full items-center justify-center gap-2 px-2 py-1.5 text-sm text-text-secondary">
									No tables
								</span>
							)}
						</Select.List>
					</Select.Popup>
				</Select.Positioner>
			</Select.Portal>
		</Select.Root>
	);
}
