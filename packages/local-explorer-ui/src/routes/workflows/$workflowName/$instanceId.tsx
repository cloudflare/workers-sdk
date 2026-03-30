import {
	Button,
	Dialog,
	DropdownMenu,
	LayerCard,
	Text,
	Tooltip,
} from "@cloudflare/kumo";
import {
	ArrowClockwiseIcon,
	BellIcon,
	CaretDownIcon,
	CodeIcon,
	ListBulletsIcon,
	MagnifyingGlassIcon,
	MoonIcon,
	PaperPlaneTiltIcon,
	PauseIcon,
	PlayIcon,
	StopIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
	workflowsChangeInstanceStatus,
	workflowsDeleteInstance,
	workflowsGetInstanceDetails,
	workflowsSendInstanceEvent,
} from "../../../api";
import WorkflowsIcon from "../../../assets/icons/workflows.svg?react";
import { Breadcrumbs } from "../../../components/Breadcrumbs";
import { CopyButton } from "../../../components/workflows/CopyButton";
import {
	formatDuration,
	formatJson,
} from "../../../components/workflows/helpers";
import { ScrollableCodeBlock } from "../../../components/workflows/ScrollableCodeBlock";
import { WorkflowStatusBadge } from "../../../components/workflows/StatusBadge";
import { StatusIcon } from "../../../components/workflows/StatusIcon";
import { StepRow } from "../../../components/workflows/StepRow";
import {
	getAvailableActions,
	isTerminalStatus,
} from "../../../components/workflows/types";
import type {
	Action,
	InstanceDetails,
} from "../../../components/workflows/types";

export const Route = createFileRoute("/workflows/$workflowName/$instanceId")({
	component: InstanceDetailView,
	loader: async ({ params }) => {
		const response = await workflowsGetInstanceDetails({
			path: {
				instance_id: params.instanceId,
				workflow_name: params.workflowName,
			},
		});

		const details = response.data?.result as InstanceDetails | undefined;
		if (!details) {
			throw new Error(`Workflow instance "${params.instanceId}" not found.`);
		}

		return { details };
	},
});

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

const ACTION_ICONS: Record<Action, typeof PauseIcon> = {
	pause: PauseIcon,
	resume: PlayIcon,
	terminate: StopIcon,
	restart: ArrowClockwiseIcon,
};

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Memoized sub-components
// ---------------------------------------------------------------------------

const StatsStrip = memo(function StatsStrip({
	status,
	stepCount,
	start,
	end,
}: {
	status: string;
	stepCount: number;
	start?: string;
	end?: string;
}) {
	return (
		<div className="grid grid-cols-3 overflow-hidden rounded-lg border border-border bg-bg">
			<div className="flex items-center justify-between px-5 py-2">
				<span className="text-base text-text-secondary">Status</span>
				<WorkflowStatusBadge status={status} />
			</div>
			<div className="flex items-center justify-between border-l border-border px-5 py-2">
				<span className="text-base text-text-secondary">Steps Completed</span>
				<span className="text-base font-medium text-text">{stepCount}</span>
			</div>
			<div className="flex items-center justify-between border-l border-border px-5 py-2">
				<span className="text-base text-text-secondary">Duration</span>
				<span className="text-base font-medium text-text">
					{formatDuration(start, end)}
				</span>
			</div>
		</div>
	);
});

const ParamsOutput = memo(function ParamsOutput({
	params,
	output,
}: {
	params: unknown;
	output: unknown;
}) {
	return (
		<div className="overflow-hidden rounded-xl border border-border bg-bg-tertiary">
			<div className="grid grid-cols-2 divide-x divide-border">
				{/* Input params header */}
				<div className="px-4 py-2.5">
					<span className="text-sm font-medium text-text">Input params</span>
				</div>
				{/* Output header */}
				<div className="px-4 py-2.5">
					<span className="text-sm font-medium text-text">Output</span>
				</div>
			</div>
			{/* Content with rounded top corners to create the LayerCard effect */}
			<div className="rounded-t-lg border-t border-border bg-bg">
				<div className="grid grid-cols-2 divide-x divide-border">
					<div className="relative">
						<ScrollableCodeBlock content={formatJson(params)} />
						<div className="absolute top-1.5 right-1.5">
							<CopyButton text={formatJson(params)} label="Copy params" />
						</div>
					</div>
					<div className="relative">
						<ScrollableCodeBlock content={formatJson(output)} />
						<div className="absolute top-1.5 right-1.5">
							<CopyButton text={formatJson(output)} label="Copy output" />
						</div>
					</div>
				</div>
			</div>
		</div>
	);
});

