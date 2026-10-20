import { Button, Dialog, Empty, RefreshButton } from "@cloudflare/kumo";
import {
	CaretRightIcon,
	KeyIcon,
	PencilSimpleIcon,
	PlusIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
	workflowsCreateConcurrencyKey,
	workflowsDeleteConcurrencyKey,
	workflowsListConcurrencyKeyHolders,
	workflowsListConcurrencyKeys,
	workflowsListConcurrencyKeyWaiters,
	workflowsUpdateConcurrencyKey,
} from "../../api";
import WorkflowsIcon from "../../assets/icons/workflows.svg?react";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { ResourceError } from "../../components/ResourceError";
import { timeAgo } from "../../components/workflows/helpers";
import type {
	WorkflowsConcurrencyKey,
	WorkflowsConcurrencyKeyHolder,
	WorkflowsConcurrencyKeyWaiter,
} from "../../api";
import type { JSX } from "react";

const POLL_INTERVAL_MS = 2_000;

export const Route = createFileRoute("/workflows/concurrency")({
	component: ConcurrencyKeysView,
	errorComponent: ResourceError,
	loader: async () => ({ keys: await listKeys() }),
});

async function listKeys(): Promise<WorkflowsConcurrencyKey[]> {
	const response = await workflowsListConcurrencyKeys({
		query: { page: 1, per_page: 100 },
		throwOnError: false,
	});
	if (response.error) {
		throw new Error("Failed to list concurrency keys");
	}
	return response.data?.result ?? [];
}

function errorMessage(error: unknown, fallback: string): string {
	const errors = (error as { errors?: Array<{ message?: string }> } | undefined)
		?.errors;
	return errors?.[0]?.message ?? fallback;
}

function UsageBar({
	keyData,
}: {
	keyData: WorkflowsConcurrencyKey;
}): JSX.Element {
	const { holding } = keyData.usage;
	const ratio = Math.min(1, holding / keyData.limit);
	const full = holding >= keyData.limit;
	return (
		<div className="flex items-center gap-2">
			<div className="h-1.5 w-24 overflow-hidden rounded-full bg-kumo-fill">
				<div
					className={`h-full rounded-full ${full ? "bg-kumo-badge-orange" : "bg-kumo-badge-teal"}`}
					style={{ width: `${ratio * 100}%` }}
				/>
			</div>
			<span className="font-mono text-xs text-kumo-default">
				{holding} / {keyData.limit}
			</span>
		</div>
	);
}

