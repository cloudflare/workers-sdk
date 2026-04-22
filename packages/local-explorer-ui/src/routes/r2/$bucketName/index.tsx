import {
	Button,
	Dialog,
	DropdownMenu,
	useKumoToastManager,
} from "@cloudflare/kumo";
import {
	ArrowClockwiseIcon,
	CaretDownIcon,
	CheckIcon,
	FolderPlusIcon,
	FoldersIcon,
	ListIcon,
	UploadIcon,
} from "@phosphor-icons/react";
import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
} from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
	r2BucketDeleteObjects,
	r2BucketListObjects,
	r2BucketPutObject,
} from "../../../api";
import R2Icon from "../../../assets/icons/r2.svg?react";
import { Breadcrumbs } from "../../../components/Breadcrumbs";
import { NotFound } from "../../../components/NotFound";
import { R2ObjectTable } from "../../../components/R2ObjectTable";
import { R2UploadDialog } from "../../../components/R2UploadDialog";
import { ResourceError } from "../../../components/ResourceError";
import { withMinimumDelay } from "../../../utils/async";
import type { R2Object } from "../../../api";

export interface R2BucketSearch {
	delimiter?: boolean;
	prefix?: string;
}

export const Route = createFileRoute("/r2/$bucketName/")({
	component: BucketView,
	errorComponent: ResourceError,
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
			throwOnError: false,
		});
		if (response.response?.status === 404) {
			throw notFound();
		}

		if (response.error) {
			throw new Error(
				`Failed to list objects in bucket "${params.bucketName}"`
			);
		}

		return {
			objects: response.data?.result ?? [],
			delimitedPrefixes: response.data?.result_info?.delimited ?? [],
			cursor: response.data?.result_info?.cursor ?? null,
			isTruncated: response.data?.result_info?.is_truncated === "true",
			delimiterEnabled: deps.delimiter !== false,
		};
	},
	notFoundComponent: NotFound,
	validateSearch: (search: Record<string, unknown>): R2BucketSearch => ({
		delimiter: search.delimiter === false ? false : true,
		prefix: typeof search.prefix === "string" ? search.prefix : undefined,
	}),
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

	const [isTruncated, setIsTruncated] = useState(loaderData.isTruncated);
	const [loading, setLoading] = useState<boolean>(false);
	const [loadingMore, setLoadingMore] = useState<boolean>(false);
	const [newDirectoryName, setNewDirectoryName] = useState<string>("");
	const [objects, setObjects] = useState<R2Object[]>(loaderData.objects);
	const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
	const [uploadDialogOpen, setUploadDialogOpen] = useState<boolean>(false);

	const toastManager = useKumoToastManager();
	const directoryView = search.delimiter !== false;

	useEffect(() => {
		setObjects(loaderData.objects);
		setDelimitedPrefixes(loaderData.delimitedPrefixes);
		setCursor(loaderData.cursor);
		setIsTruncated(loaderData.isTruncated);
		setDeleteTargets([]);
		setDeleting(false);
		setSelectedKeys(new Set());
	}, [loaderData]);

	const fetchObjects = useCallback(
		async (nextCursor?: string, withDelimiter?: boolean) => {
			try {
				if (nextCursor) {
					setLoadingMore(true);
				} else {
					setLoading(true);
				}

				const apiCall = r2BucketListObjects({
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

				// Apply minimum delay only for refresh (not load more) to ensure spinner is visible
				const response = nextCursor
					? await apiCall
					: await withMinimumDelay(apiCall);

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
				toastManager.add({
					title: "Failed to fetch objects",
					description:
						err instanceof Error ? err.message : "An unknown error occurred",
					variant: "error",
				});
			} finally {
				setLoading(false);
				setLoadingMore(false);
			}
		},
		[params.bucketName, search.prefix, toastManager]
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
			search: (prev) => ({
				...prev,
				prefix: search.prefix && checked ? search.prefix : undefined,
				delimiter: checked ? undefined : false,
			}),
			to: "/r2/$bucketName",
		});
	}

	async function handleNavigateToPrefix(newPrefix: string): Promise<void> {
		await navigate({
			params: {
				bucketName: params.bucketName,
			},
			search: (prev) => ({ ...prev, prefix: newPrefix || undefined }),
			to: "/r2/$bucketName",
		});
	}

	function handleDelete(keys: string[]): void {
		setDeleteTargets(keys);
	}

	function handleDownload(keys: string[]): void {
		for (const key of keys) {
			const downloadUrl = `/cdn-cgi/explorer/api/r2/buckets/${encodeURIComponent(params.bucketName)}/objects/${encodeURIComponent(key)}`;
			const link = document.createElement("a");
			link.href = downloadUrl;
			link.download = key.split("/").pop() || "download";
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
		}

		if (keys.length > 1) {
			toastManager.add({
				title: "Downloads started",
				description: `Downloading ${keys.length} files`,
			});
		}

		// Clear selection after download
		setSelectedKeys(new Set());
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
			setDelimitedPrefixes((prev) =>
				prev.filter((prefix) => !deleteTargets.includes(prefix))
			);
			setDeleteTargets([]);
			setSelectedKeys(new Set());
		} catch (err) {
			let errorMessage = "Failed to delete objects";
			if (err instanceof Error) {
				errorMessage = err.message;
			} else if (
				typeof err === "object" &&
				err !== null &&
				"errors" in err &&
				Array.isArray((err as { errors: unknown }).errors)
			) {
				const apiError = err as { errors: Array<{ message?: string }> };
				if (apiError.errors[0]?.message) {
					errorMessage = apiError.errors[0].message;
				}
			}

			toastManager.add({
				title: "Delete failed",
				description: errorMessage,
				variant: "error",
			});
			setDeleteTargets([]);
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
			toastManager.add({
				title: "Failed to create directory",
				description:
					err instanceof Error ? err.message : "An unknown error occurred",
				variant: "error",
			});
		} finally {
			setCreatingDirectory(false);
		}
	}

	// Build breadcrumb items
	const pathSegments =
		directoryView && search.prefix
			? search.prefix.split("/").filter(Boolean)
			: [];
	const breadcrumbItems = [
		<Link
			className="text-kumo-default no-underline hover:text-kumo-link"
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
					className="text-kumo-default no-underline hover:text-kumo-link"
					key={segmentPrefix}
					params={{ bucketName: params.bucketName }}
					search={{ prefix: segmentPrefix }}
					to="/r2/$bucketName"
				>
					{segment}/
				</Link>
			);
		}),
	];

	return (
		<>
			<Breadcrumbs icon={R2Icon} title="R2" items={breadcrumbItems}>
				<DropdownMenu>
					<DropdownMenu.Trigger
						render={
							<Button variant="secondary">
								{directoryView ? (
									<FoldersIcon size={16} />
								) : (
									<ListIcon size={16} />
								)}

								{directoryView ? "Grouped" : "Ungrouped"}

								<CaretDownIcon size={14} />
							</Button>
						}
					/>
					<DropdownMenu.Content align="end" sideOffset={4}>
						<DropdownMenu.Item
							className="flex items-center gap-2"
							icon={FoldersIcon}
							onClick={() => handleDirectoryViewChange(true)}
						>
							<span>Grouped</span>
							{directoryView && <CheckIcon className="ml-auto" size={14} />}
						</DropdownMenu.Item>

						<DropdownMenu.Item
							className="flex items-center gap-2"
							icon={ListIcon}
							onClick={() => handleDirectoryViewChange(false)}
						>
							<span>Ungrouped</span>
							{!directoryView && <CheckIcon className="ml-auto" size={14} />}
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu>

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
					aria-label="Refresh"
					icon={ArrowClockwiseIcon}
					loading={loading}
					onClick={handleRefresh}
					shape="square"
					variant="secondary"
				></Button>
			</Breadcrumbs>

			<div className="px-6 py-6">
				<R2ObjectTable
					bucketName={params.bucketName}
					currentPrefix={search.prefix || ""}
					delimitedPrefixes={delimitedPrefixes}
					objects={objects}
					onDelete={handleDelete}
					onDownload={handleDownload}
					onNavigateToPrefix={handleNavigateToPrefix}
					onSelectionChange={setSelectedKeys}
					selectedKeys={selectedKeys}
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

				{/* Delete Confirmation Dialog */}
				<Dialog.Root
					onOpenChange={(open) => !open && setDeleteTargets([])}
					open={deleteTargets.length > 0}
				>
					<Dialog className="p-6">
						{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
						<Dialog.Title className="mb-4 text-lg font-semibold">
							Delete {deleteTargets.length === 1 ? "object" : "objects"}?
						</Dialog.Title>

						{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
						<Dialog.Description className="mb-2 text-kumo-subtle">
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
						</Dialog.Description>

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
					</Dialog>
				</Dialog.Root>

				{/* Add Directory Dialog */}
				<Dialog.Root
					onOpenChange={(open) => {
						if (!open) {
							setAddDirectoryOpen(false);
							setNewDirectoryName("");
						}
					}}
					open={addDirectoryOpen}
				>
					<Dialog className="p-6">
						{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
						<Dialog.Title className="mb-4 text-lg font-semibold">
							Add directory
						</Dialog.Title>

						{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
						<Dialog.Description className="mb-4 text-kumo-subtle">
							Enter a name for the new directory.
						</Dialog.Description>

						<div className="mb-4">
							<label className="mb-1 block text-sm font-medium text-kumo-default">
								Directory name
							</label>
							<input
								type="text"
								className="focus-visible:ring-kumo-ring w-full rounded-md border border-kumo-fill bg-kumo-base px-3 py-2 text-sm text-kumo-default focus:border-kumo-brand focus:outline-none focus-visible:ring-2"
								value={newDirectoryName}
								onChange={(e) => setNewDirectoryName(e.target.value)}
								placeholder="my-directory"
								autoFocus
							/>
							{search.prefix && (
								<p className="mt-1 text-xs text-kumo-subtle">
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
					</Dialog>
				</Dialog.Root>

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
