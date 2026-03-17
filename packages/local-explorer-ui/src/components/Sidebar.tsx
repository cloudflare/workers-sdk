import { CloudflareLogo, cn, Popover } from "@cloudflare/kumo";
import { Collapsible } from "@cloudflare/kumo/primitives/collapsible";
import { CaretDownIcon, SidebarSimpleIcon } from "@phosphor-icons/react";
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
	storageKey: string;
	title: string;
}

function SidebarItemGroup({
	collapsed,
	emptyLabel,
	error,
	icon: Icon,
	items,
	storageKey,
	title,
}: SidebarItemGroupProps): JSX.Element {
	const [popoverOpen, setPopoverOpen] = useState<boolean>(false);
	const [isExpanded, setIsExpanded] = useState<boolean>(() => {
		if (typeof window !== "undefined") {
			const stored = localStorage.getItem(`sidebar-group-${storageKey}`);
			// Default to expanded (true) if no stored value
			return stored !== "false";
		}
		return true;
	});

	function handleExpandedChange(open: boolean): void {
		setIsExpanded(open);
		localStorage.setItem(`sidebar-group-${storageKey}`, String(open));
	}

	// When collapsed, show icon with popover containing the list
	if (collapsed) {
		return (
			<div className="flex items-center px-3 py-1">
				<Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
					<Popover.Trigger
						className="group flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-tertiary hover:text-text"
						delay={100}
						openOnHover={true}
					>
						<Icon className="h-4 w-4" />
					</Popover.Trigger>

					<Popover.Content
						align="start"
						className="min-w-48 p-0 [&_svg[class*='arrow']]:hidden [&>svg]:hidden"
						side="right"
						sideOffset={8}
					>
						<div className="border-b border-border px-3 py-2">
							<span className="text-xs font-medium text-text-secondary">
								{title}
							</span>
						</div>

						<ul className="list-none space-y-0.5 p-1.5">
							{error ? (
								<li className="px-2 py-1.5 text-sm text-danger">{error}</li>
							) : null}

							{!error
								? items.map((item) => (
										<li key={item.id}>
											<Link
												className={cn(
													"group flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm no-underline transition-colors",
													item.isActive
														? "bg-primary/10 font-medium text-primary hover:bg-primary/15"
														: "text-text hover:bg-surface-tertiary"
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

	// When expanded, show collapsible group with clean design
	return (
		<Collapsible.Root
			open={isExpanded}
			onOpenChange={handleExpandedChange}
			className="py-1"
		>
			<Collapsible.Trigger className="group flex w-full cursor-pointer items-center gap-2 bg-transparent px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:text-text">
				<span className="flex h-9 w-9 shrink-0 items-center justify-center">
					<Icon className="h-4 w-4" />
				</span>
				<span className="flex-1 text-left">{title}</span>
				<CaretDownIcon
					className="h-3 w-3 transition-transform duration-200 group-data-panel-closed:-rotate-90"
					weight="bold"
				/>
			</Collapsible.Trigger>

			<Collapsible.Panel className="overflow-hidden transition-[height,opacity] duration-200 ease-out data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0">
				<ul className="mt-0.5 list-none space-y-0.5 px-2">
					{error ? (
						<li className="px-2.5 py-2 text-sm text-danger">{error}</li>
					) : null}

					{!error
						? items.map((item) => (
								<li key={item.id}>
									<Link
										className={cn(
											"group flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm no-underline transition-colors",
											item.isActive
												? "bg-primary/10 font-medium text-primary hover:bg-primary/15"
												: "text-text hover:bg-surface-tertiary",
											"mx-2" // Indent to align with title text
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
						<li className="ml-11 px-2.5 py-2 text-sm text-text-secondary italic">
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
			<nav className="flex-1 overflow-x-hidden overflow-y-auto py-2">
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
					storageKey="kv"
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
					storageKey="d1"
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
					storageKey="do"
					title="Durable Objects"
				/>
			</nav>

			{/* Toggle button at bottom */}
			<div className="shrink-0 p-2">
				<button
					aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
					className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg bg-transparent text-muted transition-colors hover:bg-surface-tertiary hover:text-text"
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
