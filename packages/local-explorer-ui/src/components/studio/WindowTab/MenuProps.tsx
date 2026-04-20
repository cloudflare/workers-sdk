import { PlusIcon } from "@phosphor-icons/react";

interface StudioWindowTabMenuProps {
	onClick: () => void;
}

export function StudioWindowTabMenu({
	onClick,
}: StudioWindowTabMenuProps): JSX.Element {
	return (
		<button
			className="sticky right-0 flex h-10 cursor-pointer items-center gap-2 border-b border-kumo-fill px-4 py-3 text-xs font-semibold tracking-wide text-kumo-subtle hover:bg-kumo-fill disabled:cursor-not-allowed"
			onClick={onClick}
			type="button"
		>
			<PlusIcon /> New Query
		</button>
	);
}
