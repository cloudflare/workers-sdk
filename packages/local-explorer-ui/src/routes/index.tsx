import { Button, LayerCard, useKumoToastManager } from "@cloudflare/kumo";
import { CopyIcon } from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { AnimatedCloudflareLogo } from "../components/AnimatedCloudflareLogo";
import {
	copyTextToClipboard,
	createLocalExplorerPrompt,
	getLocalExplorerApiEndpoint,
} from "../utils/agent-prompt";

export const Route = createFileRoute("/")({
	component: IndexPage,
	loader: () => {
		const apiEndpoint = getLocalExplorerApiEndpoint(
			window.location.origin,
			import.meta.env.VITE_LOCAL_EXPLORER_API_PATH
		);

		return {
			prompt: createLocalExplorerPrompt(apiEndpoint),
		};
	},
});

function IndexPage() {
	const { prompt } = Route.useLoaderData();
	const toast = useKumoToastManager();

	async function copyPrompt() {
		try {
			await copyTextToClipboard(prompt);
			toast.add({
				title: "Copied to clipboard",
				variant: "success",
			});
		} catch {
			toast.add({
				title: "Failed to copy to clipboard",
				description: "Something went wrong when trying to copy the prompt.",
				variant: "default",
			});
		}
	}

	return (
		<div className="flex h-full flex-col items-center justify-center space-y-2 p-12 text-center">
			<div className="mx-auto max-w-sm space-y-6">
				<div className="flex flex-col items-center gap-2">
					<AnimatedCloudflareLogo size={96} />

					<h2 className="text-3xl font-bold text-kumo-default">
						Welcome to Local Explorer
					</h2>
					<p className="text-sm font-light text-kumo-subtle">
						Select a resource from the sidebar to view & manage it.
					</p>
				</div>

				<LayerCard>
					<LayerCard.Secondary className="flex items-center justify-between">
						<h4>Copy prompt for agent</h4>

						<Button
							icon={CopyIcon}
							onClick={() => {
								void copyPrompt();
							}}
							size="sm"
							variant="ghost"
						/>
					</LayerCard.Secondary>

					<LayerCard.Primary className="max-h-16 overflow-auto p-3 text-left">
						<p className="font-mono text-kumo-inactive">{prompt}</p>
					</LayerCard.Primary>
				</LayerCard>
			</div>
		</div>
	);
}
