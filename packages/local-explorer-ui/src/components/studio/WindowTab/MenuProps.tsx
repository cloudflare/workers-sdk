import { cn } from "@cloudflare/kumo";
import { PlusIcon } from "@phosphor-icons/react";
import { useMemo } from "react";

interface StudioWindowTabMenuProps {
	onClick: () => void;
}

export function StudioWindowTabMenu({
	onClick,
}: StudioWindowTabMenuProps): JSX.Element {
	// TODO: Does this need to be memoized?
	const className = useMemo<string>(
		() =>
			cn(
				"flex gap-2 relative px-2", // display style
				"bg-surface-secondary", // background color
				"border-b border-border", // border style
				"items-center text-left text-xs text-muted" // text style
			),
		[]
	);

	return (
		<div
			className={className}
			onClick={onClick}
			style={{ position: "sticky", right: 0 }}
		>
			<div className="flex px-2 py-1.5 items-center gap-2 cursor-pointer hover:text-text hover:bg-surface-tertiary transition-colors rounded-md">
				<PlusIcon /> New
			</div>
		</div>
	);
}
