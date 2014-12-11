

var PROTO_VERSION = "1.0";
var APP_ID = 'app id';
var OS_ID = 'os id';
var ID = 'id';
var HEADER_OID = 'clientHeader';
var DEV_ID = 'extension';

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
    msg: {},
    header: REQUEST_HEADER

};

function getHandshakeRequest(secret){
    var request = REGULAR_REQUEST;
    if(typeof secret !== 'undefined'){
        request = REGISTRATION_REQUEST;
        request.msg.secret = secret;
    }
    increaserequestCounter();
    return JSON.stringify(request);
}

function getReadyRequest(request, token){
    request.header.token = token;
    increaserequestCounter();
    return JSON.stringify(request);
}

function increaserequestCounter(){
    REQUEST_HEADER.seq++;
}