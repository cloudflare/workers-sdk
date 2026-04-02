import { Button, Checkbox, DropdownMenu, Table } from "@cloudflare/kumo";
import {
	DotsThreeIcon,
	DownloadIcon,
	FileIcon,
	FolderIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { formatDate, formatSize } from "../utils/format";
import type { R2Object } from "../api";

interface R2ObjectTableProps {
	bucketName: string;
	currentPrefix: string;
	delimitedPrefixes: string[];
	objects: R2Object[];
	onDelete: (keys: string[]) => void;
	onDownload: (keys: string[]) => void;
	onNavigateToPrefix: (prefix: string) => void;
	onSelectionChange: (keys: Set<string>) => void;
	selectedKeys: Set<string>;
}

function getDisplayName(key: string, currentPrefix: string): string {
	const withoutPrefix = key.startsWith(currentPrefix)
		? key.slice(currentPrefix.length)
		: key;

	return withoutPrefix;
}

function getContentType(obj: R2Object): string {
	return obj.http_metadata?.contentType ?? "application/octet-stream";
}

interface ActionMenuProps {
	isDirectory?: boolean;
	onDelete: () => void;
	onDownload?: () => void;
}

function ActionMenu({
	isDirectory,
	onDelete,
	onDownload,
}: ActionMenuProps): JSX.Element {
	return (
		<DropdownMenu>
			<DropdownMenu.Trigger
				render={
					<Button
						aria-label="Actions"
						className="h-7! w-7!"
						shape="square"
						variant="ghost"
					>
						<DotsThreeIcon size={16} weight="bold" />
					</Button>
				}
			/>

			<DropdownMenu.Content align="end" sideOffset={4}>
				{!isDirectory && onDownload && (
					<>
						<DropdownMenu.Item
							className="flex items-center gap-2"
							onClick={onDownload}
						>
							<DownloadIcon />
							<span>Download</span>
						</DropdownMenu.Item>
						<DropdownMenu.Separator />
					</>
				)}

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

interface BulkActionMenuProps {
	disabled: boolean;
	onDelete: () => void;
	onDownload: () => void;
	selectedFileCount: number;
	selectedTotalCount: number;
}

function BulkActionMenu({
	disabled,
	onDelete,
	onDownload,
	selectedFileCount,
	selectedTotalCount,
}: BulkActionMenuProps): JSX.Element {
	return (
		<DropdownMenu>
			<DropdownMenu.Trigger
				render={
					<Button
						aria-label="Bulk actions"
						className="h-7! w-7!"
						disabled={disabled}
						shape="square"
						variant="ghost"
					>
						<DotsThreeIcon size={16} weight="bold" />
					</Button>
				}
			/>

			<DropdownMenu.Content align="end" sideOffset={4}>
				{selectedFileCount > 0 && (
					<>
						<DropdownMenu.Item
							className="flex items-center gap-2"
							onClick={onDownload}
						>
							<DownloadIcon />
							<span>
								Download {selectedFileCount}{" "}
								{selectedFileCount === 1 ? "file" : "files"}
							</span>
						</DropdownMenu.Item>
						<DropdownMenu.Separator />
					</>
				)}
				<DropdownMenu.Item
					className="flex items-center gap-2 text-kumo-danger"
					onClick={onDelete}
				>
					<TrashIcon />
					<span>
						Delete {selectedTotalCount}{" "}
						{selectedTotalCount === 1 ? "item" : "items"}
					</span>
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu>
	);
}

export function R2ObjectTable({
	bucketName,
	currentPrefix,
	delimitedPrefixes,
	objects,
	onDelete,
	onDownload,
	onNavigateToPrefix,
	onSelectionChange,
	selectedKeys,
}: R2ObjectTableProps): JSX.Element | null {
	// Combine directories and files for display
	const items: Array<
		| {
				prefix: string;
				type: "directory";
		  }
		| {
				object: R2Object;
				type: "file";
		  }
	> = [
		...delimitedPrefixes.map((prefix) => ({
			prefix,
			type: "directory" as const,
		})),
		...objects
			.filter((obj) => {
				// Filter out "directory marker" objects (zero-byte objects ending in /)
				const key = obj.key ?? "";
				if (key.endsWith("/") && obj.size === 0) {
					return false;
				}

				return true;
			})
			.map((object) => ({
				object,
				type: "file" as const,
			})),
	];

	// Get all selectable keys (both files and directories)
	const selectableKeys = items
		.map((item) => (item.type === "directory" ? item.prefix : item.object.key))
		.filter((key): key is string => key !== undefined);

	// Get selected file keys (excluding directories) for download
	const selectedFileKeys = Array.from(selectedKeys).filter(
		(key) => !delimitedPrefixes.includes(key)
	);

	const allItemsSelected =
		selectableKeys.length > 0 &&
		selectableKeys.every((key) => selectedKeys.has(key));

	const someItemsSelected = selectableKeys.some((key) => selectedKeys.has(key));

	function handleSelectAll(): void {
		// Deselect all
		if (allItemsSelected) {
			onSelectionChange(new Set());
			return;
		}

		// Select all items
		onSelectionChange(new Set(selectableKeys));
	}

	function handleSelectItem(key: string): void {
		const newSelection = new Set(selectedKeys);
		if (newSelection.has(key)) {
			newSelection.delete(key);
		} else {
			newSelection.add(key);
		}

		onSelectionChange(newSelection);
	}

	if (items.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center space-y-2 p-12 text-center text-kumo-subtle">
				<h2 className="text-2xl font-medium">
					{currentPrefix
						? "No objects in this directory"
						: "No objects in this bucket"}
				</h2>
				<p className="text-sm font-light">
					Upload an object using the button above.
				</p>
			</div>
		);
	}

	return (
		<div className="overflow-hidden rounded-lg border border-kumo-fill">
			<Table>
				<Table.Header>
					<Table.Row>
						<Table.Head className="w-12">
							<Checkbox
								aria-label="Select all"
								checked={allItemsSelected}
								className="hover:cursor-pointer"
								disabled={selectableKeys.length === 0}
								indeterminate={someItemsSelected && !allItemsSelected}
								onCheckedChange={handleSelectAll}
							/>
						</Table.Head>
						<Table.Head>Objects</Table.Head>
						<Table.Head>Type</Table.Head>
						<Table.Head>Size</Table.Head>
						<Table.Head>Modified</Table.Head>
						<Table.Head className="w-12">
							<BulkActionMenu
								disabled={selectedKeys.size === 0}
								onDelete={() => onDelete(Array.from(selectedKeys))}
								onDownload={() => onDownload(selectedFileKeys)}
								selectedFileCount={selectedFileKeys.length}
								selectedTotalCount={selectedKeys.size}
							/>
						</Table.Head>
					</Table.Row>
				</Table.Header>

				<Table.Body>
					{items.map((item) => {
						if (item.type === "directory") {
							const displayName = getDisplayName(item.prefix, currentPrefix);
							return (
								<Table.Row key={item.prefix} className="group">
									<Table.Cell>
										<Checkbox
											aria-label={`Select ${displayName}`}
											checked={selectedKeys.has(item.prefix)}
											className="hover:cursor-pointer"
											onCheckedChange={() => handleSelectItem(item.prefix)}
										/>
									</Table.Cell>
									<Table.Cell>
										<button
											className="flex cursor-pointer items-center gap-2 border-none bg-transparent p-0 text-left text-kumo-default hover:text-kumo-link"
											onClick={() => onNavigateToPrefix(item.prefix)}
										>
											<FolderIcon size={16} className="text-kumo-brand-hover" />
											<span className="font-medium">{displayName}</span>
										</button>
									</Table.Cell>
									<Table.Cell className="text-kumo-subtle">
										Directory
									</Table.Cell>
									<Table.Cell className="text-kumo-subtle">-</Table.Cell>
									<Table.Cell className="text-kumo-subtle">-</Table.Cell>
									<Table.Cell className="text-right whitespace-nowrap">
										<ActionMenu
											isDirectory
											onDelete={() => onDelete([item.prefix])}
										/>
									</Table.Cell>
								</Table.Row>
							);
						}

						const obj = item.object;
						const key = obj.key ?? "";
						const displayName = getDisplayName(key, currentPrefix);
						const contentType = getContentType(obj);

						return (
							<Table.Row key={key} className="group">
								<Table.Cell>
									<Checkbox
										aria-label={`Select ${displayName}`}
										checked={selectedKeys.has(key)}
										className="hover:cursor-pointer"
										onCheckedChange={() => handleSelectItem(key)}
									/>
								</Table.Cell>
								<Table.Cell>
									<Link
										to="/r2/$bucketName/object/$"
										params={{ bucketName, _splat: key }}
										className="flex items-center gap-2 text-kumo-default no-underline hover:text-kumo-link"
									>
										<FileIcon size={16} className="text-kumo-subtle" />
										<span className="font-medium">{displayName}</span>
									</Link>
								</Table.Cell>
								<Table.Cell className="font-mono text-xs text-kumo-subtle">
									{contentType}
								</Table.Cell>
								<Table.Cell className="text-kumo-subtle">
									{formatSize(obj.size)}
								</Table.Cell>
								<Table.Cell className="text-kumo-subtle">
									{formatDate(obj.last_modified)}
								</Table.Cell>
								<Table.Cell className="text-right whitespace-nowrap">
									<ActionMenu
										onDownload={() => onDownload([key])}
										onDelete={() => onDelete([key])}
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
