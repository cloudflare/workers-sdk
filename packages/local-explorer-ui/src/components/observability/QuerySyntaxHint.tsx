import { Button, Popover } from "@cloudflare/kumo";
import { InfoIcon } from "@phosphor-icons/react";
import type { JSX } from "react";

/**
 * A small "?" popover explaining the search bar's `key:value` query language.
 * The syntax mirrors (a subset of) the Workers Observability dashboard's query
 * builder — see utils/observability-query.ts for the parsers. Shared by the
 * Traces and Events views so their search bars stay consistent.
 */
export function QuerySyntaxHint({
	variant,
}: {
	variant: "traces" | "events";
}): JSX.Element {
	return (
		<Popover>
			<Popover.Trigger
				render={
					<Button
						size="sm"
						shape="square"
						variant="ghost"
						icon={InfoIcon}
						aria-label="Query syntax help"
					/>
				}
			/>
			<Popover.Content side="bottom" align="end" className="max-w-sm">
				<div className="text-sm font-semibold text-kumo-default">
					Query syntax
				</div>
				<p className="mt-1 text-sm text-kumo-subtle">
					Combine <code>key:value</code> terms (matched with AND). This is a
					subset of the Workers Observability dashboard syntax.
				</p>
				<ul className="mt-2 space-y-1 text-sm text-kumo-default">
					{variant === "traces" ? (
						<>
							<li>
								<code>status:error</code> or <code>status:success</code>
							</li>
							<li>
								<code>kind:</code>
								{" http | fetch | d1 | kv | r2 | do"}
							</li>
							<li>
								<code>dur:&gt;100</code> — duration in ms (
								<code>&gt; &gt;= &lt; &lt;=</code>)
							</li>
							<li>
								<code>db.query.text:orders</code> — any attribute key
							</li>
							<li>Bare words become free-text search.</li>
						</>
					) : (
						<>
							<li>
								<code>level:</code>
								{" error | warn | info | debug"}
							</li>
							<li>
								<code>op:/checkout</code> — filter by operation/route
							</li>
							<li>Bare words search the message and service.</li>
						</>
					)}
				</ul>
			</Popover.Content>
		</Popover>
	);
}
