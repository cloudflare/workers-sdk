/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { ApplicationConstraintPop } from "./ApplicationConstraintPop";
import type { City } from "./City";
import type { Region } from "./Region";

export type ApplicationConstraints = {
	region?: Region;
	tier?: number;
	tiers?: Array<number>;
	regions?: Array<Region>;
	cities?: Array<City>;
	pops?: Array<ApplicationConstraintPop>;
};
