import { constants as bufferConstants } from 'buffer';
import { constants as nodeBufferConstants } from 'node:buffer';
import * as externalImports from '@cloudflare-dev-module-resolution/imports/node-builtins';
import * as externalRequires from '@cloudflare-dev-module-resolution/requires/node-builtins';

export default {
	'(internal import) buffer.constants.MAX_LENGTH': bufferConstants.MAX_LENGTH,
	'(internal import) node:buffer.constants.MAX_LENGTH':
		nodeBufferConstants.MAX_LENGTH,
	'(external require) buffer.constants.MAX_LENGTH':
		externalRequires.bufferConstants.MAX_LENGTH,
	'(external require) node:buffer.constants.MAX_LENGTH':
		externalRequires.nodeBufferConstants.MAX_LENGTH,
	'(external import) buffer.constants.MAX_LENGTH':
		externalImports.bufferConstants.MAX_LENGTH,
	'(external import) node:buffer.constants.MAX_LENGTH':
		externalImports.nodeBufferConstants.MAX_LENGTH,
};
