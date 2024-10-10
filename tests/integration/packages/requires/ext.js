exports.helloWorldExt = `${require('./hello.js').default} ${require('./world.cjs').default}`;

let helloCjs = null;
try {
    helloCjs = require('./hello.cjs');
} catch { }
exports.helloCjs = helloCjs;

let worldJs = null;
try {
    helloCjs = require('./world.js');
} catch { }
exports.worldJs = worldJs;
