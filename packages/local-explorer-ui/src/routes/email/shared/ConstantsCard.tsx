import { Badge, ClipboardText, LayerCard } from "@cloudflare/kumo";
import { PaperclipIcon } from "@phosphor-icons/react";
import {
	formatEmailAddress,
	formatMessageId,
	formatSize,
} from "../../../utils/format";
import { formatEmailTimestamp } from "./format";
import type { InfoMessage } from "./types";

interface ConstantsCardProps {
	message: InfoMessage;
}

const Row = ({
	label,
	children,
	className,
}: {
	label: string;
	children: React.ReactNode;
	className?: string;
}) => (
	<div className={`flex min-w-0 flex-col gap-1 ${className ?? ""}`}>
		<span className="text-sm font-medium text-kumo-subtle">{label}</span>
		<div className="text-sm break-words text-kumo-default">{children}</div>
	</div>
);

/**
 * Invariants for the email detail page.
 *
 * Subject and Message ID span the full grid width because they're
 * typically long strings. From and To sit side-by-side.
 */
export function ConstantsCard({ message }: ConstantsCardProps) {
	return (
		<LayerCard>
			<LayerCard.Secondary>Message</LayerCard.Secondary>
			<LayerCard.Primary>
				<div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
					<Row label="Subject" className="sm:col-span-2">
						{message.subject || "—"}
					</Row>
					{message.messageId ? (
						<Row label="Message ID" className="sm:col-span-2">
							<ClipboardText text={formatMessageId(message.messageId)} />
						</Row>
					) : null}
					<Row label="From">
						<Badge variant="outline">
							{formatEmailAddress(message.from) || "—"}
						</Badge>
					</Row>
					<Row label="To">
						<Badge variant="outline">{message.to || "—"}</Badge>
					</Row>
					<Row label="Received">{formatEmailTimestamp(message.receivedAt)}</Row>
					<Row label="Size">{formatSize(message.rawSize)}</Row>
					{message.attachments.length > 0 ? (
						<Row label="Attachments" className="sm:col-span-2">
							<div className="flex flex-col gap-1.5">
								{message.attachments.map((attachment, index) => (
									<div
										className="flex min-w-0 items-center gap-2"
										key={`${attachment.filename}-${index}`}
									>
										<PaperclipIcon
											className="shrink-0 text-kumo-subtle"
											size={14}
										/>
										<span className="truncate text-sm text-kumo-default">
											{attachment.filename}
										</span>
										<span className="shrink-0 text-sm text-kumo-subtle">
											{attachment.contentType}
										</span>
										<span className="ml-auto shrink-0 text-sm text-kumo-subtle">
											{formatSize(attachment.size)}
										</span>
									</div>
								))}
							</div>
						</Row>
					) : null}
				</div>
			</LayerCard.Primary>
		</LayerCard>
	);
}
