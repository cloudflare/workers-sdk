import { CloudflareLogo, cn } from "@cloudflare/kumo";
import { Collapsible } from "@cloudflare/kumo/primitives/collapsible";
import { CaretRightIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import D1Icon from "../assets/icons/d1.svg?react";
import DOIcon from "../assets/icons/durable-objects.svg?react";
import KVIcon from "../assets/icons/kv.svg?react";
import R2Icon from "../assets/icons/r2.svg?react";
import WorkflowsIcon from "../assets/icons/workflows.svg?react";
import { WorkerSelector, type LocalExplorerWorker } from "./WorkerSelector";
import type { LocalExplorerWorkerBindings } from "../api";
import type { FileRouteTypes } from "../routeTree.gen";
import type { FC } from "react";

interface SidebarItemGroupProps {
	emptyLabel: string;
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
	icon: Icon,
	items,
	title,
}: SidebarItemGroupProps): JSX.Element {
	return (
		<Collapsible.Root defaultOpen className="py-0.5">
			<Collapsible.Trigger className="group ml-1 flex w-[calc(100%-0.25rem)] cursor-pointer items-center gap-2 rounded-l-md bg-transparent p-3 text-xs font-semibold text-kumo-default transition-colors hover:bg-kumo-brand/10">
				<CaretRightIcon
					className="h-3.5 w-3.5 text-kumo-subtle transition-transform duration-200 group-data-panel-open:rotate-90"
					weight="bold"
				/>
				<Icon className="h-4 w-4 text-kumo-subtle" />
				{title}
			</Collapsible.Trigger>

			<Collapsible.Panel className="overflow-hidden transition-[height,opacity] duration-200 ease-out data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0">
				<ul className="ml-3 list-none space-y-0.5 border-l border-kumo-fill pl-3">
					{items.map((item) => (
						<li key={item.id}>
							<Link
								className={cn(
									"block cursor-pointer rounded-l-md px-2 py-2.5 text-sm text-kumo-default no-underline transition-colors hover:bg-kumo-brand/10",
									{
										"bg-kumo-brand/10 font-medium text-kumo-link hover:bg-kumo-brand/20":
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

					{items.length === 0 && (
						<li className="px-2 py-1.5 text-sm text-kumo-subtle italic">
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
	bindings?: LocalExplorerWorkerBindings;
	workers: LocalExplorerWorker[];
	selectedWorker: string;
	onWorkerChange: (workerName: string) => void;
}

export function Sidebar({
	currentPath,
	bindings,
	workers,
	selectedWorker,
	onWorkerChange,
}: SidebarProps) {
	const showWorkerSelector = workers.length > 1;
	const workerSearch = workers.length > 1 ? { worker: selectedWorker } : {};

	const kvNamespaces = bindings?.kv ?? [];
	const databases = bindings?.d1 ?? [];
	const doNamespaces = (bindings?.do ?? []).filter((ns) => ns.useSqlite);
	const r2Buckets = bindings?.r2 ?? [];
	const workflows = bindings?.workflows ?? [];

	return (
		<aside className="flex w-sidebar flex-col border-r border-kumo-fill bg-kumo-elevated">
			<a
				className="box-border flex min-h-16.75 items-center gap-2.5 p-4"
				href="/cdn-cgi/explorer/"
			>
				<CloudflareLogo variant="glyph" className="h-8 w-8 shrink-0" />
				<div className="flex flex-col gap-px">
					<span className="text-sm leading-tight font-semibold text-kumo-default">
						Local Explorer
					</span>
					<span className="text-[10px] font-medium tracking-wide text-kumo-subtle uppercase">
						Cloudflare DevTools
					</span>
				</div>
			</a>

			{showWorkerSelector && (
				<WorkerSelector
					workers={workers}
					selectedWorker={selectedWorker}
					onWorkerChange={onWorkerChange}
				/>
			)}

			<SidebarItemGroup
				emptyLabel="No namespaces"
				icon={KVIcon}
				items={kvNamespaces.map((ns) => ({
					id: ns.id,
					isActive: currentPath === `/kv/${ns.id}`,
					label: ns.bindingName,
					link: {
						params: { namespaceId: ns.id },
						search: workerSearch,
						to: "/kv/$namespaceId",
					},
				}))}
				title="KV Namespaces"
			/>

			<SidebarItemGroup
				emptyLabel="No databases"
				icon={D1Icon}
				items={databases.map((db) => ({
					id: db.id,
					isActive: currentPath === `/d1/${db.id}`,
					label: db.bindingName,
					link: {
						params: { databaseId: db.id },
						search: { table: undefined, ...workerSearch },
						to: "/d1/$databaseId",
					},
				}))}
				title="D1 Databases"
			/>

			<SidebarItemGroup
				emptyLabel="No SQLite namespaces"
				icon={DOIcon}
				items={doNamespaces.map((ns) => ({
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
				}))}
				title="Durable Objects"
			/>

			<SidebarItemGroup
				emptyLabel="No buckets"
				icon={R2Icon}
				items={r2Buckets.map((bucket) => ({
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
				}))}
				title="R2 Buckets"
			/>
			<SidebarItemGroup
				emptyLabel="No workflows"
				icon={WorkflowsIcon}
				items={workflows.map((wf) => ({
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
				}))}
				title="Workflows"
			/>
		</aside>
	);
}
