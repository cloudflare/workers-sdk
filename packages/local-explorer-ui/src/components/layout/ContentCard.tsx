import { cn } from "@cloudflare/kumo";
import type { ReactNode } from "react";

interface ContentCardProps {
	children: ReactNode;
	className?: string;
	noPadding?: boolean;
}

export function ContentCard({
	children,
	className,
	noPadding,
}: ContentCardProps) {
	return (
		<div
			className={cn(
				"flex flex-1 flex-col overflow-hidden rounded-tl-xl border-t border-l border-border bg-card-bg shadow-card",
				!noPadding && "p-6",
				className
			)}
		>
			{children}
		</div>
	);
}
