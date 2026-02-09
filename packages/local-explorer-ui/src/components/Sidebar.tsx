import { Collapsible } from "@base-ui/react/collapsible";
import { cn } from "@cloudflare/kumo";
import { CaretRightIcon, DatabaseIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import CloudflareLogo from "../assets/icons/cloudflare-logo.svg?react";
import KVIcon from "../assets/icons/kv.svg?react";
import type { D1DatabaseResponse, WorkersKvNamespace } from "../api";

interface SidebarProps {
	namespaces: WorkersKvNamespace[];
	databases: D1DatabaseResponse[];
	loading: boolean;
	error: string | null;
	currentPath: string;
}

export function Sidebar({
	namespaces,
	databases,
	loading,
	error,
	currentPath,
}: SidebarProps) {
	return (
		<aside className="w-sidebar bg-bg-secondary border-r border-border flex flex-col">
			<a
				className="flex items-center gap-2.5 p-4 border-b border-border min-h-[67px] box-border"
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

			<Collapsible.Root defaultOpen>
				<Collapsible.Trigger className="group flex items-center gap-2 w-full py-3 px-4 border-0 border-b border-border bg-transparent font-semibold text-[11px] uppercase tracking-wide text-text-secondary cursor-pointer transition-colors hover:bg-border">
					<CaretRightIcon className="transition-transform duration-200 group-data-[panel-open]:rotate-90" />
					<KVIcon className="w-3.5 h-3.5" />
					KV Namespaces
				</Collapsible.Trigger>
				<Collapsible.Panel className="overflow-hidden transition-[height,opacity] duration-200 ease-out data-[starting-style]:h-0 data-[starting-style]:opacity-0 data-[ending-style]:h-0 data-[ending-style]:opacity-0">
					<ul className="list-none flex-1 overflow-y-auto">
						{loading && (
							<li className="block py-2.5 px-4 text-text-secondary border-b border-border">
								Loading...
							</li>
						)}
						{error && (
							<li className="block py-2.5 px-4 text-danger border-b border-border">
								{error}
							</li>
						)}
						{!loading &&
							!error &&
							namespaces.map((ns) => {
								const isActive = currentPath === `/kv/${ns.id}`;
								return (
									<li key={ns.id}>
										<Link
											to="/kv/$namespaceId"
											params={{ namespaceId: ns.id }}
											className={cn(
												"block py-2.5 px-4 text-text no-underline border-b border-border cursor-pointer transition-colors hover:bg-border",
												isActive
													? "bg-primary/8 text-primary border-l-3 border-l-primary pl-[13px]"
													: ""
											)}
										>
											{ns.title}
										</Link>
									</li>
								);
							})}
						{!loading && !error && namespaces.length === 0 && (
							<li className="block py-2.5 px-4 text-text-secondary border-b border-border">
								No namespaces
							</li>
						)}
					</ul>
				</Collapsible.Panel>
			</Collapsible.Root>

			<Collapsible.Root defaultOpen>
				<Collapsible.Trigger className="group flex items-center gap-2 w-full py-3 px-4 border-0 border-b border-border bg-transparent font-semibold text-[11px] uppercase tracking-wide text-text-secondary cursor-pointer transition-colors hover:bg-border">
					<CaretRightIcon className="transition-transform duration-200 group-data-[panel-open]:rotate-90" />
					<DatabaseIcon className="w-3.5 h-3.5" />
					D1 Databases
				</Collapsible.Trigger>
				<Collapsible.Panel className="overflow-hidden transition-[height,opacity] duration-200 ease-out data-[starting-style]:h-0 data-[starting-style]:opacity-0 data-[ending-style]:h-0 data-[ending-style]:opacity-0">
					<ul className="list-none flex-1 overflow-y-auto">
						{loading && (
							<li className="block py-2.5 px-4 text-text-secondary border-b border-border">
								Loading...
							</li>
						)}
						{error && (
							<li className="block py-2.5 px-4 text-danger border-b border-border">
								{error}
							</li>
						)}
						{!loading &&
							!error &&
							databases.map((database) => {
								const isActive = currentPath === `/d1/${database.uuid}`;
								return (
									<li key={database.uuid}>
										<Link
											className={cn(
												"block py-2.5 px-4 text-text no-underline border-b border-border cursor-pointer transition-colors hover:bg-border",
												isActive
													? "bg-primary/8 text-primary border-l-3 border-l-primary pl-[13px]"
													: ""
											)}
											params={{ databaseId: database.uuid as string }}
											search={{ table: undefined }}
											to="/d1/$databaseId"
										>
											{database.name}
										</Link>
									</li>
								);
							})}
						{!loading && !error && databases.length === 0 && (
							<li className="block py-2.5 px-4 text-text-secondary border-b border-border">
								No databases
							</li>
						)}
					</ul>
				</Collapsible.Panel>
			</Collapsible.Root>
		</aside>
	);
}
