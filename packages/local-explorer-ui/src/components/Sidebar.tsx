import { Link } from "@tanstack/react-router";
import CloudflareLogo from "../assets/icons/cloudflare-logo.svg?react";
import type { WorkersKvNamespace } from "../api";

interface SidebarProps {
	namespaces: WorkersKvNamespace[];
	loading: boolean;
	error: string | null;
	currentPath: string;
}

export function Sidebar({
	namespaces,
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
			<div className="sidebar-section-title">KV Namespaces</div>
			<ul className="sidebar-list">
				{loading && (
					<li className="sidebar-item sidebar-item--muted">Loading...</li>
				)}
				{error && <li className="sidebar-item sidebar-item--error">{error}</li>}
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
					<li className="sidebar-item sidebar-item--muted">No namespaces</li>
				)}
			</ul>
		</aside>
	);
}
