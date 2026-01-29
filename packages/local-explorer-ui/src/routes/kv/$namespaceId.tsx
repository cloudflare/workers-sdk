import { AlertDialog } from "@base-ui-components/react/alert-dialog";
import { Button } from "@base-ui-components/react/button";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
	workersKvNamespaceDeleteKeyValuePair,
	workersKvNamespaceGetMultipleKeyValuePairs,
	workersKvNamespaceListANamespace_SKeys,
	workersKvNamespaceWriteKeyValuePairWithMetadata,
} from "../../api";
import KVIcon from "../../assets/icons/kv.svg?react";
import { AddKVForm } from "../../components/AddKVForm";
import { KVTable } from "../../components/KVTable";
import type { KVEntry } from "../../api";

export const Route = createFileRoute("/kv/$namespaceId")({
	component: NamespaceView,
});

function NamespaceView() {
	const { namespaceId } = Route.useParams();
	const [entries, setEntries] = useState<KVEntry[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [cursor, setCursor] = useState<string | null>(null);
	const [hasMore, setHasMore] = useState(false);
	const [loadingMore, setLoadingMore] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
	const [deleting, setDeleting] = useState(false);

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

	const handleLoadMore = () => {
		if (cursor && !loadingMore) {
			void fetchEntries(cursor);
		}
	};

	const handleAdd = async (key: string, value: string) => {
		await workersKvNamespaceWriteKeyValuePairWithMetadata({
			path: { namespace_id: namespaceId, key_name: key },
			body: value,
		});

		// Add to top of list (or move to top if key already exists)
		setEntries((prev) => {
			const newEntry: KVEntry = { key: { name: key }, value };
			const filtered = prev.filter((e) => e.key.name !== key);
			return [newEntry, ...filtered];
		});
	};

	const handleSave = async (
		originalKey: string,
		newKey: string,
		value: string
	) => {
		// Check if renaming to an existing key
		if (originalKey !== newKey) {
			const existingKey = entries.find((e) => e.key.name === newKey);
			if (existingKey) {
				throw new Error(`Key "${newKey}" already exists`);
			}
			await workersKvNamespaceDeleteKeyValuePair({
				path: { namespace_id: namespaceId, key_name: originalKey },
				body: null,
			});
		}
		await workersKvNamespaceWriteKeyValuePairWithMetadata({
			path: { namespace_id: namespaceId, key_name: newKey },
			body: value,
		});

		// Update entry in place (keeps position in list)
		setEntries((prev) =>
			prev.map((entry) =>
				entry.key.name === originalKey
					? { key: { name: newKey }, value }
					: entry
			)
		);
	};

	const handleDeleteClick = (key: string) => {
		setDeleteTarget(key);
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
			setDeleteTarget(null);
			void fetchEntries();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to delete");
			setDeleteTarget(null);
		} finally {
			setDeleting(false);
		}
	};

	return (
		<div>
			<div className="breadcrumb-bar">
				<span className="breadcrumb-item">
					<KVIcon />
					KV
				</span>
				<span className="breadcrumb-separator">&gt;</span>
				<span className="breadcrumb-item current">{namespaceId}</span>
			</div>

			<AddKVForm onAdd={handleAdd} />

			{error && <div className="error">{error}</div>}

			{loading ? (
				<div className="loading">Loading...</div>
			) : entries.length === 0 ? (
				<div className="empty-state">
					<p>No keys in this namespace.</p>
					<p>Add an entry using the form above.</p>
				</div>
			) : (
				<>
					<div className="table-wrapper">
						<KVTable
							entries={entries}
							onSave={handleSave}
							onDelete={handleDeleteClick}
						/>
					</div>
					{hasMore && (
						<div className="load-more">
							<Button
								className="btn btn-secondary"
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
						<AlertDialog.Title className="dialog-title">
							Delete key?
						</AlertDialog.Title>
						<AlertDialog.Description className="dialog-description">
							Are you sure you want to delete &ldquo;{deleteTarget}&rdquo;? This
							cannot be undone.
						</AlertDialog.Description>
						<div className="dialog-actions">
							<AlertDialog.Close
								render={<Button className="btn btn-secondary" />}
								disabled={deleting}
							>
								Cancel
							</AlertDialog.Close>
							<Button
								className="btn btn-danger"
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
		</div>
	);
}
