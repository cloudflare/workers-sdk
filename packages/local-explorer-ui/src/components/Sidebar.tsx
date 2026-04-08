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
import type {
	D1DatabaseResponse,
	R2Bucket,
	WorkersKvNamespace,
	WorkersNamespace,
	WorkflowsWorkflow,
} from "../api";
import type { SidebarGroupId } from "../utils/sidebar-state";
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
	currentPath: string;
	d1Error: string | null;
	databases: D1DatabaseResponse[];
	doError: string | null;
	doNamespaces: WorkersNamespace[];
	kvError: string | null;
	kvNamespaces: WorkersKvNamespace[];
	onCycleTheme: () => void;
	onWorkerChange: (workerName: string) => void;
	r2Buckets: R2Bucket[];
	r2Error: string | null;
	selectedWorker: string;
	themeMode: ThemeMode;
	workers: LocalExplorerWorker[];
	workflows: WorkflowsWorkflow[];
	workflowsError: string | null;
}

export function AppSidebar({
	currentPath,
	d1Error,
	databases,
	doError,
	doNamespaces,
	kvError,
	kvNamespaces,
	onCycleTheme,
	onWorkerChange,
	r2Buckets,
	r2Error,
	selectedWorker,
	themeMode,
	workers,
	workflows,
	workflowsError,
}: SidebarProps) {
	const router = useRouter();
	const sidebar = useSidebar();

	const [groupOpen, setGroupOpen] = useState(loadGroupState);

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

	// Only include the worker search param when there are multiple workers.
	// This keeps URLs clean in the common single-worker case.
	const workerSearch = workers.length > 1 ? { worker: selectedWorker } : {};

	const sidebarItemGroups = [
		{
			emptyLabel: "No databases",
			error: d1Error,
			groupId: "d1" as const,
			icon: D1Icon,
			items: databases.map((db) => ({
				href: router.buildLocation({
					params: { databaseId: db.uuid as string },
					search: { table: undefined, ...workerSearch },
					to: "/d1/$databaseId",
				}).href,
				id: db.uuid as string,
				isActive: currentPath === `/d1/${db.uuid}`,
				label: db.name as string,
			})),
			title: "D1 Databases",
		},
		{
			emptyLabel: "No SQLite namespaces",
			error: doError,
			groupId: "do" as const,
			icon: DOIcon,
			items: doNamespaces.map((ns) => {
				const className = ns.class ?? ns.name ?? ns.id ?? "Unknown";
				return {
					href: router.buildLocation({
						params: { className },
						search: workerSearch,
						to: "/do/$className",
					}).href,
					id: ns.id as string,
					isActive:
						currentPath === `/do/${className}` ||
						currentPath.startsWith(`/do/${className}/`),
					label: className,
				};
			}),
			title: "Durable Objects",
		},
		{
			emptyLabel: "No namespaces",
			error: kvError,
			groupId: "kv" as const,
			icon: KVIcon,
			items: kvNamespaces.map((ns) => ({
				href: router.buildLocation({
					params: { namespaceId: ns.id },
					search: workerSearch,
					to: "/kv/$namespaceId",
				}).href,
				id: ns.id,
				isActive: currentPath === `/kv/${ns.id}`,
				label: ns.title,
			})),
			title: "KV Namespaces",
		},
		{
			emptyLabel: "No buckets",
			error: r2Error,
			groupId: "r2" as const,
			icon: R2Icon,
			items: r2Buckets.map((bucket) => {
				const bucketName = bucket.name ?? "Unknown";
				return {
					href: router.buildLocation({
						params: { bucketName },
						search: workerSearch,
						to: "/r2/$bucketName",
					}).href,
					id: bucketName,
					isActive:
						currentPath === `/r2/${bucketName}` ||
						currentPath.startsWith(`/r2/${bucketName}/`),
					label: bucketName,
				};
			}),
			title: "R2 Buckets",
		},
		{
			emptyLabel: "No workflows",
			error: workflowsError,
			groupId: "workflows" as const,
			icon: WorkflowsIcon,
			items: workflows.map((wf) => ({
				href: router.buildLocation({
					params: { workflowName: wf.name },
					search: workerSearch,
					to: "/workflows/$workflowName",
				}).href,
				id: wf.name as string,
				isActive:
					currentPath === `/workflows/${wf.name}` ||
					currentPath.startsWith(`/workflows/${wf.name}/`),
				label: wf.name as string,
			})),
			title: "Workflows",
		},
	] satisfies Array<{
		emptyLabel: string;
		error: string | null;
		groupId: SidebarGroupId;
		icon: FC<{ className?: string }>;
		items: Array<{
			href: string;
			id: string;
			isActive: boolean;
			label: string;
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
									{group.error ? (
										<div className="ml-8 px-2 py-1.5 text-sm text-kumo-danger">
											{group.error}
										</div>
									) : group.items.length === 0 ? (
										<div className="text-text-secondary ml-8 px-2 py-1.5 text-sm italic">
											{group.emptyLabel}
										</div>
									) : (
										group.items.map((item) => (
											<Sidebar.MenuSub className="ml-5.5" key={item.id}>
												<Sidebar.MenuSubButton
													className="cursor-pointer"
													href={item.href}
												>
													{item.label}
												</Sidebar.MenuSubButton>
											</Sidebar.MenuSub>
										))
									)}
								</Sidebar.CollapsibleContent>
							</Sidebar.Collapsible>
						))}
					</Sidebar.MenuItem>
				) : (
					<Sidebar.MenuItem className="space-y-1">
						{sidebarItemGroups.map((group) => (
							<SidebarGroupPopup
								emptyLabel={group.emptyLabel}
								error={group.error}
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

				<Sidebar.Trigger className="cursor-pointer" />
			</Sidebar.Footer>
		</Sidebar>
	);
}
