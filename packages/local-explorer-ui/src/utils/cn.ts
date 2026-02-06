import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ClassValue } from "clsx";

/**
 * A function that allows the conditional classnames from 'clsx' or 'classnames' to be passed into 'tailwind-merge'.
 *
 * Combining clsx or classnames with tailwind-merge allows us to conditionally join Tailwind CSS classes in classNames together without style conflicts. Inspired by shadcn/ui.
 *
 * @see https://akhilaariyachandra.com/snippets/using-clsx-or-classnames-with-tailwind-merge
 */
export const cn = (...args: Array<ClassValue>): string => twMerge(clsx(args));
