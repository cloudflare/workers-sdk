import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "../generated/prisma";

interface Env {
	DB: D1Database;
}

export default {
	async fetch(request, env) {
		const adapter = new PrismaD1(env.DB);

		const prisma = new PrismaClient({
			// context(justinvdm, 21-05-2025): prisma-client generated type appears to
			// consider D1 adapter incompatible, though in runtime (dev and production)
			// it works
			// @ts-ignore
			adapter,
		});

		if (!request.url.includes("/b")) {
			return new Response(null, {
				status: 302,
				headers: {
					Location: "/b",
				},
			});
		} else {
			const users = await prisma.user.findMany();
			return Response.json(users);
		}
	},
} satisfies ExportedHandler<Env>;
