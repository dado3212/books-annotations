/**
 * This source code is licensed under the terms found in the LICENSE file in 
 * the root directory of this project.
 */

/******************************************************************************
 * Required Modules
 *****************************************************************************/
const Service = require("../../Service");
const protocol = require("./protocol");
const File = require("./File");

// mce Modules
const meaco = require("meaco");
const JarvisEmitter = require("jarvis-emitter");

// External Modules
const ref = require("@lwahonen/ref-napi");
const fs = require("fs-extra");
const debug = require("debug")("libijs:services:afc");

/**
 *
 *
 * @class AFC
 * @extends {Service}
 */
class AFC extends Service {
	/**
	 * Creates an instance of AFC.
	 *
	 * @param {UsbmuxdDeviceConnection} connection
	 *
	 * @memberof AFC
	 */
	constructor(connection) {
		super(connection, protocol.header.Struct.size);

		this.__packetNumber = 0;

		this._pendingRequests = new Map();
	}

	/**
	 *
	 *
	 * @readonly
	 * @static
	 *
	 * @memberof AFC
	 */
	static get FileMode() {
		return protocol.fileMode;
	}

	/**
	 *
	 *
	 * @readonly
	 * @static
	 * @memberof AFC
	 */
	static get LinkType() {
		return protocol.linkType;
	}

	/**
	 *
	 *
	 * @readonly
	 * @static
	 *
	 * @memberof AFC
	 */
	static get LockFlags() {
		return protocol.lockFlags;
	}

	/**
	 *
	 *
	 * @readonly
	 * @static
	 *
	 * @memberof AFC
	 */
	static get SeekOrigin() {
		return protocol.seekOrigin;
	}

	/**
	 *
	 *
	 * @param {string} path
	 * @returns {JarvisEmitter}
	 *
	 * @memberof AFC
	 */
	getFileInfo(path) {
		return this._dispatchPacket(protocol.operations.GET_FILE_INFO, ref.allocCString(path))
			.done.middleware(((next, result) => {
				if (!result) {
					debug(`getFileInfo: Failed to retrieve file info for ${path}`);
					return next(null);
				}
				next(this.__parseObjectBuffer(result));
			}).bind(this));
	}

	/**
	 *
	 *
	 * @param {string} fileName
	 * @param {(protocol.fileMode|string)} mode
	 * @returns {JarvisEmitter}
	 *
	 * @memberof AFC
	 */
	openFile(fileName, mode) {
		if ("string" === typeof mode) {
			mode = protocol.fileMode[mode];
		}

		// A FILE_OPEN packet data contains a mode (uint64) and the null terminated file name
		const data = Buffer.alloc(ref.types.uint64.size + fileName.length + 1);
		data.writeUInt64LE(mode, 0);
		data.writeCString(fileName, ref.types.uint64.size);

		return this._dispatchPacket(protocol.operations.FILE_OPEN, data)
			.done.middleware((next, result) => {
				if (!result) {
					debug(`openFile: Failed to open ${fileName} (mode ${mode})`);
					return next(null);
				}

				// The response contains a file handle
				const fileHandle = result.readUInt64LE(0);
				next(new File(this, fileName, fileHandle));
			});
	}

	/**
	 * Reads the (entire) contents of a file at a given path.
	 * Should be used only when the stream api can't be used.
	 *
	 * @param {string} fileName
	 * @returns {JarvisEmitter}
	 *
	 * @memberof AFC
	 */
	readFile(fileName) {
		return meaco(function* doReadFile() {
			// Open the file
			const file = yield this.openFile(fileName, "r");
			if (!file) {
				debug(`readFile: Failed to open ${fileName}`);
				return null;
			}

			const content = yield file.readAll();
			if (!content) {
				debug(`readFile: Failed to read the contents of ${fileName}`);
			}

			yield file.close();
			return content;
		}.bind(this));
	}

