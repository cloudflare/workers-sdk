export async function onRequest(context) {
	return new Response(
		`[/holiday]:\n` +
			`🎵 🎵 🎵\n` +
			`If we took a ${context.env.VAR1}\n` +
			`Took some time to ${context.env.VAR2}\n` +
			`Just one day out of life\n` +
			`It would be, it would be so nice\n` +
			`🎵 🎵 🎵`
	);
}
