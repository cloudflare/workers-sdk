import { cn, DropdownMenu } from "@cloudflare/kumo";
import {
	CopyIcon,
	FlowArrowIcon,
	KeyIcon,
	SigmaIcon,
	SortAscendingIcon,
	SortDescendingIcon,
} from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import { StudioTable } from "..";
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
} from "../../../../types/studio";
import type {
	StudioTableCellRendererProps,
	StudioTableHeaderProps,
} from "../BaseTable";
import type { StudioTableState } from "../State";
import type { StudioResultHeaderMetadata } from "../State/Helpers";
import type { PropsWithChildren, ReactNode } from "react";

interface StudioResultTableProps {
	arrangeHeaderIndex: number[];
	/**
	 * If provided, enables sort options in the header context menu.
	 * Called when the sort column or direction changes.
	 */
	onOrderByColumnChange?: (
		columnName: string,
		direction: StudioSortDirection
	) => void;
	/** The column currently used for sorting */
	orderByColumn?: string;
	/** Sort direction for the current column ('ASC' or 'DESC') */
	orderByDirection?: StudioSortDirection;
	state: StudioTableState<StudioResultHeaderMetadata>;
}

export function StudioResultTable({
	arrangeHeaderIndex,
	onOrderByColumnChange,
	orderByColumn,
	orderByDirection,
	state,
}: StudioResultTableProps): JSX.Element {
	const { copyCallback, onContextMenu, pasteCallback } =
		useStudioResultTableContextMenu(state);

	const renderCell = useCallback(
		(
			props: StudioTableCellRendererProps<StudioResultHeaderMetadata>
		): JSX.Element => {
			const { header, isFocus, x, y } = props;

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
						editMode={editMode}
						focus={isFocus}
						header={header}
						onChange={(newValue) => {
							props.state.changeValue(y, x, newValue);
						}}
						state={props.state}
						value={value as StudioResultValue<number>}
					/>
				);
			}

			if (columnType === "TEXT") {
				const shouldUsePopoverEditor =
					typeof value === "string" &&
					(value.length > 100 || value.includes("\n"));

				return (
					<StudioEditableTextCell
						editMode={editMode}
						editor={shouldUsePopoverEditor ? "text" : "input"}
						focus={isFocus}
						header={header}
						onChange={(newValue) => {
							props.state.changeValue(y, x, newValue);
						}}
						state={props.state}
						value={value as StudioResultValue<string>}
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
		(
			header: StudioTableHeaderProps<StudioResultHeaderMetadata>
		): JSX.Element => {
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
					<DropdownMenu.Content align="start" side="bottom" sideOffset={2}>
						<DropdownMenu.Item
							className="text-sm"
							onClick={() => navigator.clipboard.writeText(header.name || "")}
						>
							<CopyIcon className="mr-1 size-4" />
							<span>Copy column name</span>
						</DropdownMenu.Item>

						{onOrderByColumnChange && (
							<>
								<DropdownMenu.Separator />
								<DropdownMenu.Item
									className="text-sm"
									onClick={() => onOrderByColumnChange(header.name, "ASC")}
								>
									<SortAscendingIcon className="mr-1 size-4" />
									<span>Sort A → Z</span>
								</DropdownMenu.Item>
								<DropdownMenu.Item
									className="text-sm"
									onClick={() => onOrderByColumnChange(header.name, "DESC")}
								>
									<SortDescendingIcon className="mr-1 size-4" />
									<span>Sort Z → A</span>
								</DropdownMenu.Item>
							</>
						)}

						{hasColumnInfo && (
							<>
								<DropdownMenu.Separator />
								<span className="px-3 py-1.5 text-xs font-medium text-kumo-subtle">
									Constraints and Indexes
								</span>
							</>
						)}

						{header.metadata.isPrimaryKey && (
							<DropdownMenuColumnInfo
								description={primaryColumnList}
								icon={
									<KeyIcon
										weight="duotone"
										className="size-5 text-kumo-success"
									/>
								}
								title={"Primary Key"}
							/>
						)}

						{header.metadata.indexes?.map((idx) => (
							<DropdownMenuColumnInfo
								description={idx.columns.join(", ")}
								icon={
									<KeyIcon
										weight="duotone"
										className={cn("size-5", {
											"text-kumo-link": idx.type === "KEY",
											"text-kumo-warning": idx.type === "UNIQUE",
										})}
									/>
								}
								key={idx.name}
								title={idx.name}
							/>
						))}

						{header.metadata.referenceTo && (
							<DropdownMenuColumnInfo
								description={`${header.metadata.referenceTo.table}.${header.metadata.referenceTo.column}`}
								icon={
									<FlowArrowIcon
										weight="duotone"
										className="size-5 text-kumo-link"
									/>
								}
								title={"Reference To"}
							/>
						)}

						{header.metadata.columnSchema?.constraint?.generatedExpression && (
							<DropdownMenuColumnInfo
								description={
									header.metadata.columnSchema.constraint.generatedExpression
								}
								icon={<SigmaIcon className="size-5 text-kumo-brand" />}
								title={"Generated Expression"}
							/>
						)}
					</DropdownMenu.Content>
				</HeaderDropdownMenu>
			);
		},
		[orderByColumn, orderByDirection, onOrderByColumnChange, state]
	);

	const onKeyDown = useCallback(
		(e: React.KeyboardEvent): void => {
			// Detect the "modifier" key: Command (⌘) on macOS, Control (Ctrl) on Windows/Linux
			const isModifierPressed = e.metaKey || e.ctrlKey;

			if (isModifierPressed && e.key === "c") {
				copyCallback();
				e.preventDefault();
				return;
			}

			if (isModifierPressed && e.key === "v") {
				pasteCallback();
				e.preventDefault();
			}
		},
		[copyCallback, pasteCallback]
	);

	return (
		<StudioTable
			arrangeHeaderIndex={arrangeHeaderIndex}
			onContextMenu={onContextMenu}
			onKeyDown={onKeyDown}
			renderAhead={3}
			renderCell={renderCell}
			renderHeader={renderHeader}
			rowHeight={36}
			state={state}
		/>
	);
}

