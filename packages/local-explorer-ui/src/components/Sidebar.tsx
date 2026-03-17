import { CloudflareLogo, cn, Popover } from "@cloudflare/kumo";
import { Collapsible } from "@cloudflare/kumo/primitives/collapsible";
import { CaretRightIcon, SidebarSimpleIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
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
	collapsed: boolean;
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
	collapsed,
	emptyLabel,
	error,
	icon: Icon,
	items,
	title,
}: SidebarItemGroupProps): JSX.Element {
	const [popoverOpen, setPopoverOpen] = useState<boolean>(false);

	// When collapsed, show icon with popover containing the list
	if (collapsed) {
		return (
			<div className="flex justify-center px-2 py-1">
				<Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
					<Popover.Trigger
						className="group flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-primary/10 hover:text-primary"
						delay={100}
						openOnHover={true}
					>
						<Icon className="h-5 w-5" />
					</Popover.Trigger>

					<Popover.Content
						align="start"
						className="min-w-48 p-0 [&_svg[class*='arrow']]:hidden [&>svg]:hidden"
						side="right"
						sideOffset={8}
					>
						<div className="border-b border-border px-3 py-2">
							<span className="text-xs font-semibold text-text">{title}</span>
						</div>

						<ul className="list-none space-y-0.5 p-1">
							{error ? (
								<li className="px-2 py-1.5 text-sm text-danger">{error}</li>
							) : null}

							{!error
								? items.map((item) => (
										<li key={item.id}>
											<Link
												className={cn(
													"block cursor-pointer rounded-md px-2 py-1.5 text-sm text-text no-underline transition-colors hover:bg-primary/15 hover:text-primary",
													{
														"bg-primary/10 font-medium text-primary":
															item.isActive,
													}
												)}
												onClick={() => setPopoverOpen(false)}
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
					</Popover.Content>
				</Popover>
			</div>
		);
	}

	// When expanded, show collapsible group
	return (
		<Collapsible.Root defaultOpen className="px-2 py-0.5">
			<Collapsible.Trigger className="group flex w-full cursor-pointer items-center gap-2 rounded-md bg-transparent px-2 py-2 text-xs font-semibold text-text transition-colors hover:bg-primary/10 hover:text-primary">
				<CaretRightIcon
					className="h-3.5 w-3.5 text-muted transition-transform duration-200 group-data-panel-open:rotate-90"
					weight="bold"
				/>
				<Icon className="h-4 w-4 text-muted" />
				{title}
			</Collapsible.Trigger>

			<Collapsible.Panel className="overflow-hidden transition-[height,opacity] duration-200 ease-out data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0">
				<ul className="mt-1 list-none space-y-0.5 pl-6">
					{error ? (
						<li className="px-2 py-1.5 text-sm text-danger">{error}</li>
					) : null}

					{!error
						? items.map((item) => (
								<li key={item.id}>
									<Link
										className={cn(
											"block cursor-pointer rounded-md px-2 py-2 text-sm text-text no-underline transition-colors hover:bg-primary/15 hover:text-primary",
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
	collapsed: boolean;
	currentPath: string;
	d1Error: string | null;
	databases: D1DatabaseResponse[];
	doError: string | null;
	doNamespaces: WorkersNamespace[];
	kvError: string | null;
	kvNamespaces: WorkersKvNamespace[];
	onToggle: () => void;
}

export function Sidebar({
	collapsed,
	currentPath,
	d1Error,
	databases,
	doError,
	doNamespaces,
	kvError,
	kvNamespaces,
	onToggle,
}: SidebarProps) {
	return (
		<aside
			className={cn(
				"sticky top-0 flex h-screen flex-col bg-app-bg transition-[width] duration-200 ease-out",
				collapsed ? "w-sidebar-collapsed" : "w-sidebar"
			)}
		>
			{/* Header with logo */}
			<a
				className="box-border flex min-h-16 items-center gap-2.5 overflow-hidden p-3"
				href="/cdn-cgi/explorer/"
			>
				<CloudflareLogo variant="glyph" className="h-8 w-8 shrink-0" />
				<div
					className={cn(
						"flex flex-col gap-px overflow-hidden transition-[opacity,width] duration-200 ease-out",
						collapsed ? "w-0 opacity-0" : "w-auto opacity-100"
					)}
				>
					<span className="text-sm leading-tight font-semibold whitespace-nowrap text-text">
						Local Explorer
					</span>
					<span className="text-[10px] font-medium tracking-wide whitespace-nowrap text-text-secondary uppercase">
						Cloudflare DevTools
					</span>
				</div>
			</a>

			{/* Navigation groups */}
			<nav className="flex-1 overflow-x-hidden overflow-y-auto">
				<SidebarItemGroup
					collapsed={collapsed}
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
					collapsed={collapsed}
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
					collapsed={collapsed}
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
			</nav>

			{/* Toggle button at bottom */}
			<div className="shrink-0 p-2">
				<button
					aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
					className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md bg-transparent text-muted transition-colors hover:bg-primary/10 hover:text-primary"
					onClick={onToggle}
					title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
					type="button"
				>
					<SidebarSimpleIcon className="h-5 w-5" weight="regular" />
				</button>
			</div>
		</aside>
	);
}
