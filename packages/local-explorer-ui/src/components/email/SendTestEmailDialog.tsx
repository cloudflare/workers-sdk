import {
	Button,
	Dialog,
	Input,
	InputArea,
	useKumoToastManager,
} from "@cloudflare/kumo";
import { PaperclipIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type ChangeEvent,
	type ComponentPropsWithoutRef,
	type JSX,
	type ReactNode,
} from "react";
import { emailSendRouting } from "../../api";
import {
	hasInvalidEmailHeaderValueCharacters,
	isEmailHeaderName,
	isManagedEmailHeaderName,
} from "../../utils/email-headers";
import { formatSize } from "../../utils/format";
import type { EmailSendRequest, EmailSendRoutingError } from "../../api";
import type { TestEmailDraft } from "./TestEmailDraftsContext";

interface SendTestEmailDialogProps {
	initialDraft?: TestEmailDraft;
	onOpenChange: (open: boolean) => void;
	onSent: (draft: TestEmailDraft) => void;
	open: boolean;
	worker?: string;
}

type SelectedAttachment = TestEmailDraft["attachments"][number];

type HeaderField = TestEmailDraft["headers"][number] & {
	id: number;
	nameError?: string;
	valueError?: string;
};

type KumoInputProps = ComponentPropsWithoutRef<"input"> & {
	error?: string;
	label?: ReactNode;
	labelTooltip?: ReactNode;
};

const EMAIL_SEND_FAILED_CODE = 10602;

/** Identifies the send failure that still leaves a captured email to inspect. */
function isMissingEmailHandlerError(
	error: EmailSendRoutingError | undefined,
	worker: string
): boolean {
	return (
		error?.errors.some(
			({ code, message }) =>
				code === EMAIL_SEND_FAILED_CODE &&
				message === `Worker '${worker}' does not export an email() handler.`
		) === true
	);
}

// Kumo and the monorepo currently resolve different React type versions. Keep
// native input props checked against this package's React types at the boundary.
const KumoInput = Input as unknown as (props: KumoInputProps) => JSX.Element;

function RequiredLabel({ children }: { children: ReactNode }): JSX.Element {
	return (
		<>
			{children} <span aria-hidden="true">*</span>
		</>
	);
}

function HeaderFieldLabel({
	index,
	label,
}: {
	index: number;
	label: "Name" | "Value";
}): JSX.Element {
	return (
		<>
			<span className="sr-only">
				Header {index + 1} {label.toLowerCase()}
			</span>
			<span aria-hidden="true">{label}</span>
		</>
	);
}

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

/** Splits comma/newline-separated mailboxes without splitting quoted names. */
function parseAddressList(value: string): string[] {
	const addresses: string[] = [];
	let current = "";
	let angleDepth = 0;
	let commentDepth = 0;
	let escaped = false;
	let quoted = false;

	function commitAddress(): void {
		const address = current.trim();
		if (address) {
			addresses.push(address);
		}
		current = "";
	}

	for (const character of value) {
		if (escaped) {
			current += character;
			escaped = false;
			continue;
		}
		if ((quoted || commentDepth > 0) && character === "\\") {
			current += character;
			escaped = true;
			continue;
		}
		if (commentDepth === 0 && character === '"') {
			quoted = !quoted;
			current += character;
			continue;
		}
		if (!quoted) {
			if (angleDepth === 0 && character === "(") {
				commentDepth++;
			} else if (angleDepth === 0 && character === ")" && commentDepth > 0) {
				commentDepth--;
			} else if (commentDepth === 0 && character === "<") {
				angleDepth++;
			} else if (commentDepth === 0 && character === ">" && angleDepth > 0) {
				angleDepth--;
			}
		}
		if (
			!quoted &&
			angleDepth === 0 &&
			commentDepth === 0 &&
			(character === "," || character === "\n" || character === "\r")
		) {
			commitAddress();
		} else {
			current += character;
		}
	}
	commitAddress();
	return addresses;
}

