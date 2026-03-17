import { cn } from "@cloudflare/kumo";
import type { ReactNode } from "react";

interface AppShellProps {
	children: ReactNode;
	className?: string;
	sidebar: ReactNode;
}

export function AppShell({ children, className, sidebar }: AppShellProps) {
	return (
		<div className={cn("flex min-h-screen bg-app-bg", className)}>
			{sidebar}
			<div className="flex flex-1 flex-col overflow-hidden">{children}</div>
		</div>
	);
}
