import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "@prisma/client-generated";

interface Env {
	DB: D1Database;
}

export default {
	async fetch(request, env) {
		const adapter = new PrismaD1(env.DB);
		const prisma = new PrismaClient({ adapter });
		const users = await prisma.user.findMany();

		return Response.json(users);
	},
} satisfies ExportedHandler<Env>;
