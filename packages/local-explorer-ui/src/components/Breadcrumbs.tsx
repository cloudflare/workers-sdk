import { CaretRightIcon } from "@phosphor-icons/react";
import { Fragment } from "react";
import type { FC } from "react";

interface BreadcrumbsProps {
	icon: FC;
	title: string;
	items: Array<string>;
}

export function Breadcrumbs({
	icon: Icon,
	items,
	title,
}: BreadcrumbsProps): JSX.Element {
	return (
		<div className="flex items-center gap-2 py-4 px-6 min-h-16.75 box-border bg-bg-secondary border-b border-border text-sm shrink-0">
			<span className="flex items-center gap-1.5">
				<Icon />
				{title}
			</span>

			{items.map((item) => (
				<Fragment key={item}>
					<CaretRightIcon className="w-4 h-4" />
					<span className="flex items-center gap-1.5">{item}</span>
				</Fragment>
			))}
		</div>
	);
}
