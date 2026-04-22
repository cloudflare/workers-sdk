import { Button, Dialog } from "@cloudflare/kumo";
import { DownloadIcon, TrashIcon } from "@phosphor-icons/react";
import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
} from "@tanstack/react-router";
import { useState } from "react";
import { r2BucketDeleteObjects, r2BucketGetObject } from "../../../api";
import R2Icon from "../../../assets/icons/r2.svg?react";
import { Breadcrumbs } from "../../../components/Breadcrumbs";
import { CopyButton } from "../../../components/CopyButton";
import { NotFound } from "../../../components/NotFound";
import { ResourceError } from "../../../components/ResourceError";
import { formatDate, formatSize } from "../../../utils/format";
import type { R2HeadObjectResult } from "../../../api";

export interface ObjectDetailSearch {
	delimiter?: boolean;
}

export const Route = createFileRoute("/r2/$bucketName/object/$")({
	component: ObjectDetailView,
	errorComponent: ResourceError,
	validateSearch: (search: Record<string, unknown>): ObjectDetailSearch => ({
		delimiter: search.delimiter === false ? false : true,
	}),
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
			throwOnError: false,
		});
		if (response.response?.status === 404) {
			throw notFound();
		}

		if (response.error) {
			throw new Error(`Failed to fetch object "${objectKey}"`);
		}

		const result = response.data?.result;
		if (!result) {
			throw notFound();
		}

		return {
			object: result,
			objectKey,
		};
	},
	notFoundComponent: NotFound,
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
		<div className="rounded-lg border border-kumo-fill bg-kumo-base p-6">
			<h3 className="mb-4 text-base font-semibold text-kumo-default">
				Object Details
			</h3>
			<dl className="grid grid-cols-3 gap-x-8 gap-y-2 text-sm">
				<div>
					<dt className="text-kumo-subtle">Date Created</dt>
					<dd className="mt-1">
						<span className="text-kumo-default">{datePart}</span>
						{timePart && (
							<span className="ml-1 text-kumo-subtle">{timePart}</span>
						)}
					</dd>
				</div>
				<div>
					<dt className="text-kumo-subtle">Type</dt>
					<dd className="mt-1 text-kumo-default">{contentType}</dd>
				</div>
				<div>
					<dt className="text-kumo-subtle">Size</dt>
					<dd className="mt-1 text-kumo-default">{formatSize(object.size)}</dd>
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
		<div className="rounded-lg border border-kumo-fill bg-kumo-base p-6">
			<h3 className="mb-4 text-base font-semibold text-kumo-default">
				Custom Metadata
			</h3>

			{entries.length === 0 ? (
				<p className="text-sm text-kumo-subtle">No custom metadata set</p>
			) : (
				<dl className="space-y-2 text-sm">
					{entries.map(([key, value]) => (
						<div key={key} className="flex gap-4">
							<dt className="min-w-30 font-mono text-kumo-subtle">{key}</dt>
							<dd className="font-mono text-kumo-default">{value}</dd>
						</div>
					))}
				</dl>
			)}
		</div>
	);
}

function ObjectDetailView(): JSX.Element {
	const params = Route.useParams();
	const loaderData = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = useNavigate();

	const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false);
	const [deleting, setDeleting] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);

	function handleDownload(): void {
		const downloadUrl = `/cdn-cgi/explorer/api/r2/buckets/${encodeURIComponent(params.bucketName)}/objects/${encodeURIComponent(loaderData.objectKey)}`;
		const link = document.createElement("a");
		link.href = downloadUrl;
		link.download = loaderData.objectKey.split("/").pop() || "download";
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
				body: [loaderData.objectKey],
			});
			// Navigate back to bucket root or parent prefix
			const parentPrefix = loaderData.objectKey.includes("/")
				? loaderData.objectKey.substring(
						0,
						loaderData.objectKey.lastIndexOf("/") + 1
					)
				: undefined;
			void navigate({
				params: {
					bucketName: params.bucketName,
				},
				search: (prev) => ({
					...prev,
					prefix: parentPrefix,
				}),
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
	const directoryView = search.delimiter !== false;

	const pathSegments = directoryView
		? loaderData.objectKey.split("/").filter(Boolean)
		: [];
	const fileName = directoryView
		? pathSegments.pop() || loaderData.objectKey
		: loaderData.objectKey;
	const breadcrumbItems = [
		// bucket name
		<Link
			className="text-kumo-default no-underline hover:text-kumo-link"
			key="bucket"
			params={{ bucketName: params.bucketName }}
			search={(prev) => ({ ...prev, prefix: undefined })}
			to="/r2/$bucketName"
		>
			{params.bucketName}
		</Link>,
		// optional path segments (only if set to folder mode)
		...pathSegments.map((segment, index) => {
			const segmentPrefix = pathSegments.slice(0, index + 1).join("/") + "/";
			return (
				<Link
					className="text-kumo-default no-underline hover:text-kumo-link"
					key={segmentPrefix}
					params={{ bucketName: params.bucketName }}
					search={(prev) => ({ ...prev, prefix: segmentPrefix })}
					to="/r2/$bucketName"
				>
					{segment}/
				</Link>
			);
		}),
		// file name (may be full object key if not in folder mode)
		<span key="file">{fileName}</span>,
	];

	return (
		<>
			<Breadcrumbs icon={R2Icon} title="R2" items={breadcrumbItems} />

			<div className="px-6 py-6">
				{error && (
					<div className="mb-4 rounded-md border border-kumo-danger/20 bg-kumo-danger/8 p-4 text-kumo-danger">
						{error}
					</div>
				)}

				<div className="mb-6 flex items-center justify-between">
					<div className="flex min-w-0 items-center gap-2">
						<h1
							className="truncate text-base text-kumo-default"
							title={loaderData.objectKey}
						>
							{loaderData.objectKey}
						</h1>
						<CopyButton text={loaderData.objectKey} />
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
					<ObjectDetailsCard object={loaderData.object} />
					<CustomMetadataCard metadata={loaderData.object.custom_metadata} />
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
						<Dialog.Description className="mb-2 text-kumo-subtle">
							Are you sure you want to delete &ldquo;{loaderData.objectKey}
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
