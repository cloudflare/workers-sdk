import { Collapsible } from "@base-ui/react/collapsible";
import { cn } from "@cloudflare/kumo";
import { CaretRightIcon, DatabaseIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import CloudflareLogo from "../assets/icons/cloudflare-logo.svg?react";
import KVIcon from "../assets/icons/kv.svg?react";
import type { D1DatabaseResponse, WorkersKvNamespace } from "../api";
import type { FileRouteTypes } from "../routeTree.gen";
import type { FC } from "react";

interface SidebarItemGroupProps {
	emptyLabel: string;
	error: string | null;
	icon: FC<{ className?: string }>;
	items: Array<{
		id: string;
		isActive: boolean;
		label: string;
		link: {
			params: object;
			search?: object;
			to: FileRouteTypes["to"];
		};
	}>;
	loading: boolean;
	title: string;
}

function SidebarItemGroup({
	emptyLabel,
	error,
	icon: Icon,
	items,
	loading,
	title,
}: SidebarItemGroupProps): JSX.Element {
	return (
		<Collapsible.Root defaultOpen className="py-0.5">
			<Collapsible.Trigger className="group flex items-center gap-2 w-[calc(100%-0.25rem)] ml-1 p-3 bg-transparent font-semibold text-xs text-text cursor-pointer transition-colors rounded-l-md hover:bg-surface-tertiary">
				<CaretRightIcon
					className="w-3.5 h-3.5 text-muted transition-transform duration-200 group-data-panel-open:rotate-90"
					weight="bold"
				/>
				<Icon className="w-4 h-4 text-muted" />
				{title}
			</Collapsible.Trigger>

			<Collapsible.Panel className="overflow-hidden transition-[height,opacity] duration-200 ease-out data-starting-style:h-0 data-starting-style:opacity-0 data-ending-style:h-0 data-ending-style:opacity-0">
				<ul className="list-none ml-3 pl-3 space-y-0.5 border-l border-border">
					{loading ? (
						<li className="py-1.5 px-2 text-text-secondary text-sm">
							Loading...
						</li>
					) : null}

					{error ? (
						<li className="py-1.5 px-2 text-danger text-sm">{error}</li>
					) : null}

					{!loading && !error
						? items.map((item) => (
								<li key={item.id}>
									<Link
										className={cn(
											"block py-2.5 px-2 text-text text-sm no-underline rounded-l-md cursor-pointer transition-colors hover:bg-surface-tertiary",
											{
												"bg-primary/10 text-primary font-medium": item.isActive,
											}
										)}
										params={item.link.params}
										search={item.link.search}
										to={item.link.to}
									>
										{item.label}
									</Link>
								</li>
							))
						: null}

					{!loading && !error && items.length === 0 && (
						<li className="py-1.5 px-2 text-text-secondary text-sm italic">
							{emptyLabel}
						</li>
					)}
				</ul>
			</Collapsible.Panel>
		</Collapsible.Root>
	);
}

interface SidebarProps {
	currentPath: string;
	d1Error: string | null;
	databases: D1DatabaseResponse[];
	kvError: string | null;
	loading: boolean;
	namespaces: WorkersKvNamespace[];
}

export function Sidebar({
	currentPath,
	d1Error,
	databases,
	kvError,
	loading,
	namespaces,
}: SidebarProps) {
	return (
		<aside className="w-sidebar bg-bg-secondary border-r border-border flex flex-col">
			<a
				className="flex items-center gap-2.5 p-4 min-h-16.75 box-border"
				href="/"
			>
				<CloudflareLogo className="shrink-0 text-primary" />
				<div className="flex flex-col gap-px">
					<span className="text-sm font-semibold text-text leading-tight">
						Local Explorer
					</span>
					<span className="text-[10px] font-medium text-text-secondary uppercase tracking-wide">
						Cloudflare DevTools
					</span>
				</div>
			</a>

			<SidebarItemGroup
				emptyLabel="No namespaces"
				error={kvError}
				icon={KVIcon}
				items={namespaces.map((ns) => ({
					id: ns.id,
					isActive: currentPath === `/kv/${ns.id}`,
					label: ns.title,
					link: {
						params: { namespaceId: ns.id },
						to: "/kv/$namespaceId",
					},
				}))}
				loading={loading}
				title="KV Namespaces"
			/>

			<SidebarItemGroup
				emptyLabel="No databases"
				error={d1Error}
				icon={DatabaseIcon}
				items={databases.map((db) => ({
					id: db.uuid as string,
					isActive: currentPath === `/d1/${db.uuid}`,
					label: db.name as string,
					link: {
						params: { databaseId: db.uuid },
						search: { table: undefined },
						to: "/d1/$databaseId",
					},
				}))}
				loading={loading}
				title="D1 Databases"
			/>
		</aside>
	);
}
