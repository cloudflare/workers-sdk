import { createFileRoute } from "@tanstack/react-router";
import CloudflareLogo from "../assets/icons/cloudflare-logo.svg?react";

export const Route = createFileRoute("/")({
	component: IndexPage,
});

function IndexPage() {
	return (
		<div className="flex flex-col items-center justify-center h-full text-center p-12 space-y-2">
			<CloudflareLogo className="text-primary w-24 h-24" />

			<h2 className="text-3xl font-bold text-text">
				Welcome to Local Explorer
			</h2>
			<p className="text-text-secondary text-sm font-light">
				Select a resource from the sidebar to view & manage it.
			</p>
		</div>
	);
}