export function SendTestEmailDialog({
	initialDraft,
	onOpenChange,
	onSent,
	open,
	worker,
}: SendTestEmailDialogProps): JSX.Element {
	const toast = useKumoToastManager();
	const [sending, setSending] = useState<boolean>(false);
	const [from, setFrom] = useState<string>("");
	const [fromError, setFromError] = useState<string | null>(null);
	const [to, setTo] = useState<string>("");
	const [toError, setToError] = useState<string | null>(null);
	const [cc, setCc] = useState<string>("");
	const [bcc, setBcc] = useState<string>("");
	const [replyTo, setReplyTo] = useState<string>("");
	const [subject, setSubject] = useState<string>("");
	const [headers, setHeaders] = useState<HeaderField[]>([]);
	const [text, setText] = useState<string>("");
	const [html, setHtml] = useState<string>("");
	const [attachments, setAttachments] = useState<SelectedAttachment[]>([]);
	const [attachmentsError, setAttachmentsError] = useState<string | null>(null);
	const [pendingAttachmentReads, setPendingAttachmentReads] =
		useState<number>(0);
	const attachmentsRef = useRef<SelectedAttachment[]>([]);
	const attachmentReadGenerationRef = useRef<number>(0);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const nextHeaderIdRef = useRef<number>(0);

	const loadDraft = useCallback((draft?: TestEmailDraft) => {
		setFrom(draft?.from ?? "");
		setFromError(null);
		setTo(draft?.to ?? "");
		setToError(null);
		setCc(draft?.cc ?? "");
		setBcc(draft?.bcc ?? "");
		setReplyTo(draft?.replyTo ?? "");
		setSubject(draft?.subject ?? "");
		setHeaders(
			(draft?.headers ?? []).map((header) => ({
				...header,
				id: nextHeaderIdRef.current++,
			}))
		);
		setText(draft?.text ?? "");
		setHtml(draft?.html ?? "");
		attachmentReadGenerationRef.current += 1;
		setPendingAttachmentReads(0);
		const nextAttachments = (draft?.attachments ?? []).map((attachment) => ({
			...attachment,
		}));
		attachmentsRef.current = nextAttachments;
		setAttachments(nextAttachments);
		setAttachmentsError(null);
	}, []);

	useEffect(() => {
		if (open) {
			loadDraft(initialDraft);
		}
	}, [initialDraft, loadDraft, open]);

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
		setAttachmentsError(null);
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
			attachmentsRef.current = nextAttachments;
			setAttachments(nextAttachments);
		} catch (err) {
			if (generation !== attachmentReadGenerationRef.current) {
				return;
			}
			setAttachmentsError(
				err instanceof Error ? err.message : "Failed to read the selected file."
			);
		} finally {
			if (generation === attachmentReadGenerationRef.current) {
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
		setAttachmentsError(null);
	}

	function handleAddHeader(): void {
		setHeaders((current) => [
			...current,
			{ id: nextHeaderIdRef.current++, name: "", value: "" },
		]);
	}

	function handleRemoveHeader(id: number): void {
		setHeaders((current) => current.filter((header) => header.id !== id));
	}

	function handleHeaderChange(
		id: number,
		field: "name" | "value",
		value: string
	): void {
		setHeaders((current) =>
			current.map((header) =>
				header.id === id
					? {
							...header,
							[field]: value,
							...(field === "name"
								? { nameError: undefined }
								: { valueError: undefined }),
						}
					: header
			)
		);
	}

	function handleOpenChange(newOpen: boolean): void {
		if (!newOpen && sending) {
			return;
		}
		if (!newOpen) {
			loadDraft();
		}
		onOpenChange(newOpen);
	}

	async function handleSend(): Promise<void> {
		const recipients = parseAddressList(to);
		const customHeaders = new Map<string, string>();
		const usedHeaderNames = new Set<string>();
		let hasHeaderError = false;
		const validatedHeaders = headers.map((header) => {
			const name = header.name.trim();
			let nameError: string | undefined;
			let valueError: string | undefined;

			if (!name && !header.value) {
				return { ...header, nameError, valueError };
			}
			if (!name) {
				nameError = "Enter a header name.";
			} else if (!isEmailHeaderName(name)) {
				nameError = "Enter a valid header name.";
			} else if (isManagedEmailHeaderName(name)) {
				nameError = `${name} is managed by the email composer and cannot be overridden.`;
			} else if (usedHeaderNames.has(name.toLowerCase())) {
				nameError = "Header names must be unique.";
			} else {
				usedHeaderNames.add(name.toLowerCase());
				customHeaders.set(name, header.value);
			}

			if (hasInvalidEmailHeaderValueCharacters(header.value)) {
				valueError =
					"Header values may only contain printable characters and line breaks.";
			}
			hasHeaderError ||= nameError !== undefined || valueError !== undefined;
			return { ...header, nameError, valueError };
		});
		const nextFromError = from.trim() ? null : "A sender address is required.";
		const nextToError =
			recipients.length > 0 ? null : "At least one recipient is required.";
		const nextAttachmentsError =
			pendingAttachmentReads > 0
				? "Wait for the selected attachments to finish loading."
				: null;

		setFromError(nextFromError);
		setToError(nextToError);
		setHeaders(validatedHeaders);
		setAttachmentsError(nextAttachmentsError);

		if (
			nextFromError ||
			nextToError ||
			hasHeaderError ||
			nextAttachmentsError
		) {
			return;
		}
		if (!worker) {
			toast.add({
				title: "Select a worker before sending a test email.",
				variant: "error",
			});
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
		if (customHeaders.size > 0) {
			body.headers = Object.fromEntries(customHeaders);
		}
		if (attachments.length > 0) {
			body.attachments = attachments.map(
				({ size: _size, ...attachment }) => attachment
			);
		}

		setSending(true);
		const sentDraft: TestEmailDraft = {
			from,
			to,
			cc,
			bcc,
			replyTo,
			subject,
			headers: validatedHeaders
				.filter((header) => header.name.trim() || header.value)
				.map(({ name, value }) => ({ name, value })),
			text,
			html,
			attachments: attachments.map((attachment) => ({ ...attachment })),
		};
		try {
			const { error: sendError, response } = await emailSendRouting({
				body,
				query: { worker },
				throwOnError: false,
			});
			if (sendError || !response.ok) {
				toast.add({
					title:
						sendError?.errors?.[0]?.message ?? "Failed to send test email.",
					variant: "error",
				});
				if (!isMissingEmailHandlerError(sendError, worker)) {
					return;
				}
			}
			loadDraft();
			onSent(sentDraft);
			onOpenChange(false);
		} catch (err) {
			toast.add({
				title:
					err instanceof Error ? err.message : "Failed to send test email.",
				variant: "error",
			});
		} finally {
			setSending(false);
		}
	}

	return (
		<Dialog.Root open={open} onOpenChange={handleOpenChange}>
			<Dialog
				className="w-[calc(100vw-2rem)] max-w-[32rem] min-w-0 sm:w-[32rem] sm:max-w-[32rem]"
				size="lg"
			>
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
					className="min-w-0"
					noValidate
					onSubmit={(event) => {
						event.preventDefault();
						void handleSend();
					}}
				>
					<div className="max-h-[60vh] min-w-0 space-y-4 overflow-y-auto px-6 py-5">
						<KumoInput
							aria-invalid={fromError ? true : undefined}
							className={fromError ? "ring-2 !ring-kumo-danger" : undefined}
							error={fromError ?? undefined}
							id="test-email-from"
							label={<RequiredLabel>From</RequiredLabel>}
							onChange={(event) => {
								setFrom(event.target.value);
								setFromError(null);
							}}
							placeholder="sender@example.com"
							required
							type="text"
							value={from}
						/>

						<KumoInput
							aria-invalid={toError ? true : undefined}
							className={toError ? "ring-2 !ring-kumo-danger" : undefined}
							error={toError ?? undefined}
							id="test-email-to"
							label={<RequiredLabel>To</RequiredLabel>}
							labelTooltip="Only the first parsed address is used as the envelope recipient. All addresses remain in the To header."
							onChange={(event) => {
								setTo(event.target.value);
								setToError(null);
							}}
							placeholder="recipient@example.com, another@example.com"
							required
							type="text"
							value={to}
						/>

						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<KumoInput
								id="test-email-cc"
								label="Cc"
								onChange={(event) => setCc(event.target.value)}
								placeholder="cc@example.com"
								type="text"
								value={cc}
							/>
							<KumoInput
								id="test-email-bcc"
								label="Bcc"
								onChange={(event) => setBcc(event.target.value)}
								placeholder="bcc@example.com"
								type="text"
								value={bcc}
							/>
						</div>

						<KumoInput
							id="test-email-reply-to"
							label="Reply-To"
							onChange={(event) => setReplyTo(event.target.value)}
							placeholder="reply@example.com"
							type="text"
							value={replyTo}
						/>

						<KumoInput
							id="test-email-subject"
							label="Subject"
							onChange={(event) => setSubject(event.target.value)}
							placeholder="Hello from the local explorer"
							type="text"
							value={subject}
						/>

						<div>
							<div className="mb-2 flex items-center justify-between">
								<p className="text-sm font-medium text-kumo-default">
									Custom headers
								</p>
								<Button type="button" variant="ghost" onClick={handleAddHeader}>
									<PlusIcon size={14} />
									Add header
								</Button>
							</div>

							{headers.length === 0 ? (
								<p className="text-sm text-kumo-subtle italic">
									No custom headers
								</p>
							) : (
								<div className="space-y-3">
									{headers.map((header, index) => (
										<div
											className="min-w-0 rounded-lg bg-kumo-elevated px-3 py-3 ring ring-kumo-line"
											key={header.id}
										>
											<div className="flex min-w-0 items-start gap-2">
												<div className="grid min-w-0 flex-1 grid-cols-1 items-start gap-3 sm:grid-cols-2">
													<div className="min-w-0 [&_[role=alert]]:break-words [&>*]:min-w-0">
														<KumoInput
															aria-invalid={header.nameError ? true : undefined}
															className={
																header.nameError
																	? "w-full ring-2 !ring-kumo-danger"
																	: "w-full"
															}
															error={header.nameError}
															id={`test-email-header-${header.id}-name`}
															label={
																<HeaderFieldLabel index={index} label="Name" />
															}
															onChange={(event) =>
																handleHeaderChange(
																	header.id,
																	"name",
																	event.target.value
																)
															}
															placeholder="X-Custom-Header"
															type="text"
															value={header.name}
														/>
													</div>
													<div className="min-w-0 [&_[role=alert]]:break-words [&>*]:min-w-0">
														<InputArea
															aria-invalid={
																header.valueError ? true : undefined
															}
															className={`h-9 w-full resize-none py-1.5 ${
																header.valueError
																	? "ring-2 !ring-kumo-danger"
																	: ""
															}`}
															error={header.valueError}
															id={`test-email-header-${header.id}-value`}
															label={
																<HeaderFieldLabel index={index} label="Value" />
															}
															onChange={(event) =>
																handleHeaderChange(
																	header.id,
																	"value",
																	event.target.value
																)
															}
															placeholder="Header value"
															rows={1}
															value={header.value}
														/>
													</div>
												</div>
												<Button
													aria-label={`Remove header ${index + 1}`}
													className="mt-7 shrink-0"
													onClick={() => handleRemoveHeader(header.id)}
													shape="square"
													type="button"
													variant="ghost"
												>
													<TrashIcon size={14} />
												</Button>
											</div>
										</div>
									))}
								</div>
							)}
						</div>

						<InputArea
							className="w-full resize-y"
							id="test-email-text"
							label="Text body"
							onChange={(event) => setText(event.target.value)}
							placeholder="Plain text body"
							rows={4}
							value={text}
						/>

						<InputArea
							className="w-full resize-y font-mono"
							id="test-email-html"
							label="HTML body"
							onChange={(event) => setHtml(event.target.value)}
							placeholder="<p>HTML body</p>"
							rows={4}
							value={html}
						/>

						<div>
							<div className="mb-2 flex items-center justify-between">
								<label
									className="text-sm font-medium text-kumo-default"
									htmlFor="test-email-attachments"
								>
									Attachments
								</label>
								<Button
									aria-describedby={
										attachmentsError
											? "test-email-attachments-error"
											: undefined
									}
									className={
										attachmentsError ? "ring-2 ring-kumo-danger" : undefined
									}
									type="button"
									variant="ghost"
									onClick={() => fileInputRef.current?.click()}
								>
									<PaperclipIcon size={14} />
									Add files
								</Button>
							</div>

							<input
								aria-describedby={
									attachmentsError ? "test-email-attachments-error" : undefined
								}
								aria-invalid={attachmentsError ? true : undefined}
								className="hidden"
								id="test-email-attachments"
								multiple
								onChange={(e) => void handleAttachmentsSelected(e)}
								ref={fileInputRef}
								type="file"
							/>
							{attachmentsError && (
								<p
									className="mb-2 text-sm leading-snug text-kumo-danger"
									id="test-email-attachments-error"
									role="alert"
								>
									{attachmentsError}
								</p>
							)}

							{attachments.length === 0 ? (
								<p className="text-sm text-kumo-subtle italic">
									No attachments
								</p>
							) : (
								<div className="space-y-2">
									{attachments.map((attachment, index) => (
										<div
											key={`${attachment.filename}-${index}`}
											className="flex items-start gap-2 rounded-lg border border-kumo-fill bg-kumo-base px-3 py-2"
										>
											<span className="flex h-lh shrink-0 items-center">
												<PaperclipIcon className="text-kumo-subtle" size={14} />
											</span>
											<div className="min-w-0 flex-1">
												<p className="truncate text-sm text-kumo-default">
													{attachment.filename}
												</p>
												<p className="text-sm text-kumo-subtle">
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
