import { ContentCard } from "./ContentCard";
import type { ReactNode } from "react";

export interface PageLayoutProps {
	children: ReactNode;
	header?: ReactNode;
	noPadding?: boolean;
}

export function PageLayout({ children, header, noPadding }: PageLayoutProps) {
	return (
		<div className="flex flex-1 flex-col overflow-hidden pt-6 pl-2">
			<ContentCard header={header} noPadding={noPadding}>
				{children}
			</ContentCard>
		</div>
	);
}
