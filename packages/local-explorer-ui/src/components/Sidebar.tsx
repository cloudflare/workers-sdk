import { Collapsible } from "@base-ui/react/collapsible";
import { DatabaseIcon } from "@phosphor-icons/react";
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

function ChevronIcon(props: React.ComponentProps<"svg">) {
	return (
		<svg width="10" height="10" viewBox="0 0 10 10" fill="none" {...props}>
			<path d="M3.5 9L7.5 5L3.5 1" stroke="currentcolor" strokeWidth="1.5" />
		</svg>
	);
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
			<div className="flex items-center gap-2.5 p-4 border-b border-border min-h-[67px] box-border">
				<CloudflareLogo className="shrink-0 text-primary" />
				<div className="flex flex-col gap-px">
					<span className="text-sm font-semibold text-text leading-tight">
						Local Explorer
					</span>
					<span className="text-[10px] font-medium text-text-secondary uppercase tracking-wide">
						Cloudflare Dev Tools
					</span>
				</div>
			</div>
			<Collapsible.Root defaultOpen>
				<Collapsible.Trigger className="sidebar-section-trigger flex items-center gap-2 w-full py-3 px-4 border-0 border-b border-border bg-transparent font-semibold text-[11px] uppercase tracking-wide text-text-secondary cursor-pointer transition-colors hover:bg-border">
					<ChevronIcon className="sidebar-section-icon transition-transform duration-200" />
					<KVIcon className="w-3.5 h-3.5" />
					KV Namespaces
				</Collapsible.Trigger>
				<Collapsible.Panel className="sidebar-section-panel">
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
											className={`block py-2.5 px-4 text-text no-underline border-b border-border cursor-pointer transition-colors hover:bg-border ${isActive ? "bg-primary/8 text-primary border-l-3 border-l-primary pl-[13px]" : ""}`}
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

			<Collapsible.Root defaultOpen className="sidebar-section">
				<Collapsible.Trigger className="sidebar-section-trigger">
					<ChevronIcon className="sidebar-section-icon" />
					<DatabaseIcon className="sidebar-section-type-icon" />
					D1 Databases
				</Collapsible.Trigger>
				<Collapsible.Panel className="sidebar-section-panel">
					<ul className="sidebar-list">
						{loading && (
							<li className="sidebar-item sidebar-item--muted">Loading...</li>
						)}
						{error && (
							<li className="sidebar-item sidebar-item--error">{error}</li>
						)}
						{!loading &&
							!error &&
							databases.map((db) => {
								const isActive = currentPath === `/d1/${db.uuid}`;
								return (
									<li key={db.uuid}>
										<Link
											to="/d1/$databaseId"
											params={{ databaseId: db.uuid as string }}
											className={`sidebar-item ${isActive ? "active" : ""}`}
										>
											{db.name}
										</Link>
									</li>
								);
							})}
						{!loading && !error && databases.length === 0 && (
							<li className="sidebar-item sidebar-item--muted">No databases</li>
						)}
					</ul>
				</Collapsible.Panel>
			</Collapsible.Root>
		</aside>
	);
}
