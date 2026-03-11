import { createFileRoute } from "@tanstack/react-router";
import CloudflareLogo from "../assets/icons/cloudflare-logo.svg?react";

export const Route = createFileRoute("/")({
	component: IndexPage,
});

function IndexPage() {
	return (
		<div className="flex h-full flex-col items-center justify-center space-y-2 p-12 text-center">
			<CloudflareLogo className="h-24 w-24 text-primary" />

			<h2 className="text-3xl font-bold text-text">
				Welcome to Local Explorer
			</h2>
			<p className="text-sm font-light text-text-secondary">
				Select a resource from the sidebar to view & manage it.
			</p>
		</div>
	);
}
