import { Button } from "@cloudflare/kumo";
import { PlusIcon } from "@phosphor-icons/react";
import type { JSX } from "react";

interface StudioWindowTabMenuProps {
	onClick: () => void;
}

export function StudioWindowTabMenu({
	onClick,
}: StudioWindowTabMenuProps): JSX.Element {
	return (
		<div className="sticky right-0 flex h-10 items-center border-b border-l border-kumo-fill bg-kumo-elevated px-2">
			<Button size="sm" onClick={onClick}>
				<PlusIcon /> New Query
			</Button>
		</div>
	);
}
