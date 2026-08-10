import { Loader, Tooltip } from "@cloudflare/kumo";
import { ArrowClockwiseIcon, CheckIcon, PlusIcon } from "@phosphor-icons/react";
import { memo, useEffect, useState, type JSX } from "react";
import { workflowsGetStepOutput } from "../../api";
import { CopyButton } from "./CopyButton";
import {
	formatDuration,
	formatJson,
	isTruncatedStreamPreview,
} from "./helpers";
import { ScrollableCodeBlock } from "./ScrollableCodeBlock";
import { Timestamp } from "./Timestamp";
import type { StepData } from "./types";

function StepStatusIcon({
	success,
	finished,
	hasError,
	subtle,
}: {
	success?: boolean | null;
	finished?: boolean;
	hasError?: boolean;
	subtle?: boolean;
}): JSX.Element {
	if (success === false || hasError) {
		if (subtle) {
			return (
				<div className="flex size-5 items-center justify-center rounded bg-kumo-fill">
					<span className="text-xs font-bold text-kumo-default">!</span>
				</div>
			);
		}
		return (
			<div className="flex size-5 items-center justify-center rounded bg-kumo-badge-red">
				<span className="text-xs font-bold text-white">!</span>
			</div>
		);
	}
	if (success === true || finished === true) {
		if (subtle) {
			return (
				<div className="flex size-5 items-center justify-center rounded bg-kumo-fill">
					<CheckIcon size={12} weight="bold" className="text-white" />
				</div>
			);
		}
		return (
			<div className="flex size-5 items-center justify-center rounded bg-kumo-badge-teal">
				<CheckIcon size={12} weight="bold" className="text-white" />
			</div>
		);
	}
	return (
		<span>
			<Loader size={18} />
		</span>
	);
}

const TYPE_BADGE_STYLES: Record<string, string> = {
	step: "bg-kumo-tint text-kumo-subtle",
	sleep: "bg-kumo-overlay text-kumo-subtle",
	waitForEvent: "bg-kumo-badge-purple/10 text-kumo-badge-purple",
};

export function getStepKey(step: StepData): string {
	return `${step.type}-${step.name}`;
}

/** Strip the internal "-N" counter suffix for display purposes */
export function getStepDisplayName(name: string | undefined): string {
	return (name ?? "Unknown step").replace(/-\d+$/, "");
}

