import {
	Badge,
	CloudflareLogo,
	cn,
	Sidebar,
	useSidebar,
} from "@cloudflare/kumo";
import { MoonIcon } from "@phosphor-icons/react";
import { useRouter } from "@tanstack/react-router";
import D1Icon from "../assets/icons/d1.svg?react";
import DOIcon from "../assets/icons/durable-objects.svg?react";
import KVIcon from "../assets/icons/kv.svg?react";
import R2Icon from "../assets/icons/r2.svg?react";
import WorkflowsIcon from "../assets/icons/workflows.svg?react";
import { type LocalExplorerWorker } from "./WorkerSelector";
import type {
	D1DatabaseResponse,
	R2Bucket,
	WorkersKvNamespace,
	WorkersNamespace,
	WorkflowsWorkflow,
} from "../api";
import type { FC } from "react";

interface SidebarProps {
	currentPath: string;
	d1Error: string | null;
	databases: D1DatabaseResponse[];
	doError: string | null;
	doNamespaces: WorkersNamespace[];
	kvError: string | null;
	kvNamespaces: WorkersKvNamespace[];
	r2Buckets: R2Bucket[];
	r2Error: string | null;
	workers: LocalExplorerWorker[];
	selectedWorker: string;
	onWorkerChange: (workerName: string) => void;
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
	r2Buckets,
	r2Error,
	workers,
	selectedWorker,
	// onWorkerChange,
	workflows,
	workflowsError,
}: SidebarProps) {
	const router = useRouter();
	const sidebar = useSidebar();

	// const showWorkerSelector = workers.length > 1;

	// Only include the worker search param when there are multiple workers.
	// This keeps URLs clean in the common single-worker case.
	const workerSearch = workers.length > 1 ? { worker: selectedWorker } : {};

	const sidebarItemGroups = [
		{
			emptyLabel: "No databases",
			error: d1Error,
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
				<Sidebar.MenuItem>
					{sidebarItemGroups.map((group) => (
						<Sidebar.Collapsible key={group.title}>
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
								{!group.error && group.items.length === 0 ? (
									<div className="text-text-secondary px-2 py-1.5 text-sm italic">
										{group.emptyLabel}
									</div>
								) : (
									group.items.map((item) => (
										<Sidebar.MenuSub key={item.id}>
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
			</Sidebar.Content>

			<Sidebar.Footer className="gap-1">
				<Sidebar.MenuButton
					className="px-2"
					icon={<MoonIcon size={18} weight="bold" />}
					onClick={() => {}}
					tooltip="Switch theme"
					type="button"
				/>

				<Sidebar.Trigger className="cursor-pointer" />
			</Sidebar.Footer>
		</Sidebar>
	);
}
