import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Button, Switch } from "@cloudflare/kumo";
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
	delimiter?: boolean;
	prefix?: string;
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
			path: {
				bucket_name: params.bucketName,
			},
			query: {
				delimiter: deps.delimiter !== false ? "/" : undefined,
				per_page: 100,
				prefix: deps.prefix || undefined,
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

function BucketView(): JSX.Element {
	const params = Route.useParams();
	const search = Route.useSearch();
	const loaderData = Route.useLoaderData();
	const navigate = useNavigate();

	const [addDirectoryOpen, setAddDirectoryOpen] = useState<boolean>(false);
	const [creatingDirectory, setCreatingDirectory] = useState<boolean>(false);
	const [cursor, setCursor] = useState<string | null>(loaderData.cursor);
	const [deleteTargets, setDeleteTargets] = useState<string[]>([]);
	const [deleting, setDeleting] = useState<boolean>(false);
	const [delimitedPrefixes, setDelimitedPrefixes] = useState<string[]>(
		loaderData.delimitedPrefixes
	);
	const [error, setError] = useState<string | null>(null);
	const [isTruncated, setIsTruncated] = useState(loaderData.isTruncated);
	const [loading, setLoading] = useState<boolean>(false);
	const [loadingMore, setLoadingMore] = useState<boolean>(false);
	const [newDirectoryName, setNewDirectoryName] = useState<string>("");
	const [objects, setObjects] = useState<R2Object[]>(loaderData.objects);
	const [uploadDialogOpen, setUploadDialogOpen] = useState<boolean>(false);

	const directoryView = search.delimiter !== false;

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
					path: {
						bucket_name: params.bucketName,
					},
					query: {
						prefix: search.prefix || undefined,
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
		[params.bucketName, search.prefix]
	);

	async function handleRefresh(): Promise<void> {
		await fetchObjects(undefined, directoryView);
	}

	async function handleLoadMore(): Promise<void> {
		if (cursor && !loadingMore) {
			await fetchObjects(cursor, directoryView);
		}
	}

	async function handleDirectoryViewChange(checked: boolean): Promise<void> {
		// Navigate with the new delimiter setting (and back to root if in a subdirectory)
		await navigate({
			params: {
				bucketName: params.bucketName,
			},
			search: {
				prefix: search.prefix && checked ? search.prefix : undefined,
				delimiter: checked ? undefined : false,
			},
			to: "/r2/$bucketName",
		});
	}

	async function handleNavigateToPrefix(newPrefix: string): Promise<void> {
		await navigate({
			params: {
				bucketName: params.bucketName,
			},
			search: { prefix: newPrefix || undefined },
			to: "/r2/$bucketName",
		});
	}

	function handleDelete(keys: string[]): void {
		setDeleteTargets(keys);
	}

	async function handleConfirmDelete(): Promise<void> {
		if (deleteTargets.length === 0) {
			return;
		}

		try {
			setDeleting(true);
			await r2BucketDeleteObjects({
				path: {
					bucket_name: params.bucketName,
				},
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
	}

	async function handleUploadComplete(): Promise<void> {
		setUploadDialogOpen(false);
		await fetchObjects(undefined, directoryView);
	}

	async function handleCreateDirectory(): Promise<void> {
		if (!newDirectoryName.trim()) {
			return;
		}

		try {
			setCreatingDirectory(true);
			const directoryKey =
				(search.prefix || "") + newDirectoryName.trim() + "/";
			await r2BucketPutObject({
				path: { bucket_name: params.bucketName, object_key: directoryKey },
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
	}

	// Build breadcrumb items
	const pathSegments = search.prefix
		? search.prefix.split("/").filter(Boolean)
		: [];
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
							icon={UploadIcon}
							onClick={() => setUploadDialogOpen(true)}
							variant="secondary"
						>
							Upload
						</Button>
						<Button
							icon={FolderPlusIcon}
							onClick={() => setAddDirectoryOpen(true)}
							variant="secondary"
						>
							Add directory
						</Button>
						<Button
							disabled={loading}
							icon={ArrowClockwiseIcon}
							loading={loading}
							onClick={handleRefresh}
							variant="secondary"
						>
							Refresh
						</Button>
					</div>
				</div>

				{loading ? (
					<div className="p-12 text-center text-text-secondary">Loading...</div>
				) : objects.length === 0 && delimitedPrefixes.length === 0 ? (
					<div className="flex flex-col items-center justify-center space-y-2 p-12 text-center text-text-secondary">
						{search.prefix ? (
							<p className="text-sm font-light">
								No objects found at prefix &quot;{search.prefix}&quot;.
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
							bucketName={params.bucketName}
							currentPrefix={search.prefix || ""}
							delimitedPrefixes={delimitedPrefixes}
							objects={objects}
							onDelete={handleDelete}
							onNavigateToPrefix={handleNavigateToPrefix}
						/>
						{isTruncated && cursor && (
							<div className="p-4 text-center">
								<Button
									disabled={loadingMore}
									loading={loadingMore}
									onClick={handleLoadMore}
									variant="secondary"
								>
									{loadingMore ? "Loading..." : "Load More"}
								</Button>
							</div>
						)}
					</>
				)}

				{/* Delete Confirmation Dialog */}
				<AlertDialog.Root
					onOpenChange={(open) => !open && setDeleteTargets([])}
					open={deleteTargets.length > 0}
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
								<Button
									disabled={deleting}
									onClick={() => setDeleteTargets([])}
									variant="secondary"
								>
									Cancel
								</Button>
								<Button
									disabled={deleting}
									loading={deleting}
									onClick={handleConfirmDelete}
									variant="destructive"
								>
									{deleting ? "Deleting..." : "Delete"}
								</Button>
							</div>
						</AlertDialog.Popup>
					</AlertDialog.Portal>
				</AlertDialog.Root>

				{/* Add Directory Dialog */}
				<AlertDialog.Root
					onOpenChange={(open) => {
						if (!open) {
							setAddDirectoryOpen(false);
							setNewDirectoryName("");
						}
					}}
					open={addDirectoryOpen}
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
								{search.prefix && (
									<p className="mt-1 text-xs text-text-secondary">
										Will be created at: {search.prefix}
										{newDirectoryName || "..."}/
									</p>
								)}
							</div>

							<div className="flex justify-end gap-2">
								<Button
									disabled={creatingDirectory}
									onClick={() => {
										setAddDirectoryOpen(false);
										setNewDirectoryName("");
									}}
									variant="secondary"
								>
									Cancel
								</Button>

								<Button
									disabled={creatingDirectory || !newDirectoryName.trim()}
									loading={creatingDirectory}
									onClick={handleCreateDirectory}
									variant="primary"
								>
									{creatingDirectory ? "Creating..." : "Create"}
								</Button>
							</div>
						</AlertDialog.Popup>
					</AlertDialog.Portal>
				</AlertDialog.Root>

				{/* Upload Dialog */}
				<R2UploadDialog
					bucketName={params.bucketName}
					currentPrefix={search.prefix || ""}
					onOpenChange={setUploadDialogOpen}
					onUploadComplete={handleUploadComplete}
					open={uploadDialogOpen}
				/>
			</div>
		</>
	);
}
