import { createFileRoute } from "@tanstack/react-router";
import { AnimatedCloudflareLogo } from "../components/AnimatedCloudflareLogo";
import { PageLayout } from "../components/layout";

export const Route = createFileRoute("/")({
	component: IndexPage,
});

function IndexPage() {
	return (
		<PageLayout header={<div className="h-12" />}>
			<div className="flex h-full flex-col items-center justify-center space-y-2 text-center">
				<AnimatedCloudflareLogo size={96} />

				<h2 className="text-3xl font-bold text-text">
					Welcome to Local Explorer
				</h2>
				<p className="text-sm font-light text-text-secondary">
					Select a resource from the sidebar to view & manage it.
				</p>
			</div>
		</PageLayout>
	);
}
