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
		<div className="flex items-center gap-2 text-sm">
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

			{children && (
				<>
					<div className="flex-1" />
					<div className="flex items-center gap-2">{children}</div>
				</>
			)}
		</div>
	);
}
