import { DropdownMenu } from "@cloudflare/kumo";
import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
} from "react";
import type { ComponentProps, PropsWithChildren } from "react";

type DropdownItemBuilderProps = ComponentProps<typeof DropdownMenu.Content>;

type OnOpenChangeHandler = (open: boolean) => void;

type OpenContextMenuHandler = (
	mouseEvent: React.MouseEvent<Element, MouseEvent>,
	menuItems: DropdownItemBuilderProps[],
	onOpenChange?: OnOpenChangeHandler
) => void;

export const StudioContextMenu = createContext<{
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

export function StudioContextMenuProvider({
	children,
}: StudioContextMenuProvider) {
	const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
	const [open, setOpen] = useState<boolean>(false);
	const [_menuItems, setMenuItems] = useState<DropdownItemBuilderProps[]>([]);
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

	return (
		<StudioContextMenu.Provider value={value}>
			<DropdownMenu
				onOpenChange={(isOpen) => {
					setOpen(isOpen);
					onOpenChange.current?.(isOpen);
				}}
				open={open}
			>
				<DropdownMenu.Trigger
					render={
						<button
							className="fixed hidden z-200"
							style={{ top: `${position.y}px`, left: `${position.x}px` }}
						/>
					}
				/>

				<DropdownMenu.Content
					align="start"
					side="bottom"
					style={{ width: 250 }}
				>
					{/* TODO: Add stub implementation of this dropdown using the new Kumo components */}
					{/* <DropdownMenuItemsBuilder items={menuItems} /> */}
				</DropdownMenu.Content>
			</DropdownMenu>

			{children}
		</StudioContextMenu.Provider>
	);
}
