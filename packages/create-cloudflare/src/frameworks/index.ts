import angular from "./angular";
import astro from "./astro";
import docusaurus from "./docusaurus";
import gatsby from "./gatsby";
import hono from "./hono";
import next from "./next";
import nuxt from "./nuxt";
import qwik from "./qwik";
import react from "./react";
import remix from "./remix";
import solid from "./solid";
import svelte from "./svelte";
import vue from "./vue";
import type { FrameworkConfig } from "types";

export const FrameworkMap: Record<string, FrameworkConfig> = {
  angular,
  astro,
  docusaurus,
  gatsby,
  hono,
  next,
  nuxt,
  qwik,
  react,
  remix,
  solid,
  svelte,
  vue,
};

export const supportedFramework = (framework: string) => {
  return Object.keys(FrameworkMap).includes(framework);
};
