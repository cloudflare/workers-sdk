import { WorkerEntrypoint } from "cloudflare:workers";

type Env = {
	STORE: KVNamespace;
	DATABASE: D1Database;
};

type User = {
	id: string;
	name: string;
};

/**
 * API Worker: fetches users from an upstream service, caches them in KV, and generates daily reports on a schedule.
 */
export default class ApiWorker extends WorkerEntrypoint<Env> {
	async fetch(request: Request) {
		const url = new URL(request.url);
		const userPathPrefix = "/v1/users/";

		if (url.pathname.startsWith(userPathPrefix)) {
			const userId = url.pathname.slice(userPathPrefix.length);
			return Response.json(await this.getUser(userId));
		}

		const reportPathPrefix = "/v1/reports/";

		if (url.pathname.startsWith(reportPathPrefix)) {
			const date = url.pathname.slice(reportPathPrefix.length);
			const report = await this.getDailyReport(date);

			if (report === null) {
				return Response.json({ error: "No report" }, { status: 404 });
			}

			return Response.json(report);
		}

		return new Response("Not Found", { status: 404 });
	}

	async scheduled(event: ScheduledController) {
		if (event.cron !== "0 0 * * *") {
			throw new Error(`Unexpected cron: ${event.cron}`);
		}

		const date = new Date(event.scheduledTime).toISOString().slice(0, 10);
		const list = await this.env.STORE.list({ prefix: "user/" });
		const userIds = list.keys.map((key) => key.name.slice("user/".length));

		await this.env.DATABASE.prepare(
			"INSERT OR REPLACE INTO daily_reports (date, user_ids) VALUES (?, ?)"
		)
			.bind(date, JSON.stringify(userIds))
			.run();
		console.info(`Generated daily report for ${date}`);

		for (const key of list.keys) {
			await this.env.STORE.delete(key.name);
		}
	}

	async getUser(userId: string): Promise<User> {
		const key = `user/${userId}`;
		const cachedUser = await this.env.STORE.get<User>(key, {
			type: "json",
		});

		if (cachedUser !== null) {
			return cachedUser;
		}

		const upstreamResponse = await fetch(
			`http://identity.example.com/profile/${userId}`
		);
		const user = await upstreamResponse.json<User>();

		await this.env.STORE.put(key, JSON.stringify(user));

		return user;
	}

	async getDailyReport(date: string) {
		const report = await this.env.DATABASE.prepare(
			"SELECT user_ids FROM daily_reports WHERE date = ?"
		)
			.bind(date)
			.first<{ user_ids: string }>();

		if (report === null) {
			return null;
		}

		const userIds: string[] = JSON.parse(report.user_ids);
		return userIds;
	}
}
