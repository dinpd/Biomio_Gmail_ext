function SocketHelper() {
    this._PROTO_VERSION = "1.0";
    this._OS_ID = 'os id';
    this._APP_ID = null;
    this._APP_TYPE = 'extension';
    this._HEADER_OID = 'clientHeader';
    this._DEV_ID = 'extension';

    this.RPC_PGP_NAMESPACE = 'pgp_extension_plugin';
    this.RPC_AUTH_CLIENT_NAMESPACE = 'auth_client_plugin';


    this.RPC_GET_PASS_PHRASE_METHOD = 'get_pass_phrase';
    this.RPC_GET_PUBLIC_KEY_METHOD = 'get_users_public_pgp_keys';
    this.RPC_PROCESS_AUTH_METHOD = 'process_auth';
    this.RPC_CHECK_USER_EXISTS_METHOD = 'check_user_exists';

    this._REQUEST_HEADER = {
        protoVer: this._PROTO_VERSION,
        seq: 0,
        oid: this._HEADER_OID,
        appType: this._APP_TYPE,
        osId: this._OS_ID,
        devId: this._DEV_ID
    };
    this._RPC_MSG =
    {
        oid: 'rpcReq',
        onBehalfOf: 'STRING_USER_EMAIL',
        namespace: 'STRING_NAMESPACE_NAME',
        call: 'STRING_METHOD_NAME',
        data: {
            keys: [],
            values: []
        }
    };

    this._REGISTRATION_MSG = {
        oid: "clientHello",
        secret: "STRING_VALUE"
    };

    this._ACK_MSG = {
        oid: 'ack'
    };

    this._NOP_MSG = {
        oid: 'nop'
    };

    this._REGULAR_MSG = {
        oid: "clientHello"
    };

    this._REGULAR_DIGEST_MSG = {
        oid: "auth",
        key: "STRING"
    };

    this._BYE_MSG = {
        oid: "bye"
    };
}

SocketHelper.prototype.reset_header = function () {
    this._REQUEST_HEADER = {
        protoVer: this._PROTO_VERSION,
        seq: 0,
        oid: this._HEADER_OID,
        appType: this._APP_TYPE,
        osId: this._OS_ID,
        devId: this._DEV_ID
    };
    if (this._APP_ID != null) {
        this._REQUEST_HEADER.appId = this._APP_ID;
    }
};

SocketHelper.prototype.set_app_id = function (app_id) {
    this._APP_ID = app_id;
    this.reset_header();
};

/**
 * Generates handshake request.
 * @param {string=} secret - user defined secret
 * @returns {object}
 */
SocketHelper.prototype.get_handshake_request = function (secret) {
    var msg = this._REGULAR_MSG;
    if (typeof secret !== 'undefined') {
        msg = this._REGISTRATION_MSG;
        msg.secret = secret;
    }
    return {msg: msg, header: this._REQUEST_HEADER};

};

SocketHelper.prototype.get_ack_request = function (token) {
    var msg = this._ACK_MSG;
    var header = this._REQUEST_HEADER;
    header.token = token;
    return {msg: msg, header: header};
};

/**
 * Generates digest request.
 * @param key - digest.
 * @param {string} token
 * @returns {object}
 */
SocketHelper.prototype.get_digest_request = function (key, token) {
    var msg = this._REGULAR_DIGEST_MSG;
    msg.key = key;
    msg = JSON.stringify(msg);
    return '{"msg":' + msg + ',"header":' + this.get_header_string(token) + '}';
};

SocketHelper.prototype.get_nop_request = function (token) {
    var msg = this._NOP_MSG;
    var header = this._REQUEST_HEADER;
    header.token = token;
    return {msg: msg, header: header};
};

/**
 * Increases socket requests counter.
 */
SocketHelper.prototype.increase_request_counter = function () {
    this._REQUEST_HEADER.seq += 2;
};

/**
 * Generates header for digest.
 * @param {string} token
 * @returns {string}
 */
SocketHelper.prototype.get_header_string = function (token) {
    var header = this._REQUEST_HEADER;
    header.token = token;
    return '{"oid":"' + header.oid + '","seq":' + header.seq + ',"protoVer":"'
        + header.protoVer + '","appType":"' + header.appType + '","appId":"' + header.appId
        + '","osId":"' + header.osId + '","devId":"' + header.devId + '","token":"' + header.token + '"}';
};

/**
 * Generates RPC request with given data dictionary.
 * @param {string} token
 * @param {string} method - RPC method type (name).
 * @param {string} namespace - RPC namespace type (name).
 * @param {string} onBehalfOf - current user email.
 * @param {Object} keyValueDict - RPC method input values
 * @returns {object}
 */
SocketHelper.prototype.get_rpc_request = function (token, method, namespace, onBehalfOf, keyValueDict) {
    var msg = this._RPC_MSG;
    var header = this._REQUEST_HEADER;
    header.token = token;
    msg.call = method;
    msg.namespace = namespace;
    msg.onBehalfOf = onBehalfOf;
    msg.data = {
        keys: [],
        values: []
    };
    for (var key in keyValueDict) {
        if (keyValueDict.hasOwnProperty(key)) {
            msg.data.keys.push(key);
            msg.data.values.push(keyValueDict[key]);
        }
    }
    return {msg: msg, header: header};
};

SocketHelper.prototype.get_bye_request = function (token) {
    var msg = this._BYE_MSG;
    var header = this._REQUEST_HEADER;
    header.token = token;
    return {msg: msg, header: header};
};

var socket_helper = new SocketHelper();
