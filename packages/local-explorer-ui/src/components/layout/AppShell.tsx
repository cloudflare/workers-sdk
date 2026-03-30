import { cn } from "@cloudflare/kumo";
import type { ReactNode } from "react";

interface AppShellProps {
	children: ReactNode;
	className?: string;
	sidebar: ReactNode;
}

export function AppShell({ children, className, sidebar }: AppShellProps) {
	return (
		<div className={cn("flex min-h-screen", className)}>
			{sidebar}
			<div className="z-0 flex flex-1 flex-col overflow-hidden">{children}</div>
		</div>
	);
}
