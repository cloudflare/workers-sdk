import { Button, Tooltip } from "@cloudflare/kumo";
import { CopyIcon, InfoIcon, TrashIcon } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import {
	changeCronBuilderKind,
	cronBuilderKinds,
	cronWeekdays,
	generateCronExpression,
} from "./cron-builder";
import type { CronBuilderDraft, CronRow, CronWeekday } from "./types";
import type { JSX } from "react";

const CRON_CONFIGURATION_DOCS =
	"https://developers.cloudflare.com/workers/configuration/cron-triggers/";

interface CronRowCardProps {
	focusRequested: boolean;
	onFocusHandled: () => void;
	onRemove: () => void;
	onUpdate: (update: (row: CronRow) => CronRow) => void;
	row: CronRow;
	trigger: () => void;
	triggerEnabled: boolean;
}

export function CronRowCard({
	focusRequested,
	onFocusHandled,
	onRemove,
	onUpdate,
	row,
	trigger,
	triggerEnabled,
}: CronRowCardProps): JSX.Element {
	const inputRef = useRef<HTMLInputElement>(null);
	const actionRef = useRef<HTMLButtonElement>(null);
	const pending = row.invocation?.status === "pending";
	const cronValid = row.cron.trim() !== "";
	const canTrigger = triggerEnabled && !pending && cronValid;

	useEffect(() => {
		if (focusRequested) {
			if (row.source === "configured") {
				actionRef.current?.focus();
			} else {
				inputRef.current?.focus();
			}
			onFocusHandled();
		}
	}, [focusRequested, onFocusHandled, row.source]);

	function activateTrigger(): void {
		if (!canTrigger) {
			return;
		}
		trigger();
	}

	return (
		<section
			className="@container/cron-row rounded-lg border border-kumo-fill bg-kumo-base p-3"
			data-row-id={row.id}
		>
			{row.source === "no-longer-configured" ? (
				<div className="grid min-w-0 gap-1">
					<h2 className="text-base font-semibold text-kumo-default">
						No longer configured
					</h2>
					<p className="text-sm text-kumo-subtle">
						This row is retained for this page session only. See the{" "}
						<a
							className="text-kumo-link underline"
							href={CRON_CONFIGURATION_DOCS}
							target="_blank"
							rel="noreferrer"
						>
							supported expressions
						</a>
						.
					</p>
				</div>
			) : null}

			<div
				className={`flex min-w-0 items-start gap-2 ${row.source === "no-longer-configured" ? "mt-3" : ""}`}
			>
				<div className="grid min-w-0 flex-1 gap-1">
					<input
						aria-describedby={
							!cronValid && row.cronInputMode !== "builder"
								? `${row.id}-cron-error`
								: undefined
						}
						aria-invalid={!cronValid && row.cronInputMode !== "builder"}
						aria-label="Cron expression"
						className="focus-visible:ring-kumo-ring h-9 w-full min-w-0 rounded-md border border-kumo-fill bg-kumo-elevated px-3 font-mono text-sm text-kumo-default outline-none focus:border-kumo-brand focus-visible:ring-2 disabled:text-kumo-subtle"
						disabled={pending}
						onChange={(event) =>
							onUpdate((current) => ({
								...current,
								cron: event.target.value,
								cronInputMode: "expression",
							}))
						}
						ref={inputRef}
						readOnly={row.source === "configured"}
						value={row.cron}
					/>
					{!cronValid && row.cronInputMode !== "builder" ? (
						<span
							className="text-sm font-normal text-kumo-danger"
							id={`${row.id}-cron-error`}
						>
							Enter a non-empty cron expression.
						</span>
					) : null}
				</div>
				<div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
					<Button
						aria-disabled={!canTrigger}
						className="h-9"
						onClick={activateTrigger}
						ref={actionRef}
					>
						{pending ? "Running…" : "Trigger"}
					</Button>
					<Tooltip asChild content="Copy cron expression">
						<Button
							aria-label="Copy expression"
							className="h-9 w-9"
							icon={CopyIcon}
							onClick={() => {
								void navigator.clipboard.writeText(row.cron).catch(() => {});
							}}
							shape="square"
							variant="ghost"
						/>
					</Tooltip>
					{row.source !== "configured" ? (
						<Tooltip asChild content="Remove row">
							<Button
								aria-disabled={pending}
								aria-label="Remove row"
								className="h-9 w-9"
								icon={TrashIcon}
								onClick={() => {
									if (!pending) {
										onRemove();
									}
								}}
								shape="square"
								variant="secondary-destructive"
							/>
						</Tooltip>
					) : null}
				</div>
			</div>

			<div className="mt-3 grid gap-3">
				{row.source !== "configured" ? (
					<div
						className="grid min-w-0 content-start gap-3"
						data-cron-expression-controls
					>
						<ModeGroup
							label="Cron entry mode"
							disabled={pending}
							onChange={(mode) =>
								onUpdate((current) => ({
									...current,
									cronInputMode: mode,
								}))
							}
							options={[
								{ label: "Expression", value: "expression" },
								{ label: "Build expression", value: "builder" },
							]}
							value={row.cronInputMode}
						/>

						{row.cronInputMode === "builder" ? (
							<CronBuilder
								disabled={pending}
								onUpdate={(draft) =>
									onUpdate((current) => {
										const generated = generateCronExpression(draft);
										return {
											...current,
											cron: generated.expression ?? current.cron,
											cronBuilder: draft,
										};
									})
								}
								rowId={row.id}
								value={row.cronBuilder}
							/>
						) : null}
					</div>
				) : null}
				<InvocationResult row={row} />
			</div>
		</section>
	);
}

