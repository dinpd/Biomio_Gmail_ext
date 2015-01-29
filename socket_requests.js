var PROTO_VERSION = "1.0";
var APP_ID = '';
var OS_ID = 'os id';
var ID = 'id';
var HEADER_OID = 'clientHeader';
var DEV_ID = 'extension';
var SOCKET_CONNECTION_TIMEOUT = 10000;
var RPC_NAMESPACE = 'extension_test_plugin';

var RPC_GET_PASS_PHRASE_METHOD = 'get_pass_phrase';
var RPC_GET_PUBLIC_KEY_METHOD = 'get_users_public_pgp_keys';

var REQUEST_HEADER,
    RPC_REQUEST,
    REGISTRATION_REQUEST,
    ACK_REQUEST,
    NOP_REQUEST,
    REGULAR_REQUEST,
    REGULAR_DIGEST_REQUEST,
    BYE_REQUEST;

/**
 * Generates handshake request.
 * @param {string} secret - user defined secret
 * @returns {String}
 */
function getHandshakeRequest(secret) {
    var request = REGULAR_REQUEST;
    if (typeof secret !== 'undefined') {
        request = REGISTRATION_REQUEST;
        request.msg.secret = secret;
    }
    return JSON.stringify(request);
}

/**
 * Generates digest request.
 * @param {string} key - digest.
 * @param {string} token
 * @returns {String}
 */
function getDigestRequest(key, token) {
    var request = REGULAR_DIGEST_REQUEST;
    request.msg.key = key;
    request.header.token = token;
    request = JSON.stringify(request.msg);
    request = '{"msg":' + request + ',"header":' + getHeaderString(token) + '}';
    return request;
}

/**
 * Generates custom request based on request type.
 * @param {string} request type.
 * @param {string} token
 * @returns {String}
 */
function getCustomRequest(request, token) {
    request.header.token = token;
    return JSON.stringify(request);
}

/**
 * Increases socket requests counter.
 */
function increaseRequestCounter() {
    REQUEST_HEADER.seq += 2;
}

/**
 * Generates header for digest.
 * @param {string} token
 * @returns {string}
 */
function getHeaderString(token) {
    var header = REQUEST_HEADER;
    header.token = token;
    header = '{"oid":"' + header.oid + '","seq":' + header.seq + ',"protoVer":"'
    + header.protoVer + '","id":"' + header.id + '","appId":"' + header.appId
    + '","osId":"' + header.osId + '","devId":"' + header.devId + '","token":"' + header.token + '"}';
    return header;
}

/**
 * Generates RPC request with given data dictionary.
 * @param {string} token
 * @param {string} method - RPC method type (name).
 * @param {Object} keyValueDict - RPC method input values
 * @returns {string}
 */
function getRpcRequest(token, method, keyValueDict) {
    var request = RPC_REQUEST;
    request.header.token = token;
    request.msg.call = method;
    request.msg.data = {
        keys: [],
        values: []
    };
    for (var key in keyValueDict) {
        if (keyValueDict.hasOwnProperty(key)) {
            request.msg.data.keys.push(key);
            request.msg.data.values.push(keyValueDict[key]);
        }
    }
    return JSON.stringify(request);
}

/**
 * Sets application APP_ID and initializes defaults.
 * @param {string} appId
 */
function setAppID(appId) {
    APP_ID = appId;
    setupDefaults();
}

/**
 * Initializes default values.
 */
function setupDefaults() {
    REQUEST_HEADER = {
        protoVer: PROTO_VERSION,
        seq: 0,
        oid: HEADER_OID,
        appId: APP_ID,
        osId: OS_ID,
        id: ID,
        devId: DEV_ID
    };

    RPC_REQUEST = {
        msg: {
            oid: 'rpcReq',
            namespace: RPC_NAMESPACE,
            call: 'STRING_METHOD_NAME',
            data: {
                keys: [],
                values: []
            }
        },
        header: REQUEST_HEADER
    };

    REGISTRATION_REQUEST = {
        msg: {
            oid: "clientHello",
            secret: "STRING_VALUE"
        },
        header: REQUEST_HEADER
    };

    ACK_REQUEST = {
        msg: {
            oid: 'ack'
        },
        header: REQUEST_HEADER // + token
    };

    NOP_REQUEST = {
        msg: {
            oid: 'nop'
        },
        header: REQUEST_HEADER // + token = refresh_token
    };

    REGULAR_REQUEST = {
        msg: {
            oid: "clientHello"
        },
        header: REQUEST_HEADER

    };

    REGULAR_DIGEST_REQUEST = {
        msg: {
            oid: "auth",
            key: "STRING"
        },
        header: REQUEST_HEADER
    };

    BYE_REQUEST = {
        msg: {
            oid: "bye"
        },
        header: REQUEST_HEADER
    };
}