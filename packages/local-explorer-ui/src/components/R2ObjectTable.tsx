import { Button, cn, DropdownMenu } from "@cloudflare/kumo";
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
		<table className="w-full border-separate border-spacing-0 rounded-lg border border-border bg-bg">
			<thead>
				<tr>
					<th className="border-b border-border bg-bg px-3 py-2.5 text-left text-xs font-semibold tracking-wide text-text-secondary uppercase first:rounded-tl-[7px]">
						Objects
					</th>
					<th className="border-b border-border bg-bg px-3 py-2.5 text-left text-xs font-semibold tracking-wide text-text-secondary uppercase">
						Type
					</th>
					<th className="border-b border-border bg-bg px-3 py-2.5 text-left text-xs font-semibold tracking-wide text-text-secondary uppercase">
						Size
					</th>
					<th className="border-b border-border bg-bg px-3 py-2.5 text-left text-xs font-semibold tracking-wide text-text-secondary uppercase">
						Modified
					</th>
					<th className="w-12 border-b border-border bg-bg px-3 py-2.5 text-left text-xs font-semibold tracking-wide text-text-secondary uppercase last:rounded-tr-[7px]"></th>
				</tr>
			</thead>

			<tbody>
				{items.map((item, index) => {
					const isLast = index === items.length - 1;

					if (item.type === "directory") {
						const displayName = getDisplayName(item.prefix, currentPrefix);
						return (
							<tr key={item.prefix} className="group hover:bg-bg-tertiary">
								<td
									className={cn(
										"px-3 py-2 text-left",
										isLast
											? "border-b-0 first:rounded-bl-[7px]"
											: "border-b border-border"
									)}
								>
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
								</td>
								<td
									className={cn(
										"px-3 py-2 text-text-secondary",
										isLast ? "border-b-0" : "border-b border-border"
									)}
								>
									Directory
								</td>
								<td
									className={cn(
										"px-3 py-2 text-text-secondary",
										isLast ? "border-b-0" : "border-b border-border"
									)}
								>
									-
								</td>
								<td
									className={cn(
										"px-3 py-2 text-text-secondary",
										isLast ? "border-b-0" : "border-b border-border"
									)}
								>
									-
								</td>
								<td
									className={cn(
										"px-3 py-2 text-right whitespace-nowrap",
										isLast
											? "border-b-0 last:rounded-br-[7px]"
											: "border-b border-border"
									)}
								>
									<ActionMenu
										isDirectory
										onDelete={() => onDelete([item.prefix])}
									/>
								</td>
							</tr>
						);
					}

					const obj = item.object;
					const key = obj.key ?? "";
					const displayName = getDisplayName(key, currentPrefix);
					const contentType = getContentType(obj);

					return (
						<tr key={key} className="group hover:bg-bg-tertiary">
							<td
								className={cn(
									"px-3 py-2 text-left",
									isLast
										? "border-b-0 first:rounded-bl-[7px]"
										: "border-b border-border"
								)}
							>
								<Link
									to="/r2/$bucketName/object/$"
									params={{ bucketName, _splat: key }}
									className="flex items-center gap-2 text-text no-underline hover:text-primary"
								>
									<FileIcon size={16} className="text-muted" />
									<span className="font-medium">{displayName}</span>
								</Link>
							</td>
							<td
								className={cn(
									"px-3 py-2 font-mono text-xs text-text-secondary",
									isLast ? "border-b-0" : "border-b border-border"
								)}
							>
								{contentType}
							</td>
							<td
								className={cn(
									"px-3 py-2 text-text-secondary",
									isLast ? "border-b-0" : "border-b border-border"
								)}
							>
								{formatSize(obj.size)}
							</td>
							<td
								className={cn(
									"px-3 py-2 text-text-secondary",
									isLast ? "border-b-0" : "border-b border-border"
								)}
							>
								{formatDate(obj.last_modified)}
							</td>
							<td
								className={cn(
									"px-3 py-2 text-right whitespace-nowrap",
									isLast
										? "border-b-0 last:rounded-br-[7px]"
										: "border-b border-border"
								)}
							>
								<ActionMenu
									onDownload={() => handleDownload(obj)}
									onDelete={() => onDelete([key])}
								/>
							</td>
						</tr>
					);
				})}
			</tbody>
		</table>
	);
}
