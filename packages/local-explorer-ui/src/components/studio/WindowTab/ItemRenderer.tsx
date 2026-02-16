import { cn } from "@cloudflare/kumo";
import { CircleIcon, XIcon } from "@phosphor-icons/react";
import { useState } from "react";
import type { StudioWindowTabItem } from "./types";

interface StudioWindowTabItemRendererProps {
	index: number;
	onClick: () => void;
	onClose?: () => void;
	onDoubleClick?: () => void;
	selected?: boolean;
	tab: StudioWindowTabItem;
}

export function StudioWindowTabItemRenderer({
	onClick,
	onClose,
	onDoubleClick,
	selected,
	tab,
}: StudioWindowTabItemRendererProps): JSX.Element {
	const isDirty = tab.isDirty;
	const isTemp = tab.isTemp;

	const [isHovered, setIsHovered] = useState<boolean>(false);
	const [isCloseHovered, setIsCloseHovered] = useState<boolean>(false);

	const shouldShowDirtyIcon = !isCloseHovered && isDirty;
	const shouldShowCloseIcon = !shouldShowDirtyIcon && (selected || isHovered);

	return (
		<div
			className={cn(
				"h-10 min-w-42.5 max-w-75  flex gap-2 relative px-2 border-b border-r border-border items-center text-left text-xs cursor-pointer hover:text-text select-none",
				selected
					? "border-b-transparent! bg-surface"
					: "bg-surface-secondary text-muted",
				isTemp && "italic",
				isDirty && "not-italic"
			)}
			onClick={onClick}
			onDoubleClick={onDoubleClick}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			<tab.icon className="w-4 h-4" />

			<div className={cn("line-clamp-1 grow")}>{tab.title}</div>

			{onClose && (
				<div
					className={cn(
						"ml-2 flex h-5 w-5 items-center justify-center rounded hover:bg-accent"
					)}
					onClick={(e) => {
						e.stopPropagation();
						onClose?.();
					}}
					onMouseEnter={() => setIsCloseHovered(true)}
					onMouseLeave={() => setIsCloseHovered(false)}
				>
					{shouldShowCloseIcon && (
						<XIcon className={"h-3 w-3 shrink-0 grow-0"} />
					)}
					{shouldShowDirtyIcon && (
						<CircleIcon
							className={"h-3 w-3 shrink-0 grow-0 text-muted"}
							weight="fill"
						/>
					)}
				</div>
			)}
		</div>
	);
}