export const StepRow = memo(function StepRow({
	step,
	isExpanded,
	onToggleExpanded,
	onRestartFromStep,
	workflowName,
	instanceId,
}: {
	step: StepData;
	isExpanded: boolean;
	onToggleExpanded: () => void;
	onRestartFromStep?: (step: StepData) => void;
	workflowName?: string;
	instanceId?: string;
}): JSX.Element {
	const hasDetails =
		step.type === "step" ||
		(step.type === "waitForEvent" &&
			(step.error || step.output != null || step.finished));

	return (
		<div className="border-b border-kumo-fill p-1 last:border-b-0">
			{/* Collapsed row */}
			<div
				className={`grid h-10 grid-cols-[20px_1fr_160px_160px_80px_28px_24px] items-center gap-3 rounded-lg px-2 transition-colors ${hasDetails ? "cursor-pointer hover:bg-kumo-fill" : ""}`}
				onClick={hasDetails ? onToggleExpanded : undefined}
			>
				<StepStatusIcon
					success={step.success}
					finished={step.finished}
					hasError={!!step.error}
				/>

				<div className="flex items-center gap-2 overflow-hidden">
					{step.type && step.type !== "step" && (
						<span
							className={`shrink-0 rounded px-1.5 py-0.5 text-sm ${TYPE_BADGE_STYLES[step.type] ?? TYPE_BADGE_STYLES.step}`}
						>
							{step.type === "waitForEvent" ? "wait for event" : step.type}
						</span>
					)}
					<span className="truncate text-sm text-kumo-default">
						{getStepDisplayName(step.name)}
					</span>
				</div>

				<Timestamp value={step.start} />
				<Timestamp value={step.end} />
				<span className="text-sm text-kumo-subtle">
					{formatDuration(step.start, step.end)}
				</span>

				<div className="flex items-center justify-center">
					{onRestartFromStep && (
						<Tooltip content="Restart from this step" asChild>
							<button
								aria-label="Restart from this step"
								className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md border border-kumo-fill bg-kumo-base text-kumo-default transition-colors hover:bg-kumo-fill disabled:cursor-not-allowed disabled:opacity-40"
								onClick={(event) => {
									event.stopPropagation();
									onRestartFromStep(step);
								}}
								type="button"
							>
								<ArrowClockwiseIcon size={14} />
							</button>
						</Tooltip>
					)}
				</div>

				<div className="flex items-center justify-center">
					{hasDetails ? (
						<PlusIcon
							size={14}
							className={`text-kumo-subtle transition-transform ${isExpanded ? "rotate-45" : ""}`}
						/>
					) : (
						<div className="w-6" />
					)}
				</div>
			</div>

			{/* Expanded detail panel */}
			{isExpanded && hasDetails && (
				<div className="-mx-1 -mb-1">
					<div className="mt-1 h-2 rounded-t-lg border-t border-kumo-fill" />
					<div className="px-4 pt-3 pb-4">
						{step.type === "step" && (
							<StepDoDetails
								step={step}
								workflowName={workflowName}
								instanceId={instanceId}
							/>
						)}
						{step.type === "waitForEvent" && (
							<WaitForEventDetails
								step={step}
								workflowName={workflowName}
								instanceId={instanceId}
							/>
						)}
					</div>
				</div>
			)}
		</div>
	);
});

function StepCodeCard({
	label,
	content,
	loading = false,
	note,
}: {
	label: string;
	content: string;
	loading?: boolean;
	note?: string;
}): JSX.Element {
	return (
		<div>
			<h5 className="mb-2 text-sm font-medium text-kumo-default">{label}</h5>
			<div className="relative overflow-hidden rounded-lg border border-kumo-fill bg-kumo-base">
				{loading ? (
					<div className="flex items-center gap-2 p-3 text-sm text-kumo-subtle">
						<Loader size={14} />
						Loading full output…
					</div>
				) : (
					<ScrollableCodeBlock content={content} />
				)}
				<div className="absolute top-1.5 right-1.5">
					<CopyButton
						text={content}
						label={`Copy ${label.toLowerCase()}`}
						disabled={loading}
					/>
				</div>
			</div>
			{note && <p className="mt-1 text-xs text-kumo-subtle">{note}</p>}
		</div>
	);
}

type FullOutputState =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "loaded"; text: string; note?: string }
	| { status: "error" };

// Cap how much of a step output we pull into the tab. Streamed outputs can be
// up to ~1 GiB; we read only this much and cancel the transfer, pointing users
// to `wrangler workflows instances step --output <file>` for the full value.
const DISPLAY_CAP_BYTES = 2 * 1024 * 1024;
const DOWNLOAD_HINT =
	"download the full output with `wrangler workflows instances step … --output <file>`";

/**
 * Read up to `cap` bytes from a stream, then cancel it (so the rest is never
 * transferred). `truncated` is true when there was more beyond the cap.
 */
async function readCapped(
	stream: ReadableStream<Uint8Array>,
	cap: number
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let received = 0;
	let truncated = false;
	try {
		while (received < cap) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			chunks.push(value);
			received += value.byteLength;
		}
		if (received >= cap) {
			truncated = !(await reader.read()).done;
		}
	} finally {
		await reader.cancel().catch(() => {});
	}
	const bytes = new Uint8Array(received);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return { bytes, truncated };
}

