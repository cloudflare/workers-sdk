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
import WorkersIcon from "../assets/icons/workers.svg?react";
import WorkflowsIcon from "../assets/icons/workflows.svg?react";
import type {
	D1DatabaseResponse,
	LocalExplorerWorker,
	R2Bucket,
	WorkersKvNamespace,
	WorkersNamespace,
	WorkflowsWorkflow,
} from "../api";
import type { ResolvedTheme, ThemePreference } from "../hooks/useTheme";
import type { FileRouteTypes } from "../routeTree.gen";
import type { FC } from "react";

interface SidebarItem {
	id: string;
	isActive: boolean;
	label: string;
	link: {
		params: object;
		search?: object;
		to: FileRouteTypes["to"];
	};
}

interface SidebarItemGroupProps {
	collapsed: boolean;
	emptyLabel: string;
	error: string | null;
	icon: FC<{ className?: string }>;
	items: SidebarItem[];
	showItemTree?: boolean;
	storageKey: string;
	title: string;
}

function SidebarItemGroup({
	collapsed,
	emptyLabel,
	error,
	icon: Icon,
	items,
	showItemTree = true,
	storageKey,
	title,
}: SidebarItemGroupProps): JSX.Element {
	const [popoverOpen, setPopoverOpen] = useState<boolean>(false);
	const [isExpanded, setIsExpanded] = useState<boolean>(() => {
		if (typeof window !== "undefined") {
			const stored = localStorage.getItem(`sidebar-group-${storageKey}`);
			return stored === "true";
		}

		return false;
	});

	function handleExpandedChange(open: boolean): void {
		setIsExpanded(open);
		localStorage.setItem(`sidebar-group-${storageKey}`, String(open));
	}

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
						className="min-w-56 p-0 [&_svg[class*='arrow']]:hidden [&>svg]:hidden"
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
													"block cursor-pointer rounded-l-md px-2 py-2.5 text-sm text-text no-underline transition-colors hover:bg-surface-tertiary",
													{
														"bg-primary/10 font-medium text-primary":
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
				<div className="min-h-0 overflow-hidden">
					<ul className="mt-0.5 list-none space-y-0.5 px-2">
						{error ? (
							<li className="ml-8.5 px-2.5 py-2 text-sm text-danger">
								{error}
							</li>
						) : null}

						{!error
							? items.map((item, index) => {
									const isFirst = index === 0;
									const isLast = index === items.length - 1;
									return (
										<li key={item.id} className="relative">
											{showItemTree ? (
												isLast ? (
													<span className="absolute top-0 left-6.5 h-1/2 w-2 rounded-bl-md border-b border-l border-text-secondary/35 dark:border-text-secondary/25" />
												) : (
													<>
														<span className="absolute top-0 left-6.5 h-[calc(100%+2px)] w-px bg-text-secondary/35 dark:bg-text-secondary/25" />
														<span className="absolute top-1/2 left-6.5 h-px w-2 -translate-y-px bg-text-secondary/35 dark:bg-text-secondary/25" />
													</>
												)
											) : isFirst && isLast ? (
												<span className="absolute top-0 left-6.5 h-1/2 w-2 rounded-bl-md border-b border-l border-text-secondary/35 dark:border-text-secondary/25" />
											) : isFirst ? (
												<>
													<span className="absolute top-0 left-6.5 h-[calc(100%+2px)] w-px bg-text-secondary/35 dark:bg-text-secondary/25" />
													<span className="absolute top-1/2 left-6.5 h-px w-2 -translate-y-px bg-text-secondary/35 dark:bg-text-secondary/25" />
												</>
											) : isLast ? (
												<span className="absolute top-0 left-6.5 h-1/2 w-2 rounded-bl-md border-b border-l border-text-secondary/35 dark:border-text-secondary/25" />
											) : (
												<>
													<span className="absolute top-0 left-6.5 h-[calc(100%+2px)] w-px bg-text-secondary/35 dark:bg-text-secondary/25" />
													<span className="absolute top-1/2 left-6.5 h-px w-2 -translate-y-px bg-text-secondary/35 dark:bg-text-secondary/25" />
												</>
											)}

											<Link
												className={cn(
													"group flex cursor-pointer items-center gap-2.5 rounded-lg p-2 text-sm font-medium no-underline transition-colors",
													"ml-9.5",
													item.isActive
														? "bg-primary/10 text-primary hover:bg-primary/15"
														: "text-text hover:bg-surface-tertiary"
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

interface WorkerResourceGroup {
	databases: D1DatabaseResponse[];
	doNamespaces: WorkersNamespace[];
	kvNamespaces: WorkersKvNamespace[];
	r2Buckets: R2Bucket[];
	worker: LocalExplorerWorker;
	workflows: WorkflowsWorkflow[];
}

interface SidebarProps {
	collapsed: boolean;
	currentPath: string;
	d1Error: string | null;
	doError: string | null;
	kvError: string | null;
	onThemeToggle: () => void;
	onToggle: () => void;
	r2Error: string | null;
	resolvedTheme: ResolvedTheme;
	themePreference: ThemePreference;
	workerGroups: WorkerResourceGroup[];
	workflowsError: string | null;
}

interface WorkerSidebarGroupProps {
	collapsed: boolean;
	currentPath: string;
	d1Error: string | null;
	doError: string | null;
	kvError: string | null;
	r2Error: string | null;
	workerGroup: WorkerResourceGroup;
	workflowsError: string | null;
}

function WorkerSidebarGroup({
	collapsed,
	currentPath,
	d1Error,
	doError,
	kvError,
	r2Error,
	workerGroup,
	workflowsError,
}: WorkerSidebarGroupProps): JSX.Element {
	const { worker } = workerGroup;
	const workerPrefix = `/${worker.name}`;

	const [defaultWorkerExpanded] = useState<boolean>(() => {
		if (typeof window !== "undefined") {
			const stored = localStorage.getItem(
				`sidebar-group-worker-${worker.name}`
			);
			return stored !== "false";
		}

		return true;
	});

	const d1Items = workerGroup.databases.map(
		(db): SidebarItem => ({
			id: `${worker.name}-${db.uuid}`,
			isActive: currentPath === `${workerPrefix}/d1/${db.uuid}`,
			label: db.name ?? "Unknown",
			link: {
				params: { databaseId: db.uuid, workerName: worker.name },
				search: { table: undefined },
				to: "/$workerName/d1/$databaseId",
			},
		})
	);

	const doItems = workerGroup.doNamespaces.map((ns): SidebarItem => {
		const className = ns.class ?? ns.name ?? ns.id ?? "Unknown";
		return {
			id: `${worker.name}-${ns.id}`,
			isActive:
				currentPath === `${workerPrefix}/do/${className}` ||
				currentPath.startsWith(`${workerPrefix}/do/${className}/`),
			label: className,
			link: {
				params: { className, workerName: worker.name },
				to: "/$workerName/do/$className",
			},
		};
	});

	const kvItems = workerGroup.kvNamespaces.map(
		(ns): SidebarItem => ({
			id: `${worker.name}-${ns.id}`,
			isActive: currentPath === `${workerPrefix}/kv/${ns.id}`,
			label: ns.title,
			link: {
				params: { namespaceId: ns.id, workerName: worker.name },
				to: "/$workerName/kv/$namespaceId",
			},
		})
	);

	const r2Items = workerGroup.r2Buckets.map((bucket): SidebarItem => {
		const bucketName = bucket.name ?? "Unknown";
		return {
			id: `${worker.name}-${bucketName}`,
			isActive:
				currentPath === `${workerPrefix}/r2/${bucketName}` ||
				currentPath.startsWith(`${workerPrefix}/r2/${bucketName}/`),
			label: bucketName,
			link: {
				params: { bucketName, workerName: worker.name },
				to: "/$workerName/r2/$bucketName",
			},
		};
	});

	const workflowItems = workerGroup.workflows.map(
		(wf): SidebarItem => ({
			id: `${worker.name}-${wf.name}`,
			isActive:
				currentPath === `${workerPrefix}/workflows/${wf.name}` ||
				currentPath.startsWith(`${workerPrefix}/workflows/${wf.name}/`),
			label: wf.name,
			link: {
				params: { workerName: worker.name, workflowName: wf.name },
				to: "/$workerName/workflows/$workflowName",
			},
		})
	);

	const resourceGroups = [
		{
			emptyLabel: "No databases",
			error: d1Error,
			icon: D1Icon,
			items: d1Items,
			key: "d1",
			title: "D1 Databases",
		},
		{
			emptyLabel: "No namespaces",
			error: doError,
			icon: DOIcon,
			items: doItems,
			key: "do",
			title: "Durable Objects",
		},
		{
			emptyLabel: "No namespaces",
			error: kvError,
			icon: KVIcon,
			items: kvItems,
			key: "kv",
			title: "KV Namespaces",
		},
		{
			emptyLabel: "No buckets",
			error: r2Error,
			icon: R2Icon,
			items: r2Items,
			key: "r2",
			title: "R2 Buckets",
		},
		{
			emptyLabel: "No workflows",
			error: workflowsError,
			icon: WorkflowsIcon,
			items: workflowItems,
			key: "workflows",
			title: "Workflows",
		},
	] as const;

	if (collapsed) {
		return (
			<div className="flex items-center px-3">
				<Popover>
					<Popover.Trigger
						className="group flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-tertiary hover:text-text"
						delay={100}
						openOnHover={true}
					>
						<WorkersIcon className="h-5 w-5" />
					</Popover.Trigger>

					<Popover.Content
						align="start"
						className="min-w-64 p-0 [&_svg[class*='arrow']]:hidden [&>svg]:hidden"
						side="right"
						sideOffset={8}
					>
						<div className="border-b border-border px-3 py-2">
							<span className="text-xs font-semibold text-text">
								{worker.name}
							</span>
						</div>

						<div className="max-h-84 overflow-y-auto p-1.5">
							{resourceGroups.map((group, index) => (
								<div
									className={cn("py-2", {
										"border-t border-border": index > 0,
									})}
									key={`${worker.name}-${group.key}`}
								>
									<div className="mb-1 px-2 text-[8px] font-semibold tracking-wide text-text-secondary uppercase">
										{group.title}
									</div>

									{group.error ? (
										<div className="px-2 py-1 text-xs text-danger">
											{group.error}
										</div>
									) : group.items.length === 0 ? (
										<div className="px-2 py-1 text-xs text-text-secondary italic">
											{group.emptyLabel}
										</div>
									) : (
										<ul className="list-none space-y-0.5">
											{group.items.map((item) => (
												<li key={item.id}>
													<Link
														className={cn(
															"block cursor-pointer rounded-l-md px-2 py-2 text-sm text-text no-underline transition-colors hover:bg-surface-tertiary",
															{
																"bg-primary/10 font-medium text-primary":
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
											))}
										</ul>
									)}
								</div>
							))}
						</div>
					</Popover.Content>
				</Popover>
			</div>
		);
	}

	return (
		<Collapsible.Root
			defaultOpen={defaultWorkerExpanded}
			onOpenChange={(open) => {
				localStorage.setItem(
					`sidebar-group-worker-${worker.name}`,
					String(open)
				);
			}}
		>
			<Collapsible.Trigger className="group mx-2 flex w-[calc(100%-1rem)] cursor-pointer items-center gap-2 rounded-lg bg-transparent px-2 text-xs font-semibold text-text transition-colors hover:bg-surface-tertiary">
				<span className="flex h-9 w-9 shrink-0 items-center justify-center">
					<WorkersIcon className="h-5 w-5 -translate-x-1" />
				</span>
				<span className="flex-1 truncate text-left">{worker.name}</span>
				<CaretDownIcon
					className="h-3 w-3 -rotate-90 transition-transform duration-300 group-data-panel-open:rotate-0"
					weight="bold"
				/>
			</Collapsible.Trigger>

			<Collapsible.Panel
				className="grid grid-rows-[1fr] transition-[grid-template-rows,opacity] duration-300 ease-in-out data-ending-style:grid-rows-[0fr] data-ending-style:opacity-0 data-starting-style:grid-rows-[0fr] data-starting-style:opacity-0"
				keepMounted
			>
				<div className="min-h-0 overflow-hidden">
					<div className="pl-2">
						<ul className="list-none space-y-0.5 pr-2">
							{resourceGroups.map((group, index) => {
								const isLast = index === resourceGroups.length - 1;
								return (
									<li className="relative" key={`${worker.name}-${group.key}`}>
										{isLast ? (
											<>
												<span className="absolute top-0 left-4.5 h-4.5 w-px bg-text-secondary/35 dark:bg-text-secondary/25" />
												<span className="absolute top-4.5 left-4.5 h-1 w-2 rounded-bl-md border-b border-l border-text-secondary/35 dark:border-text-secondary/25" />
											</>
										) : (
											<>
												<span className="absolute top-0 left-4.5 h-[calc(100%+2px)] w-px bg-text-secondary/35 dark:bg-text-secondary/25" />
												<span className="absolute top-4.5 left-4.5 h-px w-2 bg-text-secondary/35 dark:bg-text-secondary/25" />
											</>
										)}

										<div className="ml-4">
											<SidebarItemGroup
												collapsed={false}
												emptyLabel={group.emptyLabel}
												error={group.error}
												icon={group.icon}
												items={group.items}
												showItemTree={false}
												storageKey={`${worker.name}-${group.key}`}
												title={group.title}
											/>
										</div>
									</li>
								);
							})}
						</ul>
					</div>
				</div>
			</Collapsible.Panel>
		</Collapsible.Root>
	);
}

export function Sidebar({
	collapsed,
	currentPath,
	d1Error,
	doError,
	kvError,
	onThemeToggle,
	onToggle,
	r2Error,
	resolvedTheme,
	themePreference,
	workerGroups,
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

	return (
		<aside
			className={cn(
				"sticky top-0 flex h-screen flex-col transition-[width] duration-200 ease-out",
				collapsed ? "w-sidebar-collapsed" : "w-sidebar"
			)}
		>
			<a
				className={cn(
					"mt-2 box-border flex min-h-16 items-center justify-start gap-2.5 overflow-hidden py-3 transition-all duration-300",
					collapsed ? "px-3" : "px-6"
				)}
				href="/cdn-cgi/explorer/"
			>
				<CloudflareLogo variant="glyph" className="h-8 w-8 shrink-0" />
				{!collapsed ? (
					<div className="flex w-auto flex-col gap-px overflow-hidden opacity-100 transition-[opacity,width] duration-200 ease-out">
						<span className="text-sm leading-tight font-semibold whitespace-nowrap text-text">
							Local Explorer
						</span>
						<span className="text-[10px] font-medium tracking-wide whitespace-nowrap text-text-secondary uppercase">
							Cloudflare DevTools
						</span>
					</div>
				) : null}
			</a>

			<nav className="flex-1 space-y-1 overflow-x-hidden overflow-y-auto">
				{workerGroups.map((workerGroup) => (
					<WorkerSidebarGroup
						collapsed={collapsed}
						currentPath={currentPath}
						d1Error={d1Error}
						doError={doError}
						key={workerGroup.worker.name}
						kvError={kvError}
						r2Error={r2Error}
						workerGroup={workerGroup}
						workflowsError={workflowsError}
					/>
				))}
			</nav>

			<div className="shrink-0 space-y-1 p-2">
				<Button
					aria-label={`Theme: ${themeLabel}. Click to cycle.`}
					icon={<ThemeIcon className="h-5 w-5" weight="regular" />}
					onClick={onThemeToggle}
					shape="square"
					title={`Theme: ${themeLabel}`}
					type="button"
					variant="ghost"
				/>

				<Button
					aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
					icon={<SidebarSimpleIcon className="h-5 w-5" weight="regular" />}
					onClick={onToggle}
					shape="square"
					title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
					type="button"
					variant="ghost"
				/>
			</div>
		</aside>
	);
}
