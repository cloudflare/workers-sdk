export function ScrollableCodeBlock({
	content,
}: {
	content: string;
}): JSX.Element {
	return (
		<pre className="max-h-64 overflow-y-auto px-4 py-3 font-mono text-xs wrap-break-word whitespace-pre-wrap text-kumo-default">
			{content}
		</pre>
	);
}
