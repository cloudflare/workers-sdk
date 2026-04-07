import { Loader } from "@cloudflare/kumo";
import { CheckIcon, PlusIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { CopyButton } from "./CopyButton";
import { formatDuration, formatJson } from "./helpers";
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
			<div className="flex size-5 items-center justify-center rounded bg-kumo-danger">
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
			<div className="bg-kumo-success flex size-5 items-center justify-center rounded">
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
	waitForEvent: "bg-kumo-brand/10 text-kumo-brand",
};

export function StepRow({ step }: { step: StepData }): JSX.Element {
	const [expanded, setExpanded] = useState(false);

	const hasDetails =
		step.type === "step" ||
		(step.type === "waitForEvent" &&
			(step.error || step.output !== undefined || step.finished));

	return (
		<div className="border-b border-kumo-fill p-1 last:border-b-0">
			{/* Collapsed row */}
			<div
				className={`grid h-10 grid-cols-[20px_1fr_160px_160px_80px_24px] items-center gap-3 rounded-lg px-2 transition-colors ${hasDetails ? "cursor-pointer hover:bg-kumo-fill" : ""}`}
				onClick={hasDetails ? () => setExpanded(!expanded) : undefined}
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
						{step.name ?? "Unknown step"}
					</span>
				</div>

				<Timestamp value={step.start} />
				<Timestamp value={step.end} />
				<span className="text-sm text-kumo-subtle">
					{formatDuration(step.start, step.end)}
				</span>

				<div className="flex items-center justify-center">
					{hasDetails ? (
						<PlusIcon
							size={14}
							className={`text-kumo-subtle transition-transform ${expanded ? "rotate-45" : ""}`}
						/>
					) : (
						<div className="w-6" />
					)}
				</div>
			</div>

			{/* Expanded detail panel */}
			{expanded && hasDetails && (
				<div className="-mx-1 -mb-1">
					<div className="mt-1 h-2 rounded-t-lg border-t border-kumo-fill" />
					<div className="px-4 pt-3 pb-4">
						{step.type === "step" && <StepDoDetails step={step} />}
						{step.type === "waitForEvent" && (
							<WaitForEventDetails step={step} />
						)}
					</div>
				</div>
			)}
		</div>
	);
}

function StepCodeCard({
	label,
	content,
}: {
	label: string;
	content: string;
}): JSX.Element {
	return (
		<div>
			<h5 className="mb-2 text-sm font-medium text-kumo-default">{label}</h5>
			<div className="relative overflow-hidden rounded-lg border border-kumo-fill bg-kumo-base">
				<ScrollableCodeBlock content={content} />
				<div className="absolute top-1.5 right-1.5">
					<CopyButton text={content} label={`Copy ${label.toLowerCase()}`} />
				</div>
			</div>
		</div>
	);
}

function StepDoDetails({ step }: { step: StepData }): JSX.Element {
	// Get error text from last failed attempt
	const failedAttempt =
		step.success === false && step.attempts
			? [...step.attempts].reverse().find((a) => a.error)
			: null;
	const errorText = failedAttempt?.error
		? `${failedAttempt.error.name}: ${failedAttempt.error.message}`
		: null;
	const outputText =
		step.success === true && step.output !== undefined
			? formatJson(step.output)
			: null;

	// Left side: output or error. Right side: config.
	const leftLabel = errorText ? "Error" : "Output";
	const leftContent = errorText ?? outputText ?? "N/A";
	const configContent = step.config ? formatJson(step.config) : null;

	return (
		<div className="space-y-4">
			{/* Output/Error + Config side by side */}
			<div className={configContent ? "grid grid-cols-2 gap-4" : ""}>
				<StepCodeCard label={leftLabel} content={leftContent} />
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

function WaitForEventDetails({ step }: { step: StepData }): JSX.Element {
	const hasPayload = step.finished && !step.error;
	const hasError = !!step.error;

	return (
		<div
			className={
				hasPayload && hasError ? "grid grid-cols-2 gap-4" : "space-y-4"
			}
		>
			{hasPayload && (
				<StepCodeCard label="Event Payload" content={formatJson(step.output)} />
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
