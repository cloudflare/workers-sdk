import { Button, Dialog } from "@cloudflare/kumo";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	workersKvNamespaceDeleteKeyValuePair,
	workersKvNamespaceGetMultipleKeyValuePairs,
	workersKvNamespaceListANamespace_SKeys,
	workersKvNamespaceReadKeyValuePair,
	workersKvNamespaceWriteKeyValuePairWithMetadata,
} from "../../api";
import KVIcon from "../../assets/icons/kv.svg?react";
import { AddKVForm } from "../../components/AddKVForm";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { KVTable } from "../../components/KVTable";
import { SearchForm } from "../../components/SearchForm";
import type { KVEntry } from "../../api";

export const Route = createFileRoute("/kv/$namespaceId")({
	component: NamespaceView,
	loader: async ({ params }) => {
		const keysResponse = await workersKvNamespaceListANamespace_SKeys({
			path: { namespace_id: params.namespaceId },
			query: { limit: 50 },
		});
		const keys = keysResponse.data?.result ?? [];

		let values: Record<string, string | null> = {};
		if (keys.length > 0) {
			const valuesResponse = await workersKvNamespaceGetMultipleKeyValuePairs({
				path: {
					namespace_id: params.namespaceId,
				},
				body: {
					keys: keys.map((k) => k.name),
				},
			});
			values = (valuesResponse.data?.result?.values ?? {}) as Record<
				string,
				string | null
			>;
		}

		const cursor = keysResponse.data?.result_info?.cursor ?? null;
		const entries = keys.map(
			(key): KVEntry => ({
				key,
				value: values[key.name] ?? null,
			})
		);

		return {
			cursor,
			entries,
			hasMore: !!cursor,
		};
	},
});

// Helper functions for optimistic entry state updates
const removeEntry = (entries: KVEntry[], key: string): KVEntry[] =>
	entries.filter((e) => e.key.name !== key);

const updateEntry = (
	entries: KVEntry[],
	key: string,
	value: string
): KVEntry[] =>
	entries.map((e) => (e.key.name === key ? { key: { name: key }, value } : e));

const prependEntry = (entries: KVEntry[], entry: KVEntry): KVEntry[] => [
	entry,
	...entries,
];

const entryVisible = (entries: KVEntry[], key: string): boolean =>
	entries.some((e) => e.key.name === key);

const rootRoute = getRouteApi("__root__");

