import { PlusIcon } from "@phosphor-icons/react";

interface StudioWindowTabMenuProps {
	onClick: () => void;
}

export function StudioWindowTabMenu({
	onClick,
}: StudioWindowTabMenuProps): JSX.Element {
	return (
		<button
			className="h-10 sticky right-0 flex items-center gap-2 px-4 py-3 border-b border-border hover:bg-border text-xs text-muted font-semibold tracking-wide cursor-pointer disabled:cursor-not-allowed"
			// TODO: Re-enable in a future PR when tab definitions are added
			disabled={true}
			onClick={onClick}
			type="button"
		>
			<PlusIcon /> New
		</button>
	);
}
