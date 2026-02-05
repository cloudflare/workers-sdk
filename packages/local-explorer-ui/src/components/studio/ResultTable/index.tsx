import { cn, DropdownMenu } from "@cloudflare/kumo";
import {
	CopyIcon,
	FlowArrowIcon,
	KeyIcon,
	SigmaIcon,
	SortAscendingIcon,
	SortDescendingIcon,
} from "@phosphor-icons/react";
import { useCallback } from "react";
import * as React from "react";
import { StudioTable } from "../Table";
import {
	StudioEditableNumberCell,
	StudioEditableTextCell,
	StudioTableDisplayCell,
} from "./DisplayCell";
import { useStudioResultTableContextMenu } from "./ResultTableContextMenu";
import type {
	StudioColumnTypeHint,
	StudioResultValue,
	StudioSortDirection,
} from "../../../types/studio";
import type {
	StudioTableCellRendererProps,
	StudioTableHeaderProps,
} from "../Table/BaseTable";
import type { StudioResultHeaderMetadata } from "../Table/StateHelpers";
import type { StudioTableState } from "../Table/TableState";
import type { ReactNode } from "react";

interface StudioResultTableProps {
	state: StudioTableState<StudioResultHeaderMetadata>;
	arrangeHeaderIndex: number[];

	/** The column currently used for sorting */
	orderByColumn?: string;

	/** Sort direction for the current column ('ASC' or 'DESC') */
	orderByDirection?: StudioSortDirection;

	/**
	 * If provided, enables sort options in the header context menu.
	 * Called when the sort column or direction changes.
	 */
	onOrderByColumnChange?: (
		columnName: string,
		direction: StudioSortDirection
	) => void;
}

export function StudioResultTable({
	state,
	arrangeHeaderIndex,
	orderByColumn,
	orderByDirection,
	onOrderByColumnChange,
}: StudioResultTableProps) {
	const { copyCallback, pasteCallback, onContextMenu } =
		useStudioResultTableContextMenu(state);

	const renderCell = useCallback(
		(props: StudioTableCellRendererProps<StudioResultHeaderMetadata>) => {
			const { x, y, header, isFocus } = props;

			const align = header.metadata?.typeHint === "NUMBER" ? "right" : "left";
			const value = props.state.getValue(y, x);
			const editMode = isFocus && props.state.isInEditMode();

			// In SQLite, column types are flexible. Even if a column is declared as INTEGER, it can still store STRING values.
			// Therefore, the actual type is determined by the stored value rather than the column definition.
			let columnType: StudioColumnTypeHint = header.metadata?.typeHint ?? null;
			if (typeof value === "number") {
				columnType = "NUMBER";
			}
			if (typeof value === "string") {
				columnType = "TEXT";
			}

			if (columnType === "NUMBER") {
				return (
					<StudioEditableNumberCell
						header={header}
						state={props.state}
						value={value as StudioResultValue<number>}
						editMode={editMode}
						focus={isFocus}
						onChange={(newValue) => {
							props.state.changeValue(y, x, newValue);
						}}
					/>
				);
			} else if (columnType === "TEXT") {
				const shouldUsePopoverEditor =
					typeof value === "string" &&
					(value.length > 100 || value.includes("\n"));

				return (
					<StudioEditableTextCell
						header={header}
						state={props.state}
						value={value as StudioResultValue<string>}
						editMode={editMode}
						editor={shouldUsePopoverEditor ? "text" : "input"}
						focus={isFocus}
						onChange={(newValue) => {
							props.state.changeValue(y, x, newValue);
						}}
					/>
				);
			}

			return (
				<StudioTableDisplayCell header={header} value={value} align={align} />
			);
		},
		[]
	);

	const renderHeader = useCallback(
		(header: StudioTableHeaderProps<StudioResultHeaderMetadata>) => {
			const hasColumnInfo =
				(header.metadata.indexes && header.metadata.indexes.length > 0) ||
				header.metadata.isPrimaryKey ||
				header.metadata.columnSchema?.constraint?.generatedExpression;

			const primaryColumnList = state
				.getHeaders()
				.filter((h) => h.metadata.isPrimaryKey)
				.map((h) => h.name)
				.join(", ");

			return (
				<HeaderDropdownMenu
					header={header}
					orderByColumn={orderByColumn}
					orderByDirection={orderByDirection}
				>
					<DropdownMenu.Content side="bottom" align="start" sideOffset={2}>
						<DropdownMenu.Item
							className="text-sm"
							onClick={() => navigator.clipboard.writeText(header.name || "")}
						>
							<CopyIcon className="size-4 mr-1" />
							Copy column name
						</DropdownMenu.Item>
						{onOrderByColumnChange && (
							<>
								<DropdownMenu.Separator />
								<DropdownMenu.Item
									className="text-sm"
									onClick={() => onOrderByColumnChange(header.name, "ASC")}
								>
									<SortAscendingIcon className="size-4 mr-1" />
									Sort A → Z
								</DropdownMenu.Item>
								<DropdownMenu.Item
									className="text-sm"
									onClick={() => onOrderByColumnChange(header.name, "DESC")}
								>
									<SortDescendingIcon className="size-4 mr-1" />
									Sort Z → A
								</DropdownMenu.Item>
							</>
						)}

						{hasColumnInfo && (
							<>
								<DropdownMenu.Separator />
								<span className="text-xs font-medium px-3 py-1.5 text-gray-500">
									Constraints and Indexes
								</span>
							</>
						)}

						{header.metadata.isPrimaryKey && (
							<DropdownMenuColumnInfo
								icon={
									<KeyIcon
										weight="duotone"
										className="size-5 text-green-600 dark:text-green-400"
									/>
								}
								title={"Primary Key"}
								description={primaryColumnList}
							/>
						)}

						{header.metadata.indexes?.map((idx) => (
							<DropdownMenuColumnInfo
								key={idx.name}
								icon={
									<KeyIcon
										weight="duotone"
										className={cn("size-5", {
											"text-blue-600 dark:text-blue-400": idx.type === "KEY",
											"text-orange-600 dark:text-orange-400":
												idx.type === "UNIQUE",
										})}
									/>
								}
								title={idx.name}
								description={idx.columns.join(", ")}
							/>
						))}

						{header.metadata.referenceTo && (
							<DropdownMenuColumnInfo
								icon={
									<FlowArrowIcon
										weight="duotone"
										className="size-5 text-blue-600 dark:text-blue-400"
									/>
								}
								title={"Reference To"}
								description={`${header.metadata.referenceTo.table}.${header.metadata.referenceTo.column}`}
							/>
						)}

						{header.metadata.columnSchema?.constraint?.generatedExpression && (
							<DropdownMenuColumnInfo
								icon={
									<SigmaIcon className="size-5 text-purple-600 dark:text-purple-400" />
								}
								title={"Generated Expression"}
								description={
									header.metadata.columnSchema.constraint.generatedExpression
								}
							/>
						)}
					</DropdownMenu.Content>
				</HeaderDropdownMenu>
			);
		},
		[orderByColumn, orderByDirection, onOrderByColumnChange, state]
	);

	const onKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			// Detect the "modifier" key: Command (⌘) on macOS, Control (Ctrl) on Windows/Linux
			const isModifierPressed = e.metaKey || e.ctrlKey;

			if (isModifierPressed && e.key === "c") {
				copyCallback();
				e.preventDefault();
			} else if (isModifierPressed && e.key === "v") {
				pasteCallback();
				e.preventDefault();
			}
		},
		[copyCallback, pasteCallback]
	);

	return (
		<StudioTable
			state={state}
			rowHeight={36}
			renderCell={renderCell}
			renderHeader={renderHeader}
			onKeyDown={onKeyDown}
			arrangeHeaderIndex={arrangeHeaderIndex}
			renderAhead={3}
			onContextMenu={onContextMenu}
		/>
	);
}

