import { Button, RefreshButton, Tooltip } from "@cloudflare/kumo";
import { ClockCountdownIcon, InfoIcon, PlusIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Breadcrumbs } from "../Breadcrumbs";
import { CronRowCard } from "./CronRowCard";
import { useCronTriggers } from "./CronTriggersContext";
import type { CronRow } from "./types";
import type { JSX } from "react";

const CRON_CONFIGURATION_DOCS =
	"https://developers.cloudflare.com/workers/configuration/cron-triggers/";
const SCHEDULED_HANDLER_DOCS =
	"https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/";

export function CronTriggersPage({
	activeWorkerName,
}: {
	activeWorkerName?: string;
}): JSX.Element {
	const cron = useCronTriggers();
	const workerName = activeWorkerName ?? cron.fallbackWorkerName;
	const entry = cron.entry(workerName);
	const [focusRow, setFocusRow] = useState<string>();
	const focusedRow = useRef<string | undefined>(undefined);
	const configured = entry.crons ?? [];
	const configuredRows = entry.rows.filter((row) => row.source !== "custom");
	const customRows = entry.rows.filter((row) => row.source === "custom");
	const previousPaneRows = useRef({
		configured: configuredRows.map((row) => row.id),
		custom: customRows.map((row) => row.id),
	});
	const showNoConfiguration = entry.authoritative && configured.length === 0;
	const canAddCustom = configured.length > 0;

	useEffect(() => {
		const nextPaneRows = {
			configured: entry.rows
				.filter((row) => row.source !== "custom")
				.map((row) => row.id),
			custom: entry.rows
				.filter((row) => row.source === "custom")
				.map((row) => row.id),
		};
		const focused = focusedRow.current;
		const activeElement = document.activeElement as HTMLElement | null;
		const activeRow =
			activeElement?.closest<HTMLElement>("[data-row-id]")?.dataset.rowId;
		if (
			focused &&
			!entry.rows.some((row) => row.id === focused) &&
			activeRow === undefined &&
			(activeElement === document.body || activeElement === null)
		) {
			const pane = previousPaneRows.current.custom.includes(focused)
				? "custom"
				: "configured";
			const previousIndex = previousPaneRows.current[pane].indexOf(focused);
			const nextRows = nextPaneRows[pane];
			const target =
				nextRows[previousIndex] ?? nextRows[Math.max(0, previousIndex - 1)];
			requestAnimationFrame(() => {
				if (target) {
					document
						.querySelector<HTMLElement>(`[data-row-id="${target}"] button`)
						?.focus();
				} else {
					focusPane(pane);
				}
			});
		} else if (activeRow !== focused) {
			focusedRow.current = activeRow;
		}
		previousPaneRows.current = nextPaneRows;
	}, [entry.rows]);

	function focusSoon(rowId: string | undefined, pane?: CronPaneKind): void {
		if (rowId) {
			setFocusRow(rowId);
			return;
		}
		requestAnimationFrame(() => {
			if (pane) {
				focusPane(pane);
			} else {
				document
					.querySelector<HTMLElement>("[data-add-custom], [data-cron-heading]")
					?.focus();
			}
		});
	}

	function renderRow(row: CronRow): JSX.Element {
		return (
			<CronRowCard
				focusRequested={focusRow === row.id}
				key={row.id}
				onFocusHandled={() => setFocusRow(undefined)}
				onDuplicate={() => focusSoon(cron.duplicateRow(workerName, row.id))}
				onRemove={() => {
					const pane = row.source === "custom" ? "custom" : "configured";
					const paneRows = pane === "custom" ? customRows : configuredRows;
					const index = paneRows.findIndex(
						(candidate) => candidate.id === row.id
					);
					const nextFocus = paneRows[index + 1]?.id ?? paneRows[index - 1]?.id;
					cron.removeRow(workerName, row.id);
					focusSoon(nextFocus, pane);
				}}
				onUpdate={(update) => cron.updateRow(workerName, row.id, update)}
				row={row}
				trigger={(scheduledTime) =>
					void cron.invoke(workerName, row.id, scheduledTime)
				}
			/>
		);
	}

	return (
		<div className="flex min-h-full flex-col lg:h-full lg:min-h-0">
			<Breadcrumbs
				icon={ClockCountdownIcon}
				items={[<span key="cron-triggers">Cron Triggers</span>]}
				title="Cron Triggers"
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
				) : (
					<>
						{showNoConfiguration ? <NoConfigurationState /> : null}
						{entry.rows.length > 0 ? (
							<div className="grid lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-1">
								<CronPane pane="configured" title="Configured crons">
									{configuredRows.map(renderRow)}
								</CronPane>

								<CronPane
									action={
										canAddCustom ? (
											<Button
												data-add-custom
												icon={PlusIcon}
												onClick={() => focusSoon(cron.addCustom(workerName))}
												size="sm"
												variant="secondary"
											>
												Add draft
											</Button>
										) : null
									}
									help="Draft crons are stored locally and do not modify your Worker configuration."
									pane="custom"
									title="Draft crons"
								>
									{customRows.length === 0 ? (
										<p className="px-1 py-2 text-sm text-kumo-subtle">
											Draft crons you add or duplicate appear here.
										</p>
									) : null}
									{customRows.map(renderRow)}
								</CronPane>
							</div>
						) : null}
					</>
				)}
			</div>
		</div>
	);
}

function CronPane({
	action,
	children,
	help,
	pane,
	title,
}: {
	action?: JSX.Element | null;
	children: React.ReactNode;
	help?: string;
	pane: CronPaneKind;
	title: string;
}): JSX.Element {
	return (
		<section
			aria-label={title}
			className={`flex min-w-0 flex-col overflow-hidden border border-kumo-fill bg-kumo-elevated lg:min-h-0 ${pane === "configured" ? "border-b-0 lg:border-r-0 lg:border-b" : "lg:border-l-0"}`}
			data-cron-pane={pane}
		>
			<header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-kumo-fill bg-kumo-base px-5">
				<div className="inline-flex items-center gap-1">
					<h2
						className="text-base font-semibold text-kumo-default"
						data-cron-pane-heading
						tabIndex={-1}
					>
						{title}
					</h2>
					{help ? (
						<Tooltip asChild content={help}>
							<button
								aria-label={`${title} help`}
								className="focus-visible:ring-kumo-ring inline-flex h-5 w-5 items-center justify-center rounded-md text-kumo-subtle outline-none hover:bg-kumo-tint focus-visible:ring-2"
								type="button"
							>
								<InfoIcon size={14} />
							</button>
						</Tooltip>
					) : null}
				</div>
				{action}
			</header>
			<div
				className={`grid content-start gap-4 p-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto ${pane === "configured" ? "lg:pr-2" : "lg:pl-2"}`}
				data-cron-pane-scroll
			>
				{children}
			</div>
		</section>
	);
}

type CronPaneKind = "configured" | "custom";

function focusPane(pane: CronPaneKind): void {
	document
		.querySelector<HTMLElement>(
			`[data-cron-pane="${pane}"] [data-add-custom], [data-cron-pane="${pane}"] [data-cron-pane-heading], [data-cron-heading]`
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
