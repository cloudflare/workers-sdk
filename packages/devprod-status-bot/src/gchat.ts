function getThreadID(date?: string | Date, label = "-pull-requests") {
	// Apply an offset so we rollover days at around 10am UTC
	return (
		(date ? new Date(date) : new Date())
			.toLocaleString("en-GB", { timeZone: "Pacific/Kiritimati" })
			.split(",")[0] + label
	);
}

/**
 * Send a Google Chat message in the daily thread associated with a label.
 *
 * @param webhookUrl The destination's incoming webhook URL.
 * @param message The Google Chat message payload.
 * @param label The suffix identifying this message's daily thread.
 */
export async function sendMessage(
	webhookUrl: string,
	message: Record<string, unknown>,
	label?: string
) {
	const threadId = getThreadID(new Date(), label);

	const url = new URL(webhookUrl);

	url.searchParams.set("threadKey", threadId);
	url.searchParams.set(
		"messageReplyOption",
		"REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD"
	);

	const response = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json; charset=utf-8" },
		body: JSON.stringify(message),
	});

	console.log(await response.json());
}
