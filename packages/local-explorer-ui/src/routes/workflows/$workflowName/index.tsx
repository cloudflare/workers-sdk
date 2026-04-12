import { Button, Dialog, DropdownMenu, Pagination } from "@cloudflare/kumo";
import {
	ArrowClockwiseIcon,
	CaretDownIcon,
	CaretUpDownIcon,
	CheckCircleIcon,
	CircleNotchIcon,
	DotsThreeIcon,
	ListIcon,
	PaperPlaneTiltIcon,
	PauseIcon,
	PlayIcon,
	SpinnerIcon,
	SquareIcon,
	StopIcon,
	TrashIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import {
	memo,
	useCallback,
	useEffect,
	useRef,
	useState,
	type MouseEvent,
} from "react";
import {
	workflowsChangeInstanceStatus,
	workflowsDeleteInstance,
	workflowsDeleteWorkflow,
	workflowsListInstances,
	workflowsSendInstanceEvent,
} from "../../../api";
import WorkflowsIcon from "../../../assets/icons/workflows.svg?react";
import { Breadcrumbs } from "../../../components/Breadcrumbs";
import { NotFound } from "../../../components/NotFound";
import { ResourceError } from "../../../components/ResourceError";
import { CreateWorkflowInstanceDialog } from "../../../components/workflows/CreateInstanceDialog";
import { timeAgo } from "../../../components/workflows/helpers";
import { WorkflowStatusBadge } from "../../../components/workflows/StatusBadge";
import { getAvailableActions } from "../../../components/workflows/types";
import { withMinimumDelay } from "../../../utils/async";
import type { WorkflowsInstance } from "../../../api";
import type { Action } from "../../../components/workflows/types";

export const Route = createFileRoute("/workflows/$workflowName/")({
	component: WorkflowInstancesView,
	errorComponent: ResourceError,
	loader: async ({ params }) => {
		const response = await workflowsListInstances({
			path: { workflow_name: params.workflowName },
			query: { page: 1, per_page: 25 },
			throwOnError: false,
		});
		if (response.response?.status === 404) {
			throw notFound();
		}

		if (response.error) {
			throw new Error(
				`Failed to list instances for workflow "${params.workflowName}"`
			);
		}

		return {
			instances: response.data?.result ?? [],
			resultInfo: response.data?.result_info ?? {
				page: 1,
				per_page: 25,
				total_count: 0,
				total_pages: 0,
			},
		};
	},
	notFoundComponent: NotFound,
});

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Status summary
// ---------------------------------------------------------------------------

const STATUS_SUMMARY_CONFIG = [
	{
		key: "complete",
		label: "Complete",
		icon: CheckCircleIcon,
		color: "text-kumo-link",
		weight: "fill" as const,
	},
	{
		key: "errored",
		label: "Errored",
		icon: WarningCircleIcon,
		color: "text-kumo-danger",
		weight: "fill" as const,
	},
	{
		key: "queued",
		label: "Queued",
		icon: CircleNotchIcon,
		color: "text-kumo-subtle",
		weight: "regular" as const,
	},
	{
		key: "running",
		label: "Running",
		icon: PlayIcon,
		color: "text-kumo-subtle",
		weight: "fill" as const,
	},
	{
		key: "paused",
		label: "Paused",
		icon: PauseIcon,
		color: "text-kumo-subtle",
		weight: "fill" as const,
	},
	{
		key: "waiting",
		label: "Waiting",
		icon: SpinnerIcon,
		color: "text-kumo-subtle",
		weight: "regular" as const,
	},
	{
		key: "terminated",
		label: "Terminated",
		icon: SquareIcon,
		color: "text-kumo-subtle",
		weight: "fill" as const,
	},
] as const;

const StatusSummary = memo(function StatusSummary({
	statusCounts,
}: {
	statusCounts: Record<string, number>;
}): JSX.Element {
	return (
		<div className="mb-4 flex divide-x divide-kumo-fill overflow-hidden rounded-lg border border-kumo-fill bg-kumo-elevated">
			{STATUS_SUMMARY_CONFIG.map(
				({ key, label, icon: Icon, color, weight }) => (
					<div className="flex-1 space-y-1 px-4.5 pt-4 pb-3.5" key={key}>
						<div className="flex items-center gap-1.5 text-xs text-kumo-subtle">
							<Icon className={color} size={12} weight={weight} />
							{label}
						</div>
						<div className="mt-0.5 text-base text-kumo-default">
							{statusCounts[key] ?? 0}
						</div>
					</div>
				)
			)}
		</div>
	);
});

// ---------------------------------------------------------------------------
// Action helpers
// ---------------------------------------------------------------------------

const ACTION_CONFIG_LIST: Record<
	Action,
	{ icon: typeof PauseIcon; style: string; weight: "fill" | "regular" }
> = {
	pause: {
		icon: PauseIcon,
		style: "border-kumo-fill bg-kumo-base text-kumo-default hover:bg-kumo-fill",
		weight: "fill",
	},
	resume: {
		icon: PlayIcon,
		style: "border-kumo-fill bg-kumo-base text-kumo-default hover:bg-kumo-fill",
		weight: "fill",
	},
	restart: {
		icon: ArrowClockwiseIcon,
		style: "border-kumo-fill bg-kumo-base text-kumo-default hover:bg-kumo-fill",
		weight: "regular",
	},
	terminate: {
		icon: StopIcon,
		style:
			"border-kumo-fill bg-kumo-base text-kumo-danger hover:bg-kumo-danger/10",
		weight: "fill",
	},
};

// ---------------------------------------------------------------------------
// Instance row with inline action buttons
// ---------------------------------------------------------------------------

const InstanceRow = memo(function InstanceRow({
	instance,
	onActionComplete,
	workflowName,
}: {
	instance: WorkflowsInstance;
	onActionComplete: () => void;
	workflowName: string;
}): JSX.Element {
	const navigate = useNavigate();
	const [actionInProgress, setActionInProgress] = useState<Action | null>(null);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false);
	const [sendEventOpen, setSendEventOpen] = useState<boolean>(false);
	const [eventType, setEventType] = useState<string>("");
	const [eventPayload, setEventPayload] = useState<string>("");
	const [sendingEvent, setSendingEvent] = useState<boolean>(false);

	const status = instance.status ?? "unknown";
	const actions = getAvailableActions(status);

	async function handleAction(e: MouseEvent, action: Action): Promise<void> {
		e.stopPropagation(); // Don't navigate when clicking action buttons
		setActionInProgress(action);
		try {
			await workflowsChangeInstanceStatus({
				path: {
					workflow_name: workflowName,
					instance_id: instance.id ?? "",
				},
				body: { action },
			});
			onActionComplete();
		} catch {
			onActionComplete();
		} finally {
			setActionInProgress(null);
		}
	}

	function handleDeleteClick(e: MouseEvent): void {
		e.stopPropagation();
		setDeleteDialogOpen(true);
	}

	async function handleDeleteConfirm(): Promise<void> {
		setDeleteDialogOpen(false);
		setActionInProgress("terminate");
		try {
			await workflowsDeleteInstance({
				path: {
					workflow_name: workflowName,
					instance_id: instance.id ?? "",
				},
			});
			onActionComplete();
		} catch {
			onActionComplete();
		} finally {
			setActionInProgress(null);
		}
	}

	function handleSendEventClick(e: MouseEvent): void {
		e.stopPropagation();
		setSendEventOpen(true);
	}

	async function handleSendEvent(): Promise<void> {
		if (!eventType.trim()) {
			return;
		}
		let payload: unknown;
		if (eventPayload.trim()) {
			try {
				payload = JSON.parse(eventPayload);
			} catch {
				// Invalid JSON — don't send, keep dialog open
				return;
			}
		}
		setSendingEvent(true);
		try {
			await workflowsSendInstanceEvent({
				path: {
					workflow_name: workflowName,
					instance_id: instance.id ?? "",
					event_type: eventType.trim(),
				},
				body: payload,
			});
			setSendEventOpen(false);
			setEventType("");
			setEventPayload("");
			onActionComplete();
		} catch {
			setSendEventOpen(false);
			onActionComplete();
		} finally {
			setSendingEvent(false);
		}
	}

	function handleRowClick(): void {
		void navigate({
			to: "/workflows/$workflowName/$instanceId",
			params: {
				instanceId: instance.id ?? "",
				workflowName,
			},
			search: (prev) => prev,
		});
	}

	return (
		<>
			<div className="border-b border-kumo-fill bg-kumo-elevated p-1 last:border-b-0">
				<div
					className="grid h-10 cursor-pointer grid-cols-[100px_60px_1fr_auto] items-center gap-3 rounded-lg px-2 transition-colors hover:bg-kumo-fill"
					onClick={handleRowClick}
				>
					<div>
						<WorkflowStatusBadge status={status} />
					</div>
					<span className="text-sm text-kumo-subtle">
						{timeAgo(instance.created_on) || "—"}
					</span>
					<span className="truncate font-mono text-xs text-kumo-default">
						{instance.id}
					</span>
					<div className="flex items-center gap-1">
						{actions.map((action) => {
							const config = ACTION_CONFIG_LIST[action];
							const Icon = config.icon;
							return (
								<button
									key={action}
									className={`inline-flex size-7 cursor-pointer items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${config.style}`}
									disabled={actionInProgress !== null}
									onClick={(e) => void handleAction(e, action)}
									title={action.charAt(0).toUpperCase() + action.slice(1)}
								>
									<Icon
										size={14}
										weight={config.weight}
										className={
											actionInProgress === action ? "animate-spin" : ""
										}
									/>
								</button>
							);
						})}
						{status !== "complete" &&
							status !== "errored" &&
							status !== "terminated" && (
								<button
									className="ml-1 inline-flex size-7 cursor-pointer items-center justify-center rounded-md border border-kumo-fill bg-kumo-base text-kumo-default transition-colors hover:bg-kumo-fill disabled:cursor-not-allowed disabled:opacity-40"
									disabled={actionInProgress !== null}
									onClick={handleSendEventClick}
									title="Send Event"
								>
									<PaperPlaneTiltIcon size={14} />
								</button>
							)}
						<button
							className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md border border-kumo-fill bg-kumo-base text-kumo-danger transition-colors hover:bg-kumo-danger/10 disabled:cursor-not-allowed disabled:opacity-40"
							disabled={actionInProgress !== null}
							onClick={handleDeleteClick}
							title="Delete"
						>
							<TrashIcon size={14} />
						</button>
					</div>
				</div>
			</div>

			{/* Delete confirmation dialog — outside Table.Row to prevent click propagation */}
			<Dialog.Root open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<Dialog size="lg">
					<div className="border-b border-kumo-fill px-6 pt-6 pb-4">
						{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
						<Dialog.Title className="text-lg font-semibold text-kumo-default">
							Delete this instance?
						</Dialog.Title>
						<p className="mt-1 text-sm text-kumo-subtle">
							This will permanently delete the instance and its persistence
							data. This action cannot be undone.
						</p>
					</div>

					<div className="px-6 py-4">
						<div className="rounded-lg border border-kumo-fill bg-kumo-elevated px-4 py-3">
							<span className="text-xs text-kumo-subtle">Instance ID</span>
							<p className="mt-0.5 font-mono text-sm text-kumo-default">
								{instance.id}
							</p>
						</div>
					</div>

					<div className="flex justify-end gap-2 border-t border-kumo-fill px-6 py-4">
						<Button
							variant="secondary"
							onClick={() => setDeleteDialogOpen(false)}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={() => void handleDeleteConfirm()}
						>
							Delete Instance
						</Button>
					</div>
				</Dialog>
			</Dialog.Root>

			{/* Send Event dialog */}
			<Dialog.Root
				open={sendEventOpen}
				onOpenChange={(open) => {
					setSendEventOpen(open);
					if (!open) {
						setEventType("");
						setEventPayload("");
					}
				}}
			>
				<Dialog size="lg" className="w-lg">
					<div className="border-b border-kumo-fill px-6 py-4">
						{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
						<Dialog.Title className="text-lg font-semibold text-kumo-default">
							Send Event
						</Dialog.Title>
					</div>

					<div className="space-y-4 px-6 py-5">
						<div>
							<label className="mb-2 block text-sm font-medium text-kumo-default">
								Event Type
							</label>
							<input
								className="focus-visible:ring-kumo-ring w-full rounded-lg border border-kumo-fill bg-kumo-base px-3 py-2.5 text-sm text-kumo-default placeholder:text-kumo-subtle focus:border-kumo-brand focus:outline-none focus-visible:ring-2"
								onChange={(e) => setEventType(e.target.value)}
								placeholder="my-event"
								type="text"
								value={eventType}
							/>
						</div>
						<div>
							<label className="mb-2 block text-sm font-medium text-kumo-default">
								Payload{" "}
								<span className="font-normal text-kumo-subtle">(optional)</span>
							</label>
							<textarea
								className="focus-visible:ring-kumo-ring w-full resize-y rounded-lg border border-kumo-fill bg-kumo-base px-3 py-2.5 font-mono text-sm text-kumo-default placeholder:text-kumo-subtle focus:border-kumo-brand focus:outline-none focus-visible:ring-2"
								onChange={(e) => setEventPayload(e.target.value)}
								placeholder='{"key": "value"}'
								rows={4}
								value={eventPayload}
							/>
						</div>
					</div>

					<div className="flex justify-end gap-2 border-t border-kumo-fill px-6 py-4">
						<Button
							variant="secondary"
							onClick={() => setSendEventOpen(false)}
							disabled={sendingEvent}
						>
							Cancel
						</Button>
						<Button
							variant="primary"
							disabled={!eventType.trim() || sendingEvent}
							loading={sendingEvent}
							onClick={() => void handleSendEvent()}
						>
							Send
						</Button>
					</div>
				</Dialog>
			</Dialog.Root>
		</>
	);
});

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

function WorkflowInstancesView() {
	const params = Route.useParams();
	const loaderData = Route.useLoaderData();

	const [deleteAllConfirmOpen, setDeleteAllConfirmOpen] =
		useState<boolean>(false);
	const [deletingAll, setDeletingAll] = useState<boolean>(false);
	const [deleteAllError, setDeleteAllError] = useState<string | null>(null);
	const [dialogOpen, setDialogOpen] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [instances, setInstances] = useState<WorkflowsInstance[]>(
		loaderData.instances
	);
	const [initialLoad, setInitialLoad] = useState<boolean>(
		loaderData.instances.length === 0 &&
			(loaderData.resultInfo.total_count ?? 0) === 0
	);
	const [fetching, setFetching] = useState<boolean>(false);
	const [refreshing, setRefreshing] = useState<boolean>(false);
	const [page, setPage] = useState<number>(loaderData.resultInfo.page ?? 1);
	const [perPage, setPerPage] = useState<number>(
		loaderData.resultInfo.per_page ?? 25
	);
	const [statusCounts, setStatusCounts] = useState<Record<string, number>>(
		((loaderData.resultInfo as Record<string, unknown>).status_counts as Record<
			string,
			number
		>) ?? {}
	);
	const [statusFilter, setStatusFilter] = useState<string>("all");
	const [totalCount, setTotalCount] = useState<number>(
		loaderData.resultInfo.total_count ?? 0
	);

	useEffect((): void => {
		setInstances(loaderData.instances);
		setTotalCount(loaderData.resultInfo.total_count ?? 0);
		setStatusCounts(
			((loaderData.resultInfo as Record<string, unknown>)
				.status_counts as Record<string, number>) ?? {}
		);
		setError(null);
		setInitialLoad(false);
		setFetching(false);
	}, [loaderData]);

	const fetchInstances = useCallback(
		async (
			fetchPage?: number,
			fetchPerPage?: number,
			quiet?: boolean,
			fetchStatus?: string
		): Promise<void> => {
			try {
				if (!quiet) {
					setFetching(true);
				}
				setError(null);

				const p = fetchPage ?? page;
				const pp = fetchPerPage ?? perPage;
				const st = fetchStatus ?? statusFilter;

				const response = await workflowsListInstances({
					path: { workflow_name: params.workflowName },
					query: {
						page: p,
						per_page: pp,
						...(st !== "all"
							? {
									status: st as
										| "queued"
										| "running"
										| "paused"
										| "errored"
										| "terminated"
										| "complete"
										| "waitingForPause"
										| "waiting",
								}
							: {}),
					},
				});

				setInstances(response.data?.result ?? []);
				setTotalCount(response.data?.result_info?.total_count ?? 0);
				setStatusCounts(
					((response.data?.result_info as Record<string, unknown> | undefined)
						?.status_counts as Record<string, number>) ?? {}
				);
				setPage(response.data?.result_info?.page ?? p);
				setInitialLoad(false);
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to fetch instances"
				);
			} finally {
				setFetching(false);
			}
		},
		[params.workflowName, page, perPage, statusFilter]
	);

	const handleRefresh = useCallback(async () => {
		setRefreshing(true);
		try {
			await withMinimumDelay(fetchInstances(undefined, undefined, true));
		} finally {
			setRefreshing(false);
		}
	}, [fetchInstances]);

	// Auto-poll every 10s (quiet refresh — no opacity flash)
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
	useEffect(() => {
		pollRef.current = setInterval(() => {
			void fetchInstances(undefined, undefined, true);
		}, 10_000);
		return () => {
			if (pollRef.current) {
				clearInterval(pollRef.current);
			}
		};
	}, [fetchInstances]);

	function handlePageChange(newPage: number): void {
		setPage(newPage);
		void fetchInstances(newPage);
	}

	function handlePerPageChange(newPerPage: number): void {
		setPerPage(newPerPage);
		setPage(1);
		void fetchInstances(1, newPerPage);
	}

	function handleCreated(): void {
		setDialogOpen(false);
		void fetchInstances(1);
	}

	function handleStatusFilterChange(newStatus: string): void {
		setStatusFilter(newStatus);
		setPage(1);
		void fetchInstances(1, undefined, false, newStatus);
	}

	function handleDeleteAllOpenChange(open: boolean): void {
		setDeleteAllConfirmOpen(open);
		if (!open) {
			setDeleteAllError(null);
		}
	}

	async function handleDeleteAll(): Promise<void> {
		setDeletingAll(true);
		setDeleteAllError(null);
		try {
			await workflowsDeleteWorkflow({
				path: { workflow_name: params.workflowName },
			});
			handleDeleteAllOpenChange(false);
			void fetchInstances(1);
		} catch (err) {
			setDeleteAllError(
				err instanceof Error ? err.message : "Failed to delete instances"
			);
		} finally {
			setDeletingAll(false);
		}
	}

	return (
		<>
			<Breadcrumbs
				icon={WorkflowsIcon}
				items={[
					<span className="flex items-center gap-1.5" key="workflow-name">
						{params.workflowName}
					</span>,
				]}
				title="Workflows"
			>
				<Button
					onClick={(e: MouseEvent<HTMLButtonElement>) => {
						(e.target as HTMLButtonElement).blur();
						setDialogOpen(true);
					}}
					variant="primary"
				>
					<PlayIcon size={14} weight="fill" />
					Trigger
				</Button>

				<DropdownMenu>
					<DropdownMenu.Trigger
						render={
							<Button className="min-w-36" icon={CaretDownIcon}>
								<span>
									{statusFilter === "all"
										? "All"
										: (STATUS_SUMMARY_CONFIG.find((s) => s.key === statusFilter)
												?.label ?? statusFilter)}
								</span>
							</Button>
						}
					/>
					<DropdownMenu.Content
						align="start"
						className="w-36 bg-kumo-base"
						side="bottom"
					>
						<DropdownMenu.Item
							className="cursor-pointer gap-2 rounded-md transition-colors hover:bg-kumo-fill"
							icon={<ListIcon />}
							onClick={() => handleStatusFilterChange("all")}
						>
							All
						</DropdownMenu.Item>
						{STATUS_SUMMARY_CONFIG.map(({ key, label, icon: Icon }) => (
							<DropdownMenu.Item
								className="cursor-pointer gap-2 rounded-md transition-colors hover:bg-kumo-fill"
								icon={<Icon />}
								key={key}
								onClick={() => handleStatusFilterChange(key)}
							>
								{label}
							</DropdownMenu.Item>
						))}
					</DropdownMenu.Content>
				</DropdownMenu>

				<Button
					aria-label="Refresh"
					icon={ArrowClockwiseIcon}
					loading={refreshing}
					onClick={() => void handleRefresh()}
					shape="square"
					variant="secondary"
				></Button>

				<DropdownMenu>
					<DropdownMenu.Trigger
						render={
							<Button aria-label="More actions" shape="square">
								<DotsThreeIcon size={14} weight="bold" />
							</Button>
						}
					/>
					<DropdownMenu.Content align="end" sideOffset={4}>
						<DropdownMenu.Item
							className="flex cursor-pointer items-center gap-2 text-kumo-danger"
							onClick={() => handleDeleteAllOpenChange(true)}
						>
							<TrashIcon />
							<span>Delete all instances</span>
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu>
			</Breadcrumbs>

			<div className="px-8 py-6">
				{totalCount > 0 && !initialLoad && (
					<StatusSummary statusCounts={statusCounts} />
				)}

				{error && (
					<div className="mb-4 rounded-md border border-kumo-danger/20 bg-kumo-danger/8 p-4 text-kumo-danger">
						{error}
					</div>
				)}

				{initialLoad ? (
					<div className="p-12 text-center text-kumo-subtle">Loading...</div>
				) : instances.length === 0 && !fetching ? (
					<div className="rounded-lg border border-kumo-fill bg-kumo-elevated px-5 py-8 text-center text-sm text-kumo-subtle">
						No instances found
					</div>
				) : instances.length === 0 ? (
					<div className="rounded-lg border border-kumo-fill bg-kumo-elevated px-5 py-8 text-center text-sm text-kumo-subtle">
						{statusFilter !== "all" ? (
							<>No instances found in state &lsquo;{statusFilter}&rsquo;</>
						) : (
							"No instances found"
						)}
					</div>
				) : (
					<div
						className={`transition-opacity duration-150 ${fetching ? "opacity-60" : "opacity-100"}`}
					>
						<div className="overflow-hidden rounded-lg border border-kumo-fill">
							{instances.map((instance) => (
								<InstanceRow
									instance={instance}
									key={instance.id}
									onActionComplete={handleRefresh}
									workflowName={params.workflowName}
								/>
							))}
						</div>

						{totalCount > 0 && (
							<div className="flex items-center justify-between gap-2 pt-4">
								<DropdownMenu>
									<DropdownMenu.Trigger
										render={<Button icon={CaretUpDownIcon}>{perPage}</Button>}
									/>
									<DropdownMenu.Content
										align="start"
										className="bg-kumo-base"
										side="top"
									>
										{[10, 25, 50, 100].map((size) => (
											<DropdownMenu.Item
												className="cursor-pointer rounded-md transition-colors hover:bg-kumo-fill"
												key={size}
												onClick={() => handlePerPageChange(size)}
											>
												{size}
												{size === perPage && (
													<span className="ml-2 text-kumo-subtle">✓</span>
												)}
											</DropdownMenu.Item>
										))}
									</DropdownMenu.Content>
								</DropdownMenu>

								<Pagination
									page={page}
									perPage={perPage}
									setPage={handlePageChange}
									totalCount={totalCount}
								/>
							</div>
						)}
					</div>
				)}
			</div>

			{/* Delete all instances confirmation dialog */}
			<Dialog.Root
				open={deleteAllConfirmOpen}
				onOpenChange={handleDeleteAllOpenChange}
			>
				<Dialog size="lg" className="w-lg">
					<div className="border-b border-kumo-fill px-6 py-4">
						{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
						<Dialog.Title className="text-lg font-semibold text-kumo-default">
							Delete all instances
						</Dialog.Title>
					</div>

					<div className="px-6 py-5">
						{deleteAllError && (
							<div className="mb-4 rounded-lg border border-kumo-danger/20 bg-kumo-danger/8 p-3 text-sm text-kumo-danger">
								{deleteAllError}
							</div>
						)}
						<p className="text-sm text-kumo-subtle">
							This will permanently delete all instances of{" "}
							<span className="font-semibold text-kumo-default">
								{params.workflowName}
							</span>
							. All instance data and persistence files will be removed. This
							action cannot be undone.
						</p>
					</div>

					<div className="flex justify-end gap-2 border-t border-kumo-fill px-6 py-4">
						<Button
							variant="secondary"
							onClick={() => handleDeleteAllOpenChange(false)}
							disabled={deletingAll}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							disabled={deletingAll}
							loading={deletingAll}
							onClick={() => void handleDeleteAll()}
						>
							Delete
						</Button>
					</div>
				</Dialog>
			</Dialog.Root>

			<CreateWorkflowInstanceDialog
				onCreated={handleCreated}
				onOpenChange={setDialogOpen}
				open={dialogOpen}
				workflowName={params.workflowName}
			/>
		</>
	);
}
