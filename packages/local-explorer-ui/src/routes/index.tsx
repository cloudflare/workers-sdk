import { createFileRoute } from "@tanstack/react-router";
import { AnimatedCloudflareLogo } from "../components/AnimatedCloudflareLogo";

export const Route = createFileRoute("/")({
	component: IndexPage,
});

function IndexPage() {
	return (
		<div className="flex h-full flex-col items-center justify-center space-y-2 p-12 text-center">
			<AnimatedCloudflareLogo size={96} />

			<h2 className="text-3xl font-bold text-kumo-default">
				Welcome to Local Explorer
			</h2>
			<p className="text-sm font-light text-kumo-subtle">
				Select a resource from the sidebar to view & manage it.
			</p>
		</div>
	);
}
