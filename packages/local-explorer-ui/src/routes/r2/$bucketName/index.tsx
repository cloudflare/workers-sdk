import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Button } from "@base-ui/react/button";
import { Switch } from "@cloudflare/kumo";
import {
	ArrowClockwiseIcon,
	FolderPlusIcon,
	UploadIcon,
} from "@phosphor-icons/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
	r2BucketDeleteObjects,
	r2BucketListObjects,
	r2BucketPutObject,
} from "../../../api";
import R2Icon from "../../../assets/icons/r2.svg?react";
import { Breadcrumbs } from "../../../components/Breadcrumbs";
import { R2ObjectTable } from "../../../components/R2ObjectTable";
import { R2UploadDialog } from "../../../components/R2UploadDialog";
import type { R2Object } from "../../../api";

export interface R2BucketSearch {
	prefix?: string;
	delimiter?: boolean;
}

export const Route = createFileRoute("/r2/$bucketName/")({
	component: BucketView,
	validateSearch: (search: Record<string, unknown>): R2BucketSearch => ({
		prefix: typeof search.prefix === "string" ? search.prefix : undefined,
		delimiter: search.delimiter === false ? false : true,
	}),
	loaderDeps: ({ search }) => ({
		prefix: search.prefix,
		delimiter: search.delimiter,
	}),
	loader: async ({ params, deps }) => {
		const response = await r2BucketListObjects({
			path: { bucket_name: params.bucketName },
			query: {
				prefix: deps.prefix || undefined,
				delimiter: deps.delimiter !== false ? "/" : undefined,
				per_page: 100,
			},
		});

		return {
			objects: response.data?.result ?? [],
			delimitedPrefixes: response.data?.result_info?.delimited ?? [],
			cursor: response.data?.result_info?.cursor ?? null,
			isTruncated: response.data?.result_info?.is_truncated === "true",
			delimiterEnabled: deps.delimiter !== false,
		};
	},
});

