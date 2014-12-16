var PROTO_VERSION = "1.0";
var APP_ID = 'app id';
var OS_ID = 'os id';
var ID = 'id';
var HEADER_OID = 'clientHeader';
var DEV_ID = 'extension';
var SOCKET_CONNECTION_TIMEOUT = 10000;

var REQUEST_HEADER = {
    protoVer: PROTO_VERSION,
    seq: 0,
    oid: HEADER_OID,
    appId: APP_ID,
    osId: OS_ID,
    id: ID,
    devId: DEV_ID
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