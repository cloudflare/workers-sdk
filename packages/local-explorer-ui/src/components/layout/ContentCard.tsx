import { cn } from "@cloudflare/kumo";
import type { ReactNode } from "react";

interface ContentCardProps {
	children: ReactNode;
	className?: string;
	header?: ReactNode;
	noPadding?: boolean;
}

export function ContentCard({
	children,
	className,
	header,
	noPadding,
}: ContentCardProps) {
	return (
		<div
			className={cn(
				"flex flex-1 flex-col overflow-hidden rounded-tl-xl border-t border-l border-border bg-card-bg shadow-card",
				className
			)}
		>
			{header && (
				<header className="shrink-0 border-b border-border px-4 py-1">
					{header}
				</header>
			)}

			<div
				className={cn(
					"flex flex-1 flex-col overflow-hidden",
					!noPadding && "p-6"
				)}
			>
				{children}
			</div>
		</div>
	);
}
