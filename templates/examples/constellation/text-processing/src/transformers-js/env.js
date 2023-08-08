const fs = require('fs');
const path = require('path');

// check if various APIs are available (depends on environment)
const CACHE_AVAILABLE = typeof self !== 'undefined' && 'caches' in self;
const FS_AVAILABLE = !isEmpty(fs); // check if file system is available
const PATH_AVAILABLE = !isEmpty(path); // check if path is available

const RUNNING_LOCALLY = FS_AVAILABLE && PATH_AVAILABLE;

const __dirname = '.'

// set local model path, based on available APIs
const DEFAULT_LOCAL_PATH = '/models/onnx/quantized/';
const localURL = RUNNING_LOCALLY
    ? path.join(path.dirname(__dirname), DEFAULT_LOCAL_PATH)
    : DEFAULT_LOCAL_PATH;

// Global variable used to control exection, with suitable defaults
const env = {
    // whether to support loading models from the HuggingFace hub
    remoteModels: true,

    // URL to load models from
    remoteURL: 'https://huggingface.co/Xenova/transformers.js/resolve/main/quantized/',

    // path prefix to models in the Constellation catalog
    consnPrefix: 'catalog/',

    // Local URL to load models from.
    localURL: localURL,

    // Whether to use Cache API to cache models. By default, it is true if available.
    useCache: CACHE_AVAILABLE,

    // Whether to use the file system to load files. By default, it is true available.
    useFS: FS_AVAILABLE,
}


/**
 * @param {object} obj
 */
function isEmpty(obj) {
    return Object.keys(obj).length === 0;
}

module.exports = {
    env
}
