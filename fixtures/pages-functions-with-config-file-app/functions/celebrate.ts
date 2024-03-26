export async function onRequest(context) {
	return new Response(
		`[/celebrate]:\n` +
			`🎵 🎵 🎵\n` +
			`You can turn this world around\n` +
			`And bring back all of those happy days\n` +
			`Put your troubles down\n` +
			`It's time to ${context.env.VAR2}\n` +
			`🎵 🎵 🎵`
	);
}
