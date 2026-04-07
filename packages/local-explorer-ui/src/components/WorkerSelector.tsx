import { Select } from "@cloudflare/kumo/primitives/select";
import {
	CaretUpDownIcon,
	CheckIcon,
	TerminalIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import type { LocalExplorerWorker } from "../api";

// Re-export the type for convenience
export type { LocalExplorerWorker };

// Internal workers that should be hidden from users
// These are infrastructure workers created by the Vite plugin and other tooling
const INTERNAL_WORKER_NAMES = new Set([
	"__router-worker__",
	"__asset-worker__",
	"__vite_proxy_worker__",
]);

/**
 * Check if a worker name is an internal worker that should be hidden
 */
export function isInternalWorker(workerName: string): boolean {
	return INTERNAL_WORKER_NAMES.has(workerName);
}

/**
 * Filter out internal workers from a list of workers
 */
export function filterVisibleWorkers(
	workers: LocalExplorerWorker[]
): LocalExplorerWorker[] {
	return workers.filter((w) => !isInternalWorker(w.name));
}

interface WorkerSelectorProps {
	workers: LocalExplorerWorker[];
	selectedWorker: string;
	onWorkerChange: (workerName: string) => void;
}

export function WorkerSelector({
	workers,
	selectedWorker,
	onWorkerChange,
}: WorkerSelectorProps): JSX.Element {
	const [open, setOpen] = useState(false);

	const handleValueChange = (value: string | null): void => {
		if (value === null) {
			return;
		}
		onWorkerChange(value);
	};

	// Find the current worker that is hosting this explorer (isSelf = true)
	const selfWorker = workers.find((w) => w.isSelf);

	return (
		<div className="px-4 py-2">
			<Select.Root
				onOpenChange={setOpen}
				onValueChange={handleValueChange}
				open={open}
				value={selectedWorker}
			>
				<Select.Trigger className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-kumo-fill bg-kumo-base px-3 py-2 text-sm text-kumo-default transition-colors hover:bg-kumo-elevated data-popup-open:border-kumo-brand">
					<span className="flex items-center gap-2 truncate">
						<TerminalIcon className="h-4 w-4 shrink-0 text-kumo-subtle" />
						<span className="truncate">{selectedWorker}</span>
					</span>
					<Select.Icon>
						<CaretUpDownIcon className="h-3.5 w-3.5 shrink-0 text-kumo-subtle" />
					</Select.Icon>
				</Select.Trigger>

				<Select.Portal>
					<Select.Positioner
						align="start"
						alignItemWithTrigger={false}
						className="z-100"
						side="bottom"
						sideOffset={4}
					>
						<Select.Popup className="max-h-72 min-w-48 overflow-hidden rounded-lg border border-kumo-fill bg-kumo-base shadow-[0_4px_12px_rgba(0,0,0,0.15)] transition-[opacity,transform] duration-150 data-ending-style:-translate-y-1 data-ending-style:opacity-0 data-starting-style:-translate-y-1 data-starting-style:opacity-0">
							<Select.List className="p-1">
								{workers.map((worker) => {
									const isSelected = selectedWorker === worker.name;
									const Icon = isSelected ? CheckIcon : TerminalIcon;

									return (
										<Select.Item
											className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-kumo-default transition-colors outline-none select-none data-highlighted:bg-kumo-elevated"
											key={worker.name}
											value={worker.name}
										>
											<span className="flex w-4 items-center">
												<Icon
													className={`h-3.5 w-3.5 ${isSelected ? "" : "text-kumo-subtle"}`}
												/>
											</span>
											<Select.ItemText>
												<span className="flex items-center gap-2">
													{worker.name}
													{worker.isSelf && selfWorker && (
														<span className="rounded bg-kumo-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-kumo-link">
															current
														</span>
													)}
												</span>
											</Select.ItemText>
										</Select.Item>
									);
								})}
							</Select.List>
						</Select.Popup>
					</Select.Positioner>
				</Select.Portal>
			</Select.Root>
		</div>
	);
}
