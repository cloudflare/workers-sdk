import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Button } from "@base-ui/react/button";
import { DownloadIcon, TrashIcon } from "@phosphor-icons/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { r2BucketDeleteObjects, r2BucketGetObject } from "../../../api";
import R2Icon from "../../../assets/icons/r2.svg?react";
import { Breadcrumbs } from "../../../components/Breadcrumbs";
import { CopyButton } from "../../../components/CopyButton";
import type { R2HeadObjectResult } from "../../../api";

export const Route = createFileRoute("/r2/$bucketName/object/$")({
	component: ObjectDetailView,
	loader: async ({ params }) => {
		const objectKey = params._splat;
		if (!objectKey) {
			throw new Error("Object key is required");
		}

		const response = await r2BucketGetObject({
			path: { bucket_name: params.bucketName, object_key: objectKey },
			headers: { "cf-metadata-only": "true" },
		});

		const result = response.data?.result;
		if (!result) {
			throw new Error(`Object "${objectKey}" not found`);
		}

		return {
			object: result,
			objectKey,
		};
	},
});

function formatSize(bytes: number | undefined): string {
	if (bytes === undefined || bytes === 0) {
		return "0 B";
	}
	const units = ["B", "KB", "MB", "GB", "TB"];
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
		// Format: "13 May 2025 01:11:37 GMT"
		const day = date.getUTCDate();
		const month = date.toLocaleString("en-US", {
			month: "short",
			timeZone: "UTC",
		});
		const year = date.getUTCFullYear();
		const time = date.toLocaleString("en-US", {
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: false,
			timeZone: "UTC",
		});
		return `${day} ${month} ${year} ${time} GMT`;
	} catch {
		return "-";
	}
}

interface ObjectDetailsCardProps {
	object: R2HeadObjectResult;
}

function ObjectDetailsCard({ object }: ObjectDetailsCardProps) {
	const contentType =
		object.http_metadata?.contentType ?? "application/octet-stream";
	const formattedDate = formatDate(object.last_modified);
	const [datePart, timePart] = formattedDate.includes("GMT")
		? [
				formattedDate.replace(/ \d{2}:\d{2}:\d{2} GMT$/, ""),
				formattedDate.match(/\d{2}:\d{2}:\d{2} GMT$/)?.[0] || "",
			]
		: [formattedDate, ""];

	return (
		<div className="rounded-lg border border-border bg-bg p-6">
			<h3 className="mb-4 text-base font-semibold text-text">Object Details</h3>
			<dl className="grid grid-cols-3 gap-x-8 gap-y-2 text-sm">
				<div>
					<dt className="text-text-secondary">Date Created</dt>
					<dd className="mt-1">
						<span className="text-text">{datePart}</span>
						{timePart && (
							<span className="ml-1 text-text-secondary">{timePart}</span>
						)}
					</dd>
				</div>
				<div>
					<dt className="text-text-secondary">Type</dt>
					<dd className="mt-1 text-text">{contentType}</dd>
				</div>
				<div>
					<dt className="text-text-secondary">Size</dt>
					<dd className="mt-1 text-text">{formatSize(object.size)}</dd>
				</div>
			</dl>
		</div>
	);
}

interface CustomMetadataCardProps {
	metadata: Record<string, string> | undefined;
}

function CustomMetadataCard({ metadata }: CustomMetadataCardProps) {
	const entries = metadata ? Object.entries(metadata) : [];

	return (
		<div className="rounded-lg border border-border bg-bg p-6">
			<h3 className="mb-4 text-base font-semibold text-text">
				Custom Metadata
			</h3>
			{entries.length === 0 ? (
				<p className="text-sm text-text-secondary">No custom metadata set</p>
			) : (
				<dl className="space-y-2 text-sm">
					{entries.map(([key, value]) => (
						<div key={key} className="flex gap-4">
							<dt className="min-w-[120px] font-mono text-text-secondary">
								{key}
							</dt>
							<dd className="font-mono text-text">{value}</dd>
						</div>
					))}
				</dl>
			)}
		</div>
	);
}

