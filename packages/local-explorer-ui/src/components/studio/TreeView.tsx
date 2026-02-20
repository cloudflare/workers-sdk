import { Button, cn } from "@cloudflare/kumo";
import {
	CaretDownIcon,
	CaretRightIcon,
	DotsThreeIcon,
} from "@phosphor-icons/react";
import React from "react";
import { StudioHighlightText } from "./HighlightText";
import type { Icon } from "@phosphor-icons/react";

export interface StudioTreeViewItem<T = unknown> {
	key: string;
	name: string;
	icon: Icon;
	iconColor?: string;
	data: T;
	children?: StudioTreeViewItem<T>[];
}

interface TreeViewProps<T> {
	/** List of items to render in the tree */
	items: StudioTreeViewItem<T>[];

	/** If true, the tree will expand to fill available width and height */
	full?: boolean;

	/** Optional filter function to determine which items are visible */
	filter?: (item: StudioTreeViewItem<T>) => boolean;

	/** Text to highlight in item names (case-insensitive) */
	highlight?: string;

	/** Set of item keys that are currently collapsed */
	collapsedKeys?: Set<string>;

	/** Callback when collapsed keys change */
	onCollapsedChange?: (keys: Set<string>) => void;

	/** Currently selected item key */
	selectedKey?: string;

	/** Callback when an item is selected */
	onSelectChange?: (item: StudioTreeViewItem<T>) => void;

	/** Callback when an item is double-clicked */
	onDoubleClick?: (item: StudioTreeViewItem<T>) => void;

	onContextMenu?: (
		item: StudioTreeViewItem<T>,
		event: React.MouseEvent
	) => void;
}

interface TreeViewRendererProps<T> extends TreeViewProps<T> {
	depth: number;
}

function CollapsedButton({
	hasCollapsed,
	collapsed,
	onClick,
}: {
	hasCollapsed: boolean;
	collapsed: boolean;
	onClick: () => void;
}) {
	return hasCollapsed ? (
		<div onClick={onClick} className="flex items-center">
			{collapsed ? (
				<CaretDownIcon className="h-4 w-4" />
			) : (
				<CaretRightIcon className="h-4 w-4" />
			)}
		</div>
	) : (
		<div className="w-4 shrink-0"></div>
	);
}

/**
 * Recursively checks if the item or any of its children match the filter condition.
 */
function matchesFilterRecursive<T = unknown>(
	item: StudioTreeViewItem<T>,
	filter?: (item: StudioTreeViewItem<T>) => boolean
): boolean {
	if (!filter) {
		return true;
	}

	return (
		filter(item) ||
		(item.children ?? []).some((child) => matchesFilterRecursive(child, filter))
	);
}

export function renderList<T>(props: TreeViewRendererProps<T>) {
	const { items, depth, ...rest } = props;
	const {
		filter,
		highlight,
		onDoubleClick,
		onSelectChange,
		selectedKey,
		collapsedKeys,
		onCollapsedChange,
		onContextMenu,
	} = rest;

	if (items.length === 0) {
		return null;
	}

	const listCollapsed = items.some(
		(item) => item.children && item.children.length > 0
	);

	return (
		<>
			{items
				.filter((item) => matchesFilterRecursive(item, filter))
				.map((item) => {
					const hasCollapsed =
						Array.isArray(item.children) && item.children.length > 0;

					const isCollapsed = !!collapsedKeys && collapsedKeys.has(item.key);

					const collapsedClicked = () => {
						if (onCollapsedChange) {
							if (collapsedKeys) {
								const tmpSet = new Set(collapsedKeys);
								if (tmpSet.has(item.key)) {
									tmpSet.delete(item.key);
								} else {
									tmpSet.add(item.key);
								}
								onCollapsedChange(tmpSet);
							} else {
								onCollapsedChange(new Set([item.key]));
							}
						}
					};

					return (
						<React.Fragment key={item.key}>
							<div
								onDoubleClick={() => {
									if (onDoubleClick) {
										onDoubleClick(item);
									}
								}}
								onClick={() => {
									if (onSelectChange) {
										onSelectChange(item);
									}
								}}
								onContextMenu={(e) => {
									onSelectChange?.(item);
									e.preventDefault();
								}}
							>
								<div
									className={cn(
										"flex h-8 items-center gap-0.5 px-4 text-xs cursor-pointer w-full group",
										selectedKey === item.key
											? "bg-surface-tertiary text-text"
											: "hover:bg-surface-tertiary",
										"border border-transparent"
									)}
								>
									<Indentation depth={depth} />
									{(depth > 0 || listCollapsed) && (
										<CollapsedButton
											hasCollapsed={hasCollapsed}
											onClick={collapsedClicked}
											collapsed={isCollapsed}
										/>
									)}
									{item.icon && (
										<item.icon
											className={cn("h-4 w-4 mr-1 shrink-0", item.iconColor)}
										/>
									)}

									<div className="line-clamp-1 flex-1 text-xs">
										<StudioHighlightText
											text={item.name}
											highlight={highlight}
										/>
									</div>

									{/* Padding added to increase the clickable area for better UX */}
									{onContextMenu && (
										<div
											className={cn(
												selectedKey !== item.key && "hidden",
												"py-1 group-hover:block"
											)}
											style={{ paddingLeft: 10 }}
											onClick={(e) => {
												onContextMenu(item, e);
											}}
											onContextMenu={(e) => {
												onContextMenu(item, e);
												e.preventDefault();
											}}
										>
											<Button
												size="sm"
												shape="square"
												variant="ghost"
												aria-label="More options"
											>
												<DotsThreeIcon size={20} weight="bold" />
											</Button>
										</div>
									)}
								</div>
							</div>
							{isCollapsed &&
								renderList({
									...rest,
									depth: depth + 1,
									items: item.children ?? [],
								})}
						</React.Fragment>
					);
				})}
		</>
	);
}

// Adds left spacing based on the current depth of the tree
function Indentation({ depth }: { depth: number }) {
	if (depth <= 0) {
		return null;
	}

	return (
		<>
			{new Array(depth).fill(false).map((_, idx: number) => {
				return <div key={idx} className={cn("w-4 shrink-0")}></div>;
			})}
		</>
	);
}

export function StudioTreeView<T = unknown>(props: TreeViewProps<T>) {
	const { full, ...rest } = props;

	return (
		<div
			tabIndex={0}
			className={cn(full ? "grow overflow-auto" : "", "select-none")}
		>
			<div className={"flex flex-col"}>
				{renderList({
					...rest,
					depth: 0,
				})}
			</div>
		</div>
	);
}