/**
 * Dropdown menu component that supports both click and right-click context menu triggers
 */
function HeaderDropdownMenu({
	children,
	header,
	orderByColumn,
	orderByDirection,
}: React.PropsWithChildren<{
	header: StudioTableHeaderProps<StudioResultHeaderMetadata>;
	orderByColumn?: string;
	orderByDirection?: "ASC" | "DESC";
}>) {
	const [open, setOpen] = React.useState(false);

	const orderIconPart =
		orderByColumn === header.name ? (
			orderByDirection === "ASC" ? (
				<SortAscendingIcon size={16} />
			) : (
				<SortDescendingIcon size={16} />
			)
		) : null;

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenu.Trigger asChild>
				<div
					className="flex items-center px-2 py-1 font-mono cursor-pointer w-full gap-1 bg-white dark:bg-neutral-900"
					style={{ height: 36 }}
					onContextMenu={(e) => {
						e.preventDefault();
						e.stopPropagation();

						setOpen(true);
					}}
				>
					{header.display?.icon ? (
						<header.display.icon className="size-4" />
					) : (
						header.display.iconElement
					)}
					<div className="grow line-clamp-1">{header.display.text}</div>
					{orderIconPart}
				</div>
			</DropdownMenu.Trigger>
			{children}
		</DropdownMenu>
	);
}

function DropdownMenuColumnInfo({
	title,
	description,
	icon,
}: {
	title: string;
	description: string;
	icon: ReactNode;
}) {
	return (
		<DropdownMenu.Item className="text-sm py-1.5 px-3 flex items-center gap-2">
			{icon}
			<div className="flex flex-col gap-0.5">
				<div className="font-medium">{title}</div>
				<div className="text-gray-500 text-sm">{description}</div>
			</div>
		</DropdownMenu.Item>
	);
}