function ModeGroup<T extends string>({
	disabled,
	label,
	onChange,
	options,
	value,
}: {
	disabled: boolean;
	label: string;
	onChange: (value: T) => void;
	options: Array<{ label: string; value: T }>;
	value: T;
}): JSX.Element {
	return (
		<div aria-label={label} className="flex flex-wrap gap-1" role="group">
			{options.map((option) => (
				<button
					aria-pressed={value === option.value}
					className="focus-visible:ring-kumo-ring rounded-md border border-kumo-fill px-3 py-1.5 text-sm text-kumo-default outline-none focus-visible:ring-2 disabled:text-kumo-subtle aria-pressed:border-kumo-brand aria-pressed:bg-kumo-tint"
					disabled={disabled}
					key={option.value}
					onClick={() => onChange(option.value)}
					type="button"
				>
					{option.label}
				</button>
			))}
		</div>
	);
}

function CronBuilder({
	disabled,
	onUpdate,
	rowId,
	value,
}: {
	disabled: boolean;
	onUpdate: (draft: CronBuilderDraft) => void;
	rowId: string;
	value: CronBuilderDraft;
}): JSX.Element {
	const generated = generateCronExpression(value);
	function updateField(field: string, nextValue: string | CronWeekday[]): void {
		onUpdate({ ...value, [field]: nextValue } as CronBuilderDraft);
	}
	return (
		<fieldset
			className="@container grid min-w-0 gap-3 rounded-md border border-kumo-fill px-4 py-3"
			disabled={disabled}
		>
			<legend className="px-1 text-sm font-medium text-kumo-default">
				<span className="inline-flex items-center gap-1">
					Build a Cron expression (UTC)
					<Tooltip
						asChild
						content={
							<div className="max-w-80 text-sm">
								Step values start at the field minimum and reset at its
								boundary. Day steps start on day 1; month steps start in
								January. Dates 29–31 do not run in months without that date. W
								selects the nearest weekday, LW the last weekday, weekday L the
								last named weekday, and # an occurrence of a named weekday in
								the month.
							</div>
						}
					>
						<button
							aria-label="Cron builder help"
							className="focus-visible:ring-kumo-ring inline-flex h-5 w-5 items-center justify-center rounded-md text-kumo-subtle outline-none hover:bg-kumo-tint focus-visible:ring-2"
							type="button"
						>
							<InfoIcon size={14} />
						</button>
					</Tooltip>
				</span>
			</legend>
			<label className="grid min-w-0 gap-1 text-sm text-kumo-default">
				Schedule
				<select
					className="h-9 w-full min-w-0 rounded-md border border-kumo-fill bg-kumo-base px-3"
					onChange={(event) =>
						onUpdate(
							changeCronBuilderKind(
								event.target.value as CronBuilderDraft["kind"]
							)
						)
					}
					value={value.kind}
				>
					{cronBuilderKinds.map((kind) => (
						<option key={kind.value} value={kind.value}>
							{kind.label}
						</option>
					))}
				</select>
			</label>
			<div className="grid min-w-0 grid-cols-1 gap-3 @md:grid-cols-2">
				{"every" in value ? (
					<BuilderNumber
						errors={generated.errors}
						field="every"
						label="Every"
						onChange={updateField}
						rowId={rowId}
						value={value.every}
					/>
				) : null}
				{"dayOfMonth" in value ? (
					<BuilderNumber
						errors={generated.errors}
						field="dayOfMonth"
						label="Day of month (1 = first day)"
						onChange={updateField}
						rowId={rowId}
						value={value.dayOfMonth}
					/>
				) : null}
				{"hour" in value ? (
					<BuilderNumber
						errors={generated.errors}
						field="hour"
						label="Hour"
						onChange={updateField}
						rowId={rowId}
						value={value.hour}
					/>
				) : null}
				{"minute" in value ? (
					<BuilderNumber
						errors={generated.errors}
						field="minute"
						label="Minute"
						onChange={updateField}
						rowId={rowId}
						value={value.minute}
					/>
				) : null}
				{"occurrence" in value ? (
					<BuilderNumber
						errors={generated.errors}
						field="occurrence"
						label="Occurrence"
						onChange={updateField}
						rowId={rowId}
						value={value.occurrence}
					/>
				) : null}
				{"weekday" in value ? (
					<label className="grid min-w-0 gap-1 text-sm text-kumo-default">
						Weekday
						<select
							className="h-9 w-full min-w-0 rounded-md border border-kumo-fill bg-kumo-base px-3"
							onChange={(event) => updateField("weekday", event.target.value)}
							value={value.weekday}
						>
							{cronWeekdays.map((weekday) => (
								<option key={weekday} value={weekday}>
									{weekday}
								</option>
							))}
						</select>
					</label>
				) : null}
			</div>
			{value.kind === "weekdays" ? (
				<div
					aria-describedby={
						generated.errors.weekdays ? `${rowId}-weekdays-error` : undefined
					}
					aria-invalid={Boolean(generated.errors.weekdays)}
					aria-label="Weekdays"
					className="flex flex-wrap items-center gap-3"
					role="group"
				>
					{cronWeekdays.map((weekday) => (
						<label className="flex items-center gap-1.5 text-sm" key={weekday}>
							<input
								checked={value.weekdays.includes(weekday)}
								onChange={(event) =>
									updateField(
										"weekdays",
										event.target.checked
											? [...value.weekdays, weekday]
											: value.weekdays.filter((item) => item !== weekday)
									)
								}
								type="checkbox"
							/>
							{weekday}
						</label>
					))}
					{generated.errors.weekdays ? (
						<span
							className="text-sm text-kumo-danger"
							id={`${rowId}-weekdays-error`}
						>
							{generated.errors.weekdays}
						</span>
					) : null}
				</div>
			) : null}
		</fieldset>
	);
}

