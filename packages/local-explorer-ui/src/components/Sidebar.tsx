import { CloudflareLogo, cn } from "@cloudflare/kumo";
import { Collapsible } from "@cloudflare/kumo/primitives/collapsible";
import { CaretRightIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import D1Icon from "../assets/icons/d1.svg?react";
import DOIcon from "../assets/icons/durable-objects.svg?react";
import KVIcon from "../assets/icons/kv.svg?react";
import type {
	D1DatabaseResponse,
	WorkersKvNamespace,
	WorkersNamespace,
} from "../api";
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
	title: string;
}

function SidebarItemGroup({
	emptyLabel,
	error,
	icon: Icon,
	items,
	title,
}: SidebarItemGroupProps): JSX.Element {
	return (
		<Collapsible.Root defaultOpen className="py-0.5">
			<Collapsible.Trigger className="group ml-1 flex w-[calc(100%-0.25rem)] cursor-pointer items-center gap-2 rounded-l-md bg-transparent p-3 text-xs font-semibold text-text transition-colors hover:bg-surface-tertiary">
				<CaretRightIcon
					className="h-3.5 w-3.5 text-muted transition-transform duration-200 group-data-panel-open:rotate-90"
					weight="bold"
				/>
				<Icon className="h-4 w-4 text-muted" />
				{title}
			</Collapsible.Trigger>

			<Collapsible.Panel className="overflow-hidden transition-[height,opacity] duration-200 ease-out data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0">
				<ul className="ml-3 list-none space-y-0.5 border-l border-border pl-3">
					{error ? (
						<li className="px-2 py-1.5 text-sm text-danger">{error}</li>
					) : null}

					{!error
						? items.map((item) => (
								<li key={item.id}>
									<Link
										className={cn(
											"block cursor-pointer rounded-l-md px-2 py-2.5 text-sm text-text no-underline transition-colors hover:bg-surface-tertiary",
											{
												"bg-primary/10 font-medium text-primary": item.isActive,
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

					{!error && items.length === 0 && (
						<li className="px-2 py-1.5 text-sm text-text-secondary italic">
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
	doError: string | null;
	doNamespaces: WorkersNamespace[];
	kvError: string | null;
	kvNamespaces: WorkersKvNamespace[];
}

export function Sidebar({
	currentPath,
	d1Error,
	databases,
	doError,
	doNamespaces,
	kvError,
	kvNamespaces,
}: SidebarProps) {
	return (
		<aside className="flex w-sidebar flex-col border-r border-border bg-bg-secondary">
			<a
				className="box-border flex min-h-16.75 items-center gap-2.5 p-4"
				href="/cdn-cgi/explorer/"
			>
				<CloudflareLogo variant="glyph" className="h-8 w-8 shrink-0" />
				<div className="flex flex-col gap-px">
					<span className="text-sm leading-tight font-semibold text-text">
						Local Explorer
					</span>
					<span className="text-[10px] font-medium tracking-wide text-text-secondary uppercase">
						Cloudflare DevTools
					</span>
				</div>
			</a>

			<SidebarItemGroup
				emptyLabel="No namespaces"
				error={kvError}
				icon={KVIcon}
				items={kvNamespaces.map((ns) => ({
					id: ns.id,
					isActive: currentPath === `/kv/${ns.id}`,
					label: ns.title,
					link: {
						params: { namespaceId: ns.id },
						to: "/kv/$namespaceId",
					},
				}))}
				title="KV Namespaces"
			/>

			<SidebarItemGroup
				emptyLabel="No databases"
				error={d1Error}
				icon={D1Icon}
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
				title="D1 Databases"
			/>

			<SidebarItemGroup
				emptyLabel="No SQLite namespaces"
				error={doError}
				icon={DOIcon}
				items={doNamespaces.map((ns) => {
					const className = ns.class ?? ns.name ?? ns.id ?? "Unknown";
					return {
						id: ns.id as string,
						isActive:
							currentPath === `/do/${className}` ||
							currentPath.startsWith(`/do/${className}/`),
						label: className,
						link: {
							params: { className },
							to: "/do/$className",
						},
					};
				})}
				title="Durable Objects"
			/>
		</aside>
	);
}
