import { ContentCard } from "./ContentCard";
import type { ReactNode } from "react";

export interface PageLayoutProps {
	children: ReactNode;
	header?: ReactNode;
	noPadding?: boolean;
}

export function PageLayout({ children, header, noPadding }: PageLayoutProps) {
	return (
		<div className="flex flex-1 flex-col gap-3 overflow-hidden pt-4 pl-2">
			{header && <header className="shrink-0 pr-4">{header}</header>}
			<ContentCard noPadding={noPadding}>{children}</ContentCard>
		</div>
	);
}
