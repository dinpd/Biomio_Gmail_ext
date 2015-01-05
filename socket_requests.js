var PROTO_VERSION = "1.0";
var APP_ID = 'abcsd';
var OS_ID = 'os id';
var ID = 'id';
var HEADER_OID = 'clientHeader';
var DEV_ID = 'extension';
var SOCKET_CONNECTION_TIMEOUT = 10000;
var RPC_NAMESPACE = 'extension_test_plugin';

var RPC_GET_PASS_PHRASE_METHOD = 'get_pass_phrase';
var RPC_GET_PUBLIC_KEY_METHOD = 'get_user_public_pgp_key';

var REQUEST_HEADER = {
    protoVer: PROTO_VERSION,
    seq: 0,
    oid: HEADER_OID,
    appId: APP_ID,
    osId: OS_ID,
    id: ID,
    devId: DEV_ID
};

var RPC_REQUEST = {
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

var REGISTRATION_REQUEST = {
    msg: {
        oid: "clientHello",
        secret: "STRING_VALUE"
    },
    header: REQUEST_HEADER
};

var ACK_REQUEST = {
    msg: {
        oid: 'ack'
    },
    header: REQUEST_HEADER // + token
};

var NOP_REQUEST = {
    msg: {
        oid: 'nop'
    },
    header: REQUEST_HEADER // + token = refresh_token
};

var REGULAR_REQUEST = {
    msg: {
        oid: "clientHello"
    },
    header: REQUEST_HEADER

};

var REGULAR_DIGEST_REQUEST = {
    msg: {
        oid: "auth",
        key: "STRING"
    },
    header: REQUEST_HEADER
};

function getHandshakeRequest(secret) {
    var request = REGULAR_REQUEST;
    if (typeof secret !== 'undefined') {
        request = REGISTRATION_REQUEST;
        request.msg.secret = secret;
    }
    return JSON.stringify(request);
}

function getDigestRequest(key, token) {
    var request = REGULAR_DIGEST_REQUEST;
    request.msg.key = key;
    request.header.token = token;
    request = JSON.stringify(request.msg);
    request = '{"msg":' + request + ',"header":' + getHeaderString(token) + '}';
    return request;
}

function getReadyRequest(request, token) {
    request.header.token = token;
    return JSON.stringify(request);
}

function increaseRequestCounter() {
    REQUEST_HEADER.seq += 2;
}

function getHeaderString(token) {
    var header = REQUEST_HEADER;
    header.token = token;
    header = '{"oid":"' + header.oid + '","seq":' + header.seq + ',"protoVer":"'
    + header.protoVer + '","id":"' + header.id + '","appId":"' + header.appId
    + '","osId":"' + header.osId + '","devId":"' + header.devId + '","token":"' + header.token + '"}';
    return header;
}

function getRpcRequest(token, method, keyValueDict){
    var request = RPC_REQUEST;
    request.header.token = token;
    request.msg.call = method;
    for(var key in keyValueDict){
        if(keyValueDict.hasOwnProperty(key)){
            request.msg.data.keys.push(key);
            request.msg.data.values.push(keyValueDict[key]);
        }
    }
    return JSON.stringify(request);
}