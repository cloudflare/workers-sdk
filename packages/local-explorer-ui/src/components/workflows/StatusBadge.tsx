import { cn } from "@cloudflare/kumo";
import type { WorkflowsInstance } from "../../api";

type WorkflowStatus = NonNullable<WorkflowsInstance["status"]>;

const statusStyles: Record<WorkflowStatus, string> = {
	complete: "bg-kumo-success text-white",
	errored: "bg-kumo-danger text-white",
	terminated: "bg-kumo-danger text-white",
	waiting: "bg-kumo-brand text-white",
	paused: "bg-kumo-brand text-white",
	running: "bg-kumo-brand text-white",
	waitingForPause: "bg-kumo-brand text-white",
	queued: "bg-kumo-subtle text-white",
	unknown: "bg-kumo-subtle text-white",
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
