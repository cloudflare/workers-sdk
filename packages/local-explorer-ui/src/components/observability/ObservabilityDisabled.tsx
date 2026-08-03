import { ClipboardText } from "@cloudflare/kumo";
import { PulseIcon } from "@phosphor-icons/react";
import type { JSX } from "react";

/**
 * Shown when observability capture is off (opt-in). Capture is enabled by
 * setting the `X_LOCAL_OBSERVABILITY=true` environment variable and restarting
 * the dev server; there is no in-UI toggle while the feature is opt-in.
 *
 * Rendered by both the Traces and Events views when the query endpoint reports
 * that capture is disabled (see `isObservabilityDisabledError`), so the panel
 * lives here rather than being duplicated in each route.
 */
export function ObservabilityDisabled(): JSX.Element {
	return (
		<div className="flex h-full flex-col">
			<header className="flex min-h-14 items-center gap-2.5 border-b border-kumo-fill px-4">
				<PulseIcon size={18} className="text-kumo-subtle" />
				<span className="text-sm font-semibold text-kumo-default">
					Observability
				</span>
			</header>
			<div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
				<PulseIcon size={32} className="mb-3 text-kumo-subtle" />
				<h3 className="text-base font-semibold text-kumo-default">
					Observability capture is off
				</h3>
				<p className="mt-2 max-w-md text-sm text-kumo-subtle">
					Local observability is opt-in for now. To record traces, spans, and
					logs from your Worker, restart your dev server with the{" "}
					<code className="font-mono text-[0.9em]">X_LOCAL_OBSERVABILITY</code>{" "}
					environment variable set:
				</p>
				<ClipboardText
					size="base"
					className="mt-3 max-w-md"
					text="X_LOCAL_OBSERVABILITY=true wrangler dev"
					tooltip={{ text: "Copy command", copiedText: "Copied!" }}
				/>
				<p className="mt-3 max-w-md text-sm text-kumo-subtle">
					(or{" "}
					<code className="font-mono text-[0.9em]">
						X_LOCAL_OBSERVABILITY=true
					</code>{" "}
					before <code className="font-mono text-[0.9em]">vite dev</code>)
				</p>
			</div>
		</div>
	);
}
