import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Button } from "@base-ui/react/button";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
	workersKvNamespaceDeleteKeyValuePair,
	workersKvNamespaceGetMultipleKeyValuePairs,
	workersKvNamespaceListANamespace_SKeys,
	workersKvNamespaceReadKeyValuePair,
	workersKvNamespaceWriteKeyValuePairWithMetadata,
} from "../../api";
import KVIcon from "../../assets/icons/kv.svg?react";
import { AddKVForm } from "../../components/AddKVForm";
import { KVTable } from "../../components/KVTable";
import type { KVEntry } from "../../api";

export const Route = createFileRoute("/kv/$namespaceId")({
	component: NamespaceView,
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

function NamespaceView() {
	const { namespaceId } = Route.useParams();
	const [entries, setEntries] = useState<KVEntry[]>([]);
	const [loading, setLoading] = useState(true);
	// Global (not individal validation) errors like fetch failures, shown in a
	// banner. Set by fetchEntries, handleAdd, handleEditSave,
	// handleConfirmOverwrite, handleConfirmDelete
	const [error, setError] = useState<string | null>(null);
	const [cursor, setCursor] = useState<string | null>(null);
	const [hasMore, setHasMore] = useState(false);
	const [loadingMore, setLoadingMore] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
	const [deleting, setDeleting] = useState(false);
	// State for overwrite confirmation dialog
	const [overwriteConfirm, setOverwriteConfirm] = useState<{
		key: string;
		value: string;
		originalKey?: string; // undefined for add, set for edit
	} | null>(null);
	const [overwriting, setOverwriting] = useState(false);
	// Signal to clear AddKVForm after successful overwrite
	const [clearAddForm, setClearAddForm] = useState(0);

	const fetchEntries = useCallback(
		async (nextCursor?: string) => {
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
					query: { cursor: nextCursor, limit: 50 },
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

	useEffect(() => {
		void fetchEntries();
	}, [fetchEntries]);

	useEffect(() => {
		setDeleteTarget(null);
		setOverwriteConfirm(null);
		setError(null);
	}, [namespaceId]);

	const handleLoadMore = () => {
		if (cursor && !loadingMore) {
			void fetchEntries(cursor);
		}
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
		<div>
			<div className="flex items-center gap-2 py-4 px-6 -mx-6 mb-6 min-h-[67px] box-border bg-bg-secondary border-b border-border text-sm">
				<span className="flex items-center gap-1.5 text-text-secondary">
					<KVIcon />
					KV
				</span>
				<span className="text-text-secondary text-xs">&gt;</span>
				<span className="flex items-center gap-1.5 text-text font-medium">
					{namespaceId}
				</span>
			</div>

			<AddKVForm onAdd={handleAdd} clearSignal={clearAddForm} />

			{error && (
				<div className="text-danger p-4 bg-danger/8 border border-danger/20 rounded-md mb-4">
					{error}
				</div>
			)}

			{loading ? (
				<div className="text-center p-12 text-text-secondary">Loading...</div>
			) : entries.length === 0 ? (
				<div className="text-center p-12 text-text-secondary">
					<p>No keys in this namespace.</p>
					<p>Add an entry using the form above.</p>
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
						<div className="text-center p-4">
							<Button
								className="btn inline-flex items-center justify-center py-2 px-4 text-sm font-medium rounded-md cursor-pointer transition-[background-color,transform] active:translate-y-px bg-bg-tertiary text-text border border-border hover:bg-border"
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

			<AlertDialog.Root
				open={deleteTarget !== null}
				onOpenChange={(open) => !open && setDeleteTarget(null)}
			>
				<AlertDialog.Portal>
					<AlertDialog.Backdrop className="dialog-backdrop" />
					<AlertDialog.Popup className="dialog">
						<AlertDialog.Title className="text-lg font-semibold mb-4">
							Delete key?
						</AlertDialog.Title>
						<AlertDialog.Description className="text-text-secondary mb-2">
							Are you sure you want to delete &ldquo;{deleteTarget}&rdquo;? This
							cannot be undone.
						</AlertDialog.Description>
						<div className="flex justify-end gap-2 mt-6">
							<AlertDialog.Close
								render={
									<Button className="btn inline-flex items-center justify-center py-2 px-4 text-sm font-medium border-none rounded-md cursor-pointer transition-[background-color,transform] active:translate-y-px bg-bg-tertiary text-text border border-border hover:bg-border" />
								}
								disabled={deleting}
							>
								Cancel
							</AlertDialog.Close>
							<Button
								className="btn inline-flex items-center justify-center py-2 px-4 text-sm font-medium border-none rounded-md cursor-pointer transition-[background-color,transform] active:translate-y-px bg-danger text-bg-tertiary hover:bg-danger-hover"
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

			<AlertDialog.Root
				open={overwriteConfirm !== null}
				onOpenChange={(open) => !open && setOverwriteConfirm(null)}
			>
				<AlertDialog.Portal>
					<AlertDialog.Backdrop className="dialog-backdrop" />
					<AlertDialog.Popup className="dialog">
						<AlertDialog.Title className="text-lg font-semibold mb-4">
							Overwrite key?
						</AlertDialog.Title>
						<AlertDialog.Description className="text-text-secondary mb-2">
							Key &ldquo;{overwriteConfirm?.key}&rdquo; already exists. Do you
							want to overwrite its value?
						</AlertDialog.Description>
						<div className="flex justify-end gap-2 mt-6">
							<AlertDialog.Close
								render={
									<Button className="btn inline-flex items-center justify-center py-2 px-4 text-sm font-medium border-none rounded-md cursor-pointer transition-[background-color,transform] active:translate-y-px bg-bg-tertiary text-text border border-border hover:bg-border" />
								}
								disabled={overwriting}
							>
								Cancel
							</AlertDialog.Close>
							<Button
								className="btn inline-flex items-center justify-center py-2 px-4 text-sm font-medium border-none rounded-md cursor-pointer transition-[background-color,transform] active:translate-y-px bg-primary text-bg-tertiary hover:bg-primary-hover"
								onClick={handleConfirmOverwrite}
								disabled={overwriting}
								focusableWhenDisabled
							>
								{overwriting ? "Overwriting..." : "Overwrite"}
							</Button>
						</div>
					</AlertDialog.Popup>
				</AlertDialog.Portal>
			</AlertDialog.Root>
		</div>
	);
}
