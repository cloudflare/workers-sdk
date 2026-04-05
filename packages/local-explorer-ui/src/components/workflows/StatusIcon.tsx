import { Loader, Tooltip } from "@cloudflare/kumo";
import {
	CheckCircleIcon,
	CircleNotchIcon,
	PauseIcon,
	SpinnerIcon,
	StopIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";

export function StatusIcon({ status }: { status: string }): JSX.Element {
	switch (status) {
		case "complete":
			return (
				<Tooltip content="Complete">
					<CheckCircleIcon size={20} weight="fill" className="text-kumo-link" />
				</Tooltip>
			);
		case "errored":
			return (
				<Tooltip content="Errored">
					<WarningCircleIcon
						size={20}
						weight="fill"
						className="text-kumo-danger"
					/>
				</Tooltip>
			);
		case "terminated":
			return (
				<Tooltip content="Terminated">
					<StopIcon size={20} weight="fill" className="text-kumo-subtle" />
				</Tooltip>
			);
		case "paused":
		case "waitingForPause":
			return (
				<Tooltip content="Paused">
					<PauseIcon size={20} weight="fill" className="text-kumo-subtle" />
				</Tooltip>
			);
		case "running":
			return (
				<Tooltip content="Running">
					<Loader size={20} />
				</Tooltip>
			);
		case "waiting":
			return (
				<Tooltip content="Waiting">
					<SpinnerIcon size={20} weight="bold" className="text-kumo-subtle" />
				</Tooltip>
			);
		default:
			return (
				<Tooltip content={status}>
					<CircleNotchIcon
						size={20}
						weight="bold"
						className="text-kumo-subtle"
					/>
				</Tooltip>
			);
	}
}
