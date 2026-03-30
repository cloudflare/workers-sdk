export function ScrollableCodeBlock({
	content,
}: {
	content: string;
}): JSX.Element {
	return (
		<pre className="max-h-64 overflow-y-auto px-4 py-3 font-mono text-xs break-words whitespace-pre-wrap text-text">
			{content}
		</pre>
	);
}