// Lazily fetch the full output when the inline value is only a truncated stream
// preview. Streamed outputs come back as octet-stream bytes, else flat JSON.
function useFullStepOutput(
	step: StepData,
	workflowName?: string,
	instanceId?: string
): FullOutputState {
	const needsFetch = !step.error && isTruncatedStreamPreview(step.output);
	const apiType = step.type === "waitForEvent" ? "waitForEvent" : "step";
	const [state, setState] = useState<FullOutputState>({ status: "idle" });

	useEffect(() => {
		if (!needsFetch || !workflowName || !instanceId || !step.name) {
			return;
		}
		let active = true;
		setState({ status: "loading" });
		void workflowsGetStepOutput({
			path: { workflow_name: workflowName, instance_id: instanceId },
			query: { name: step.name, type: apiType },
			parseAs: "stream",
			throwOnError: false,
		})
			.then(async (res) => {
				const body = res.data as unknown as
					| ReadableStream<Uint8Array>
					| undefined;
				if (!res.response.ok || !body) {
					if (active) {
						setState({ status: "error" });
					}
					return;
				}
				const contentType = res.response.headers.get("content-type") ?? "";
				const { bytes, truncated } = await readCapped(body, DISPLAY_CAP_BYTES);
				if (!active) {
					return;
				}
				if (contentType.includes("application/octet-stream")) {
					try {
						const text = new TextDecoder("utf-8", { fatal: true }).decode(
							bytes
						);
						setState({
							status: "loaded",
							text,
							note: truncated
								? `Showing the first 2 MB — ${DOWNLOAD_HINT}.`
								: undefined,
						});
					} catch {
						// Non-UTF-8 stream: show a note rather than dumping bytes into a card.
						setState({
							status: "loaded",
							text: `[binary output]`,
							note: `Binary output — ${DOWNLOAD_HINT}.`,
						});
					}
					return;
				}
				// Non-stream outputs are JSON (capped at 1 MiB), so fully read here.
				const parsed = JSON.parse(new TextDecoder().decode(bytes)) as {
					result?: { output?: unknown };
				};
				setState({
					status: "loaded",
					text: formatJson(parsed.result?.output),
				});
			})
			.catch(() => {
				if (active) {
					setState({ status: "error" });
				}
			});
		return () => {
			active = false;
		};
		// step.output (the inline preview) and step.end change when the step
		// re-runs (e.g. restart-from-step), so a stale full output is refetched.
	}, [
		needsFetch,
		apiType,
		workflowName,
		instanceId,
		step.name,
		step.output,
		step.end,
	]);

	return needsFetch ? state : { status: "idle" };
}

/**
 * Resolve what to show for a step's output card: the full fetched value when the
 * inline output is a truncated preview (loading/error handled), else the inline
 * value. `show` gates it to steps that actually have an output.
 */
function resolveDisplayedOutput(
	step: StepData,
	full: FullOutputState,
	show: boolean
): { text: string | null; loading: boolean; note?: string } {
	if (!show) {
		return { text: null, loading: false };
	}
	if (!isTruncatedStreamPreview(step.output)) {
		return {
			text: step.output !== undefined ? formatJson(step.output) : null,
			loading: false,
		};
	}
	if (full.status === "loaded") {
		return { text: full.text, loading: false, note: full.note };
	}
	if (full.status === "error") {
		return { text: formatJson(step.output), loading: false };
	}
	return { text: "", loading: true };
}

