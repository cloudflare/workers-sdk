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
		<Collapsible.Root defaultOpen>
			<Collapsible.Trigger className="group flex items-center gap-2 w-full h-10 py-3 px-4 border-0 border-b border-border bg-transparent font-semibold text-[11px] uppercase tracking-wide text-text-secondary cursor-pointer transition-colors hover:bg-border">
				<CaretRightIcon className="transition-transform duration-200 group-data-panel-open:rotate-90" />
				<Icon className="w-3.5 h-3.5" />
				{title}
			</Collapsible.Trigger>

			<Collapsible.Panel className="overflow-hidden transition-[height,opacity] duration-200 ease-out data-starting-style:h-0 data-starting-style:opacity-0 data-ending-style:h-0 data-ending-style:opacity-0">
				<ul className="list-none flex-1 overflow-y-auto">
					{loading ? (
						<li className="block py-2.5 px-4 text-text-secondary border-b border-border">
							Loading...
						</li>
					) : null}

					{error ? (
						<li className="block py-2.5 px-4 text-danger border-b border-border">
							{error}
						</li>
					) : null}

					{!loading && !error
						? items.map((item) => (
								<li key={item.id}>
									<Link
										className={cn(
											"block py-2.5 px-4 text-text no-underline border-b border-border cursor-pointer transition-colors hover:bg-border",
											{
												"bg-primary/8 text-primary border-l-3 border-l-primary pl-3.25":
													item.isActive,
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
						<li className="block py-2.5 px-4 text-text-secondary border-b border-border">
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
				className="flex items-center gap-2.5 p-4 border-b border-border min-h-16.75 box-border"
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
