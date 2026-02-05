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
		<aside className="sidebar">
			<div className="sidebar-logo">
				<CloudflareLogo style={{ color: "var(--color-primary)" }} />
				<div className="sidebar-logo-text">
					<span className="sidebar-logo-title">Local Explorer</span>
					<span className="sidebar-logo-subtitle">Wrangler Dev Tools</span>
				</div>
			</div>

			<Collapsible.Root defaultOpen className="sidebar-section">
				<Collapsible.Trigger className="sidebar-section-trigger">
					<ChevronIcon className="sidebar-section-icon" />
					<KVIcon className="sidebar-section-type-icon" />
					KV Namespaces
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
							namespaces.map((ns) => {
								const isActive = currentPath === `/kv/${ns.id}`;
								return (
									<li key={ns.id}>
										<Link
											to="/kv/$namespaceId"
											params={{ namespaceId: ns.id }}
											className={`sidebar-item ${isActive ? "active" : ""}`}
										>
											{ns.title}
										</Link>
									</li>
								);
							})}
						{!loading && !error && namespaces.length === 0 && (
							<li className="sidebar-item sidebar-item--muted">
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
