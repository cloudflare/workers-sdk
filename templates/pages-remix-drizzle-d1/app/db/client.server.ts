import { drizzle } from "drizzle-orm/d1";

export const client = (database: any) => drizzle(database);
