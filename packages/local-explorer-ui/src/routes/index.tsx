import { Button, Text } from "@cloudflare/kumo";
import { CopyIcon } from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { AnimatedCloudflareLogo } from "../components/AnimatedCloudflareLogo";

const LLM_PROMPT = `You have access to local Cloudflare services (KV, R2, D1, Durable Objects, and Workflows) for this app via the Explorer API.
API endpoint: http://localhost:{port}/cdn-cgi/explorer/api
Fetch the OpenAPI schema from /api to discover available operations. Use these endpoints to list, query, and manage local resources during development.`;

export const Route = createFileRoute("/")({
	component: IndexPage,
});

function IndexPage() {
	return (
		<div className="flex h-full flex-col items-center justify-center space-y-2 p-12 text-center">
			<div className="mx-auto max-w-md space-y-6">
				<div className="flex flex-col items-center gap-2">
					<AnimatedCloudflareLogo size={96} />

					<h2 className="text-3xl font-bold text-kumo-default">
						Welcome to Local Explorer
					</h2>
					<p className="text-sm font-light text-kumo-subtle">
						Select a resource from the sidebar to view & manage it.
					</p>
				</div>

				<div className="w-full rounded border border-kumo-line">
					<div className="flex w-full items-center justify-between border-b border-kumo-line p-2">
						<Text bold={true} variant="body">
							Copy Prompt
						</Text>

						<Button icon={CopyIcon} size="sm" variant="ghost" />
					</div>

					<div className="p-3 text-left">
						<Text variant="mono">{LLM_PROMPT}</Text>
					</div>
				</div>
			</div>
		</div>
	);
}
