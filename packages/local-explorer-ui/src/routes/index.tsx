import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
	component: IndexPage,
});

function IndexPage() {
	return (
		<div className="empty-state">
			<h2>Welcome to Local Explorer</h2>
			<p>Select a KV namespace from the sidebar to view and manage its keys.</p>
		</div>
	);
}
