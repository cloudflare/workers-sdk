import { Button, RefreshButton, Tooltip } from "@cloudflare/kumo";
import { ClockCountdownIcon, InfoIcon, PlusIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Breadcrumbs } from "../Breadcrumbs";
import { CronRowCard } from "./CronRowCard";
import { useCronTriggers } from "./CronTriggersContext";
import {
	ScheduledTimeControl,
	type ScheduledTimeSelection,
} from "./ScheduledTimeControl";
import type { CronRow } from "./types";
import type { JSX } from "react";

const CRON_CONFIGURATION_DOCS =
	"https://developers.cloudflare.com/workers/configuration/cron-triggers/";
const SCHEDULED_HANDLER_DOCS =
	"https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/";

export type CronTriggersView = "configured" | "ad-hoc";

export function CronTriggersPage({
	view,
}: {
	view: CronTriggersView;
}): JSX.Element {
	const cron = useCronTriggers();
	const workerName = cron.activeWorkerName ?? cron.fallbackWorkerName;
	const entry = cron.entry(workerName);
	const [focusRow, setFocusRow] = useState<string>();
	const [timeSelection, setTimeSelection] =
		useState<ScheduledTimeSelection>("now");
	const focusedRow = useRef<string | undefined>(undefined);
	const configured = entry.crons ?? [];
	const configuredRows = entry.configuredRows;
	const customRows = entry.customRows;
	const rows = view === "configured" ? configuredRows : customRows;
	const previousRows = useRef(rows.map((row) => row.id));
	const showNoConfiguration = entry.authoritative && configured.length === 0;
	const showPureNoConfiguration =
		view === "configured" &&
		showNoConfiguration &&
		!configuredRows.some((row) => row.source === "no-longer-configured");
	const title = view === "configured" ? "Configured Crons" : "Ad-Hoc Triggers";

	useEffect(() => {
		setTimeSelection("now");
	}, [workerName]);

	useEffect(() => {
		setTimeSelection((current) =>
			current !== "now" && !entry.timePresets.includes(current)
				? "now"
				: current
		);
	}, [entry.timePresets]);

	useEffect(() => {
		const nextRows = rows.map((row) => row.id);
		const focused = focusedRow.current;
		const activeElement = document.activeElement as HTMLElement | null;
		const activeRow =
			activeElement?.closest<HTMLElement>("[data-row-id]")?.dataset.rowId;
		if (
			focused &&
			!rows.some((row) => row.id === focused) &&
			activeRow === undefined &&
			(activeElement === document.body || activeElement === null)
		) {
			const previousIndex = previousRows.current.indexOf(focused);
			const target =
				nextRows[previousIndex] ?? nextRows[Math.max(0, previousIndex - 1)];
			requestAnimationFrame(() => {
				if (target) {
					document
						.querySelector<HTMLElement>(`[data-row-id="${target}"] button`)
						?.focus();
				} else {
					focusView(view);
				}
			});
		} else if (activeRow !== focused) {
			focusedRow.current = activeRow;
		}
		previousRows.current = nextRows;
	}, [rows, view]);

	function focusSoon(rowId: string | undefined): void {
		if (rowId) {
			setFocusRow(rowId);
			return;
		}
		requestAnimationFrame(() => {
			focusView(view);
		});
	}

	function renderRow(row: CronRow): JSX.Element {
		return (
			<CronRowCard
				focusRequested={focusRow === row.id}
				key={row.id}
				onFocusHandled={() => setFocusRow(undefined)}
				onRemove={() => {
					const index = rows.findIndex((candidate) => candidate.id === row.id);
					const nextFocus = rows[index + 1]?.id ?? rows[index - 1]?.id;
					cron.removeRow(workerName, row.id);
					focusSoon(nextFocus);
				}}
				onUpdate={(update) => cron.updateRow(workerName, row.id, update)}
				row={row}
				triggerEnabled={view === "ad-hoc" || !showNoConfiguration}
				trigger={() => {
					void cron.invoke(
						workerName,
						row.id,
						timeSelection === "now" ? Date.now() : timeSelection
					);
				}}
			/>
		);
	}

	function scheduledTimeControl(): JSX.Element {
		return (
			<ScheduledTimeControl
				onAddPreset={(epochMs) => cron.addTimePreset(workerName, epochMs)}
				onRemovePreset={(epochMs) => cron.removeTimePreset(workerName, epochMs)}
				onSelectionChange={setTimeSelection}
				presets={entry.timePresets}
				selection={timeSelection}
			/>
		);
	}

	return (
		<div className="flex min-h-full flex-col lg:h-full lg:min-h-0">
			<Breadcrumbs
				icon={ClockCountdownIcon}
				items={[<span key={view}>{title}</span>]}
				title={title}
			>
				<div className="ml-auto flex items-center gap-2">
					<Tooltip
						asChild
						content="Full invocation logs are available in the Observability tab for the Worker's owning dev session, when enabled."
					>
						<button
							aria-label="About invocation logs"
							className="focus-visible:ring-kumo-ring rounded-md p-1 text-kumo-subtle outline-none hover:bg-kumo-tint focus-visible:ring-2"
							type="button"
						>
							<InfoIcon size={16} />
						</button>
					</Tooltip>
					<RefreshButton
						aria-label="Refresh Cron Triggers"
						loading={cron.isRefreshing(workerName)}
						onClick={() => void cron.refresh(workerName)}
					/>
				</div>
			</Breadcrumbs>

			<div
				className="flex w-full flex-1 flex-col lg:min-h-0 lg:overflow-hidden"
				onFocusCapture={(event) => {
					focusedRow.current = (
						event.target as HTMLElement
					).closest<HTMLElement>("[data-row-id]")?.dataset.rowId;
				}}
			>
				{entry.stale && entry.authoritative ? <RefreshWarning /> : null}
				{!entry.authoritative ? (
					<UnavailableState onRefresh={() => void cron.refresh(workerName)} />
				) : showPureNoConfiguration ? (
					<NoConfigurationState />
				) : view === "configured" ? (
					<CronView title={title} view={view}>
						{showNoConfiguration ? (
							<NoConfigurationState />
						) : (
							scheduledTimeControl()
						)}
						<RowList>{configuredRows.map(renderRow)}</RowList>
					</CronView>
				) : (
					<CronView title={title} view={view}>
						{scheduledTimeControl()}
						<div className="flex flex-wrap items-center justify-between gap-3 border-b border-kumo-fill bg-kumo-base px-5 py-4">
							<p className="text-sm text-kumo-subtle">
								Ad-hoc triggers are stored locally and do not modify your Worker
								configuration.
							</p>
							<Button
								data-add-custom
								icon={PlusIcon}
								onClick={() => focusSoon(cron.addCustom(workerName))}
								size="sm"
								variant="secondary"
							>
								Add trigger
							</Button>
						</div>
						<RowList>
							{customRows.length === 0 ? (
								<p className="px-1 py-2 text-sm text-kumo-subtle">
									Ad-hoc triggers you add appear here.
								</p>
							) : null}
							{customRows.map(renderRow)}
						</RowList>
					</CronView>
				)}
			</div>
		</div>
	);
}

