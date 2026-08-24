import { Button, Dialog } from "@cloudflare/kumo";
import { PaperclipIcon, TrashIcon } from "@phosphor-icons/react";
import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type ChangeEvent,
	type JSX,
} from "react";
import { emailSendRouting } from "../../api";
import { formatSize } from "../../utils/format";
import type { EmailSendRequest } from "../../api";

interface SendTestEmailDialogProps {
	onOpenChange: (open: boolean) => void;
	onSent: () => void;
	open: boolean;
	worker?: string;
}

type AttachmentInput = NonNullable<EmailSendRequest["attachments"]>[number];

interface SelectedAttachment extends AttachmentInput {
	size: number;
}

// Keep test attachments small enough for quick local iteration. Attachments are
// base64-encoded in the JSON request and MIME message, so even modest source
// files consume substantially more memory while the preview is being composed.
const MAX_TOTAL_ATTACHMENT_BYTES = 700 * 1024;

async function readFileAsBase64(file: File): Promise<string> {
	const bytes = new Uint8Array(await file.arrayBuffer());
	// Chunked to stay clear of the argument-count limit on String.fromCharCode.
	const chunkSize = 0x8000;
	let binary = "";
	for (let i = 0; i < bytes.length; i += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
	}
	return btoa(binary);
}

const inputClass =
	"focus-visible:ring-kumo-ring w-full rounded-lg border border-kumo-fill bg-kumo-base px-3 py-2.5 text-sm text-kumo-default placeholder:kumo-input-placeholder focus:border-kumo-brand focus:outline-none focus-visible:ring-2";

const MANAGED_HEADER_NAMES = new Set([
	"bcc",
	"cc",
	"content-transfer-encoding",
	"content-type",
	"date",
	"from",
	"message-id",
	"mime-version",
	"reply-to",
	"subject",
	"to",
]);

function parseAddressList(value: string): string[] {
	return value
		.split(/[\n,]/)
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
}

function parseHeaders(
	value: string
):
	| { valid: true; headers: Record<string, string> }
	| { valid: false; error: string } {
	const headers: Record<string, string> = {};
	for (const rawLine of value.split("\n")) {
		const line = rawLine.trim();
		if (!line) {
			continue;
		}
		const separator = line.indexOf(":");
		if (separator === -1) {
			return {
				valid: false,
				error: "Each header must use the format 'Key: Value'.",
			};
		}
		const key = line.slice(0, separator).trim();
		const val = line.slice(separator + 1).trim();
		if (!key) {
			return {
				valid: false,
				error: "Each header must use the format 'Key: Value'.",
			};
		}
		if (MANAGED_HEADER_NAMES.has(key.toLowerCase())) {
			return {
				valid: false,
				error: `${key} is managed by the email composer and cannot be overridden.`,
			};
		}
		headers[key] = val;
	}
	return { valid: true, headers };
}

