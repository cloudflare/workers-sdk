import { cn } from "@cloudflare/kumo";
import type { WorkflowsInstance } from "../../api";

type WorkflowStatus = NonNullable<WorkflowsInstance["status"]>;

const statusStyles: Record<WorkflowStatus, string> = {
	complete: "bg-emerald-600 text-white dark:bg-emerald-500",
	errored: "bg-red-600 text-white dark:bg-red-500",
	terminated: "bg-red-600 text-white dark:bg-red-500",
	waiting: "bg-violet-600 text-white dark:bg-violet-500",
	paused: "bg-violet-600 text-white dark:bg-violet-500",
	running: "bg-kumo-brand text-white",
	waitingForPause: "bg-kumo-brand text-white",
	queued: "bg-neutral-400 text-white dark:bg-neutral-500",
	unknown: "bg-neutral-400 text-white dark:bg-neutral-500",
};

const statusLabels: Record<WorkflowStatus, string> = {
	queued: "Queued",
	running: "Running",
	paused: "Paused",
	errored: "Errored",
	terminated: "Terminated",
	complete: "Complete",
	waitingForPause: "Waiting for Pause",
	waiting: "Waiting",
	unknown: "Unknown",
};

interface WorkflowStatusBadgeProps {
	status: WorkflowStatus | string | undefined;
}

export function WorkflowStatusBadge({
	status,
}: WorkflowStatusBadgeProps): JSX.Element {
	const resolvedStatus = (
		status && status in statusStyles ? status : "unknown"
	) as WorkflowStatus;

	return (
		<span
			className={cn(
				"inline-flex items-center rounded-full px-2 py-0.5 text-xs",
				statusStyles[resolvedStatus]
			)}
		>
			{statusLabels[resolvedStatus]}
		</span>
	);
}
