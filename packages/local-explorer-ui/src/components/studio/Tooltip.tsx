import type { PropsWithChildren, ReactNode } from "react";

interface TooltipProps extends PropsWithChildren {
	message: ReactNode;
}

export function Tooltip({ message, children }: TooltipProps): JSX.Element {
	return (
		<span
			className="relative group inline-flex"
			title={typeof message === "string" ? message : undefined}
		>
			{children}
			<span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-neutral-800 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
				{message}
			</span>
		</span>
	);
}