const ErrorCard = memo(function ErrorCard({
	error,
}: {
	error: { name?: string; message?: string };
}) {
	return (
		<LayerCard>
			<LayerCard.Secondary className="bg-bg-tertiary !px-4 !py-2.5">
				<Text bold>{error.name ?? "Error"}</Text>
			</LayerCard.Secondary>
			<LayerCard.Primary className="relative !p-0">
				<pre className="max-h-64 overflow-y-auto px-4 py-3 font-mono text-sm break-words whitespace-pre-wrap text-text-secondary">
					{error.message ?? "Unknown error"}
				</pre>
				<div className="absolute top-1.5 right-1.5">
					<CopyButton
						text={`${error.name ?? "Error"}: ${error.message ?? ""}`}
						label="Copy error"
					/>
				</div>
			</LayerCard.Primary>
		</LayerCard>
	);
});

const STEP_TYPE_FILTERS = [
	{ value: "all", label: "All", icon: ListBulletsIcon },
	{ value: "step", label: "Do", icon: CodeIcon },
	{ value: "sleep", label: "Sleep", icon: MoonIcon },
	{ value: "waitForEvent", label: "Wait for Event", icon: BellIcon },
] as const;

const StepHistory = memo(function StepHistory({
	steps,
}: {
	steps: InstanceDetails["steps"];
}) {
	const stepList = steps ?? [];
	const [search, setSearch] = useState("");
	const [typeFilter, setTypeFilter] = useState("all");

	const filtered = [...stepList].reverse().filter((step) => {
		if (typeFilter !== "all" && step.type !== typeFilter) {
			return false;
		}
		if (search.trim()) {
			const q = search.trim().toLowerCase();
			return (step.name ?? "").toLowerCase().includes(q);
		}
		return true;
	});

	const activeFilter =
		STEP_TYPE_FILTERS.find((f) => f.value === typeFilter) ??
		STEP_TYPE_FILTERS[0];
	const ActiveIcon = activeFilter.icon;

	return (
		<div>
			<div className="mb-3">
				<h4 className="text-lg font-semibold text-text">Step History</h4>
			</div>

			{/* Search + Filter controls */}
			{stepList.length > 0 && (
				<div className="mb-3 flex items-center gap-2">
					<div className="relative flex-1">
						<MagnifyingGlassIcon
							size={14}
							className="absolute top-1/2 left-3 -translate-y-1/2 text-text-secondary"
						/>
						<input
							className="h-9 w-full rounded-lg border border-border bg-bg pr-3 pl-9 text-sm text-text placeholder-text-secondary focus:border-primary focus:shadow-focus-primary focus:outline-none"
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search steps..."
							type="text"
							value={search}
						/>
					</div>
					<DropdownMenu>
						<DropdownMenu.Trigger
							render={
								<button className="inline-flex h-9 w-44 cursor-pointer items-center justify-between rounded-lg border border-border bg-bg px-3 text-sm text-text transition-colors hover:bg-border/60">
									<span className="flex items-center gap-2">
										<ActiveIcon size={14} className="text-text-secondary" />
										{activeFilter.label}
									</span>
									<CaretDownIcon size={14} className="text-text-secondary" />
								</button>
							}
						/>
						<DropdownMenu.Content
							align="end"
							className="w-44 bg-bg"
							side="bottom"
						>
							{STEP_TYPE_FILTERS.map(({ value, label, icon: Icon }) => (
								<DropdownMenu.Item
									className="flex cursor-pointer items-center gap-2 rounded-md transition-colors hover:bg-border/60"
									key={value}
									onClick={() => setTypeFilter(value)}
								>
									<Icon size={14} className="text-text-secondary" />
									{label}
								</DropdownMenu.Item>
							))}
						</DropdownMenu.Content>
					</DropdownMenu>
				</div>
			)}

			<div className="overflow-hidden rounded-lg border border-border bg-bg">
				{stepList.length === 0 ? (
					<div className="px-4 py-8 text-center text-sm text-text-secondary">
						No steps recorded yet
					</div>
				) : filtered.length === 0 ? (
					<div className="px-4 py-8 text-center text-sm text-text-secondary">
						No steps match your search
					</div>
				) : (
					filtered.map((step, i) => (
						<StepRow key={`${step.name}-${i}`} step={step} />
					))
				)}
			</div>
		</div>
	);
});

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

