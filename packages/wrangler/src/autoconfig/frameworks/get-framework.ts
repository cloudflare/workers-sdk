import { Analog } from "./analog";
import { Angular } from "./angular";
import { Astro } from "./astro";
import { Hono } from "./hono";
import { NextJs } from "./next";
import { Nuxt } from "./nuxt";
import { CloudflarePages } from "./pages";
import { Qwik } from "./qwik";
import { ReactRouter } from "./react-router";
import { SolidStart } from "./solid-start";
import { Static } from "./static";
import { SvelteKit } from "./sveltekit";
import { TanstackStart } from "./tanstack";
import { Vike } from "./vike";
import { Vite } from "./vite";
import { Waku } from "./waku";
import type { Framework } from ".";

export type FrameworkInfo = {
	id: string;
	name: string;
	class: typeof Framework;
};

const staticFramework = {
	id: "static",
	name: "Static",
	class: Static,
} as const satisfies FrameworkInfo;

export const allKnownFrameworks = [
	staticFramework,
	{ id: "analog", name: "Analog", class: Analog },
	{ id: "angular", name: "Angular", class: Angular },
	{ id: "astro", name: "Astro", class: Astro },
	{ id: "hono", name: "Hono", class: Hono },
	{ id: "next", name: "Next.js", class: NextJs },
	{ id: "nuxt", name: "Nuxt", class: Nuxt },
	{ id: "qwik", name: "Qwik", class: Qwik },
	{ id: "react-router", name: "React Router", class: ReactRouter },
	{ id: "solid-start", name: "Solid Start", class: SolidStart },
	{ id: "svelte-kit", name: "SvelteKit", class: SvelteKit },
	{ id: "tanstack-start", name: "TanStack Start", class: TanstackStart },
	{ id: "vite", name: "Vite", class: Vite },
	{ id: "vike", name: "Vike", class: Vike },
	{ id: "waku", name: "Waku", class: Waku },
	{ id: "cloudflare-pages", name: "Cloudflare Pages", class: CloudflarePages },
] as const satisfies FrameworkInfo[];

export function getFramework(frameworkId?: FrameworkInfo["id"]): Framework {
	const targetedFramework = allKnownFrameworks.find(
		(framework) => framework.id === frameworkId
	);
	const framework = targetedFramework ?? staticFramework;
	return new framework.class({ id: framework.id, name: framework.name });
}
