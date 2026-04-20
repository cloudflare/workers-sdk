import {
	Badge,
	CloudflareLogo,
	cn,
	Sidebar,
	useSidebar,
} from "@cloudflare/kumo";
import { MonitorIcon, MoonIcon, SunIcon } from "@phosphor-icons/react";
import { useRouter } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import D1Icon from "../assets/icons/d1.svg?react";
import DOIcon from "../assets/icons/durable-objects.svg?react";
import KVIcon from "../assets/icons/kv.svg?react";
import R2Icon from "../assets/icons/r2.svg?react";
import WorkflowsIcon from "../assets/icons/workflows.svg?react";
import { loadGroupState, saveGroupState } from "../utils/sidebar-state";
import { getNextThemeMode } from "../utils/theme-state";
import { SidebarGroupPopup } from "./SidebarGroupPopup";
import { WorkerSelector, type LocalExplorerWorker } from "./WorkerSelector";
import type { LocalExplorerWorkerBindings } from "../api";
import type { FileRouteTypes } from "../routeTree.gen";
import type { SidebarGroupId, SidebarGroupState } from "../utils/sidebar-state";
import type { ThemeMode } from "../utils/theme-state";
import type { FC } from "react";

const THEME_MODE_CONFIG = {
	light: {
		icon: SunIcon,
		label: "Light",
	},
	dark: {
		icon: MoonIcon,
		label: "Dark",
	},
	system: {
		icon: MonitorIcon,
		label: "System",
	},
} satisfies Record<
	ThemeMode,
	{
		icon: typeof SunIcon;
		label: string;
	}
>;

interface SidebarProps {
	bindings?: LocalExplorerWorkerBindings;
	currentPath: string;
	onCycleTheme: () => void;
	onWorkerChange: (workerName: string) => void;
	selectedWorker: string;
	themeMode: ThemeMode;
	workers: LocalExplorerWorker[];
}