function InstanceDetailView() {
	const params = Route.useParams();
	const loaderData = Route.useLoaderData();

	const navigate = useNavigate();
	const [details, setDetails] = useState<InstanceDetails>(loaderData.details);
	const [actionInProgress, setActionInProgress] = useState<Action | null>(null);
	const [copied, setCopied] = useState(false);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [sendEventOpen, setSendEventOpen] = useState(false);
	const [eventType, setEventType] = useState("");
	const [eventPayload, setEventPayload] = useState("");
	const [sendingEvent, setSendingEvent] = useState(false);

	// Sync from loader on navigation
	useEffect(() => {
		setDetails(loaderData.details);
	}, [loaderData]);

	const status = details.status ?? "unknown";
	const instanceId = params.instanceId;
	const steps = details.steps ?? [];
	const availableActions = getAvailableActions(status);

	// Poll every 1 second (quiet — no flash)
	const fetchDetails = useCallback(async () => {
		try {
			const response = await workflowsGetInstanceDetails({
				path: {
					instance_id: instanceId,
					workflow_name: params.workflowName,
				},
			});
			const result = response.data?.result as InstanceDetails | undefined;
			if (result) {
				setDetails(result);
			}
		} catch {
			// Silent fail on poll
		}
	}, [instanceId, params.workflowName]);

	// Poll every 1s, but stop on terminal states
	const isTerminal = isTerminalStatus(status);
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
	useEffect(() => {
		if (isTerminal) {
			return;
		}
		pollRef.current = setInterval(() => {
			void fetchDetails();
		}, 1_000);
		return () => {
			if (pollRef.current) {
				clearInterval(pollRef.current);
			}
		};
	}, [fetchDetails, isTerminal]);

	const handleAction = useCallback(
		async (action: Action) => {
			setActionInProgress(action);
			setError(null);
			try {
				await workflowsChangeInstanceStatus({
					path: {
						workflow_name: params.workflowName,
						instance_id: instanceId,
					},
					body: { action },
				});
				await fetchDetails();
			} catch (err) {
				setError(err instanceof Error ? err.message : `Failed to ${action}`);
			} finally {
				setActionInProgress(null);
			}
		},
		[params.workflowName, instanceId, fetchDetails]
	);

	return (
		<div className="flex h-full flex-col">
			<Breadcrumbs
				icon={WorkflowsIcon}
				items={[
					<Link
						className="flex items-center gap-1.5"
						key="wf"
						params={{ workflowName: params.workflowName }}
						to="/workflows/$workflowName"
					>
						{params.workflowName}
					</Link>,
					<span
						className="flex items-center gap-1.5 font-mono text-xs"
						key="id"
					>
						{instanceId}
					</span>,
				]}
				title="Workflows"
			/>

			<div className="flex-1 overflow-auto">
				{/* Header */}
				<div className="px-32 pt-6">
					<div>
						<header className="flex items-center justify-between pb-6">
							<div className="flex items-center gap-3">
								<h1 className="text-2xl font-semibold text-text">
									{params.workflowName}
								</h1>
								<Tooltip content={copied ? "Copied!" : "Copy instance ID"}>
									<button
										className={`cursor-pointer font-mono text-2xl transition-colors ${copied ? "text-text" : "text-text-secondary hover:text-text"}`}
										onClick={() => {
											void navigator.clipboard.writeText(instanceId);
											setCopied(true);
											setTimeout(() => setCopied(false), 1000);
										}}
									>
										#{instanceId}
									</button>
								</Tooltip>
								<StatusIcon status={status} />
							</div>

							<div className="flex shrink-0 items-center gap-2">
								{availableActions.map((action) => {
									const Icon = ACTION_ICONS[action];
									const isTerminate = action === "terminate";
									return (
										<button
											key={action}
											className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
												isTerminate
													? "border-border bg-bg text-danger hover:bg-danger/10"
													: "border-border bg-bg text-text hover:bg-border/60"
											}`}
											disabled={actionInProgress !== null}
											onClick={() => void handleAction(action)}
										>
											<Icon
												size={14}
												weight={action === "restart" ? "regular" : "fill"}
												className={
													actionInProgress === action ? "animate-spin" : ""
												}
											/>
											{action.charAt(0).toUpperCase() + action.slice(1)}
										</button>
									);
								})}
								{status !== "complete" &&
									status !== "errored" &&
									status !== "terminated" && (
										<button
											className="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg border border-border bg-bg text-text-secondary transition-colors hover:bg-border/60 disabled:cursor-not-allowed disabled:opacity-40 dark:text-text"
											disabled={actionInProgress !== null}
											onClick={() => setSendEventOpen(true)}
											title="Send Event"
										>
											<PaperPlaneTiltIcon size={14} />
										</button>
									)}
								<button
									className="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg border border-border bg-bg text-danger transition-colors hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40"
									disabled={actionInProgress !== null}
									onClick={() => setDeleteDialogOpen(true)}
									title="Delete"
								>
									<TrashIcon size={14} />
								</button>
							</div>
						</header>
					</div>
				</div>
				{/* Stats strip overlapping the divider line */}
				<div className="relative">
					<hr className="absolute top-1/2 w-full border-border" />
					<div className="relative px-32">
						<StatsStrip
							status={status}
							stepCount={steps.length}
							start={details.start}
							end={details.end}
						/>
					</div>
				</div>

				{/* Delete confirmation dialog */}
				<Dialog.Root open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
					<Dialog size="lg" className="w-[32rem]">
						<div className="border-b border-border px-6 py-4">
							{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
							<Dialog.Title className="text-lg font-semibold text-text">
								Delete this instance?
							</Dialog.Title>
						</div>

						<div className="px-6 py-5">
							<p className="text-sm text-text-secondary">
								This will permanently delete the instance and its persistence
								data. This action cannot be undone.
							</p>
							<div className="mt-3 rounded-lg border border-border bg-bg-secondary px-4 py-3">
								<span className="text-xs text-text-secondary">Instance ID</span>
								<p className="mt-0.5 font-mono text-sm text-text">
									{instanceId}
								</p>
							</div>
						</div>

						<div className="flex justify-end gap-2 border-t border-border px-6 py-4">
							<Button
								variant="secondary"
								onClick={() => setDeleteDialogOpen(false)}
								disabled={deleting}
							>
								Cancel
							</Button>
							<Button
								variant="destructive"
								disabled={deleting}
								loading={deleting}
								onClick={() => {
									setDeleting(true);
									void workflowsDeleteInstance({
										path: {
											workflow_name: params.workflowName,
											instance_id: instanceId,
										},
									})
										.then(() => {
											setDeleteDialogOpen(false);
											void navigate({
												to: "/workflows/$workflowName",
												params: { workflowName: params.workflowName },
											});
										})
										.finally(() => setDeleting(false));
								}}
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
					<Dialog size="lg" className="w-[32rem]">
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
								onClick={() => {
									let payload: unknown;
									if (eventPayload.trim()) {
										try {
											payload = JSON.parse(eventPayload);
										} catch {
											// Invalid JSON — keep dialog open
											return;
										}
									}
									setSendingEvent(true);
									void workflowsSendInstanceEvent({
										path: {
											workflow_name: params.workflowName,
											instance_id: instanceId,
											event_type: eventType.trim(),
										},
										body: payload,
									})
										.then(() => {
											setSendEventOpen(false);
											setEventType("");
											setEventPayload("");
											void fetchDetails();
										})
										.finally(() => setSendingEvent(false));
								}}
							>
								Send
							</Button>
						</div>
					</Dialog>
				</Dialog.Root>

				{/* Content */}
				<div className="space-y-8 px-32 py-6">
					{error && (
						<div className="rounded-lg border border-danger/20 bg-danger/8 p-4 text-sm text-danger">
							{error}
						</div>
					)}

					<ParamsOutput params={details.params} output={details.output} />

					{details.error && <ErrorCard error={details.error} />}

					<StepHistory steps={details.steps} />
				</div>
			</div>
		</div>
	);
}
