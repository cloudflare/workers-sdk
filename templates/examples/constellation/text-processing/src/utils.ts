export function structureArray(flatArr: number[], shape: number[]) {
	if (shape.length > 2) {
		throw Error("Nested js arrays are currently limited to 2-dimensions");
	}
	if (shape.length < 2) {
		return flatArr;
	}
	const structuredArr = [];
	for (let i = 0, t = 0; i < shape[0]; i++) {
		const currArr = [];
		for (let j = 0; j < shape[1]; j++, t++) {
			currArr.push(flatArr[t]);
		}
		structuredArr.push(currArr);
	}
	return structuredArr;
}