function ObjectDetailView() {
	const { bucketName } = Route.useParams();
	const { object, objectKey } = Route.useLoaderData();
	const navigate = useNavigate();

	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleDownload = () => {
		const downloadUrl = `/cdn-cgi/explorer/api/r2/buckets/${encodeURIComponent(bucketName)}/objects/${encodeURIComponent(objectKey)}`;
		const link = document.createElement("a");
		link.href = downloadUrl;
		link.download = objectKey.split("/").pop() || "download";
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	};

	const handleDelete = async () => {
		try {
			setDeleting(true);
			await r2BucketDeleteObjects({
				path: { bucket_name: bucketName },
				body: [objectKey],
			});
			// Navigate back to bucket root or parent prefix
			const parentPrefix = objectKey.includes("/")
				? objectKey.substring(0, objectKey.lastIndexOf("/") + 1)
				: undefined;
			void navigate({
				to: "/r2/$bucketName",
				params: { bucketName },
				search: parentPrefix ? { prefix: parentPrefix } : {},
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to delete object");
			setDeleteDialogOpen(false);
		} finally {
			setDeleting(false);
		}
	};

	// Build breadcrumb items - bucket, parent folders, and object name
	const pathSegments = objectKey.split("/").filter(Boolean);
	const fileName = pathSegments.pop() || objectKey;
	const breadcrumbItems = [
		<Link
			key="bucket"
			to="/r2/$bucketName"
			params={{ bucketName }}
			search={{}}
			className="text-text no-underline hover:text-primary"
		>
			{bucketName}
		</Link>,
		...pathSegments.map((segment, index) => {
			const segmentPrefix = pathSegments.slice(0, index + 1).join("/") + "/";
			return (
				<Link
					key={segmentPrefix}
					to="/r2/$bucketName"
					params={{ bucketName }}
					search={{ prefix: segmentPrefix }}
					className="text-text no-underline hover:text-primary"
				>
					{segment}
				</Link>
			);
		}),
		<span key="file">{fileName}</span>,
	];

	return (
		<>
			<Breadcrumbs icon={R2Icon} title="R2" items={breadcrumbItems} />

			<div className="px-6 py-6">
				{error && (
					<div className="mb-4 rounded-md border border-danger/20 bg-danger/8 p-4 text-danger">
						{error}
					</div>
				)}

				<div className="mb-6 flex items-center justify-between">
					<div className="flex min-w-0 items-center gap-2">
						<h1 className="truncate text-base text-text" title={objectKey}>
							{objectKey}
						</h1>
						<CopyButton text={objectKey} />
					</div>
					<div className="flex shrink-0 items-center gap-2">
						<Button
							className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border bg-bg px-3 py-2 text-sm font-medium text-text transition-[background-color,transform] hover:bg-bg-tertiary active:translate-y-px"
							onClick={handleDownload}
						>
							<DownloadIcon size={16} />
							Download
						</Button>
						<Button
							className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border-none bg-danger px-3 py-2 text-sm font-medium text-white transition-[background-color,transform] hover:bg-danger-hover active:translate-y-px"
							onClick={() => setDeleteDialogOpen(true)}
						>
							<TrashIcon size={16} />
							Delete
						</Button>
					</div>
				</div>

				<div className="space-y-6">
					<ObjectDetailsCard object={object} />
					<CustomMetadataCard metadata={object.custom_metadata} />
				</div>

				{/* Delete Confirmation Dialog */}
				<AlertDialog.Root
					open={deleteDialogOpen}
					onOpenChange={(open) => !open && setDeleteDialogOpen(false)}
				>
					<AlertDialog.Portal>
						<AlertDialog.Backdrop className="fixed inset-0 z-1000 flex items-center justify-center bg-black/50 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
						<AlertDialog.Popup className="fixed top-1/2 left-1/2 z-1001 w-full max-w-125 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-bg p-6 shadow-[0_4px_24px_rgba(0,0,0,0.15),0_0_0_1px_var(--color-border)] transition-[opacity,transform] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
							<AlertDialog.Title className="mb-4 text-lg font-semibold">
								Delete object?
							</AlertDialog.Title>
							<AlertDialog.Description className="mb-2 text-text-secondary">
								Are you sure you want to delete &ldquo;{objectKey}&rdquo;? This
								cannot be undone.
							</AlertDialog.Description>
							<div className="mt-6 flex justify-end gap-2">
								<AlertDialog.Close
									render={
										<Button className="inline-flex cursor-pointer items-center justify-center rounded-md border border-none border-border bg-bg-tertiary px-4 py-2 text-sm font-medium text-text transition-[background-color,transform] hover:bg-border active:translate-y-px data-disabled:cursor-not-allowed data-disabled:opacity-60 data-disabled:active:translate-y-0" />
									}
									disabled={deleting}
								>
									Cancel
								</AlertDialog.Close>
								<Button
									className="inline-flex cursor-pointer items-center justify-center rounded-md border-none bg-danger px-4 py-2 text-sm font-medium text-white transition-[background-color,transform] hover:bg-danger-hover active:translate-y-px data-disabled:cursor-not-allowed data-disabled:opacity-60 data-disabled:active:translate-y-0"
									onClick={handleDelete}
									disabled={deleting}
									focusableWhenDisabled
								>
									{deleting ? "Deleting..." : "Delete"}
								</Button>
							</div>
						</AlertDialog.Popup>
					</AlertDialog.Portal>
				</AlertDialog.Root>
			</div>
		</>
	);
}
