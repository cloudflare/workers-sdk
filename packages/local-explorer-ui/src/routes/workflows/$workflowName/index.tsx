import { Button, Dialog, DropdownMenu, Pagination } from "@cloudflare/kumo";
import { Select } from "@cloudflare/kumo/primitives/select";
import {
	ArrowClockwiseIcon,
	ArrowsCounterClockwiseIcon,
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
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
	workflowsChangeInstanceStatus,
	workflowsDeleteInstance,
	workflowsDeleteWorkflow,
	workflowsListInstances,
	workflowsSendInstanceEvent,
} from "../../../api";
import WorkflowsIcon from "../../../assets/icons/workflows.svg?react";
import { Breadcrumbs } from "../../../components/Breadcrumbs";
import { PageLayout } from "../../../components/layout";
import { CreateWorkflowInstanceDialog } from "../../../components/workflows/CreateInstanceDialog";
import { timeAgo } from "../../../components/workflows/helpers";
import { WorkflowStatusBadge } from "../../../components/workflows/StatusBadge";
import { getAvailableActions } from "../../../components/workflows/types";
import type { WorkflowsInstance } from "../../../api";
import type { Action } from "../../../components/workflows/types";

export const Route = createFileRoute("/workflows/$workflowName/")({
	component: WorkflowInstancesView,
	loader: async ({ params }) => {
		const response = await workflowsListInstances({
			path: { workflow_name: params.workflowName },
			query: { page: 1, per_page: 25 },
		});

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
});

// ---------------------------------------------------------------------------
// Status summary
// ---------------------------------------------------------------------------

const STATUS_SUMMARY_CONFIG = [
	{
		color: "text-[#2b7bfb] dark:text-[#004ac2]",
		icon: CheckCircleIcon,
		key: "complete",
		label: "Complete",
		weight: "fill" as const,
	},
	{
		color: "text-[#fb2b36] dark:text-[#c10007]",
		icon: WarningCircleIcon,
		key: "errored",
		label: "Errored",
		weight: "fill" as const,
	},
	{
		color: "text-text-secondary",
		icon: CircleNotchIcon,
		key: "queued",
		label: "Queued",
		weight: "regular" as const,
	},
	{
		color: "text-text-secondary",
		icon: PlayIcon,
		key: "running",
		label: "Running",
		weight: "fill" as const,
	},
	{
		color: "text-text-secondary",
		icon: PauseIcon,
		key: "paused",
		label: "Paused",
		weight: "fill" as const,
	},
	{
		color: "text-text-secondary",
		icon: SpinnerIcon,
		key: "waiting",
		label: "Waiting",
		weight: "regular" as const,
	},
	{
		color: "text-text-secondary",
		icon: SquareIcon,
		key: "terminated",
		label: "Terminated",
		weight: "fill" as const,
	},
] as const;

interface StatusSummaryProps {
	statusCounts: Record<string, number>;
}

const StatusSummary = memo<StatusSummaryProps>(function StatusSummary({
	statusCounts,
}): JSX.Element {
	return (
		<div className="flex divide-x divide-border overflow-hidden border-b border-border bg-bg">
			{STATUS_SUMMARY_CONFIG.map(
				({ key, label, icon: Icon, color, weight }) => (
					<div className="flex-1 px-6 py-4" key={key}>
						<div className="flex items-center gap-1.5 text-xs text-text-secondary">
							<Icon className={color} size={12} weight={weight} />
							{label}
						</div>

						<div className="mt-0.5 text-base text-text">
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

const ACTION_CONFIG_LIST = {
	pause: {
		icon: PauseIcon,
		style:
			"border-border bg-bg text-text-secondary dark:text-text hover:bg-border/60",
		weight: "fill",
	},
	resume: {
		icon: PlayIcon,
		style:
			"border-border bg-bg text-text-secondary dark:text-text hover:bg-border/60",
		weight: "fill",
	},
	restart: {
		icon: ArrowClockwiseIcon,
		style:
			"border-border bg-bg text-text-secondary dark:text-text hover:bg-border/60",
		weight: "regular",
	},
	terminate: {
		icon: StopIcon,
		style: "border-border bg-bg text-danger hover:bg-danger/10",
		weight: "fill",
	},
} satisfies Record<
	Action,
	{
		icon: typeof PauseIcon;
		style: string;
		weight: "fill" | "regular";
	}
>;

// ---------------------------------------------------------------------------
// Instance row with inline action buttons
// ---------------------------------------------------------------------------

interface InstanceRowProps {
	instance: WorkflowsInstance;
	onActionComplete: () => void;
	workflowName: string;
}

const InstanceRow = memo<InstanceRowProps>(function InstanceRow({
	instance,
	onActionComplete,
	workflowName,
}): JSX.Element {
	const navigate = useNavigate();

	const [actionInProgress, setActionInProgress] = useState<Action | null>(null);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false);
	const [eventPayload, setEventPayload] = useState<string>("");
	const [eventType, setEventType] = useState<string>("");
	const [sendEventOpen, setSendEventOpen] = useState<boolean>(false);
	const [sendingEvent, setSendingEvent] = useState<boolean>(false);

	const status = instance.status ?? "unknown";
	const actions = getAvailableActions(status);

	async function handleAction(
		e: React.MouseEvent,
		action: Action
	): Promise<void> {
		e.stopPropagation();

		setActionInProgress(action);

		try {
			await workflowsChangeInstanceStatus({
				body: {
					action,
				},
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

	function handleDeleteClick(e: React.MouseEvent): void {
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

	function handleSendEventClick(e: React.MouseEvent): void {
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
				body: payload,
				path: {
					workflow_name: workflowName,
					instance_id: instance.id ?? "",
					event_type: eventType.trim(),
				},
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
			params: {
				instanceId: instance.id ?? "",
				workflowName,
			},
			to: "/workflows/$workflowName/$instanceId",
		});
	}

	return (
		<>
			<div className="border-b border-border bg-bg p-1 last:border-b-0">
				<div
					className="grid h-10 cursor-pointer grid-cols-[100px_60px_1fr_auto] items-center gap-3 rounded-lg px-2 transition-colors hover:bg-border/60"
					onClick={handleRowClick}
				>
					<div>
						<WorkflowStatusBadge status={status} />
					</div>

					<span className="text-sm text-text-secondary">
						{timeAgo(instance.created_on) || "—"}
					</span>

					<span className="truncate font-mono text-xs text-text">
						{instance.id}
					</span>

					<div className="flex items-center gap-2">
						{actions.map((action) => {
							const config = ACTION_CONFIG_LIST[action];
							const Icon = config.icon;
							return (
								<Button
									className={config.style}
									disabled={actionInProgress !== null}
									key={action}
									icon={
										<Icon
											className={
												actionInProgress === action ? "animate-spin" : ""
											}
											size={14}
											weight={config.weight}
										/>
									}
									onClick={(e) => void handleAction(e, action)}
									size="sm"
									title={action.charAt(0).toUpperCase() + action.slice(1)}
								/>
							);
						})}

						{status !== "complete" &&
							status !== "errored" &&
							status !== "terminated" && (
								<Button
									disabled={actionInProgress !== null}
									icon={<PaperPlaneTiltIcon size={14} />}
									onClick={handleSendEventClick}
									size="sm"
									title="Send Event"
								/>
							)}

						<Button
							disabled={actionInProgress !== null}
							icon={TrashIcon}
							onClick={handleDeleteClick}
							size="sm"
							title="Delete"
						/>
					</div>
				</div>
			</div>

			{/* Delete confirmation dialog */}
			<Dialog.Root open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<Dialog size="lg">
					<div className="border-b border-border px-6 pt-6 pb-4">
						{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
						<Dialog.Title className="text-lg font-semibold text-text">
							Delete this instance?
						</Dialog.Title>
						<p className="mt-1 text-sm text-text-secondary">
							This will permanently delete the instance and its persistence
							data. This action cannot be undone.
						</p>
					</div>

					<div className="px-6 py-4">
						<div className="rounded-lg border border-border bg-bg-secondary px-4 py-3">
							<span className="text-xs text-text-secondary">Instance ID</span>
							<p className="mt-0.5 font-mono text-sm text-text">
								{instance.id}
							</p>
						</div>
					</div>

					<div className="flex justify-end gap-2 border-t border-border px-6 py-4">
						<Button
							onClick={() => setDeleteDialogOpen(false)}
							variant="secondary"
						>
							Cancel
						</Button>
						<Button
							onClick={() => void handleDeleteConfirm()}
							variant="destructive"
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
					<div className="border-b border-border px-6 py-4">
						{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
						<Dialog.Title className="text-lg font-semibold text-text">
							Send Event
						</Dialog.Title>
					</div>

					<div className="space-y-4 px-6 py-5">
						<div>
							<label className="mb-2 block text-sm font-medium text-text">
								Event Type
							</label>
							<input
								className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-text placeholder-text-secondary focus:border-primary focus:shadow-focus-primary focus:outline-none"
								onChange={(e) => setEventType(e.target.value)}
								placeholder="my-event"
								type="text"
								value={eventType}
							/>
						</div>
						<div>
							<label className="mb-2 block text-sm font-medium text-text">
								Payload{" "}
								<span className="font-normal text-text-secondary">
									(optional)
								</span>
							</label>
							<textarea
								className="w-full resize-y rounded-lg border border-border bg-bg px-3 py-2.5 font-mono text-sm text-text placeholder-text-secondary focus:border-primary focus:shadow-focus-primary focus:outline-none"
								onChange={(e) => setEventPayload(e.target.value)}
								placeholder='{"key": "value"}'
								rows={4}
								value={eventPayload}
							/>
						</div>
					</div>

					<div className="flex justify-end gap-2 border-t border-border px-6 py-4">
						<Button
							disabled={sendingEvent}
							onClick={() => setSendEventOpen(false)}
							variant="secondary"
						>
							Cancel
						</Button>
						<Button
							disabled={!eventType.trim() || sendingEvent}
							loading={sendingEvent}
							onClick={() => void handleSendEvent()}
							variant="primary"
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

function WorkflowInstancesView(): JSX.Element {
	const params = Route.useParams();
	const loaderData = Route.useLoaderData();

	const [deleteAllError, setDeleteAllError] = useState<string | null>(null);
	const [deleteAllOpen, setDeleteAllOpen] = useState<boolean>(false);
	const [deletingAll, setDeletingAll] = useState<boolean>(false);
	const [dialogOpen, setDialogOpen] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [fetching, setFetching] = useState<boolean>(false);
	const [initialLoad, setInitialLoad] = useState<boolean>(
		loaderData.instances.length === 0 &&
			(loaderData.resultInfo.total_count ?? 0) === 0
	);
	const [instances, setInstances] = useState<WorkflowsInstance[]>(
		loaderData.instances
	);
	const [page, setPage] = useState<number>(loaderData.resultInfo.page ?? 1);
	const [perPage, setPerPage] = useState<number>(
		loaderData.resultInfo.per_page ?? 25
	);
	// Status counts always reflect global (unfiltered) totals
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

				// Always fetch unfiltered counts alongside the (possibly filtered) list,
				// so the status summary always reflects global totals.
				const [response, countsResponse] = await Promise.all([
					workflowsListInstances({
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
					}),
					workflowsListInstances({
						path: { workflow_name: params.workflowName },
						query: { page: 1, per_page: 1 },
					}),
				]);

				setInstances(response.data?.result ?? []);
				setTotalCount(response.data?.result_info?.total_count ?? 0);
				setPage(response.data?.result_info?.page ?? p);

				// Always use the unfiltered response for status counts
				setStatusCounts(
					((
						countsResponse.data?.result_info as
							| Record<string, unknown>
							| undefined
					)?.status_counts as Record<string, number>) ?? {}
				);
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

	const handleRefresh = useCallback(() => {
		void fetchInstances(undefined, undefined, true);
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

	async function handleDeleteAll(): Promise<void> {
		setDeletingAll(true);
		setDeleteAllError(null);

		try {
			await workflowsDeleteWorkflow({
				path: {
					workflow_name: params.workflowName,
				},
			});
			setDeleteAllOpen(false);
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
		<PageLayout
			noPadding
			header={
				<Breadcrumbs
					icon={WorkflowsIcon}
					items={[
						<span className="flex items-center gap-1.5" key="workflow-name">
							{params.workflowName}
						</span>,
					]}
					title="Workflows"
				>
					{/* Trigger button */}
					<Button
						icon={<PlayIcon weight="fill" />}
						onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
							(e.target as HTMLButtonElement).blur();
							setDialogOpen(true);
						}}
						variant="primary"
					>
						Trigger
					</Button>

					{/* Status filter */}
					<Select.Root
						onValueChange={(value) => {
							if (value !== null) {
								handleStatusFilterChange(value);
							}
						}}
						value={statusFilter}
					>
						<Select.Trigger>
							<Button
								className="inline-flex min-w-32 items-center justify-between"
								type="button"
							>
								<span>
									{statusFilter === "all"
										? "All"
										: (STATUS_SUMMARY_CONFIG.find((s) => s.key === statusFilter)
												?.label ?? statusFilter)}
								</span>

								<Select.Icon>
									<CaretDownIcon
										className="shrink-0 text-text-secondary"
										size={14}
									/>
								</Select.Icon>
							</Button>
						</Select.Trigger>

						<Select.Portal>
							<Select.Positioner
								align="start"
								alignItemWithTrigger={false}
								className="z-100"
								side="bottom"
								sideOffset={4}
							>
								<Select.Popup className="min-w-32 overflow-hidden rounded-lg border border-border bg-bg shadow-[0_4px_12px_rgba(0,0,0,0.15)] transition-[opacity,transform] duration-150 data-ending-style:-translate-y-1 data-ending-style:opacity-0 data-starting-style:-translate-y-1 data-starting-style:opacity-0">
									<Select.List className="p-1">
										<Select.Item
											className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text transition-colors outline-none select-none data-highlighted:bg-border/60"
											value="all"
										>
											<Select.Icon>
												<ListIcon />
											</Select.Icon>
											<Select.ItemText>All</Select.ItemText>
										</Select.Item>

										{STATUS_SUMMARY_CONFIG.map(({ key, label, icon: Icon }) => (
											<Select.Item
												className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text transition-colors outline-none select-none data-highlighted:bg-border/60"
												key={key}
												value={key}
											>
												<Select.Icon>
													<Icon />
												</Select.Icon>
												<Select.ItemText>{label}</Select.ItemText>
											</Select.Item>
										))}
									</Select.List>
								</Select.Popup>
							</Select.Positioner>
						</Select.Portal>
					</Select.Root>

					{/* Refresh button */}
					<Button
						aria-label="Refresh"
						icon={ArrowsCounterClockwiseIcon}
						onClick={() => void fetchInstances()}
					/>

					{/* Three-dots menu */}
					<DropdownMenu>
						<DropdownMenu.Trigger
							render={<Button aria-label="More options" icon={DotsThreeIcon} />}
						/>
						<DropdownMenu.Content
							align="end"
							className="w-48 bg-bg"
							side="bottom"
						>
							<DropdownMenu.Item
								className="cursor-pointer rounded-md text-danger transition-colors hover:bg-danger/10"
								onClick={() => setDeleteAllOpen(true)}
								icon={TrashIcon}
							>
								Delete all instances
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu>
				</Breadcrumbs>
			}
		>
			<div className="">
				<StatusSummary statusCounts={statusCounts} />

				<div className="p-4">
					{error && (
						<div className="mb-4 rounded-md border border-danger/20 bg-danger/8 p-4 text-danger">
							{error}
						</div>
					)}

					{initialLoad ? (
						<div className="p-12 text-center text-text-secondary">
							Loading...
						</div>
					) : instances.length === 0 && !fetching ? (
						<div className="rounded-lg border border-border bg-bg px-5 py-8 text-center text-sm text-text-secondary">
							{statusFilter !== "all" ? (
								<>No instances found in state &lsquo;{statusFilter}&rsquo;</>
							) : (
								"No instances found"
							)}
						</div>
					) : instances.length === 0 ? (
						<div className="rounded-lg border border-border bg-bg px-5 py-8 text-center text-sm text-text-secondary">
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
							<div className="overflow-hidden rounded-lg border border-border">
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
								<div className="flex items-center justify-between pt-4">
									<DropdownMenu>
										<DropdownMenu.Trigger
											render={
												<Button>
													{perPage}
													<CaretUpDownIcon
														className="text-text-secondary"
														size={12}
													/>
												</Button>
											}
										/>
										<DropdownMenu.Content
											align="start"
											className="bg-bg"
											side="top"
										>
											{[10, 25, 50, 100].map((size) => (
												<DropdownMenu.Item
													className="cursor-pointer rounded-md transition-colors hover:bg-border/60"
													key={size}
													onClick={() => handlePerPageChange(size)}
												>
													{size}
													{size === perPage && (
														<span className="ml-2 text-text-secondary">✓</span>
													)}
												</DropdownMenu.Item>
											))}
										</DropdownMenu.Content>
									</DropdownMenu>

									<div className="pagination-styled">
										<Pagination
											page={page}
											perPage={perPage}
											setPage={handlePageChange}
											totalCount={totalCount}
										/>
									</div>
								</div>
							)}
						</div>
					)}
				</div>
			</div>

			{/* Delete all instances dialog */}
			<Dialog.Root
				open={deleteAllOpen}
				onOpenChange={(open) => {
					setDeleteAllOpen(open);
					if (!open) {
						setDeleteAllError(null);
					}
				}}
			>
				<Dialog size="lg" className="w-lg">
					<div className="border-b border-border px-6 py-4">
						{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
						<Dialog.Title className="text-lg font-semibold text-text">
							Delete all instances
						</Dialog.Title>
					</div>

					<div className="px-6 py-5">
						{deleteAllError && (
							<div className="mb-4 rounded-lg border border-danger/20 bg-danger/8 p-3 text-sm text-danger">
								{deleteAllError}
							</div>
						)}

						<p className="text-sm text-text-secondary">
							This will permanently delete all instances of{" "}
							<span className="font-semibold text-text">
								{params.workflowName}
							</span>
							. All instance data and persistence files will be removed. This
							action cannot be undone.
						</p>
					</div>

					<div className="flex justify-end gap-2 border-t border-border px-6 py-4">
						<Button
							disabled={deletingAll}
							onClick={() => setDeleteAllOpen(false)}
							variant="secondary"
						>
							Cancel
						</Button>
						<Button
							disabled={deletingAll}
							loading={deletingAll}
							onClick={() => void handleDeleteAll()}
							variant="destructive"
						>
							Delete all
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
		</PageLayout>
	);
}
