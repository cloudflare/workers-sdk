import { cn, Popover } from "@cloudflare/kumo";
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
	collapsed?: boolean;
	workers: LocalExplorerWorker[];
	selectedWorker: string;
	onWorkerChange: (workerName: string) => void;
}

export function WorkerSelector({
	collapsed = false,
	workers,
	selectedWorker,
	onWorkerChange,
}: WorkerSelectorProps): JSX.Element {
	const [open, setOpen] = useState(false);

	// Find the current worker that is hosting this explorer (isSelf = true)
	const selfWorker = workers.find((w) => w.isSelf);

	// When collapsed, show an icon-only trigger with a popover list (matching sidebar groups)
	if (collapsed) {
		return (
			<div className="flex items-center px-3">
				<Popover open={open} onOpenChange={setOpen}>
					<Popover.Trigger
						aria-label={`Worker: ${selectedWorker}`}
						className="group flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-tertiary hover:text-text"
						delay={100}
						openOnHover={true}
						title={`Worker: ${selectedWorker}`}
					>
						<TerminalIcon className="h-5 w-5" />
					</Popover.Trigger>

					<Popover.Content
						align="start"
						className="min-w-48 p-0 [&_svg[class*='arrow']]:hidden [&>svg]:hidden"
						side="right"
						sideOffset={8}
					>
						<div className="border-b border-border px-3 py-2">
							<span className="text-xs font-medium text-text-secondary">
								Workers
							</span>
						</div>

						<ul className="list-none space-y-0.5 p-1.5">
							{workers.map((worker) => {
								const isSelected = selectedWorker === worker.name;
								const Icon = isSelected ? CheckIcon : TerminalIcon;

								return (
									<li key={worker.name}>
										<button
											className={cn(
												"group flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
												isSelected
													? "bg-primary/10 text-primary hover:bg-primary/15"
													: "text-text hover:bg-surface-tertiary"
											)}
											onClick={() => {
												onWorkerChange(worker.name);
												setOpen(false);
											}}
											type="button"
										>
											<Icon
												className={cn(
													"h-3.5 w-3.5 shrink-0",
													isSelected ? "" : "text-text-secondary"
												)}
											/>
											{worker.name}
											{worker.isSelf && selfWorker && (
												<span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
													current
												</span>
											)}
										</button>
									</li>
								);
							})}
						</ul>
					</Popover.Content>
				</Popover>
			</div>
		);
	}

	const handleValueChange = (value: string | null): void => {
		if (value === null) {
			return;
		}
		onWorkerChange(value);
	};

	return (
		<div className="px-4 py-2">
			<Select.Root
				onOpenChange={setOpen}
				onValueChange={handleValueChange}
				open={open}
				value={selectedWorker}
			>
				<Select.Trigger className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-border bg-bg px-3 py-2 text-sm text-text transition-colors hover:bg-bg-secondary data-popup-open:border-primary">
					<span className="flex items-center gap-2 truncate">
						<TerminalIcon className="h-4 w-4 shrink-0 text-text-secondary" />
						<span className="truncate">{selectedWorker}</span>
					</span>
					<Select.Icon>
						<CaretUpDownIcon className="h-3.5 w-3.5 shrink-0 text-text-secondary" />
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
						<Select.Popup className="max-h-72 min-w-48 overflow-hidden rounded-lg border border-border bg-bg shadow-[0_4px_12px_rgba(0,0,0,0.15)] transition-[opacity,transform] duration-150 data-ending-style:-translate-y-1 data-ending-style:opacity-0 data-starting-style:-translate-y-1 data-starting-style:opacity-0">
							<Select.List className="p-1">
								{workers.map((worker) => {
									const isSelected = selectedWorker === worker.name;
									const Icon = isSelected ? CheckIcon : TerminalIcon;

									return (
										<Select.Item
											className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-text transition-colors outline-none select-none data-highlighted:bg-bg-secondary dark:data-highlighted:bg-bg-tertiary"
											key={worker.name}
											value={worker.name}
										>
											<span className="flex w-4 items-center">
												<Icon
													className={`h-3.5 w-3.5 ${isSelected ? "" : "text-text-secondary"}`}
												/>
											</span>
											<Select.ItemText>
												<span className="flex items-center gap-2">
													{worker.name}
													{worker.isSelf && selfWorker && (
														<span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
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