function NamespaceView() {
	const { namespaceId } = Route.useParams();
	const loaderData = Route.useLoaderData();
	const rootData = rootRoute.useLoaderData();

	// Get namespace title (binding name) from root loader data
	const namespaceTitle = useMemo(() => {
		const namespace = rootData.kvNamespaces.find((ns) => ns.id === namespaceId);
		return namespace?.title;
	}, [rootData.kvNamespaces, namespaceId]);

	const [entries, setEntries] = useState<KVEntry[]>(loaderData.entries);
	const [cursor, setCursor] = useState<string | null>(loaderData.cursor);
	const [hasMore, setHasMore] = useState(loaderData.hasMore);

	// Global (not individal validation) errors like fetch failures, shown in a
	// banner. Set by fetchEntries, handleAdd, handleEditSave,
	// handleConfirmOverwrite, handleConfirmDelete
	const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
	const [deleting, setDeleting] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState<boolean>(false);
	const [loadingMore, setLoadingMore] = useState<boolean>(false);
	// State for overwrite confirmation dialog
	const [overwriteConfirm, setOverwriteConfirm] = useState<{
		key: string;
		value: string;
		originalKey?: string; // undefined for add, set for edit
	} | null>(null);
	const [overwriting, setOverwriting] = useState<boolean>(false);
	// Signal to clear AddKVForm after successful overwrite
	const [clearAddForm, setClearAddForm] = useState<number>(0);
	// Search prefix filter
	const [prefix, setPrefix] = useState<string | undefined>(undefined);

	useEffect(() => {
		setEntries(loaderData.entries);
		setCursor(loaderData.cursor);
		setHasMore(loaderData.hasMore);
		setDeleteTarget(null);
		setDeleting(false);
		setOverwriteConfirm(null);
		setOverwriting(false);
		setError(null);
		setPrefix(undefined);
		setLoading(false);
		setLoadingMore(false);
	}, [loaderData]);

	const fetchEntries = useCallback(
		async (nextCursor?: string, prefixParam?: string) => {
			try {
				if (nextCursor) {
					setLoadingMore(true);
				} else {
					setLoading(true);
					setEntries([]);
				}
				setError(null);

				const keysResponse = await workersKvNamespaceListANamespace_SKeys({
					path: { namespace_id: namespaceId },
					query: { cursor: nextCursor, limit: 50, prefix: prefixParam },
				});
				const keys = keysResponse.data?.result ?? [];

				let values: Record<string, string | null> = {};
				if (keys.length > 0) {
					const valuesResponse =
						await workersKvNamespaceGetMultipleKeyValuePairs({
							path: { namespace_id: namespaceId },
							body: { keys: keys.map((k) => k.name) },
						});
					values = (valuesResponse.data?.result?.values ?? {}) as Record<
						string,
						string | null
					>;
				}

				const newEntries: KVEntry[] = keys.map((key) => ({
					key,
					value: values[key.name] ?? null,
				}));

				if (nextCursor) {
					setEntries((prev) => [...prev, ...newEntries]);
				} else {
					setEntries(newEntries);
				}

				const newCursor = keysResponse.data?.result_info?.cursor;
				setCursor(newCursor ?? null);
				setHasMore(!!newCursor);
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to fetch entries"
				);
			} finally {
				setLoading(false);
				setLoadingMore(false);
			}
		},
		[namespaceId]
	);

	const handleLoadMore = () => {
		if (cursor && !loadingMore) {
			void fetchEntries(cursor, prefix);
		}
	};

	const handleSearch = (searchPrefix: string) => {
		const newPrefix = searchPrefix || undefined;
		setPrefix(newPrefix);
		void fetchEntries(undefined, newPrefix);
	};

	const checkKeyExists = async (key: string): Promise<boolean> => {
		try {
			const response = await workersKvNamespaceReadKeyValuePair({
				path: { namespace_id: namespaceId, key_name: key },
			});
			return response.response.ok;
		} catch {
			return false;
		}
	};

	/**
	 *
	 * @returns whether we should clear the add form
	 */
	const handleAdd = async (key: string, value: string): Promise<boolean> => {
		try {
			const exists = await checkKeyExists(key);
			if (exists) {
				setOverwriteConfirm({ key, value });
				return false;
			}
			await executeAdd(key, value);
			return true;
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to add entry");
			return false;
		}
	};

	/** Execute add operation (called directly or after overwrite confirmation) */
	const executeAdd = async (
		key: string,
		value: string,
		isOverwrite: boolean = false
	) => {
		await workersKvNamespaceWriteKeyValuePairWithMetadata({
			path: { namespace_id: namespaceId, key_name: key },
			body: value,
		});

		const newEntry: KVEntry = { key: { name: key }, value };

		setEntries((prev) => {
			const wasInView = entryVisible(prev, key);
			const filtered = removeEntry(prev, key);

			// If key was in view, move to top. If new key, add to top.
			// If overwriting a key not in view, don't add (avoid duplicate).
			if (wasInView || !isOverwrite) {
				return prependEntry(filtered, newEntry);
			}
			return filtered;
		});
	};

	/**
	 * Edit existing entry. If the key is renamed, check for conflicts.
	 */
	const handleEditSave = async (
		originalKey: string,
		newKey: string,
		value: string
	): Promise<boolean> => {
		try {
			if (originalKey !== newKey) {
				const exists = await checkKeyExists(newKey);
				if (exists) {
					setOverwriteConfirm({ key: newKey, value, originalKey });
					return false;
				}
			}
			await executeEditSave(originalKey, newKey, value);
			return true;
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to save entry");
			return false;
		}
	};

	// Execute save operation (called directly or after overwrite confirmation)
	const executeEditSave = async (
		originalKey: string,
		newKey: string,
		value: string,
		isOverwrite: boolean = false
	) => {
		// Write first, then delete (safer - if write fails, we don't lose data)
		await workersKvNamespaceWriteKeyValuePairWithMetadata({
			path: { namespace_id: namespaceId, key_name: newKey },
			body: value,
		});

		if (originalKey !== newKey) {
			await workersKvNamespaceDeleteKeyValuePair({
				path: { namespace_id: namespaceId, key_name: originalKey },
				body: null,
			});
		}

		const newEntry: KVEntry = { key: { name: newKey }, value };

		setEntries((prev) => {
			// Remove original key if renamed
			const wasRenamed =
				originalKey !== newKey ? removeEntry(prev, originalKey) : prev;

			// Update or add the new key
			if (entryVisible(wasRenamed, newKey)) {
				return updateEntry(wasRenamed, newKey, value);
			}

			// Key not in view - add to top unless it's an overwrite of a key below
			if (!isOverwrite) {
				return prependEntry(wasRenamed, newEntry);
			}

			return wasRenamed;
		});
	};

	const handleConfirmOverwrite = async () => {
		if (!overwriteConfirm) {
			return;
		}

		const { key, value, originalKey } = overwriteConfirm;

		try {
			setOverwriting(true);
			if (originalKey) {
				// Edit mode - pass isOverwrite=true since we confirmed overwriting existing key
				await executeEditSave(originalKey, key, value, true);
			} else {
				// Add mode - pass isOverwrite=true since we confirmed overwriting existing key
				await executeAdd(key, value, true);
				// Signal AddKVForm to clear its fields
				setClearAddForm((c) => c + 1);
			}
			setOverwriteConfirm(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to overwrite");
		} finally {
			setOverwriting(false);
		}
	};

	const handleConfirmDelete = async () => {
		if (!deleteTarget) {
			return;
		}

		try {
			setDeleting(true);
			await workersKvNamespaceDeleteKeyValuePair({
				path: { namespace_id: namespaceId, key_name: deleteTarget },
				body: null,
			});
			setEntries((prev) => removeEntry(prev, deleteTarget));
			setDeleteTarget(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to delete");
			setDeleteTarget(null);
		} finally {
			setDeleting(false);
		}
	};

	return (
		<>
			<Breadcrumbs
				icon={KVIcon}
				title="KV"
				items={[
					<span className="flex items-center gap-1.5" key="namespace-id">
						{namespaceTitle && namespaceTitle !== namespaceId ? (
							<>
								{namespaceTitle}
								<span className="text-kumo-subtle">({namespaceId})</span>
							</>
						) : (
							namespaceId
						)}
					</span>,
				]}
			/>

			<div className="px-6 py-6">
				{error && (
					<div className="mb-4 rounded-md border border-kumo-danger/20 bg-kumo-danger/8 p-4 text-kumo-danger">
						{error}
					</div>
				)}

				<SearchForm
					key={namespaceId}
					onSearch={handleSearch}
					disabled={loading}
				/>

				<hr className="my-4 border-kumo-fill" />

				<AddKVForm onAdd={handleAdd} clearSignal={clearAddForm} />

				{loading ? (
					<div className="p-12 text-center text-kumo-subtle">Loading...</div>
				) : entries.length === 0 ? (
					<div className="flex flex-col items-center justify-center space-y-2 p-12 text-center text-kumo-subtle">
						{prefix ? (
							<p className="text-sm font-light">{`No keys found matching prefix "${prefix}".`}</p>
						) : (
							<>
								<h2 className="text-2xl font-medium">
									No keys in this namespace
								</h2>
								<p className="text-sm font-light">
									Add an entry using the form above.
								</p>
							</>
						)}
					</div>
				) : (
					<>
						<div className="rounded-lg">
							<KVTable
								entries={entries}
								onSave={handleEditSave}
								onDelete={(key: string) => setDeleteTarget(key)}
							/>
						</div>
						{hasMore && (
							<div className="py-4 text-center">
								<Button
									variant="secondary"
									onClick={handleLoadMore}
									disabled={loadingMore}
									loading={loadingMore}
								>
									{loadingMore ? "Loading..." : "Load More"}
								</Button>
							</div>
						)}
					</>
				)}

				<Dialog.Root
					open={deleteTarget !== null}
					onOpenChange={(open: boolean) => !open && setDeleteTarget(null)}
				>
					<Dialog className="p-6">
						{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
						<Dialog.Title className="mb-4 text-lg font-semibold">
							Delete key?
						</Dialog.Title>
						{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
						<Dialog.Description className="mb-2 text-kumo-subtle">
							Are you sure you want to delete &ldquo;{deleteTarget}&rdquo;? This
							cannot be undone.
						</Dialog.Description>
						<div className="mt-6 flex justify-end gap-2">
							<Button
								variant="secondary"
								onClick={() => setDeleteTarget(null)}
								disabled={deleting}
							>
								Cancel
							</Button>
							<Button
								variant="destructive"
								onClick={handleConfirmDelete}
								disabled={deleting}
								loading={deleting}
							>
								{deleting ? "Deleting..." : "Delete"}
							</Button>
						</div>
					</Dialog>
				</Dialog.Root>

				<Dialog.Root
					open={overwriteConfirm !== null}
					onOpenChange={(open: boolean) => !open && setOverwriteConfirm(null)}
				>
					<Dialog className="p-6">
						{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
						<Dialog.Title className="mb-4 text-lg font-semibold">
							Overwrite key?
						</Dialog.Title>
						{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
						<Dialog.Description className="mb-2 text-kumo-subtle">
							Key &ldquo;{overwriteConfirm?.key}&rdquo; already exists. Do you
							want to overwrite its value?
						</Dialog.Description>
						<div className="mt-6 flex justify-end gap-2">
							<Button
								variant="secondary"
								onClick={() => setOverwriteConfirm(null)}
								disabled={overwriting}
							>
								Cancel
							</Button>
							<Button
								variant="primary"
								onClick={handleConfirmOverwrite}
								disabled={overwriting}
								loading={overwriting}
							>
								{overwriting ? "Overwriting..." : "Overwrite"}
							</Button>
						</div>
					</Dialog>
				</Dialog.Root>
			</div>
		</>
	);
}