function BucketView() {
	const { bucketName } = Route.useParams();
	const { prefix, delimiter } = Route.useSearch();
	const loaderData = Route.useLoaderData();
	const navigate = useNavigate();

	const [objects, setObjects] = useState<R2Object[]>(loaderData.objects);
	const [delimitedPrefixes, setDelimitedPrefixes] = useState<string[]>(
		loaderData.delimitedPrefixes
	);
	const [cursor, setCursor] = useState<string | null>(loaderData.cursor);
	const [isTruncated, setIsTruncated] = useState(loaderData.isTruncated);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [loadingMore, setLoadingMore] = useState(false);
	const [deleteTargets, setDeleteTargets] = useState<string[]>([]);
	const [deleting, setDeleting] = useState(false);
	const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
	const [addDirectoryOpen, setAddDirectoryOpen] = useState(false);
	const [newDirectoryName, setNewDirectoryName] = useState("");
	const [creatingDirectory, setCreatingDirectory] = useState(false);

	const directoryView = delimiter !== false;

	useEffect(() => {
		setObjects(loaderData.objects);
		setDelimitedPrefixes(loaderData.delimitedPrefixes);
		setCursor(loaderData.cursor);
		setIsTruncated(loaderData.isTruncated);
		setError(null);
		setDeleteTargets([]);
		setDeleting(false);
	}, [loaderData]);

	const fetchObjects = useCallback(
		async (nextCursor?: string, withDelimiter?: boolean) => {
			try {
				if (nextCursor) {
					setLoadingMore(true);
				} else {
					setLoading(true);
					setObjects([]);
					setDelimitedPrefixes([]);
				}
				setError(null);

				const response = await r2BucketListObjects({
					path: { bucket_name: bucketName },
					query: {
						prefix: prefix || undefined,
						delimiter: withDelimiter ? "/" : undefined,
						cursor: nextCursor,
						per_page: 100,
					},
				});

				const newObjects = response.data?.result ?? [];
				const newPrefixes = response.data?.result_info?.delimited ?? [];

				if (nextCursor) {
					setObjects((prev) => [...prev, ...newObjects]);
					setDelimitedPrefixes((prev) => [...prev, ...newPrefixes]);
				} else {
					setObjects(newObjects);
					setDelimitedPrefixes(newPrefixes);
				}

				const newCursor = response.data?.result_info?.cursor;
				setCursor(newCursor ?? null);
				setIsTruncated(response.data?.result_info?.is_truncated === "true");
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to fetch objects"
				);
			} finally {
				setLoading(false);
				setLoadingMore(false);
			}
		},
		[bucketName, prefix]
	);

	const handleRefresh = () => {
		void fetchObjects(undefined, directoryView);
	};

	const handleLoadMore = () => {
		if (cursor && !loadingMore) {
			void fetchObjects(cursor, directoryView);
		}
	};

	const handleDirectoryViewChange = (checked: boolean) => {
		// Navigate with the new delimiter setting (and back to root if in a subdirectory)
		void navigate({
			to: "/r2/$bucketName",
			params: { bucketName },
			search: {
				prefix: prefix && checked ? prefix : undefined,
				delimiter: checked ? undefined : false,
			},
		});
	};

	const handleNavigateToPrefix = (newPrefix: string) => {
		void navigate({
			to: "/r2/$bucketName",
			params: { bucketName },
			search: { prefix: newPrefix || undefined },
		});
	};

	const handleDelete = (keys: string[]) => {
		setDeleteTargets(keys);
	};

	const handleConfirmDelete = async () => {
		if (deleteTargets.length === 0) {
			return;
		}

		try {
			setDeleting(true);
			await r2BucketDeleteObjects({
				path: { bucket_name: bucketName },
				body: deleteTargets,
			});
			setObjects((prev) =>
				prev.filter((obj) => !deleteTargets.includes(obj.key ?? ""))
			);
			setDeleteTargets([]);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to delete objects");
		} finally {
			setDeleting(false);
		}
	};

	const handleUploadComplete = () => {
		setUploadDialogOpen(false);
		void fetchObjects(undefined, directoryView);
	};

	const handleCreateDirectory = async () => {
		if (!newDirectoryName.trim()) {
			return;
		}

		try {
			setCreatingDirectory(true);
			const directoryKey = (prefix || "") + newDirectoryName.trim() + "/";
			await r2BucketPutObject({
				path: { bucket_name: bucketName, object_key: directoryKey },
				body: new Blob([]),
			});
			setAddDirectoryOpen(false);
			setNewDirectoryName("");
			void fetchObjects(undefined, directoryView);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to create directory"
			);
		} finally {
			setCreatingDirectory(false);
		}
	};

	// Build breadcrumb items
	const pathSegments = prefix ? prefix.split("/").filter(Boolean) : [];
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

				<div className="mb-4 flex items-center justify-between">
					<div className="flex items-center gap-3">
						<label className="flex items-center gap-2 text-sm">
							<Switch
								checked={directoryView}
								onCheckedChange={handleDirectoryViewChange}
							/>
							<span>View prefixes as directories</span>
						</label>
					</div>

					<div className="flex items-center gap-2">
						<Button
							className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border bg-bg-tertiary px-3 py-2 text-sm font-medium text-text transition-[background-color,transform] hover:bg-border active:translate-y-px"
							onClick={() => setUploadDialogOpen(true)}
						>
							<UploadIcon size={16} />
							Upload
						</Button>
						<Button
							className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border bg-bg-tertiary px-3 py-2 text-sm font-medium text-text transition-[background-color,transform] hover:bg-border active:translate-y-px"
							onClick={() => setAddDirectoryOpen(true)}
						>
							<FolderPlusIcon size={16} />
							Add directory
						</Button>
						<Button
							className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border bg-bg-tertiary px-3 py-2 text-sm font-medium text-text transition-[background-color,transform] hover:bg-border active:translate-y-px"
							onClick={handleRefresh}
							disabled={loading}
						>
							<ArrowClockwiseIcon size={16} />
							Refresh
						</Button>
					</div>
				</div>

				{loading ? (
					<div className="p-12 text-center text-text-secondary">Loading...</div>
				) : objects.length === 0 && delimitedPrefixes.length === 0 ? (
					<div className="flex flex-col items-center justify-center space-y-2 p-12 text-center text-text-secondary">
						{prefix ? (
							<p className="text-sm font-light">
								No objects found at prefix &quot;{prefix}&quot;.
							</p>
						) : (
							<>
								<h2 className="text-2xl font-medium">
									No objects in this bucket
								</h2>
								<p className="text-sm font-light">
									Upload an object using the button above.
								</p>
							</>
						)}
					</div>
				) : (
					<>
						<R2ObjectTable
							bucketName={bucketName}
							objects={objects}
							delimitedPrefixes={delimitedPrefixes}
							currentPrefix={prefix || ""}
							onNavigateToPrefix={handleNavigateToPrefix}
							onDelete={handleDelete}
						/>
						{isTruncated && cursor && (
							<div className="p-4 text-center">
								<Button
									className="inline-flex cursor-pointer items-center justify-center rounded-md border border-border bg-bg-tertiary px-4 py-2 text-sm font-medium text-text transition-[background-color,transform] hover:bg-border active:translate-y-px data-disabled:cursor-not-allowed data-disabled:opacity-60 data-disabled:active:translate-y-0"
									onClick={handleLoadMore}
									disabled={loadingMore}
									focusableWhenDisabled
								>
									{loadingMore ? "Loading..." : "Load More"}
								</Button>
							</div>
						)}
					</>
				)}

				{/* Delete Confirmation Dialog */}
				<AlertDialog.Root
					open={deleteTargets.length > 0}
					onOpenChange={(open) => !open && setDeleteTargets([])}
				>
					<AlertDialog.Portal>
						<AlertDialog.Backdrop className="fixed inset-0 z-1000 flex items-center justify-center bg-black/50 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
						<AlertDialog.Popup className="fixed top-1/2 left-1/2 z-1001 w-full max-w-125 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-bg p-6 shadow-[0_4px_24px_rgba(0,0,0,0.15),0_0_0_1px_var(--color-border)] transition-[opacity,transform] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
							<AlertDialog.Title className="mb-4 text-lg font-semibold">
								Delete {deleteTargets.length === 1 ? "object" : "objects"}?
							</AlertDialog.Title>
							<AlertDialog.Description className="mb-2 text-text-secondary">
								{deleteTargets.length === 1 ? (
									<>
										Are you sure you want to delete &ldquo;{deleteTargets[0]}
										&rdquo;? This cannot be undone.
									</>
								) : (
									<>
										Are you sure you want to delete {deleteTargets.length}{" "}
										objects? This cannot be undone.
									</>
								)}
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
									onClick={handleConfirmDelete}
									disabled={deleting}
									focusableWhenDisabled
								>
									{deleting ? "Deleting..." : "Delete"}
								</Button>
							</div>
						</AlertDialog.Popup>
					</AlertDialog.Portal>
				</AlertDialog.Root>

				{/* Add Directory Dialog */}
				<AlertDialog.Root
					open={addDirectoryOpen}
					onOpenChange={(open) => {
						if (!open) {
							setAddDirectoryOpen(false);
							setNewDirectoryName("");
						}
					}}
				>
					<AlertDialog.Portal>
						<AlertDialog.Backdrop className="fixed inset-0 z-1000 flex items-center justify-center bg-black/50 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
						<AlertDialog.Popup className="fixed top-1/2 left-1/2 z-1001 w-full max-w-125 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-bg p-6 shadow-[0_4px_24px_rgba(0,0,0,0.15),0_0_0_1px_var(--color-border)] transition-[opacity,transform] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
							<AlertDialog.Title className="mb-4 text-lg font-semibold">
								Add directory
							</AlertDialog.Title>
							<AlertDialog.Description className="mb-4 text-text-secondary">
								Enter a name for the new directory.
							</AlertDialog.Description>
							<div className="mb-4">
								<label className="mb-1 block text-sm font-medium text-text">
									Directory name
								</label>
								<input
									type="text"
									className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:border-primary focus:shadow-focus-primary focus:outline-none"
									value={newDirectoryName}
									onChange={(e) => setNewDirectoryName(e.target.value)}
									placeholder="my-directory"
									autoFocus
								/>
								{prefix && (
									<p className="mt-1 text-xs text-text-secondary">
										Will be created at: {prefix}
										{newDirectoryName || "..."}/
									</p>
								)}
							</div>
							<div className="flex justify-end gap-2">
								<AlertDialog.Close
									render={
										<Button className="inline-flex cursor-pointer items-center justify-center rounded-md border border-none border-border bg-bg-tertiary px-4 py-2 text-sm font-medium text-text transition-[background-color,transform] hover:bg-border active:translate-y-px data-disabled:cursor-not-allowed data-disabled:opacity-60 data-disabled:active:translate-y-0" />
									}
									disabled={creatingDirectory}
								>
									Cancel
								</AlertDialog.Close>
								<Button
									className="inline-flex cursor-pointer items-center justify-center rounded-md border-none bg-primary px-4 py-2 text-sm font-medium text-white transition-[background-color,transform] hover:bg-primary-hover active:translate-y-px data-disabled:cursor-not-allowed data-disabled:opacity-60 data-disabled:active:translate-y-0"
									onClick={handleCreateDirectory}
									disabled={creatingDirectory || !newDirectoryName.trim()}
									focusableWhenDisabled
								>
									{creatingDirectory ? "Creating..." : "Create"}
								</Button>
							</div>
						</AlertDialog.Popup>
					</AlertDialog.Portal>
				</AlertDialog.Root>

				{/* Upload Dialog */}
				<R2UploadDialog
					bucketName={bucketName}
					currentPrefix={prefix || ""}
					open={uploadDialogOpen}
					onOpenChange={setUploadDialogOpen}
					onUploadComplete={handleUploadComplete}
				/>
			</div>
		</>
	);
}