function BuilderNumber({
	errors,
	field,
	label,
	onChange,
	rowId,
	value,
}: {
	errors: Record<string, string>;
	field: string;
	label: string;
	onChange: (field: string, value: string) => void;
	rowId: string;
	value: string;
}): JSX.Element {
	const error = errors[field];
	const errorSeparator = error?.indexOf(" must ") ?? -1;
	const errorMessage =
		error && errorSeparator >= 0
			? `must ${error.slice(errorSeparator + " must ".length)}`
			: error;
	const inputId = `${rowId}-${field}-input`;
	return (
		<div className="grid min-w-0 gap-1 text-sm">
			<div className="flex min-w-0 flex-wrap items-baseline gap-x-1">
				<label className="text-kumo-default" htmlFor={inputId}>
					{label}
				</label>
				{errorMessage ? (
					<span className="text-kumo-danger" id={`${rowId}-${field}-error`}>
						{errorMessage}
					</span>
				) : null}
			</div>
			<input
				aria-describedby={error ? `${rowId}-${field}-error` : undefined}
				aria-invalid={Boolean(error)}
				className="h-9 w-full min-w-0 rounded-md border border-kumo-fill bg-kumo-base px-3"
				id={inputId}
				inputMode="numeric"
				onChange={(event) => onChange(field, event.target.value)}
				value={value}
			/>
		</div>
	);
}

function InvocationResult({ row }: { row: CronRow }): JSX.Element | null {
	const invocation = row.invocation;
	if (!invocation) {
		return null;
	}
	return (
		<div
			aria-live="polite"
			className="rounded-md bg-kumo-elevated px-4 py-3 text-sm text-kumo-default"
		>
			{invocation.status === "pending" ? <p>Invocation is running…</p> : null}
			{invocation.status === "error" ? (
				<p className="text-kumo-danger">{invocation.error}</p>
			) : null}
			{invocation.status === "result" && invocation.result ? (
				<div className="grid gap-1">
					<p>
						Outcome:{" "}
						<span className="font-medium">{invocation.result.outcome}</span>
					</p>
					<p>
						{invocation.result.noRetry
							? "noRetry() was requested; this remains a one-off local test."
							: "noRetry() was not requested."}
					</p>
				</div>
			) : null}
			<div className="mt-2 grid gap-1 text-kumo-subtle">
				<p>
					Dispatched cron:{" "}
					<code className="text-[0.9em]">{invocation.cron}</code>
				</p>
				<p>
					Scheduled time:{" "}
					<code className="text-[0.9em]">
						{new Date(invocation.scheduledTime).toISOString()}
					</code>{" "}
					({invocation.scheduledTime} ms)
				</p>
			</div>
		</div>
	);
}