export function SendTestEmailDialog({
	onOpenChange,
	onSent,
	open,
	worker,
}: SendTestEmailDialogProps): JSX.Element {
	const [sending, setSending] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [from, setFrom] = useState<string>("");
	const [to, setTo] = useState<string>("");
	const [cc, setCc] = useState<string>("");
	const [bcc, setBcc] = useState<string>("");
	const [replyTo, setReplyTo] = useState<string>("");
	const [subject, setSubject] = useState<string>("");
	const [headers, setHeaders] = useState<string>("");
	const [headersError, setHeadersError] = useState<string | null>(null);
	const [text, setText] = useState<string>("");
	const [html, setHtml] = useState<string>("");
	const [attachments, setAttachments] = useState<SelectedAttachment[]>([]);
	const [pendingAttachmentReads, setPendingAttachmentReads] =
		useState<number>(0);
	const attachmentsRef = useRef<SelectedAttachment[]>([]);
	const attachmentReadGenerationRef = useRef<number>(0);
	const pendingAttachmentBytesRef = useRef<number>(0);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (error) {
			scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
		}
	}, [error]);

	const resetForm = useCallback(() => {
		setFrom("");
		setTo("");
		setCc("");
		setBcc("");
		setReplyTo("");
		setSubject("");
		setHeaders("");
		setHeadersError(null);
		setText("");
		setHtml("");
		attachmentReadGenerationRef.current += 1;
		pendingAttachmentBytesRef.current = 0;
		setPendingAttachmentReads(0);
		attachmentsRef.current = [];
		setAttachments([]);
		setError(null);
	}, []);

	async function handleAttachmentsSelected(
		e: ChangeEvent<HTMLInputElement>
	): Promise<void> {
		const files = [...(e.target.files ?? [])];
		// Reset the input so re-selecting the same file still fires a change event.
		e.target.value = "";
		if (files.length === 0) {
			return;
		}

		const generation = attachmentReadGenerationRef.current;
		const addedBytes = files.reduce((sum, file) => sum + file.size, 0);
		const total = attachmentsRef.current.reduce(
			(sum, attachment) => sum + attachment.size,
			pendingAttachmentBytesRef.current + addedBytes
		);
		if (total > MAX_TOTAL_ATTACHMENT_BYTES) {
			setError(
				`Attachments must total less than ${formatSize(MAX_TOTAL_ATTACHMENT_BYTES)}.`
			);
			return;
		}
		pendingAttachmentBytesRef.current += addedBytes;
		setPendingAttachmentReads((pending) => pending + 1);

		try {
			const added = await Promise.all(
				files.map(async (file) => ({
					filename: file.name,
					type: file.type || "application/octet-stream",
					content: await readFileAsBase64(file),
					size: file.size,
				}))
			);
			if (generation !== attachmentReadGenerationRef.current) {
				return;
			}

			const nextAttachments = [...attachmentsRef.current, ...added];
			setError(null);
			attachmentsRef.current = nextAttachments;
			setAttachments(nextAttachments);
		} catch (err) {
			if (generation !== attachmentReadGenerationRef.current) {
				return;
			}
			setError(
				err instanceof Error ? err.message : "Failed to read the selected file."
			);
		} finally {
			if (generation === attachmentReadGenerationRef.current) {
				pendingAttachmentBytesRef.current -= addedBytes;
				setPendingAttachmentReads((pending) => pending - 1);
			}
		}
	}

	function handleRemoveAttachment(index: number): void {
		const nextAttachments = attachmentsRef.current.filter(
			(_, currentIndex) => currentIndex !== index
		);
		attachmentsRef.current = nextAttachments;
		setAttachments(nextAttachments);
	}

	function handleOpenChange(newOpen: boolean): void {
		if (!newOpen && sending) {
			return;
		}
		if (!newOpen) {
			resetForm();
		}
		onOpenChange(newOpen);
	}

	async function handleSend(): Promise<void> {
		setError(null);
		setHeadersError(null);
		if (pendingAttachmentReads > 0) {
			setError("Wait for the selected attachments to finish loading.");
			return;
		}
		if (!worker) {
			setError("Select a worker before sending a test email.");
			return;
		}
		const recipients = parseAddressList(to);
		if (!from.trim()) {
			setError("A sender address is required.");
			return;
		}
		if (recipients.length === 0) {
			setError("At least one recipient is required.");
			return;
		}

		const parsedHeaders = parseHeaders(headers);
		if (!parsedHeaders.valid) {
			setHeadersError(parsedHeaders.error);
			return;
		}

		const body: EmailSendRequest = {
			from: from.trim(),
			to: recipients,
			subject: subject.trim(),
		};
		const ccList = parseAddressList(cc);
		if (ccList.length > 0) {
			body.cc = ccList;
		}
		const bccList = parseAddressList(bcc);
		if (bccList.length > 0) {
			body.bcc = bccList;
		}
		if (replyTo.trim()) {
			body.replyTo = replyTo.trim();
		}
		if (text.trim()) {
			body.text = text;
		}
		if (html.trim()) {
			body.html = html;
		}
		if (Object.keys(parsedHeaders.headers).length > 0) {
			body.headers = parsedHeaders.headers;
		}
		if (attachments.length > 0) {
			body.attachments = attachments.map(
				({ size: _size, ...attachment }) => attachment
			);
		}

		setSending(true);
		setError(null);
		try {
			const { error: sendError, response } = await emailSendRouting({
				body,
				query: { worker },
				throwOnError: false,
			});
			if (sendError || !response.ok) {
				setError(
					sendError?.errors?.[0]?.message ?? "Failed to send test email."
				);
				return;
			}
			resetForm();
			onSent();
			onOpenChange(false);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to send test email."
			);
		} finally {
			setSending(false);
		}
	}

	return (
		<Dialog.Root open={open} onOpenChange={handleOpenChange}>
			<Dialog size="lg">
				<div className="border-b border-kumo-fill px-6 pt-6 pb-4">
					{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
					<Dialog.Title className="text-lg font-semibold text-kumo-default">
						Send test email
					</Dialog.Title>
					<p className="mt-1 text-sm text-kumo-subtle">
						Delivers a message to this worker&rsquo;s email() handler, exactly
						as an inbound email would arrive.
					</p>
				</div>

				<form
					onSubmit={(event) => {
						event.preventDefault();
						void handleSend();
					}}
				>
					<div
						ref={scrollContainerRef}
						className="max-h-[60vh] space-y-4 overflow-y-auto px-6 py-5"
					>
						{error && (
							<div
								className="rounded-lg border border-kumo-danger/20 bg-kumo-danger/8 p-3 text-sm text-kumo-danger"
								role="alert"
							>
								{error}
							</div>
						)}

						<div>
							<label
								className="mb-2 block text-sm font-medium text-kumo-default"
								htmlFor="test-email-from"
							>
								From
							</label>
							<input
								className={inputClass}
								id="test-email-from"
								onChange={(e) => setFrom(e.target.value)}
								placeholder="sender@example.com"
								type="text"
								value={from}
							/>
						</div>

						<div>
							<label
								className="mb-2 block text-sm font-medium text-kumo-default"
								htmlFor="test-email-to"
							>
								To
							</label>
							<input
								className={inputClass}
								id="test-email-to"
								onChange={(e) => setTo(e.target.value)}
								placeholder="recipient@example.com, another@example.com"
								type="text"
								value={to}
							/>
						</div>

						<div className="grid grid-cols-2 gap-4">
							<div>
								<label
									className="mb-2 block text-sm font-medium text-kumo-default"
									htmlFor="test-email-cc"
								>
									Cc{" "}
									<span className="font-normal text-kumo-subtle">
										(optional)
									</span>
								</label>
								<input
									className={inputClass}
									id="test-email-cc"
									onChange={(e) => setCc(e.target.value)}
									placeholder="cc@example.com"
									type="text"
									value={cc}
								/>
							</div>
							<div>
								<label
									className="mb-2 block text-sm font-medium text-kumo-default"
									htmlFor="test-email-bcc"
								>
									Bcc{" "}
									<span className="font-normal text-kumo-subtle">
										(optional)
									</span>
								</label>
								<input
									className={inputClass}
									id="test-email-bcc"
									onChange={(e) => setBcc(e.target.value)}
									placeholder="bcc@example.com"
									type="text"
									value={bcc}
								/>
							</div>
						</div>

						<div>
							<label
								className="mb-2 block text-sm font-medium text-kumo-default"
								htmlFor="test-email-reply-to"
							>
								Reply-To{" "}
								<span className="font-normal text-kumo-subtle">(optional)</span>
							</label>
							<input
								className={inputClass}
								id="test-email-reply-to"
								onChange={(e) => setReplyTo(e.target.value)}
								placeholder="reply@example.com"
								type="text"
								value={replyTo}
							/>
						</div>

						<div>
							<label
								className="mb-2 block text-sm font-medium text-kumo-default"
								htmlFor="test-email-subject"
							>
								Subject
							</label>
							<input
								className={inputClass}
								id="test-email-subject"
								onChange={(e) => setSubject(e.target.value)}
								placeholder="Hello from the local explorer"
								type="text"
								value={subject}
							/>
						</div>

						<div>
							<label
								className="mb-2 block text-sm font-medium text-kumo-default"
								htmlFor="test-email-headers"
							>
								Custom headers{" "}
								<span className="font-normal text-kumo-subtle">(optional)</span>
							</label>
							<textarea
								aria-describedby="test-email-headers-help"
								aria-invalid={headersError !== null}
								className={`${inputClass} resize-y font-mono ${
									headersError
										? "border-kumo-danger focus:border-kumo-danger"
										: ""
								}`}
								id="test-email-headers"
								onChange={(e) => {
									setHeaders(e.target.value);
									if (headersError) {
										setHeadersError(null);
									}
								}}
								placeholder={"X-Custom-Header: value\nX-Another: value"}
								rows={3}
								value={headers}
							/>
							{headersError ? (
								<p
									className="mt-1 text-xs text-kumo-danger"
									id="test-email-headers-help"
									role="alert"
								>
									{headersError}
								</p>
							) : (
								<p
									className="mt-1 text-xs text-kumo-subtle"
									id="test-email-headers-help"
								>
									One header per line, formatted as &lsquo;Key: Value&rsquo;
								</p>
							)}
						</div>

						<div>
							<label
								className="mb-2 block text-sm font-medium text-kumo-default"
								htmlFor="test-email-text"
							>
								Text body{" "}
								<span className="font-normal text-kumo-subtle">(optional)</span>
							</label>
							<textarea
								className={`${inputClass} resize-y`}
								id="test-email-text"
								onChange={(e) => setText(e.target.value)}
								placeholder="Plain text body"
								rows={4}
								value={text}
							/>
						</div>

						<div>
							<label
								className="mb-2 block text-sm font-medium text-kumo-default"
								htmlFor="test-email-html"
							>
								HTML body{" "}
								<span className="font-normal text-kumo-subtle">(optional)</span>
							</label>
							<textarea
								className={`${inputClass} resize-y font-mono`}
								id="test-email-html"
								onChange={(e) => setHtml(e.target.value)}
								placeholder="<p>HTML body</p>"
								rows={4}
								value={html}
							/>
						</div>

						<div>
							<div className="mb-2 flex items-center justify-between">
								<label
									className="text-sm font-medium text-kumo-default"
									htmlFor="test-email-attachments"
								>
									Attachments{" "}
									<span className="font-normal text-kumo-subtle">
										(optional)
									</span>
								</label>
								<Button
									type="button"
									variant="ghost"
									onClick={() => fileInputRef.current?.click()}
								>
									<PaperclipIcon size={12} />
									Add files
								</Button>
							</div>

							<input
								className="hidden"
								id="test-email-attachments"
								multiple
								onChange={(e) => void handleAttachmentsSelected(e)}
								ref={fileInputRef}
								type="file"
							/>

							{attachments.length === 0 ? (
								<p className="text-sm text-kumo-subtle italic">
									No attachments
								</p>
							) : (
								<div className="space-y-2">
									{attachments.map((attachment, index) => (
										<div
											key={`${attachment.filename}-${index}`}
											className="flex items-center gap-2 rounded-lg border border-kumo-fill bg-kumo-base px-3 py-2"
										>
											<PaperclipIcon
												size={14}
												className="shrink-0 text-kumo-subtle"
											/>
											<div className="min-w-0 flex-1">
												<p className="truncate text-sm text-kumo-default">
													{attachment.filename}
												</p>
												<p className="text-xs text-kumo-subtle">
													{attachment.type} &middot;{" "}
													{formatSize(attachment.size)}
												</p>
											</div>
											<Button
												type="button"
												variant="ghost"
												shape="square"
												onClick={() => handleRemoveAttachment(index)}
												aria-label={`Remove ${attachment.filename}`}
											>
												<TrashIcon size={14} />
											</Button>
										</div>
									))}
								</div>
							)}
						</div>
					</div>

					<div className="flex justify-end gap-2 border-t border-kumo-fill px-6 py-4">
						<Button
							type="button"
							variant="secondary"
							onClick={() => handleOpenChange(false)}
							disabled={sending}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							variant="primary"
							disabled={sending || pendingAttachmentReads > 0}
							loading={sending}
						>
							{sending ? "Sending..." : "Send Email"}
						</Button>
					</div>
				</form>
			</Dialog>
		</Dialog.Root>
	);
}
