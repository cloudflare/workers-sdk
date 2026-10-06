import { Button, Select, Tooltip } from "@cloudflare/kumo";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import {
	formatUtcCalendarValue,
	parseEpochMilliseconds,
	resolveUtcCalendarTime,
} from "./scheduled-time";
import type { CustomTimeInputMode } from "./types";
import type { JSX } from "react";

export type ScheduledTimeSelection = "now" | number;

export function ScheduledTimeControl({
	onAddPreset,
	onRemovePreset,
	onSelectionChange,
	presets,
	selection,
}: {
	onAddPreset: (epochMs: number) => void;
	onRemovePreset: (epochMs: number) => void;
	onSelectionChange: (selection: ScheduledTimeSelection) => void;
	presets: number[];
	selection: ScheduledTimeSelection;
}): JSX.Element {
	const [adding, setAdding] = useState(false);
	const [inputMode, setInputMode] = useState<CustomTimeInputMode>("calendar");
	const [calendarValue, setCalendarValue] = useState("");
	const [epochValue, setEpochValue] = useState("");
	const calendar = useMemo(
		() => (calendarValue ? resolveUtcCalendarTime(calendarValue) : undefined),
		[calendarValue]
	);
	const epoch = useMemo(() => parseEpochMilliseconds(epochValue), [epochValue]);
	const candidate =
		inputMode === "calendar"
			? calendar?.kind === "exact"
				? calendar.epochMs
				: undefined
			: epoch.epochMs;

	function beginAdding(): void {
		const now = Date.now();
		setInputMode("calendar");
		setCalendarValue(formatUtcCalendarValue(now));
		setEpochValue(String(now));
		setAdding(true);
	}

	function savePreset(): void {
		if (candidate === undefined) {
			return;
		}
		onAddPreset(candidate);
		onSelectionChange(candidate);
		setAdding(false);
	}

	return (
		<section
			aria-label="Scheduled time controls"
			className="grid gap-3 border-b border-kumo-fill bg-kumo-base px-5 py-3"
		>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="grid gap-0.5">
					<h2 className="text-base font-semibold text-kumo-default">
						Scheduled time
					</h2>
					<p className="text-sm text-kumo-subtle">
						Selected epoch:{" "}
						{selection === "now" ? (
							"now"
						) : (
							<>
								<code className="text-[0.9em]">{selection}</code> ms
							</>
						)}
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<label className="flex items-center gap-1.5 text-sm text-kumo-subtle">
						Trigger at
						<Select
							aria-label="Scheduled time"
							className="min-w-64"
							onValueChange={(nextValue) => {
								const value = String(nextValue);
								onSelectionChange(
									value === "now" ? "now" : Number(value.slice(7))
								);
							}}
							renderValue={(value) =>
								value === "now" ? (
									<span className="text-kumo-subtle">Now</span>
								) : (
									new Date(Number(String(value).slice(7))).toISOString()
								)
							}
							value={selection === "now" ? "now" : `preset:${selection}`}
						>
							<Select.Option value="now">Now</Select.Option>
							{presets.map((preset) => (
								<Select.Option key={preset} value={`preset:${preset}`}>
									{new Date(preset).toISOString()}
								</Select.Option>
							))}
						</Select>
					</label>
					<Button icon={PlusIcon} onClick={beginAdding} variant="secondary">
						Add preset
					</Button>
					<Tooltip asChild content="Remove preset">
						<Button
							aria-disabled={selection === "now"}
							aria-label="Remove preset"
							className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
							icon={TrashIcon}
							onClick={() => {
								if (selection === "now") {
									return;
								}
								onRemovePreset(selection);
								onSelectionChange("now");
							}}
							shape="square"
							variant="secondary-destructive"
						/>
					</Tooltip>
				</div>
			</div>

			{adding ? (
				<fieldset className="grid gap-2 rounded-lg px-4 py-2 ring ring-kumo-line">
					<legend className="px-1 text-sm font-medium text-kumo-default">
						Add scheduled time preset
					</legend>
					<div
						aria-label="Preset time input"
						className="flex flex-wrap gap-1"
						role="group"
					>
						{(
							[
								["calendar", "Date and time (UTC)"],
								["epoch", "Epoch milliseconds"],
							] as const
						).map(([value, label]) => (
							<button
								aria-pressed={inputMode === value}
								className="focus-visible:ring-kumo-ring rounded-md border border-kumo-fill px-3 py-1.5 text-sm text-kumo-default outline-none focus-visible:ring-2 aria-pressed:border-kumo-brand aria-pressed:bg-kumo-tint"
								key={value}
								onClick={() => setInputMode(value)}
								type="button"
							>
								{label}
							</button>
						))}
					</div>

					<div className="flex flex-wrap items-end gap-2">
						{inputMode === "calendar" ? (
							<label className="grid max-w-md min-w-64 flex-1 gap-1 text-sm text-kumo-default">
								Date and time (UTC)
								<input
									aria-describedby={
										calendar?.kind === "invalid"
											? "cron-preset-calendar-error"
											: undefined
									}
									aria-invalid={calendar?.kind === "invalid"}
									className="h-9 w-full rounded-md border border-kumo-fill bg-kumo-base px-3 text-sm"
									onChange={(event) => setCalendarValue(event.target.value)}
									step="0.001"
									type="datetime-local"
									value={calendarValue}
								/>
							</label>
						) : (
							<label className="grid max-w-md min-w-64 flex-1 gap-1 text-sm text-kumo-default">
								Epoch milliseconds
								<input
									aria-describedby={
										epoch.error ? "cron-preset-epoch-error" : undefined
									}
									aria-invalid={Boolean(epoch.error)}
									className="h-9 w-full rounded-md border border-kumo-fill bg-kumo-base px-3 font-mono text-sm"
									inputMode="numeric"
									onChange={(event) => setEpochValue(event.target.value)}
									value={epochValue}
								/>
							</label>
						)}
						<div className="flex shrink-0 gap-2">
							<Button onClick={() => setAdding(false)} variant="secondary">
								Cancel
							</Button>
							<Button
								disabled={candidate === undefined}
								onClick={savePreset}
								variant="primary"
							>
								Save preset
							</Button>
						</div>
					</div>
					{calendar?.kind === "invalid" && inputMode === "calendar" ? (
						<p
							className="text-sm text-kumo-danger"
							id="cron-preset-calendar-error"
						>
							{calendar.error}
						</p>
					) : null}
					{epoch.error && inputMode === "epoch" ? (
						<p
							className="text-sm text-kumo-danger"
							id="cron-preset-epoch-error"
						>
							{epoch.error}
						</p>
					) : null}
				</fieldset>
			) : null}
		</section>
	);
}
