/**
 * This source code is licensed under the terms found in the LICENSE file in 
 * the root directory of this project.
 */

 // TODO: Explose UID and Real from bplist, share with xml plist?

/******************************************************************************
 * Required Modules
 *****************************************************************************/
const bplistReader = require("./bplist/Reader");

// mce Modules
const JarvisEmitter = require("jarvis-emitter");

// External Modules
const xmlBufferToString = require('xml-buffer-tostring');
const plist = require("plist");
const fs = require("fs");

/**
 *
 *
 * @param {Buffer} buffer
 */
const parse = function parse(buffer) {
	if (bplistReader.isBinaryPlist(buffer)) {
		return bplistReader.read(buffer);
	}

	return plist.parse(xmlBufferToString(buffer));
};

/**
 *
 *
 * @param {string} filePath
 * @returns {JarvisEmitter}
 */
const readFile = function readFile(filePath) {
	return JarvisEmitter.emitify(fs.readFile, false)(filePath)
		.done.middleware((next, err, data) => {
			next(err ? null : parse(data));
		});
};

/**
 *
 *
 * @param {any} obj
 * @returns {Buffer|string}
 */
const createXml = function createXml(obj) {
	return plist.build(obj);
};

/******************************************************************************
 * Exports
 *****************************************************************************/
module.exports = {
	parse,
	readFile,
	createXml,
};