function CronView({
	children,
	title,
	view,
}: {
	children: React.ReactNode;
	title: string;
	view: CronTriggersView;
}): JSX.Element {
	return (
		<section
			aria-label={title}
			className="flex min-w-0 flex-1 flex-col overflow-hidden bg-kumo-elevated lg:min-h-0"
			data-cron-view={view}
		>
			{children}
		</section>
	);
}

function RowList({ children }: { children: React.ReactNode }): JSX.Element {
	return (
		<div
			className="grid content-start gap-4 p-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
			data-cron-row-list
		>
			{children}
		</div>
	);
}

function focusView(view: CronTriggersView): void {
	document
		.querySelector<HTMLElement>(
			`[data-cron-view="${view}"] [data-add-custom], [data-cron-view="${view}"] [data-row-id] button, [data-cron-heading]`
		)
		?.focus();
}

function RefreshWarning(): JSX.Element {
	return (
		<div
			className="rounded-lg border border-kumo-warning bg-kumo-warning/10 px-4 py-3 text-sm text-kumo-default"
			role="status"
		>
			Cron Triggers could not be refreshed. Existing rows may be stale; check
			your development console.
		</div>
	);
}

function UnavailableState({
	onRefresh,
}: {
	onRefresh: () => void;
}): JSX.Element {
	return (
		<section className="rounded-lg border border-kumo-fill bg-kumo-elevated px-5 py-10 text-center">
			<h2
				className="text-lg font-semibold text-kumo-default"
				data-cron-heading
				tabIndex={-1}
			>
				Cron Triggers are unavailable
			</h2>
			<p className="mx-auto mt-1 max-w-lg text-sm text-kumo-subtle">
				Worker metadata could not be loaded. Check your development console and
				try again.
			</p>
			<Button className="mt-4" onClick={onRefresh} variant="secondary">
				Refresh
			</Button>
		</section>
	);
}

function NoConfigurationState(): JSX.Element {
	return (
		<section className="rounded-lg border border-kumo-fill bg-kumo-elevated px-5 py-10 text-center">
			<h2
				className="text-lg font-semibold text-kumo-default"
				data-cron-heading
				tabIndex={-1}
			>
				No Cron Triggers configured
			</h2>
			<p className="mx-auto mt-1 max-w-xl text-sm text-kumo-subtle">
				Configure at least one Cron Trigger to test this Worker. Its scheduled()
				handler consumes Cron Trigger invocations.
			</p>
			<p className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm">
				<a
					className="text-kumo-link underline"
					href={CRON_CONFIGURATION_DOCS}
					target="_blank"
					rel="noreferrer"
				>
					Configure Cron Triggers
				</a>
				<a
					className="text-kumo-link underline"
					href={SCHEDULED_HANDLER_DOCS}
					target="_blank"
					rel="noreferrer"
				>
					Scheduled Handler documentation
				</a>
			</p>
		</section>
	);
}
