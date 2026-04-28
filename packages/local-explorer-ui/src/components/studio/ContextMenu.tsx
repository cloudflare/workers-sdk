import { DropdownMenu } from "@cloudflare/kumo";
import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
} from "react";
import type { VirtualElement } from "@floating-ui/react";
import type { Icon } from "@phosphor-icons/react";
import type { PropsWithChildren, ReactNode } from "react";

interface DropdownButtonItem {
	destructiveAction?: boolean;
	disabled?: boolean;
	icon?: Icon;
	label: ReactNode;
	onClick?: () => void;
	shortcut?: string;
	sub?: DropdownItemBuilderProps[];
	type: "button";
}

interface DropdownDividerItem {
	type: "divider";
}

export type DropdownItemBuilderProps = DropdownButtonItem | DropdownDividerItem;

type OnOpenChangeHandler = (open: boolean) => void;

type OpenContextMenuHandler = (
	mouseEvent: React.MouseEvent<Element, MouseEvent>,
	menuItems: DropdownItemBuilderProps[],
	onOpenChange?: OnOpenChangeHandler
) => void;

const StudioContextMenu = createContext<{
	openContextMenu: OpenContextMenuHandler;
} | null>(null);

export function useStudioContextMenu() {
	const context = useContext(StudioContextMenu);
	if (!context) {
		throw new Error(
			"Cannot use useStudioContextMenu outside StudioContextMenuProvider"
		);
	}

	return context;
}

interface Position {
	x: number;
	y: number;
}

type StudioContextMenuProvider = PropsWithChildren;

interface DropdownMenuItemsBuilderProps {
	items: DropdownItemBuilderProps[];
}

function DropdownMenuItemsBuilder({
	items,
}: DropdownMenuItemsBuilderProps): JSX.Element {
	return (
		<>
			{items.map((item, index) => {
				if (item.type === "divider") {
					return <DropdownMenu.Separator key={index} />;
				}

				if (item.sub && item.sub.length > 0) {
					return (
						<DropdownMenu.Sub key={index}>
							<DropdownMenu.SubTrigger
								disabled={item.disabled}
								icon={item.icon}
							>
								{item.label}
							</DropdownMenu.SubTrigger>
							<DropdownMenu.SubContent>
								<DropdownMenuItemsBuilder items={item.sub} />
							</DropdownMenu.SubContent>
						</DropdownMenu.Sub>
					);
				}

				return (
					<DropdownMenu.Item
						disabled={item.disabled}
						icon={item.icon}
						key={index}
						onClick={item.onClick}
						variant={item.destructiveAction ? "danger" : "default"}
					>
						{item.label}
						{item.shortcut && (
							<DropdownMenu.Shortcut>{item.shortcut}</DropdownMenu.Shortcut>
						)}
					</DropdownMenu.Item>
				);
			})}
		</>
	);
}

export function StudioContextMenuProvider({
	children,
}: StudioContextMenuProvider) {
	const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
	const [open, setOpen] = useState<boolean>(false);
	const [menuItems, setMenuItems] = useState<DropdownItemBuilderProps[]>([]);
	const onOpenChange = useRef<OnOpenChangeHandler | null>(null);

	const openContextMenu = useCallback(
		(
			mouseEvent: React.MouseEvent<Element, MouseEvent>,
			items: DropdownItemBuilderProps[],
			_onOpenChange?: OnOpenChangeHandler
		) => {
			setOpen(true);
			setMenuItems(items);
			setPosition({
				x: mouseEvent.clientX,
				y: mouseEvent.clientY,
			});
			onOpenChange.current = _onOpenChange ?? null;
		},
		[]
	);

	const value = useMemo(() => ({ openContextMenu }), [openContextMenu]);

	const virtualAnchor = useMemo<VirtualElement>(
		() => ({
			getBoundingClientRect: () => ({
				bottom: position.y,
				height: 0,
				left: position.x,
				right: position.x,
				top: position.y,
				width: 0,
				x: position.x,
				y: position.y,
			}),
		}),
		[position.x, position.y]
	);

	const handleOpenChange = useCallback(
		(isOpen: boolean, eventDetails: { reason: string }) => {
			// Only close on valid reasons, ignore focus-out to prevent
			// the context menu from closing when moving mouse away
			if (
				!isOpen &&
				eventDetails.reason !== "outside-press" &&
				eventDetails.reason !== "escape-key" &&
				eventDetails.reason !== "item-press"
			) {
				return;
			}

			setOpen(isOpen);
			onOpenChange.current?.(isOpen);
		},
		[]
	);

	return (
		<StudioContextMenu.Provider value={value}>
			<DropdownMenu onOpenChange={handleOpenChange} open={open}>
				<DropdownMenu.Trigger
					nativeButton={false}
					render={<span className="hidden" />}
				/>

				<DropdownMenu.Content
					align="start"
					anchor={virtualAnchor}
					className="w-62.5"
					side="bottom"
				>
					<DropdownMenuItemsBuilder items={menuItems} />
				</DropdownMenu.Content>
			</DropdownMenu>

			{children}
		</StudioContextMenu.Provider>
	);
}
