export type EnumKeys<Enum> = Exclude<keyof Enum, number>;

export const enumObject = <Enum extends Record<string, number | string>>(
	e: Enum
) => {
	const copy = { ...e } as { [K in EnumKeys<Enum>]: Enum[K] };
	Object.values(e).forEach(
		(value) => typeof value === "number" && delete copy[value]
	);
	return copy;
};

export const enumKeys = <Enum extends Record<string, number | string>>(
	e: Enum
) => {
	return Object.keys(enumObject(e)) as EnumKeys<Enum>[];
};
