import { Button, CloudflareLogo, cn, Popover } from "@cloudflare/kumo";
import { Collapsible } from "@cloudflare/kumo/primitives/collapsible";
import {
	CaretDownIcon,
	DesktopIcon,
	MoonIcon,
	SidebarSimpleIcon,
	SunIcon,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import D1Icon from "../assets/icons/d1.svg?react";
import DOIcon from "../assets/icons/durable-objects.svg?react";
import KVIcon from "../assets/icons/kv.svg?react";
import R2Icon from "../assets/icons/r2.svg?react";
import WorkflowsIcon from "../assets/icons/workflows.svg?react";
import { WorkerSelector, type LocalExplorerWorker } from "./WorkerSelector";
import type {
	D1DatabaseResponse,
	R2Bucket,
	WorkersKvNamespace,
	WorkersNamespace,
	WorkflowsWorkflow,
} from "../api";
import type { ResolvedTheme, ThemePreference } from "../hooks/useTheme";
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
			<div className="flex items-center px-3">
				<Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
					<Popover.Trigger
						className="group flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-tertiary hover:text-text"
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
													"group flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium no-underline transition-colors",
													item.isActive
														? "bg-primary/10 text-primary hover:bg-primary/15"
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
		<Collapsible.Root open={isExpanded} onOpenChange={handleExpandedChange}>
			<Collapsible.Trigger className="group mx-2 flex w-[calc(100%-1rem)] cursor-pointer items-center gap-2 rounded-lg bg-transparent px-2 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text">
				<span className="flex h-9 w-9 shrink-0 items-center justify-center">
					<Icon className="h-5 w-5" />
				</span>
				<span className="flex-1 text-left">{title}</span>
				<CaretDownIcon
					className="h-3 w-3 -rotate-90 transition-transform duration-300 group-data-panel-open:rotate-0"
					weight="bold"
				/>
			</Collapsible.Trigger>

			<Collapsible.Panel className="grid grid-rows-[1fr] transition-[grid-template-rows,opacity] duration-300 ease-in-out data-ending-style:grid-rows-[0fr] data-ending-style:opacity-0 data-starting-style:grid-rows-[0fr] data-starting-style:opacity-0">
				<div className="overflow-hidden">
					<ul className="mt-0.5 list-none space-y-0.5 px-2">
						{error ? (
							<li className="ml-8.5 px-2.5 py-2 text-sm text-danger">
								{error}
							</li>
						) : null}

						{!error
							? items.map((item, index) => {
									const isLast = index === items.length - 1;
									return (
										<li key={item.id} className="relative">
											{/* Tree connector lines */}
											{isLast ? (
												/* Last item: rounded corner (└) using border */
												<span className="absolute top-0 left-6.5 h-1/2 w-2 rounded-bl-md border-b border-l border-text-secondary" />
											) : (
												<>
													{/* Vertical line - extends past bottom to cover gap */}
													<span className="absolute top-0 left-6.5 h-[calc(100%+2px)] w-px bg-text-secondary" />
													{/* Horizontal branch */}
													<span className="absolute top-1/2 left-6.5 h-px w-2 -translate-y-px bg-text-secondary" />
												</>
											)}

											<Link
												className={cn(
													"group flex cursor-pointer items-center gap-2.5 rounded-lg p-2 text-sm font-medium no-underline transition-colors",
													item.isActive
														? "bg-primary/10 text-primary hover:bg-primary/15"
														: "text-text hover:bg-surface-tertiary",
													"ml-9.5" // Indent for tree lines + gap
												)}
												params={item.link.params}
												search={item.link.search}
												to={item.link.to}
											>
												{item.label}
											</Link>
										</li>
									);
								})
							: null}

						{!error && items.length === 0 && (
							<li className="ml-8.5 px-2.5 py-2 text-sm text-text-secondary italic">
								{emptyLabel}
							</li>
						)}
					</ul>
				</div>
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
	onThemeToggle: () => void;
	onToggle: () => void;
	onWorkerChange: (workerName: string) => void;
	r2Buckets: R2Bucket[];
	r2Error: string | null;
	resolvedTheme: ResolvedTheme;
	selectedWorker: string;
	themePreference: ThemePreference;
	workers: LocalExplorerWorker[];
	workflows: WorkflowsWorkflow[];
	workflowsError: string | null;
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
	onThemeToggle,
	onToggle,
	onWorkerChange,
	r2Buckets,
	r2Error,
	resolvedTheme,
	selectedWorker,
	themePreference,
	workers,
	workflows,
	workflowsError,
}: SidebarProps) {
	const ThemeIcon =
		themePreference === "system"
			? DesktopIcon
			: resolvedTheme === "dark"
				? MoonIcon
				: SunIcon;

	const themeLabel =
		themePreference === "system"
			? `System (${resolvedTheme === "dark" ? "Dark" : "Light"})`
			: themePreference === "dark"
				? "Dark"
				: "Light";

	const showWorkerSelector = workers.length > 1;

	// Only include the worker search param when there are multiple workers.
	// This keeps URLs clean in the common single-worker case.
	const workerSearch = workers.length > 1 ? { worker: selectedWorker } : {};

	return (
		<aside
			className={cn(
				"sticky top-0 flex h-screen flex-col bg-app-bg transition-[width] duration-200 ease-out",
				collapsed ? "w-sidebar-collapsed" : "w-sidebar"
			)}
		>
			{/* Header with logo */}
			<a
				className="mt-2 box-border flex min-h-16 items-center gap-2.5 overflow-hidden p-3"
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
			<nav className="flex-1 space-y-1 overflow-x-hidden overflow-y-auto py-2">
				{showWorkerSelector && (
					<WorkerSelector
						workers={workers}
						selectedWorker={selectedWorker}
						onWorkerChange={onWorkerChange}
					/>
				)}

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
					emptyLabel="No buckets"
					error={r2Error}
					icon={R2Icon}
					items={r2Buckets.map((bucket) => {
						const bucketName = bucket.name ?? "Unknown";
						return {
							id: bucketName,
							isActive:
								currentPath === `/r2/${bucketName}` ||
								currentPath.startsWith(`/r2/${bucketName}/`),
							label: bucketName,
							link: {
								params: { bucketName },
								to: "/r2/$bucketName",
							},
						};
					})}
					storageKey="r2"
					title="R2 Buckets"
				/>

				<SidebarItemGroup
					collapsed={collapsed}
					emptyLabel="No workflows"
					error={workflowsError}
					icon={WorkflowsIcon}
					items={workflows.map((wf) => ({
						id: wf.name as string,
						isActive:
							currentPath === `/workflows/${wf.name}` ||
							currentPath.startsWith(`/workflows/${wf.name}/`),
						label: wf.name as string,
						link: {
							params: { workflowName: wf.name },
							search: workerSearch,
							to: "/workflows/$workflowName",
						},
					}))}
					storageKey="workflows"
					title="Workflows"
				/>
			</nav>

			{/* Footer buttons */}
			<div className="shrink-0 space-y-1 p-2">
				<Button
					aria-label={`Theme: ${themeLabel}. Click to cycle.`}
					onClick={onThemeToggle}
					shape="square"
					title={`Theme: ${themeLabel}`}
					type="button"
					variant="ghost"
					icon={<ThemeIcon className="h-5 w-5" weight="regular" />}
				/>

				<Button
					aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
					onClick={onToggle}
					shape="square"
					title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
					type="button"
					variant="ghost"
					icon={<SidebarSimpleIcon className="h-5 w-5" weight="regular" />}
				/>
			</div>
		</aside>
	);
}