function EntryList({
	emptyLabel,
	entries,
	title,
}: {
	emptyLabel: string;
	entries: Array<WorkflowsConcurrencyKeyHolder | WorkflowsConcurrencyKeyWaiter>;
	title: string;
}): JSX.Element {
	return (
		<div>
			<h5 className="mb-2 text-sm font-medium text-kumo-default">{title}</h5>
			{entries.length === 0 ? (
				<p className="text-sm text-kumo-subtle">{emptyLabel}</p>
			) : (
				<ul className="space-y-1 text-sm">
					{entries.map((entry, index) => (
						<li className="flex items-center gap-2" key={index}>
							{entry.workflow_name === null || entry.instance_id === null ? (
								<span className="font-mono text-xs text-kumo-subtle">
									Test hold
								</span>
							) : (
								<Link
									className="truncate font-mono text-xs text-kumo-default hover:underline"
									params={{
										instanceId: entry.instance_id,
										workflowName: entry.workflow_name,
									}}
									to="/workflows/$workflowName/$instanceId"
								>
									{entry.workflow_name} / {entry.instance_id} /{" "}
									{entry.step?.replace(/-\d+$/, "")}
								</Link>
							)}
							<span className="flex-1 border-t border-dashed border-kumo-fill" />
							<span className="shrink-0 text-kumo-subtle">
								{timeAgo(entry.since)}
							</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

function KeyRow({
	keyData,
	onDelete,
	onEdit,
}: {
	keyData: WorkflowsConcurrencyKey;
	onDelete: () => void;
	onEdit: () => void;
}): JSX.Element {
	const [expanded, setExpanded] = useState(false);
	const [holders, setHolders] = useState<WorkflowsConcurrencyKeyHolder[]>([]);
	const [waiters, setWaiters] = useState<WorkflowsConcurrencyKeyWaiter[]>([]);
	const { holding, waiting } = keyData.usage;

	useEffect(() => {
		if (!expanded) {
			return;
		}
		let cancelled = false;
		void Promise.all([
			workflowsListConcurrencyKeyHolders({ path: { key_id: keyData.id } }),
			workflowsListConcurrencyKeyWaiters({ path: { key_id: keyData.id } }),
		]).then(([holdersResponse, waitersResponse]) => {
			if (!cancelled) {
				setHolders(holdersResponse.data?.result ?? []);
				setWaiters(waitersResponse.data?.result ?? []);
			}
		});
		return () => {
			cancelled = true;
		};
	}, [expanded, keyData.id, holding, waiting]);

	return (
		<div className="border-b border-kumo-fill bg-kumo-base p-1 last:border-b-0">
			<div
				className="grid h-10 cursor-pointer grid-cols-[16px_1fr_180px_100px_100px_auto] items-center gap-3 rounded-lg px-2 transition-colors hover:bg-kumo-fill"
				onClick={() => setExpanded((value) => !value)}
			>
				<CaretRightIcon
					className={`text-kumo-subtle transition-transform ${expanded ? "rotate-90" : ""}`}
					size={12}
				/>
				<span className="truncate font-mono text-sm text-kumo-default">
					{keyData.name}
				</span>
				<UsageBar keyData={keyData} />
				<span className="text-sm">
					{waiting > 0 ? (
						<span className="rounded bg-kumo-badge-orange/10 px-1.5 py-0.5 text-kumo-badge-orange">
							{waiting} waiting
						</span>
					) : (
						<span className="text-kumo-subtle">none waiting</span>
					)}
				</span>
				<span className="text-sm text-kumo-subtle">
					{timeAgo(keyData.created_on)}
				</span>
				<div className="flex items-center gap-1">
					<button
						className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md border border-kumo-fill bg-kumo-base text-kumo-default transition-colors hover:bg-kumo-fill"
						onClick={(event) => {
							event.stopPropagation();
							onEdit();
						}}
						title="Change limit"
						type="button"
					>
						<PencilSimpleIcon size={14} />
					</button>
					<button
						className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md border border-kumo-fill bg-kumo-base text-kumo-danger transition-colors hover:bg-kumo-badge-red/10"
						onClick={(event) => {
							event.stopPropagation();
							onDelete();
						}}
						title="Delete"
						type="button"
					>
						<TrashIcon size={14} />
					</button>
				</div>
			</div>
			{expanded && (
				<div className="grid grid-cols-1 gap-4 px-8 pt-2 pb-3 md:grid-cols-2">
					<EntryList
						emptyLabel="No step holds this key."
						entries={holders}
						title="Holding"
					/>
					<EntryList
						emptyLabel="No step is waiting for this key."
						entries={waiters}
						title="Waiting"
					/>
				</div>
			)}
		</div>
	);
}

function KeyDialog({
	editing,
	onOpenChange,
	onSaved,
	open,
}: {
	editing: WorkflowsConcurrencyKey | null;
	onOpenChange: (open: boolean) => void;
	onSaved: () => void;
	open: boolean;
}): JSX.Element {
	const [name, setName] = useState("");
	const [limit, setLimit] = useState("1");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (open) {
			setName(editing?.name ?? "");
			setLimit(String(editing?.limit ?? 1));
			setError(null);
		}
	}, [editing, open]);

	const parsedLimit = Number(limit);
	const valid =
		Number.isInteger(parsedLimit) &&
		parsedLimit >= 1 &&
		(editing !== null || name.trim().length > 0);

	async function save(): Promise<void> {
		setSaving(true);
		setError(null);
		const response =
			editing === null
				? await workflowsCreateConcurrencyKey({
						body: { name: name.trim(), limit: parsedLimit },
						throwOnError: false,
					})
				: await workflowsUpdateConcurrencyKey({
						path: { key_id: editing.id },
						body: { limit: parsedLimit },
						throwOnError: false,
					});
		setSaving(false);
		if (response.error) {
			setError(errorMessage(response.error, "Failed to save the key"));
			return;
		}
		onSaved();
	}

	const inputClass =
		"focus-visible:ring-kumo-ring w-full rounded-lg border border-kumo-fill bg-kumo-base px-3 py-2.5 text-sm text-kumo-default placeholder:text-kumo-subtle focus:border-kumo-brand focus:outline-none focus-visible:ring-2";

	return (
		<Dialog.Root onOpenChange={onOpenChange} open={open}>
			<Dialog className="w-lg" size="lg">
				<div className="border-b border-kumo-fill px-6 py-4">
					{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
					<Dialog.Title className="text-lg font-semibold text-kumo-default">
						{editing === null
							? "Create concurrency key"
							: `Change the limit of ${editing.name}`}
					</Dialog.Title>
				</div>
				<div className="space-y-4 px-6 py-5">
					{error && (
						<div className="rounded-lg border border-kumo-danger/20 bg-kumo-danger/8 p-3 text-sm text-kumo-danger">
							{error}
						</div>
					)}
					{editing === null && (
						<div>
							<label className="mb-2 block text-sm font-medium text-kumo-default">
								Name
							</label>
							<input
								className={`${inputClass} font-mono`}
								onChange={(event) => setName(event.target.value)}
								placeholder="payments-api"
								type="text"
								value={name}
							/>
						</div>
					)}
					<div>
						<label className="mb-2 block text-sm font-medium text-kumo-default">
							Limit
						</label>
						<input
							className={inputClass}
							min={1}
							onChange={(event) => setLimit(event.target.value)}
							type="number"
							value={limit}
						/>
						<p className="mt-1 text-xs text-kumo-subtle">
							How many steps can hold the key at once. Waiting steps see a new
							limit straight away.
						</p>
					</div>
				</div>
				<div className="flex justify-end gap-2 border-t border-kumo-fill px-6 py-4">
					<Button
						disabled={saving}
						onClick={() => onOpenChange(false)}
						variant="secondary"
					>
						Cancel
					</Button>
					<Button
						disabled={!valid || saving}
						loading={saving}
						onClick={() => void save()}
						variant="primary"
					>
						{editing === null ? "Create" : "Save"}
					</Button>
				</div>
			</Dialog>
		</Dialog.Root>
	);
}

function ConcurrencyKeysView(): JSX.Element {
	const loaderData = Route.useLoaderData();
	const router = useRouter();
	const [keys, setKeys] = useState(loaderData.keys);
	const [refreshing, setRefreshing] = useState(false);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editing, setEditing] = useState<WorkflowsConcurrencyKey | null>(null);
	const [deleteTarget, setDeleteTarget] =
		useState<WorkflowsConcurrencyKey | null>(null);

	useEffect(() => setKeys(loaderData.keys), [loaderData]);

	const refresh = useCallback(async (): Promise<void> => {
		await listKeys()
			.then(setKeys)
			.catch(() => {}); // the next poll retries
	}, []);

	useEffect(() => {
		const interval = setInterval(() => void refresh(), POLL_INTERVAL_MS);
		return () => clearInterval(interval);
	}, [refresh]);

	function openDialog(key: WorkflowsConcurrencyKey | null): void {
		setEditing(key);
		setDialogOpen(true);
	}

	async function confirmDelete(): Promise<void> {
		if (deleteTarget === null) {
			return;
		}
		await workflowsDeleteConcurrencyKey({
			path: { key_id: deleteTarget.id },
			throwOnError: false,
		});
		setDeleteTarget(null);
		await refresh();
	}

	return (
		<>
			<Breadcrumbs
				icon={WorkflowsIcon}
				items={[<span key="concurrency">Concurrency keys</span>]}
				title="Workflows"
			>
				<div className="ml-auto flex items-center gap-2">
					<RefreshButton
						loading={refreshing}
						onClick={() => {
							setRefreshing(true);
							void router.invalidate().finally(() => setRefreshing(false));
						}}
					/>
					<Button
						icon={PlusIcon}
						onClick={() => openDialog(null)}
						variant="primary"
					>
						Create key
					</Button>
				</div>
			</Breadcrumbs>

			<div className="px-8 py-6">
				<p className="mb-4 max-w-3xl text-sm text-kumo-subtle">
					Every Workflow in this dev session shares these keys. A{" "}
					<code className="font-mono text-kumo-default">step.do()</code> with{" "}
					<code className="font-mono text-kumo-default">concurrency</code> waits
					while its key is full and continues as soon as a slot frees. A step
					that references a key that does not exist here runs without a limit.
				</p>

				{keys.length === 0 ? (
					<Empty
						className="max-w-2xl"
						commandLine="wrangler workflows concurrency create payments-api --limit 2 --local"
						contents={
							<Button
								icon={PlusIcon}
								onClick={() => openDialog(null)}
								variant="primary"
							>
								Create key
							</Button>
						}
						description="Create a key here or with Wrangler to limit how many steps that reference it run at once."
						icon={
							<KeyIcon
								className="text-kumo-subtle"
								size={40}
								weight="duotone"
							/>
						}
						title="No concurrency keys"
					/>
				) : (
					<div className="overflow-hidden rounded-lg border border-kumo-fill bg-kumo-base">
						{keys.map((key) => (
							<KeyRow
								key={key.id}
								keyData={key}
								onDelete={() => setDeleteTarget(key)}
								onEdit={() => openDialog(key)}
							/>
						))}
					</div>
				)}
			</div>

			<KeyDialog
				editing={editing}
				onOpenChange={setDialogOpen}
				onSaved={() => {
					setDialogOpen(false);
					void refresh();
				}}
				open={dialogOpen}
			/>

			<Dialog.Root
				onOpenChange={(open) => {
					if (!open) {
						setDeleteTarget(null);
					}
				}}
				open={deleteTarget !== null}
			>
				<Dialog className="w-lg" size="lg">
					<div className="border-b border-kumo-fill px-6 py-4">
						{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
						<Dialog.Title className="text-lg font-semibold text-kumo-default">
							Delete {deleteTarget?.name}?
						</Dialog.Title>
					</div>
					<p className="px-6 py-5 text-sm text-kumo-subtle">
						Steps that reference this key will run without a limit. Steps
						already holding it keep their slot until they finish.
					</p>
					<div className="flex justify-end gap-2 border-t border-kumo-fill px-6 py-4">
						<Button onClick={() => setDeleteTarget(null)} variant="secondary">
							Cancel
						</Button>
						<Button onClick={() => void confirmDelete()} variant="destructive">
							Delete key
						</Button>
					</div>
				</Dialog>
			</Dialog.Root>
		</>
	);
}
