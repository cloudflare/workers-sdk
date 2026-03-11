import { CaretRightIcon } from "@phosphor-icons/react";
import { Fragment } from "react";
import type { FC, PropsWithChildren, ReactNode } from "react";

interface BreadcrumbsProps extends PropsWithChildren {
	icon: FC;
	items: Array<ReactNode>;
	title: string;
}

export function Breadcrumbs({
	children,
	icon: Icon,
	items,
	title,
}: BreadcrumbsProps): JSX.Element {
	return (
		<div className="box-border flex min-h-16.75 shrink-0 items-center gap-2 border-b border-border bg-bg-secondary px-6 py-4 text-sm">
			<span className="flex items-center gap-1.5">
				<Icon />
				{title}
			</span>

			{items.map((item, index) => (
				<Fragment key={index}>
					<CaretRightIcon className="h-4 w-4" />
					{item}
				</Fragment>
			))}

			{children}
		</div>
	);
}
