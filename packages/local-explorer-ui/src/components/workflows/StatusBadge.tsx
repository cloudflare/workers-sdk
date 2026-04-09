import { cn } from "@cloudflare/kumo";
import type { WorkflowsInstance } from "../../api";

type WorkflowStatus = NonNullable<WorkflowsInstance["status"]>;

/*
 * Color scheme matching the Cloudflare dashboard.
 * Light: soft pastel bg + dark text. Dark: vibrant saturated bg + dark text.
 * Tailwind arbitrary values with dark: variant for proper theme switching.
 */
const statusStyles: Record<WorkflowStatus, string> = {
	complete: "bg-[#059669] text-[#fffdfb] dark:bg-[#008236] dark:text-[#ffeee6]",
	errored: "bg-[#fb2b36] text-[#fffdfb] dark:bg-[#c10007] dark:text-[#ffeee6]",
	terminated:
		"bg-[#fb2b36] text-[#fffdfb] dark:bg-[#c10007] dark:text-[#ffeee6]",
	waiting: "bg-[#cf7ee9] text-[#fffdfb] dark:bg-[#831ca6] dark:text-[#ffeee6]",
	paused: "bg-[#cf7ee9] text-[#fffdfb] dark:bg-[#831ca6] dark:text-[#ffeee6]",
	running: "bg-[#2b7bfb] text-[#fffdfb] dark:bg-[#004ac2] dark:text-[#ffeee6]",
	waitingForPause:
		"bg-[#2b7bfb] text-[#fffdfb] dark:bg-[#004ac2] dark:text-[#ffeee6]",
	queued: "bg-[#d9d9d9] text-[#fffdfb] dark:bg-[#b6b6b6] dark:text-[#ffeee6]",
	unknown: "bg-[#d9d9d9] text-[#fffdfb] dark:bg-[#b6b6b6] dark:text-[#ffeee6]",
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