type HeaderDropdownMenuProps = PropsWithChildren<{
	header: StudioTableHeaderProps<StudioResultHeaderMetadata>;
	orderByColumn?: string;
	orderByDirection?: "ASC" | "DESC";
}>;

/**
 * Dropdown menu component that supports both click and right-click context menu triggers
 */
function HeaderDropdownMenu({
	children,
	header,
	orderByColumn,
	orderByDirection,
}: HeaderDropdownMenuProps): JSX.Element {
	const [open, setOpen] = useState<boolean>(false);

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
			<DropdownMenu.Trigger
				nativeButton={false}
				render={(props) => (
					<div
						{...props}
						className="flex h-9 w-full cursor-pointer items-center gap-1 bg-kumo-base px-2 py-1 font-mono"
						onContextMenu={(e): void => {
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

						<div className="line-clamp-1 grow">{header.display.text}</div>

						{orderIconPart}
					</div>
				)}
			/>
			{children}
		</DropdownMenu>
	);
}

interface DropdownMenuColumnInfoProps {
	description: string;
	icon: ReactNode;
	title: string;
}

function DropdownMenuColumnInfo({
	description,
	icon,
	title,
}: DropdownMenuColumnInfoProps) {
	return (
		<DropdownMenu.Item className="flex items-center gap-2 px-3 py-1.5 text-sm">
			{icon}
			<div className="flex flex-col gap-0.5">
				<div className="font-medium">{title}</div>
				<div className="text-sm text-kumo-subtle">{description}</div>
			</div>
		</DropdownMenu.Item>
	);
}
