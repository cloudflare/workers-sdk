import {
	Button,
	cn,
	Sidebar,
	type SidebarMenuButtonProps,
} from "@cloudflare/kumo";
import { Popover } from "@cloudflare/kumo/primitives/popover";
import { TrashIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { FileRouteTypes } from "../routeTree.gen";

type PurgeKind = "d1" | "kv" | "r2" | "workflows";

interface SidebarGroupItem {
	id: string;
	isActive: boolean;
	label: string;
	purge?: {
		id: string;
		kind: PurgeKind;
		label: string;
	};
	link: {
		params: object;
		search?: object;
		to: FileRouteTypes["to"];
	};
}

interface SidebarGroupPopupProps {
	emptyLabel: string;
	icon: SidebarMenuButtonProps["icon"];
	items: SidebarGroupItem[];
	onPurge: (target: { id: string; kind: PurgeKind; label: string }) => void;
	title: string;
}

export function SidebarGroupPopup({
	emptyLabel,
	icon,
	items,
	onPurge,
	title,
}: SidebarGroupPopupProps): JSX.Element {
	const hasActiveItem = items.some((item) => item.isActive);

	return (
		<Popover.Root>
			<Popover.Trigger
				render={<Sidebar.MenuButton active={hasActiveItem} icon={icon} />}
			/>

			<Popover.Portal>
				<Popover.Positioner
					align="start"
					className="z-100"
					side="right"
					sideOffset={8}
				>
					<Popover.Popup className="max-h-72 min-w-48 overflow-y-auto rounded-lg border border-kumo-fill bg-kumo-base shadow-[0_4px_12px_rgba(0,0,0,0.15)] transition-[opacity,transform] duration-150 data-ending-style:-translate-x-1 data-ending-style:opacity-0 data-starting-style:-translate-x-1 data-starting-style:opacity-0">
						<div className="border-b border-kumo-fill px-3 py-2">
							<span className="text-xs font-medium text-kumo-subtle">
								{title}
							</span>
						</div>

						<div className="p-1">
							{items.length === 0 ? (
								<div className="px-2 py-1.5 text-sm text-kumo-subtle italic">
									{emptyLabel}
								</div>
							) : (
								items.map((item) => {
									const purgeTarget = item.purge;

									return (
										<div className="group/item flex items-center" key={item.id}>
											<Link
												className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors outline-none select-none ${
													item.isActive
														? "bg-kumo-elevated font-medium text-kumo-default"
														: "text-kumo-default hover:bg-kumo-elevated"
												}`}
												params={item.link.params}
												search={item.link.search}
												to={item.link.to}
											>
												<span className="truncate">{item.label}</span>
											</Link>

											{purgeTarget && (
												<Button
													aria-label={`Purge ${purgeTarget.kind} ${purgeTarget.id}`}
													className={cn(
														"ml-1 shrink-0 text-kumo-subtle transition-opacity hover:bg-kumo-elevated hover:text-kumo-danger focus-visible:opacity-100",
														item.isActive
															? "opacity-100"
															: "opacity-0 group-hover/item:opacity-100"
													)}
													data-testid={`purge-${purgeTarget.kind}-${purgeTarget.id}`}
													onClick={(event) => {
														event.preventDefault();
														event.stopPropagation();
														onPurge(purgeTarget);
													}}
													shape="square"
													type="button"
													variant="ghost"
												>
													<TrashIcon size={12} weight="bold" />
												</Button>
											)}
										</div>
									);
								})
							)}
						</div>
					</Popover.Popup>
				</Popover.Positioner>
			</Popover.Portal>
		</Popover.Root>
	);
}
