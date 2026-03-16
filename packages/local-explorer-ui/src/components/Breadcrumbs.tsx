import { Breadcrumbs as KumoBreadcrumbs } from "@cloudflare/kumo";
import { Fragment } from "react";
import type { FC, PropsWithChildren, ReactNode } from "react";

interface BreadcrumbsProps extends PropsWithChildren {
	icon: FC<{ className?: string }>;
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
			<KumoBreadcrumbs>
				<KumoBreadcrumbs.Current icon={<Icon className="h-4 w-4" />}>
					{title}
				</KumoBreadcrumbs.Current>

				{items.map((item, index) => (
					<Fragment key={index}>
						<KumoBreadcrumbs.Separator />
						{item}
					</Fragment>
				))}
			</KumoBreadcrumbs>

			{children}
		</div>
	);
}