export function AppSidebar({
	bindings,
	currentPath,
	onCycleTheme,
	onWorkerChange,
	selectedWorker,
	themeMode,
	workers,
}: SidebarProps) {
	const router = useRouter();
	const sidebar = useSidebar();

	const [groupOpen, setGroupOpen] = useState<SidebarGroupState>(loadGroupState);

	const handleGroupOpenChange = useCallback(
		(groupId: SidebarGroupId, open: boolean) => {
			setGroupOpen((prev) => {
				const next = { ...prev, [groupId]: open };
				saveGroupState(next);
				return next;
			});
		},
		[]
	);

	const showWorkerSelector = workers.length > 1;
	const workerSearch = workers.length > 1 ? { worker: selectedWorker } : {};

	const d1Databases = bindings?.d1 ?? [];
	const doNamespaces = (bindings?.do ?? []).filter((ns) => ns.useSqlite);
	const kvNamespaces = bindings?.kv ?? [];
	const r2Buckets = bindings?.r2 ?? [];
	const workflows = bindings?.workflows ?? [];

	const sidebarItemGroups = [
		{
			emptyLabel: "No databases",
			groupId: "d1" as const,
			icon: D1Icon,
			items: d1Databases.map((db) => ({
				id: db.id,
				isActive: currentPath === `/d1/${db.id}`,
				label: db.bindingName,
				link: {
					params: { databaseId: db.id },
					search: { table: undefined, ...workerSearch },
					to: "/d1/$databaseId",
				},
			})),
			title: "D1 Databases",
		},
		{
			emptyLabel: "No SQLite namespaces",
			groupId: "do" as const,
			icon: DOIcon,
			items: doNamespaces.map((ns) => ({
				id: ns.id,
				isActive:
					currentPath === `/do/${ns.className}` ||
					currentPath.startsWith(`/do/${ns.className}/`),
				label: ns.className,
				link: {
					params: { className: ns.className },
					search: workerSearch,
					to: "/do/$className",
				},
			})),
			title: "Durable Objects",
		},
		{
			emptyLabel: "No namespaces",
			groupId: "kv" as const,
			icon: KVIcon,
			items: kvNamespaces.map((ns) => ({
				id: ns.id,
				isActive: currentPath === `/kv/${ns.id}`,
				label: ns.bindingName,
				link: {
					params: { namespaceId: ns.id },
					search: workerSearch,
					to: "/kv/$namespaceId",
				},
			})),
			title: "KV Namespaces",
		},
		{
			emptyLabel: "No buckets",
			groupId: "r2" as const,
			icon: R2Icon,
			items: r2Buckets.map((bucket) => ({
				id: bucket.id,
				isActive:
					currentPath === `/r2/${bucket.id}` ||
					currentPath.startsWith(`/r2/${bucket.id}/`),
				label: bucket.bindingName,
				link: {
					params: { bucketName: bucket.id },
					search: workerSearch,
					to: "/r2/$bucketName",
				},
			})),
			title: "R2 Buckets",
		},
		{
			emptyLabel: "No workflows",
			groupId: "workflows" as const,
			icon: WorkflowsIcon,
			items: workflows.map((wf) => ({
				id: wf.id,
				isActive:
					currentPath === `/workflows/${wf.id}` ||
					currentPath.startsWith(`/workflows/${wf.id}/`),
				label: wf.bindingName,
				link: {
					params: { workflowName: wf.id },
					search: workerSearch,
					to: "/workflows/$workflowName",
				},
			})),
			title: "Workflows",
		},
	] satisfies Array<{
		emptyLabel: string;
		groupId: SidebarGroupId;
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
	}>;

	return (
		<Sidebar className="bg-kumo-elevated">
			<Sidebar.Header className="min-h-14.5 border-b">
				<div className="flex w-full items-center justify-between">
					<a
						className="box-border flex items-center gap-2.5 px-1"
						href="/cdn-cgi/explorer/"
					>
						<CloudflareLogo
							className={cn(
								"shrink-0 transition-all duration-200",
								sidebar.open ? "h-8 w-8" : "h-6 w-6"
							)}
							variant="glyph"
						/>

						{sidebar.open ? (
							<div className="flex flex-col gap-px">
								<h3 className="text-text text-sm leading-tight font-semibold">
									Local Explorer
								</h3>

								<p className="text-text-secondary text-[9px] font-medium tracking-wide uppercase">
									Cloudflare DevTools
								</p>
							</div>
						) : null}
					</a>

					{sidebar.open ? (
						<Badge className="mr-1" variant="beta">
							Beta
						</Badge>
					) : null}
				</div>
			</Sidebar.Header>

			<Sidebar.Content>
				{showWorkerSelector && (
					<WorkerSelector
						workers={workers}
						selectedWorker={selectedWorker}
						onWorkerChange={onWorkerChange}
					/>
				)}

				{sidebar.open ? (
					<Sidebar.MenuItem className="space-y-1">
						{sidebarItemGroups.map((group) => (
							<Sidebar.Collapsible
								key={group.groupId}
								open={groupOpen[group.groupId]}
								onOpenChange={(open) => {
									handleGroupOpenChange(group.groupId, open);
								}}
							>
								<Sidebar.CollapsibleTrigger
									render={
										<Sidebar.MenuButton
											icon={<group.icon width={20} height={20} />}
										>
											{group.title} <Sidebar.MenuChevron />
										</Sidebar.MenuButton>
									}
								/>

								<Sidebar.CollapsibleContent>
									<Sidebar.MenuSub className="mt-1 ml-5.5 space-y-0.5">
										{group.items.length === 0 ? (
											<div className="text-text-secondary ml-8 px-2 py-1.5 text-sm italic">
												{group.emptyLabel}
											</div>
										) : (
											group.items.map((item) => (
												<Sidebar.MenuSubButton
													active={item.isActive}
													className="cursor-pointer"
													href={router.buildLocation(item.link).href}
													key={item.id}
												>
													{item.label}
												</Sidebar.MenuSubButton>
											))
										)}
									</Sidebar.MenuSub>
								</Sidebar.CollapsibleContent>
							</Sidebar.Collapsible>
						))}
					</Sidebar.MenuItem>
				) : (
					<Sidebar.MenuItem className="space-y-1">
						{sidebarItemGroups.map((group) => (
							<SidebarGroupPopup
								emptyLabel={group.emptyLabel}
								icon={<group.icon width={20} height={20} />}
								items={group.items}
								key={group.groupId}
								title={group.title}
							/>
						))}
					</Sidebar.MenuItem>
				)}
			</Sidebar.Content>

			<Sidebar.Footer className="gap-1">
				{(() => {
					const { icon: Icon, label } = THEME_MODE_CONFIG[themeMode];
					const nextLabel =
						THEME_MODE_CONFIG[getNextThemeMode(themeMode)].label;

					return (
						<Sidebar.MenuButton
							aria-label={`Theme: ${label}. Switch to ${nextLabel}`}
							className="px-2"
							icon={<Icon size={18} weight="bold" />}
							onClick={onCycleTheme}
							tooltip={`Theme: ${label}`}
							type="button"
						/>
					);
				})()}

				<Sidebar.Trigger className="cursor-pointer hover:bg-kumo-tint" />
			</Sidebar.Footer>
		</Sidebar>
	);
}