function StepDoDetails({
	step,
	workflowName,
	instanceId,
}: {
	step: StepData;
	workflowName?: string;
	instanceId?: string;
}): JSX.Element {
	const fullOutput = useFullStepOutput(step, workflowName, instanceId);

	// Get error text from last failed attempt
	const failedAttempt =
		step.success === false && step.attempts
			? [...step.attempts].reverse().find((a) => a.error)
			: null;
	const errorText = failedAttempt?.error
		? `${failedAttempt.error.name}: ${failedAttempt.error.message}`
		: null;

	const output = resolveDisplayedOutput(
		step,
		fullOutput,
		step.success === true
	);

	// Left side: output or error. Right side: config.
	const leftLabel = errorText ? "Error" : "Output";
	const leftContent = errorText ?? output.text ?? "N/A";
	const configContent = step.config ? formatJson(step.config) : null;

	return (
		<div className="space-y-4">
			{/* Output/Error + Config side by side */}
			<div
				className={configContent ? "grid grid-cols-1 gap-4 md:grid-cols-2" : ""}
			>
				<StepCodeCard
					label={leftLabel}
					content={leftContent}
					loading={!errorText && output.loading}
					note={errorText ? undefined : output.note}
				/>
				{configContent && (
					<StepCodeCard label="Config" content={configContent} />
				)}
			</div>

			{/* Attempts */}
			{step.attempts && step.attempts.length > 0 && (
				<div>
					<hr className="mb-4 border-dashed border-kumo-fill" />
					<h5 className="mb-2 text-sm font-medium text-kumo-default">
						Attempts
					</h5>
					<div>
						{[...step.attempts].reverse().map((attempt, i, reversed) => {
							const attemptNum = reversed.length - i;
							// The attempt below this one in display = next in chronological order
							const nextDisplayed = reversed[i + 1];
							// Delay between this attempt's end and the one below's start (chronologically: below is older)
							// But we want the delay between the older one's end and this one's start
							// In chronological order: nextDisplayed happened before this attempt
							const delayMs =
								nextDisplayed && nextDisplayed.end && attempt.start
									? new Date(attempt.start).getTime() -
										new Date(nextDisplayed.end).getTime()
									: null;
							const isLast = i === reversed.length - 1;

							return (
								<div key={i}>
									<div className="rounded-md bg-kumo-base py-2 pr-3 text-sm">
										<div className="flex items-start gap-3">
											<div className="flex shrink-0 items-center gap-3 pt-0.5">
												<span className="font-mono text-kumo-subtle">
													#{attemptNum}
												</span>
												<StepStatusIcon success={attempt.success} subtle />
											</div>
											<div className="min-w-0 flex-1">
												<div className="flex items-center gap-2">
													{attempt.error ? (
														<span className="font-medium text-kumo-default">
															{attempt.error.name}
														</span>
													) : attempt.success ? (
														<span className="text-kumo-subtle">Success</span>
													) : (
														<span className="text-kumo-subtle">Running</span>
													)}
													<span className="flex-1 border-t border-dashed border-kumo-fill" />
													<span className="shrink-0 text-kumo-subtle">
														{formatDuration(attempt.start, attempt.end)}
													</span>
												</div>
												{attempt.error?.message && (
													<p className="mt-1 text-xs text-kumo-subtle">
														{attempt.error.message}
													</p>
												)}
											</div>
										</div>
									</div>
									{!isLast && delayMs !== null && delayMs > 0 && (
										<div className="flex items-center py-1 pl-7">
											<div className="flex h-10 w-5 items-center justify-center">
												<div className="h-full border-l border-dashed border-kumo-fill" />
											</div>
											<span className="ml-2 text-sm text-kumo-subtle">
												{formatDuration(nextDisplayed?.end, attempt.start)}
											</span>
										</div>
									)}
								</div>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
}

function WaitForEventDetails({
	step,
	workflowName,
	instanceId,
}: {
	step: StepData;
	workflowName?: string;
	instanceId?: string;
}): JSX.Element {
	const fullOutput = useFullStepOutput(step, workflowName, instanceId);
	const hasPayload = !!step.finished && !step.error;
	const hasError = !!step.error;
	const payload = resolveDisplayedOutput(step, fullOutput, hasPayload);

	return (
		<div
			className={
				hasPayload && hasError
					? "grid grid-cols-1 gap-4 md:grid-cols-2"
					: "space-y-4"
			}
		>
			{hasPayload && (
				<StepCodeCard
					label="Event Payload"
					content={payload.text ?? "N/A"}
					loading={payload.loading}
					note={payload.note}
				/>
			)}
			{hasError && (
				<StepCodeCard
					label={step.error?.name ?? "Error"}
					content={step.error?.message ?? "Unknown error"}
				/>
			)}
		</div>
	);
}
