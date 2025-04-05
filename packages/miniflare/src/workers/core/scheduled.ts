export async function handleScheduled(
	params: URLSearchParams,
	service: Fetcher
): Promise<Response> {
	const time = params.get("time");
	const scheduledTime = time ? new Date(parseInt(time)) : undefined;
	const cron = params.get("cron") ?? undefined;

	const result = await service.scheduled({
		scheduledTime,
		cron,
	});

	return new Response(result.outcome, {
		status: result.outcome === "ok" ? 200 : 500,
	});
}
