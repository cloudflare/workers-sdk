import { PlusIcon } from "@phosphor-icons/react";

interface StudioWindowTabMenuProps {
	onClick: () => void;
}

export function StudioWindowTabMenu({
	onClick,
}: StudioWindowTabMenuProps): JSX.Element {
	return (
		<button
			className="relative flex items-center gap-2 border-b border-neutral-200 px-2 text-left text-xs text-neutral-500 dark:border-neutral-800"
			onClick={onClick}
			type="button"
		>
			<div className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-bg-tertiary hover:text-black dark:hover:text-white">
				<PlusIcon /> New Query
			</div>
		</button>
	);
}
