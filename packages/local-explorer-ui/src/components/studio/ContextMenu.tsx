import {
	DropdownMenu,
	// DropdownMenuItemsBuilder
} from "@cloudflare/kumo";
import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
} from "react";
// import type { DropdownItemBuilderProps } from "@cloudflare/kumo";
import type { PropsWithChildren } from "react";

export const StudioContextMenu = createContext<
	| {
			openContextMenu: (
				mouseEvent: React.MouseEvent<Element, MouseEvent>,
				menuItems: DropdownItemBuilderProps[],
				onOpenChange?: (open: boolean) => void
			) => void;
	  }
	| undefined
>(undefined);

export function useStudioContextMenu() {
	const context = useContext(StudioContextMenu);
	if (!context) {
		throw new Error(
			"Cannot use useStudioContextMenu outside StudioContextMenuProvider"
		);
	}

	return context;
}

export function StudioContextMenuProvider({
	children,
}: PropsWithChildren<unknown>) {
	const [position, setPosition] = useState({ x: 0, y: 0 });
	const [open, setOpen] = useState(false);
	const [menuItems, setMenuItems] = useState<DropdownItemBuilderProps[]>([]);
	const onOpenChange = useRef<Function | undefined>(undefined);

	const openContextMenu = useCallback(
		(
			mouseEvent: React.MouseEvent<Element, MouseEvent>,
			items: DropdownItemBuilderProps[],
			_onOpenChange?: (open: boolean) => void
		) => {
			setOpen(true);
			setMenuItems(items);
			setPosition({ x: mouseEvent.clientX, y: mouseEvent.clientY });
			onOpenChange.current = _onOpenChange;
		},
		[]
	);

	const value = useMemo(() => ({ openContextMenu }), [openContextMenu]);

	return (
		<StudioContextMenu.Provider value={value}>
			<DropdownMenu
				open={open}
				onOpenChange={(isOpen) => {
					setOpen(isOpen);
					onOpenChange.current?.(isOpen);
				}}
			>
				<DropdownMenu.Trigger asChild>
					<button
						style={{
							position: "fixed",
							left: position.x + "px",
							top: position.y + "px",
							zIndex: 200,
							visibility: "hidden",
						}}
					></button>
				</DropdownMenu.Trigger>
				<DropdownMenu.Content
					align="start"
					side="bottom"
					style={{ width: 250 }}
				>
					{/* <DropdownMenuItemsBuilder items={menuItems} /> */}
				</DropdownMenu.Content>
			</DropdownMenu>

			{children}
		</StudioContextMenu.Provider>
	);
}
