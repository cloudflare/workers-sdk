import { Button, Dialog } from "@cloudflare/kumo";
import { DownloadIcon, TrashIcon } from "@phosphor-icons/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { r2BucketDeleteObjects, r2BucketGetObject } from "../../../api";
import R2Icon from "../../../assets/icons/r2.svg?react";
import { Breadcrumbs } from "../../../components/Breadcrumbs";
import { CopyButton } from "../../../components/CopyButton";
import { formatDate, formatSize } from "../../../utils/format";
import type { R2HeadObjectResult } from "../../../api";

export const Route = createFileRoute("/r2/$bucketName/object/$")({
	component: ObjectDetailView,
	loader: async ({ params }) => {
		const objectKey = params._splat;
		if (!objectKey) {
			throw new Error("Object key is required");
		}

		const response = await r2BucketGetObject({
			path: {
				bucket_name: params.bucketName,
				object_key: objectKey,
			},
			headers: {
				"cf-metadata-only": "true",
			},
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

interface ObjectDetailsCardProps {
	object: R2HeadObjectResult;
}

function ObjectDetailsCard({ object }: ObjectDetailsCardProps): JSX.Element {
	const contentType =
		object.http_metadata?.contentType ?? "application/octet-stream";
	const formattedDate = formatDate(object.last_modified);
	const [datePart, timePart] = formattedDate.includes("UTC")
		? [
				formattedDate.replace(/ \d{2}:\d{2}:\d{2} UTC$/, ""),
				formattedDate.match(/\d{2}:\d{2}:\d{2} UTC$/)?.[0] || "",
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

function CustomMetadataCard({
	metadata,
}: CustomMetadataCardProps): JSX.Element {
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
							<dt className="min-w-30 font-mono text-text-secondary">{key}</dt>
							<dd className="font-mono text-text">{value}</dd>
						</div>
					))}
				</dl>
			)}
		</div>
	);
}

function ObjectDetailView(): JSX.Element {
	const params = Route.useParams();
	const search = Route.useLoaderData();
	const navigate = useNavigate();

	const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false);
	const [deleting, setDeleting] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);

	function handleDownload(): void {
		const downloadUrl = `/cdn-cgi/explorer/api/r2/buckets/${encodeURIComponent(params.bucketName)}/objects/${encodeURIComponent(search.objectKey)}`;
		const link = document.createElement("a");
		link.href = downloadUrl;
		link.download = search.objectKey.split("/").pop() || "download";
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	}

	async function handleDelete(): Promise<void> {
		try {
			setDeleting(true);
			await r2BucketDeleteObjects({
				path: {
					bucket_name: params.bucketName,
				},
				body: [search.objectKey],
			});
			// Navigate back to bucket root or parent prefix
			const parentPrefix = search.objectKey.includes("/")
				? search.objectKey.substring(0, search.objectKey.lastIndexOf("/") + 1)
				: undefined;
			void navigate({
				params: {
					bucketName: params.bucketName,
				},
				search: parentPrefix ? { prefix: parentPrefix } : {},
				to: "/r2/$bucketName",
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to delete object");
			setDeleteDialogOpen(false);
		} finally {
			setDeleting(false);
		}
	}

	// Build breadcrumb items - bucket, parent folders, and object name
	const pathSegments = search.objectKey.split("/").filter(Boolean);
	const fileName = pathSegments.pop() || search.objectKey;
	const breadcrumbItems = [
		<Link
			className="text-text no-underline hover:text-primary"
			key="bucket"
			params={{ bucketName: params.bucketName }}
			search={{}}
			to="/r2/$bucketName"
		>
			{params.bucketName}
		</Link>,
		...pathSegments.map((segment, index) => {
			const segmentPrefix = pathSegments.slice(0, index + 1).join("/") + "/";
			return (
				<Link
					className="text-text no-underline hover:text-primary"
					key={segmentPrefix}
					params={{ bucketName: params.bucketName }}
					search={{ prefix: segmentPrefix }}
					to="/r2/$bucketName"
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
						<h1
							className="truncate text-base text-text"
							title={search.objectKey}
						>
							{search.objectKey}
						</h1>
						<CopyButton text={search.objectKey} />
					</div>

					<div className="flex shrink-0 items-center gap-2">
						<Button
							icon={DownloadIcon}
							onClick={handleDownload}
							variant="secondary"
						>
							Download
						</Button>
						<Button
							icon={TrashIcon}
							onClick={() => setDeleteDialogOpen(true)}
							variant="secondary-destructive"
						>
							Delete
						</Button>
					</div>
				</div>

				<div className="space-y-6">
					<ObjectDetailsCard object={search.object} />
					<CustomMetadataCard metadata={search.object.custom_metadata} />
				</div>

				{/* Delete Confirmation Dialog */}
				<Dialog.Root
					onOpenChange={(open) => !open && setDeleteDialogOpen(false)}
					open={deleteDialogOpen}
				>
					<Dialog className="p-6">
						{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
						<Dialog.Title className="mb-4 text-lg font-semibold">
							Delete object?
						</Dialog.Title>

						{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
						<Dialog.Description className="mb-2 text-text-secondary">
							Are you sure you want to delete &ldquo;{search.objectKey}
							&rdquo;? This cannot be undone.
						</Dialog.Description>

						<div className="mt-6 flex justify-end gap-2">
							<Button
								disabled={deleting}
								onClick={() => setDeleteDialogOpen(false)}
								variant="secondary"
							>
								Cancel
							</Button>
							<Button
								disabled={deleting}
								loading={deleting}
								onClick={handleDelete}
								variant="destructive"
							>
								{deleting ? "Deleting..." : "Delete"}
							</Button>
						</div>
					</Dialog>
				</Dialog.Root>
			</div>
		</>
	);
}
