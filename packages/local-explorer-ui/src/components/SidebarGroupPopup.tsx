import { Sidebar, type SidebarMenuButtonProps } from "@cloudflare/kumo";
import { Popover } from "@cloudflare/kumo/primitives/popover";

interface SidebarGroupItem {
	href: string;
	id: string;
	isActive: boolean;
	label: string;
}

interface SidebarGroupPopupProps {
	emptyLabel: string;
	error: string | null;
	icon: SidebarMenuButtonProps["icon"];
	items: SidebarGroupItem[];
	title: string;
}

export function SidebarGroupPopup({
	emptyLabel,
	error,
	icon,
	items,
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
							{error ? (
								<div className="px-2 py-1.5 text-sm text-red-500">{error}</div>
							) : items.length === 0 ? (
								<div className="px-2 py-1.5 text-sm text-kumo-subtle italic">
									{emptyLabel}
								</div>
							) : (
								items.map((item) => (
									<a
										className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors outline-none select-none ${
											item.isActive
												? "bg-kumo-elevated font-medium text-kumo-default"
												: "text-kumo-default hover:bg-kumo-elevated"
										}`}
										href={item.href}
										key={item.id}
									>
										<span className="truncate">{item.label}</span>
									</a>
								))
							)}
						</div>
					</Popover.Popup>
				</Popover.Positioner>
			</Popover.Portal>
		</Popover.Root>
	);
}
