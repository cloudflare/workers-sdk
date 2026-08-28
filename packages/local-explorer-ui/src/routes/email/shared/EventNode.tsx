import { Button, Flow, cn } from "@cloudflare/kumo";
import {
	ArrowBendUpLeftIcon,
	ArrowUpRightIcon,
	CaretDownIcon,
	EnvelopeSimpleIcon,
	ProhibitIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { formatEmailAddress, formatMessageId } from "../../../utils/format";
import { formatEmailTimestamp } from "./format";
import type { InfoEvent } from "./types";
import type { JSX } from "react";

// ---------------------------------------------------------------------------
// Event visual mapping
// ---------------------------------------------------------------------------

const EVENT_CONFIG: Record<
	InfoEvent["type"],
	{
		icon: React.ComponentType<{ className?: string; size?: number }>;
		label: string;
		color: string;
	}
> = {
	received: {
		icon: EnvelopeSimpleIcon,
		label: "Received",
		color: "text-kumo-success",
	},
	forward: {
		icon: ArrowUpRightIcon,
		label: "Forwarded",
		color: "text-kumo-link",
	},
	reply: {
		icon: ArrowBendUpLeftIcon,
		label: "Replied",
		color: "text-kumo-link",
	},
	reject: {
		icon: ProhibitIcon,
		label: "Rejected",
		color: "text-kumo-danger",
	},
	unhandled: {
		icon: WarningIcon,
		label: "Unhandled (Worker has no email() handler)",
		color: "text-kumo-danger",
	},
};

function EventIcon({ type }: { type: InfoEvent["type"] }): JSX.Element {
	const config = EVENT_CONFIG[type];
	const Icon = config.icon;
	return <Icon size={16} className={config.color} />;
}

const Field = ({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) => (
	<div className="flex min-w-0 flex-col gap-1">
		<span className="text-sm font-medium text-kumo-subtle">{label}</span>
		<span className="text-sm break-words text-kumo-default">{children}</span>
	</div>
);

// ---------------------------------------------------------------------------
// EventNode
// ---------------------------------------------------------------------------

interface EventNodeProps {
	event: InfoEvent;
}

/**
 * One event in a message's lifecycle, rendered as a Kumo `Flow.Node`
 * with an expandable body.
 *
 * The header row (icon + label + timestamp + chevron) is wrapped
 * in `<Flow.Anchor>` so the connector lines always attach to a
 * height-stable element — when the body expands, the anchor doesn't
 * move, so connectors stay aligned.
 */
export function EventNode({ event }: EventNodeProps): JSX.Element {
	const [open, setOpen] = useState(false);
	const config = EVENT_CONFIG[event.type];

	const { forward, reply, rejectReason } = event;
	// The forwarded message's added headers, as [key, value] pairs.
	const forwardHeaders = forward?.headers ?? [];
	const hasForwardFields =
		forward !== undefined &&
		(forward.recipient.length > 0 || forwardHeaders.length > 0);
	const hasReplyFields = reply !== undefined;
	const hasRejectFields = rejectReason !== undefined && rejectReason.length > 0;
	const isExpandable = hasForwardFields || hasReplyFields || hasRejectFields;

	return (
		<Flow.Node
			render={
				<li
					data-testid="log-detail-event-node"
					data-event-type={event.type}
					data-open={open || undefined}
					className="max-w-[420px] min-w-[280px] list-none rounded-lg bg-kumo-base shadow-sm ring ring-kumo-hairline"
				>
					<Flow.Anchor
						render={
							<div className="flex min-h-12 items-start gap-3 px-4 py-2">
								<span className="flex h-lh shrink-0 items-center">
									<EventIcon type={event.type} />
								</span>
								<div className="flex min-w-0 flex-1 flex-col">
									<span className="truncate text-sm font-medium text-kumo-default">
										{config.label}
									</span>
									<span className="text-sm text-kumo-subtle">
										{formatEmailTimestamp(event.timestamp)}
									</span>
								</div>
								{isExpandable && (
									<Button
										variant="ghost"
										size="sm"
										onClick={() => setOpen((prev) => !prev)}
										aria-expanded={open}
										aria-label={
											open ? "Collapse event details" : "Expand event details"
										}
									>
										<CaretDownIcon
											size={16}
											className={cn(
												"transition-transform",
												open && "rotate-180"
											)}
										/>
									</Button>
								)}
							</div>
						}
					/>
					{open && (
						<div data-testid="log-detail-event-body">
							{(hasForwardFields || hasRejectFields) && (
								<div className="grid grid-cols-2 gap-4 border-t border-kumo-line px-4 py-3">
									{forward && (
										<Field label="Recipient">{forward.recipient}</Field>
									)}
									{forwardHeaders.map(([key, value], index) => (
										<Field key={`${key}-${index}`} label={key ?? ""}>
											{value ?? ""}
										</Field>
									))}
									{rejectReason && <Field label="Reason">{rejectReason}</Field>}
								</div>
							)}
							{reply && (
								<div className="grid grid-cols-2 gap-4 border-t border-kumo-line px-4 py-3">
									<Field label="From">{formatEmailAddress(reply.sender)}</Field>
									<Field label="Message-ID">
										{formatMessageId(reply.messageId)}
									</Field>
								</div>
							)}
							{reply?.raw && (
								<pre className="max-h-[40vh] overflow-auto border-t border-kumo-line bg-kumo-elevated px-4 py-3 font-mono text-sm whitespace-pre-wrap text-kumo-default">
									{reply.raw}
								</pre>
							)}
						</div>
					)}
				</li>
			}
		/>
	);
}
