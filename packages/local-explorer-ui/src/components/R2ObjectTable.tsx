import { Button, DropdownMenu, Table } from "@cloudflare/kumo";
import {
	DotsThreeIcon,
	DownloadIcon,
	FileIcon,
	FolderIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { R2Object } from "../api";

interface R2ObjectTableProps {
	bucketName: string;
	currentPrefix: string;
	delimitedPrefixes: string[];
	objects: R2Object[];
	onDelete: (keys: string[]) => void;
	onNavigateToPrefix: (prefix: string) => void;
}

function formatSize(bytes: number | undefined): string {
	if (bytes === undefined || bytes === 0) {
		return "-";
	}

	const units = ["B", "KB", "MB", "GB", "TB"] satisfies string[];
	let unitIndex = 0;
	let size = bytes;
	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024;
		unitIndex++;
	}

	return `${size.toFixed(unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`;
}

function formatDate(dateString: string | undefined): string {
	if (!dateString) {
		return "-";
	}

	try {
		const date = new Date(dateString);
		return date.toLocaleDateString(undefined, {
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	} catch {
		return "-";
	}
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
					className="flex items-center gap-2 text-danger"
					onClick={onDelete}
				>
					<TrashIcon />
					<span>Delete</span>
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
	onNavigateToPrefix,
}: R2ObjectTableProps): JSX.Element | null {
	function handleDownload(obj: R2Object): void {
		if (!obj.key) {
			return;
		}

		const downloadUrl = `/cdn-cgi/explorer/api/r2/buckets/${encodeURIComponent(bucketName)}/objects/${encodeURIComponent(obj.key)}`;
		const link = document.createElement("a");
		link.href = downloadUrl;
		link.download = obj.key.split("/").pop() || "download";
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	}

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

	if (items.length === 0) {
		return null;
	}

	return (
		<div className="overflow-hidden rounded-lg border border-border">
			<Table>
				<Table.Header>
					<Table.Row>
						<Table.Head>Objects</Table.Head>
						<Table.Head>Type</Table.Head>
						<Table.Head>Size</Table.Head>
						<Table.Head>Modified</Table.Head>
						<Table.Head className="w-12" />
					</Table.Row>
				</Table.Header>

				<Table.Body>
					{items.map((item) => {
						if (item.type === "directory") {
							const displayName = getDisplayName(item.prefix, currentPrefix);
							return (
								<Table.Row key={item.prefix} className="group">
									<Table.Cell>
										<button
											className="flex cursor-pointer items-center gap-2 border-none bg-transparent p-0 text-left text-text hover:text-primary"
											onClick={() => onNavigateToPrefix(item.prefix)}
										>
											<FolderIcon
												size={16}
												className="text-orange-600 dark:text-orange-400"
											/>
											<span className="font-medium">{displayName}</span>
										</button>
									</Table.Cell>
									<Table.Cell className="text-text-secondary">
										Directory
									</Table.Cell>
									<Table.Cell className="text-text-secondary">-</Table.Cell>
									<Table.Cell className="text-text-secondary">-</Table.Cell>
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
									<Link
										to="/r2/$bucketName/object/$"
										params={{ bucketName, _splat: key }}
										className="flex items-center gap-2 text-text no-underline hover:text-primary"
									>
										<FileIcon size={16} className="text-muted" />
										<span className="font-medium">{displayName}</span>
									</Link>
								</Table.Cell>
								<Table.Cell className="font-mono text-xs text-text-secondary">
									{contentType}
								</Table.Cell>
								<Table.Cell className="text-text-secondary">
									{formatSize(obj.size)}
								</Table.Cell>
								<Table.Cell className="text-text-secondary">
									{formatDate(obj.last_modified)}
								</Table.Cell>
								<Table.Cell className="text-right whitespace-nowrap">
									<ActionMenu
										onDownload={() => handleDownload(obj)}
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
