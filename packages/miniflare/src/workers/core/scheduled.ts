export async function handleScheduled(
	params: URLSearchParams,
	service: Fetcher
): Promise<Response> {
	const time = params.get("time");
	const scheduledTime = time ? new Date(parseInt(time)) : undefined;
	const cron = params.get("cron") ?? undefined;
	const format = params.get("format");
	const result = await service.scheduled({
		scheduledTime,
		cron,
	});

	if (format === "json") {
		return Response.json(result, {
			status: result.outcome === "ok" ? 200 : 500,
		});
	}

	return new Response(result.outcome, {
		status: result.outcome === "ok" ? 200 : 500,
	});
}