	/**
	 *
	 *
	 * @param {Buffer} headerBuffer
	 * @returns {JarvisEmitter}
	 *
	 * @memberof AFC
	 */
	_parseHeader(headerBuffer) {
		// TODO: Validate the header
		return new protocol.header.Struct(headerBuffer);
	}

	/**
	 *
	 *
	 * @param {protocol.header} header
	 * @returns
	 *
	 * @memberof AFC
	 */
	_getDataSizeFromHeader(header) {
		return header.entireLength - protocol.header.Struct.size;
	}

	/**
	 *
	 *
	 * @param {Buffer} headerBuffer
	 * @param {Object} packet
	 *
	 * @memberof AFC
	 */
	_buildHeader(headerBuffer, packet) {
		this.__packetNumber++;

		const dataSize = packet.data ? packet.data.length : 0;
		const payloadSize = packet.payload ? packet.payload.length : 0;

		const header = new protocol.header.Struct(headerBuffer);
		header.magic 		= protocol.header.magic;
		header.packetNumber = this.__packetNumber;
		header.operation 	= packet.operation;
		header.entireLength = protocol.header.Struct.size + dataSize + payloadSize;
		header.thisLength 	= protocol.header.Struct.size + dataSize;
	}

	/**
	 *
	 *
	 * @param {Buffer} data
	 * @param {protocol.header} header
	 * @returns {Buffer}
	 *
	 * @memberof AFC
	 */
	_parseData(data, header) {
		if (protocol.operations.STATUS === header.operation) {
			// TODO: Let the user know what error we've received
			return protocol.error.success === data.readUInt64LE(0);
		}

		return data;
	}

	/**
	 *
	 *
	 * @param {Object} packet
	 * @returns {Buffer[]}
	 *
	 * @memberof AFC
	 */
	_buildData(packet) {
		const chunks = [];

		if (packet.data) {
			chunks.push(packet.data);
		}
		if (packet.payload) {
			chunks.push(packet.payload);
		}

		return chunks;
	}

	/**
	 *
	 *
	 * @param {Object} request
	 *
	 * @memberof AFC
	 */
	_handleNewPendingRequest(request) {
		this._pendingRequests.set(this.__packetNumber, request);
	}

	/**
	 *
	 *
	 * @param {Buffer} data
	 *
	 * @memberof AFC
	 */
	_completeNextPendingRequest(data) {
		const responsePacketNumber = this._nextHeader.packetNumber;

		const pendingRequest = this._pendingRequests.get(responsePacketNumber);
		pendingRequest.promise.callDone(data);

		this._pendingRequests.delete(responsePacketNumber);
	}

	/**
	 *
	 *
	 * @param {protocol.operations} operation
	 * @param {Buffer} [data=null]
	 * @param {Buffer} [payload=null]
	 * @returns {JarvisEmitter}
	 *
	 * @memberof AFC
	 */
	_dispatchPacket(operation, data = null, payload = null) {
		return this._write({ operation, data, payload }, false, true);
	}

	/**
	 *
	 *
	 * @param {Buffer} buffer
	 * @returns {string[]}
	 *
	 * @memberof AFC
	 */
	__parseStringsBuffer(buffer) {
		const strings = [];

		let offset = 0;
		while (offset < buffer.length) {
			// Parse the current null terminated string
			const currentString = buffer.readCString(offset);
			strings.push(currentString);

			// Move to the next string
			offset += currentString.length + 1;
		}

		return strings;
	}

	/**
	 *
	 *
	 * @param {Buffer} buffer
	 * @returns {Object}
	 *
	 * @memberof AFC
	 */
	__parseObjectBuffer(buffer) {
		const obj = {};

		let offset = 0;
		while (offset < buffer.length) {
			// Parse the current null terminated key name
			const key = buffer.readCString(offset);
			offset += key.length + 1;

			// Parse the current null terminated value
			const value = buffer.readCString(offset);
			offset += value.length + 1;

			obj[key] = value;
		}

		return obj;
	}
}

/******************************************************************************
 * Exports
 *****************************************************************************/
module.exports = AFC;
