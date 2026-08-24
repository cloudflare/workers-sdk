import { PaperclipIcon } from "@phosphor-icons/react";
import { formatEmailTimestamp } from "../../routes/email/shared/format";
import { EmailHtmlPreview } from "./EmailHtmlPreview";
import { EmailTruncationWarning } from "./EmailTruncationWarning";
import type { EmailSendingDetail } from "../../api";
import type { JSX } from "react";

function MetaRow({
	label,
	value,
}: {
	label: string;
	value: string;
}): JSX.Element {
	return (
		<div className="grid grid-cols-[120px_1fr] gap-3 py-1.5">
			<span className="text-sm text-kumo-subtle">{label}</span>
			<span className="text-sm break-all text-kumo-default">{value}</span>
		</div>
	);
}

function SectionHeading({ children }: { children: string }): JSX.Element {
	return (
		<h2 className="mb-2 text-sm font-semibold text-kumo-default">{children}</h2>
	);
}

export function SentEmailDetails({
	email,
	loading,
	truncated,
}: {
	email: EmailSendingDetail | null;
	loading: boolean;
	truncated: boolean;
}): JSX.Element {
	if (loading) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-kumo-subtle">
				Loading email details…
			</div>
		);
	}

	if (!email) {
		return (
			<div className="flex h-full items-center justify-center px-8 text-center text-sm text-kumo-subtle">
				Select a sent email to view its details.
			</div>
		);
	}

	const customHeaders = Object.entries(email.headers ?? {});

	return (
		<div className="h-full overflow-y-auto">
			<div className="sticky top-0 z-10 border-b border-kumo-fill bg-kumo-base px-6 py-4">
				<h1 className="text-lg font-semibold break-words text-kumo-default">
					{email.subject || "(no subject)"}
				</h1>
				<p className="mt-1 text-xs text-kumo-subtle">
					{formatEmailTimestamp(email.sentAt)}
				</p>
			</div>

			<div className="space-y-6 p-6">
				<div className="rounded-lg border border-kumo-fill bg-kumo-elevated px-5 py-4">
					<MetaRow label="From" value={email.from} />
					<MetaRow label="To" value={email.to.join(", ")} />
					{email.cc?.length ? (
						<MetaRow label="Cc" value={email.cc.join(", ")} />
					) : null}
					{email.bcc?.length ? (
						<MetaRow label="Bcc" value={email.bcc.join(", ")} />
					) : null}
					{email.replyTo ? (
						<MetaRow label="Reply-To" value={email.replyTo} />
					) : null}
					<MetaRow label="Message-ID" value={email.messageId} />
					{email.worker ? (
						<MetaRow label="Worker" value={email.worker} />
					) : null}
				</div>

				{customHeaders.length > 0 ? (
					<div>
						<SectionHeading>Custom headers</SectionHeading>
						<div className="rounded-lg border border-kumo-fill bg-kumo-elevated px-5 py-3">
							{customHeaders.map(([name, value]) => (
								<MetaRow key={name} label={name} value={value} />
							))}
						</div>
					</div>
				) : null}

				{email.attachments.length > 0 ? (
					<div>
						<SectionHeading>Attachments</SectionHeading>
						<div className="overflow-hidden rounded-lg border border-kumo-fill bg-kumo-elevated">
							{email.attachments.map((attachment, index) => (
								<div
									className="flex items-center gap-2 border-b border-kumo-fill px-4 py-2.5 last:border-b-0"
									key={`${attachment.filename}-${index}`}
								>
									<PaperclipIcon
										className="shrink-0 text-kumo-subtle"
										size={14}
									/>
									<span className="min-w-0 truncate text-sm text-kumo-default">
										{attachment.filename}
									</span>
									<span className="text-xs text-kumo-subtle">
										{attachment.contentType}
									</span>
									<span className="ml-auto shrink-0 text-xs text-kumo-subtle">
										{attachment.size} bytes
									</span>
								</div>
							))}
						</div>
					</div>
				) : null}

				{email.text ? (
					<div>
						<SectionHeading>Text body</SectionHeading>
						{truncated ? (
							<EmailTruncationWarning kind="sent" />
						) : (
							<pre className="max-h-80 overflow-auto rounded-lg border border-kumo-fill bg-kumo-elevated p-4 text-sm whitespace-pre-wrap text-kumo-default">
								{email.text}
							</pre>
						)}
					</div>
				) : null}

				{email.html ? (
					<div>
						<SectionHeading>HTML body</SectionHeading>
						{truncated ? (
							<EmailTruncationWarning kind="sent" />
						) : (
							<EmailHtmlPreview
								html={email.html}
								title="Rendered HTML email body"
							/>
						)}
					</div>
				) : null}

				{email.raw ? (
					<div>
						<SectionHeading>Raw message</SectionHeading>
						{truncated ? (
							<EmailTruncationWarning kind="sent" />
						) : (
							<pre className="max-h-80 overflow-auto rounded-lg border border-kumo-fill bg-kumo-elevated p-4 font-mono text-xs whitespace-pre-wrap text-kumo-default">
								{email.raw}
							</pre>
						)}
					</div>
				) : null}

				{!email.text && !email.html && !email.raw ? (
					<div className="rounded-lg border border-kumo-fill bg-kumo-elevated px-5 py-8 text-center text-sm text-kumo-subtle">
						This email has no captured text or HTML body.
					</div>
				) : null}
			</div>
		</div>
	);
}
