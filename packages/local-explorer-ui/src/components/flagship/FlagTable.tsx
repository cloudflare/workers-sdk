import {
	Badge,
	Button,
	cn,
	DropdownMenu,
	Table,
	Tooltip,
} from "@cloudflare/kumo";
import {
	ArrowDownIcon,
	ArrowsDownUpIcon,
	ArrowUpIcon,
	DotsThreeIcon,
	FlaskIcon,
	PencilSimpleIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { formatDate } from "../../utils/format";
import { timeAgo } from "../../utils/time";
import { CopyButton } from "../CopyButton";
import { FLAG_TYPE_LABELS } from "./flag-helpers";
import type { FlagshipFlag } from "../../api";
import type { JSX, ReactNode } from "react";

interface FlagTableProps {
	flags: FlagshipFlag[];
	onDelete: (flag: FlagshipFlag) => void;
	onEdit: (flag: FlagshipFlag) => void;
	onTest: (flag: FlagshipFlag) => void;
	onToggle: (flag: FlagshipFlag) => void;
	pendingKey: string | null;
}

type SortColumn = "key" | "status" | "updated";

type SortDirection = "asc" | "desc";

interface SortState {
	column: SortColumn;
	direction: SortDirection;
}

function SortIcon({
	direction,
}: {
	direction: SortDirection | null;
}): JSX.Element {
	if (direction === "asc") {
		return <ArrowUpIcon size={11} weight="bold" />;
	}
	if (direction === "desc") {
		return <ArrowDownIcon size={11} weight="bold" />;
	}
	return (
		<ArrowsDownUpIcon
			className="opacity-0 transition-opacity group-hover/head:opacity-40"
			size={11}
			weight="bold"
		/>
	);
}

interface SortableHeadProps {
	children: ReactNode;
	className?: string;
	column: SortColumn;
	onSort: (column: SortColumn) => void;
	sort: SortState;
}

function SortableHead({
	children,
	className,
	column,
	onSort,
	sort,
}: SortableHeadProps): JSX.Element {
	const active = sort.column === column;
	const direction = active ? sort.direction : null;
	return (
		<Table.Head
			aria-sort={
				active ? (direction === "asc" ? "ascending" : "descending") : "none"
			}
			className={cn("group/head p-0!", className)}
		>
			<button
				className="flex w-full items-center gap-1.5 px-3 py-2 text-left transition-colors select-none hover:bg-kumo-overlay focus-visible:ring-2 focus-visible:ring-kumo-brand focus-visible:outline-none focus-visible:ring-inset"
				onClick={() => onSort(column)}
				type="button"
			>
				{children}
				<SortIcon direction={direction} />
			</button>
		</Table.Head>
	);
}

interface ActionMenuProps {
	enabled: boolean;
	onDelete: () => void;
	onEdit: () => void;
	onTest: () => void;
	onToggle: () => void;
	pending: boolean;
}

function ActionMenu({
	enabled,
	onDelete,
	onEdit,
	onTest,
	onToggle,
	pending,
}: ActionMenuProps): JSX.Element {
	return (
		<DropdownMenu modal={false}>
			<DropdownMenu.Trigger
				render={
					<Button
						aria-label="Row actions"
						className="text-kumo-subtle hover:text-kumo-default"
						shape="square"
						size="sm"
						variant="ghost"
					>
						<DotsThreeIcon size={16} weight="bold" />
					</Button>
				}
			/>
			<DropdownMenu.Content align="end" sideOffset={4}>
				<DropdownMenu.Item className="flex items-center gap-2" onClick={onEdit}>
					<PencilSimpleIcon />
					<span>Edit</span>
				</DropdownMenu.Item>
				<DropdownMenu.Item className="flex items-center gap-2" onClick={onTest}>
					<FlaskIcon />
					<span>Test</span>
				</DropdownMenu.Item>
				<DropdownMenu.Item disabled={pending} onClick={onToggle}>
					{enabled ? "Disable" : "Enable"}
				</DropdownMenu.Item>
				<DropdownMenu.Separator />
				<DropdownMenu.Item
					className="flex items-center gap-2 text-kumo-danger"
					onClick={onDelete}
				>
					<TrashIcon />
					<span>Delete</span>
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu>
	);
}

function formatValue(value: unknown): string {
	if (value === undefined) {
		return "";
	}
	return JSON.stringify(value) ?? String(value);
}

function ValueText({ value }: { value: string }): JSX.Element {
	if (value === "") {
		return <span className="text-xs text-kumo-subtle">—</span>;
	}
	const text = (
		<span className="max-w-40 truncate font-mono text-xs text-kumo-subtle">
			{value}
		</span>
	);
	if (value.length <= 24) {
		return text;
	}
	return (
		<Tooltip content={value} delay={400}>
			{text}
		</Tooltip>
	);
}

function updatedTime(flag: FlagshipFlag): number {
	if (flag.updated_at === undefined) {
		return 0;
	}
	const time = new Date(flag.updated_at).getTime();
	return Number.isNaN(time) ? 0 : time;
}

function compareFlags(
	a: FlagshipFlag,
	b: FlagshipFlag,
	column: SortColumn
): number {
	if (column === "status") {
		return Number(a.enabled === true) - Number(b.enabled === true);
	}
	if (column === "updated") {
		return updatedTime(a) - updatedTime(b);
	}
	return 0;
}

export function FlagTable({
	flags,
	onDelete,
	onEdit,
	onTest,
	onToggle,
	pendingKey,
}: FlagTableProps): JSX.Element {
	const [sort, setSort] = useState<SortState>({
		column: "updated",
		direction: "desc",
	});

	const sortedFlags = useMemo(() => {
		const factor = sort.direction === "asc" ? 1 : -1;
		return [...flags].sort((a, b) => {
			const primary = compareFlags(a, b, sort.column) * factor;
			if (primary !== 0) {
				return primary;
			}
			const byKey = (a.key ?? "").localeCompare(b.key ?? "");
			return sort.column === "key" ? byKey * factor : byKey;
		});
	}, [flags, sort]);

	function handleSort(column: SortColumn): void {
		setSort((current) => {
			if (current.column === column) {
				return {
					column,
					direction: current.direction === "asc" ? "desc" : "asc",
				};
			}
			return { column, direction: column === "key" ? "asc" : "desc" };
		});
	}

	return (
		<div className="overflow-x-auto rounded-lg border border-kumo-fill bg-kumo-base">
			<Table
				aria-label="Feature flags"
				className="[&_td]:px-3 [&_td]:py-2 [&_thead_th]:px-3 [&_thead_th]:py-2 [&_thead_th]:text-xs [&_thead_th]:font-medium [&_thead_th]:whitespace-nowrap [&_thead_th]:text-kumo-subtle"
			>
				<Table.Header>
					<Table.Row>
						<SortableHead
							className="w-2/5"
							column="key"
							onSort={handleSort}
							sort={sort}
						>
							Flag key
						</SortableHead>
						<Table.Head className="w-24">Type</Table.Head>
						<Table.Head className="w-56">Default variant</Table.Head>
						<SortableHead
							className="w-28"
							column="status"
							onSort={handleSort}
							sort={sort}
						>
							Status
						</SortableHead>
						<SortableHead
							className="w-40"
							column="updated"
							onSort={handleSort}
							sort={sort}
						>
							Last modified
						</SortableHead>
						<Table.Head className="w-14">
							<span className="sr-only">Actions</span>
						</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{sortedFlags.map((flag) => {
						const key = flag.key ?? "";
						const enabled = flag.enabled === true;
						const pending = pendingKey === key;
						const defaultVariation = flag.default_variation ?? "";
						const defaultValue = formatValue(
							flag.variations?.[defaultVariation]
						);
						const relative = timeAgo(flag.updated_at);
						return (
							<Table.Row
								className="group cursor-pointer align-middle transition-colors hover:bg-kumo-overlay"
								key={key}
								onClick={(event) => {
									const target = event.target as HTMLElement;
									if (
										!event.currentTarget.contains(target) ||
										target.closest("button") !== null ||
										target.closest("a") !== null
									) {
										return;
									}
									onEdit(flag);
								}}
							>
								<Table.Cell className="group/cell">
									<div className="flex min-w-52 items-center gap-1.5">
										<button
											className="min-w-0 cursor-pointer border-none bg-transparent p-0 text-left focus-visible:ring-2 focus-visible:ring-kumo-brand focus-visible:outline-none"
											onClick={() => onEdit(flag)}
											type="button"
										>
											<code className="block truncate text-[13px] font-medium text-kumo-default group-hover:text-kumo-link">
												{key}
											</code>
											{flag.description ? (
												<p className="mt-0.5 truncate text-xs text-kumo-subtle">
													{flag.description}
												</p>
											) : null}
										</button>
										<CopyButton text={key} />
									</div>
								</Table.Cell>
								<Table.Cell>
									{flag.type === undefined ? null : (
										<Badge variant="secondary">
											{FLAG_TYPE_LABELS[flag.type]}
										</Badge>
									)}
								</Table.Cell>
								<Table.Cell>
									<div className="flex min-w-0 items-center gap-2">
										<Badge className="font-mono" variant="outline">
											{defaultVariation || "unset"}
										</Badge>
										<ValueText value={defaultValue} />
									</div>
								</Table.Cell>
								<Table.Cell>
									<Badge
										className={cn(
											"gap-1.5 transition-opacity",
											pending && "opacity-50"
										)}
										variant="outline"
									>
										<span
											aria-hidden="true"
											className={cn(
												"size-1.5 rounded-full",
												enabled ? "bg-kumo-success" : "bg-kumo-badge-neutral"
											)}
										/>
										{enabled ? "Enabled" : "Disabled"}
									</Badge>
								</Table.Cell>
								<Table.Cell>
									{relative === "" ? (
										<span className="text-xs text-kumo-subtle">—</span>
									) : (
										<Tooltip content={formatDate(flag.updated_at)} delay={400}>
											<span className="text-xs whitespace-nowrap text-kumo-subtle">
												{relative}
											</span>
										</Tooltip>
									)}
								</Table.Cell>
								<Table.Cell className="text-right whitespace-nowrap">
									<ActionMenu
										enabled={enabled}
										onDelete={() => onDelete(flag)}
										onEdit={() => onEdit(flag)}
										onTest={() => onTest(flag)}
										onToggle={() => onToggle(flag)}
										pending={pending}
									/>
								</Table.Cell>
							</Table.Row>
						);
					})}
				</Table.Body>
			</Table>
		</div>
	);
}
