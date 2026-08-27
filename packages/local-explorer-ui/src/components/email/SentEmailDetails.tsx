import { PaperclipIcon } from "@phosphor-icons/react";
import { formatEmailTimestamp } from "../../routes/email/shared/format";
import { formatEmailAddress, formatMessageId } from "../../utils/format";
import { EmailContent } from "./EmailContent";
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
			<span className="text-sm break-all whitespace-pre-wrap text-kumo-default">
				{value}
			</span>
		</div>
	);
}

const STRUCTURED_HEADER_NAMES = new Set([
	"bcc",
	"cc",
	"from",
	"message-id",
	"reply-to",
	"subject",
	"to",
]);

const STANDARD_HEADER_NAMES = new Set([
	...STRUCTURED_HEADER_NAMES,
	"content-disposition",
	"content-language",
	"content-transfer-encoding",
	"content-type",
	"date",
	"in-reply-to",
	"mime-version",
	"references",
	"return-path",
	"sender",
]);

function SectionHeading({ children }: { children: string }): JSX.Element {
	return (
		<h2 className="mb-2 text-base font-semibold text-kumo-default">
			{children}
		</h2>
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

	const capturedHeaders = Object.entries(email.headers ?? {});
	const extraStandardHeaders = capturedHeaders.filter(
		([name]) =>
			STANDARD_HEADER_NAMES.has(name.toLowerCase()) &&
			!STRUCTURED_HEADER_NAMES.has(name.toLowerCase())
	);
	const customHeaders = capturedHeaders.filter(
		([name]) => !STANDARD_HEADER_NAMES.has(name.toLowerCase())
	);
	const standardHeaders: Array<[string, string]> = [
		["From", formatEmailAddress(email.from)],
		["To", email.to.map(formatEmailAddress).join(", ")],
	];
	if (email.cc?.length) {
		standardHeaders.push(["Cc", email.cc.map(formatEmailAddress).join(", ")]);
	}
	if (email.bcc?.length) {
		standardHeaders.push(["Bcc", email.bcc.map(formatEmailAddress).join(", ")]);
	}
	if (email.replyTo) {
		standardHeaders.push(["Reply-To", formatEmailAddress(email.replyTo)]);
	}
	standardHeaders.push(
		["Subject", email.subject || "(no subject)"],
		["Message-ID", formatMessageId(email.messageId)],
		...extraStandardHeaders
	);

	return (
		<div className="h-full overflow-y-auto">
			<div className="sticky top-0 z-10 border-b border-kumo-fill bg-kumo-base px-6 py-4">
				<h1 className="text-lg font-semibold break-words text-kumo-default">
					{email.subject || "(no subject)"}
				</h1>
				<p className="mt-1 text-sm text-kumo-subtle">
					{formatEmailTimestamp(email.sentAt)}
				</p>
			</div>

			<div className="space-y-6 px-6 py-5">
				<div>
					<SectionHeading>Standard headers</SectionHeading>
					<div className="rounded-lg border border-kumo-fill bg-kumo-elevated px-5 py-3">
						{standardHeaders.map(([name, value]) => (
							<MetaRow key={name} label={name} value={value} />
						))}
					</div>
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
									<span className="text-sm text-kumo-subtle">
										{attachment.contentType}
									</span>
									<span className="ml-auto shrink-0 text-sm text-kumo-subtle">
										{attachment.size} bytes
									</span>
								</div>
							))}
						</div>
					</div>
				) : null}

				<EmailContent
					html={email.html}
					kind="sent"
					previewTitle="Rendered HTML email body"
					raw={email.raw}
					rawBase64={email.rawBase64}
					text={email.text}
					truncated={truncated}
				/>
			</div>
		</div>
	);
}
