var pgpContext = new e2e.openpgp.ContextImpl();
var ctxApi = new e2e.ext.api.Api(pgpContext);
pgpContext.setKeyRingPassphrase('');
pgpContext.setArmorHeader(
    'Version',
    'BioMio v1.0');

ctxApi.installApi();
//console.log(ctxApi.pgpCtx_.importKey(function(){}, "-----BEGIN RSA PRIVATE KEY-----\nMIICWwIBAAKBgQCbJ1wAitBwoICb4n8anXMkPMRUPXBB+F5+aFyNPcX/t/AmxQ2i\ndxw85t+bPJ3AjfXmTXZ1jVMgcyc4GkXQkBgUvzXiuYcPNKHHwoGFvG/TTgkr/TW7\n8/wrXi17x8OAtiWVXKhRPjtBL6YCgVIbCywggk7Yj7NuF9BBUbyvGWC4+wIDAQAB\nAoGAFMAd2OC34ehFaxPOxgN6y8ToyQ9yfRA3qxZQEn/JhFrYXocKPMlLWIXUMBHa\nU09pLMT9a9lb3cIo46L35V3wKljazqo00kG+MOMkmShXZ1Zs+72JRUWGs+HAMoCJ\nwltyavf3ckBXhu5cY+eyPTLYasqioVIzWeMLy+XGwvcpQMkCQQDDnC20EO/+BLyV\nnxMBIGI/iQb34Ww1VpELJR4m/hVpuMWmkTaNtGYgagGKuF3qaUcQAIffKTsSK7yF\nzGm151O3AkEAyw3CxwgdU92pFpXbwxebaXEoEofWoQChHcku9nx9/Cuq3rSGJgiG\n8kfiHjr3A5C2IjUyyVih4Wfqa6cdaAYs3QJAU+UMBQquo7fMWi+bqwQEn1NZ1b6s\n9kNmee01fWvEK0/AFax6RVR16LkOaDyiqwL0I3zWyXOZjjWL6aa+P/IzCQJAfLjs\nHhLW6M+rb8sG3LOga0jtI0y6wdRAIqqTpSVcwUsVPoxGJhBwy1rqAkWXumHl7ecd\nVd2SOYD51bwlbOL2JQJAfgH31nXQm9sW3NPm8WYMHV1akZ2bN5b1nU8L8ofA/Juv\n939MM1FGkJ53OHnbaGdjnAwRuVWDRIGKV0IVVjYBjQ==\n-----END RSA PRIVATE KEY-----"));

var STATE_CONNECTED = 'connected';
var STATE_REGISTRATION_HANDSHAKE = 'registration';
var STATE_REGULAR_HANDSHAKE = 'regular_handshake';
var STATE_READY = 'connection_ready';
var STATE_DISCONNECTED = 'disconnected';
var socket_connection;
var SERVER_URL = "wss://gb.vakoms.com:8080/websocket";
var STORAGE_RSA_KEY = 'biomio_private_key';
var user_info = {};

var state_machine;
var session_alive_interval;
var refresh_token_interval;

var iterations = 0;

var keepAlive = function () {
    session_alive_interval = setInterval(function () {
        console.log('keepAlive');
        if (state_machine.is(STATE_READY)) {
            socket_connection.send(getReadyRequest(NOP_REQUEST, user_info.token));
            iterations++;
        } else {
            clearInterval(session_alive_interval);
        }
        if (iterations > 3) {
            socket_connection.close();
        }
    }, (SOCKET_CONNECTION_TIMEOUT - 2000));
};

var refresh_token = function () {
    refresh_token_interval = setInterval(function () {
        console.log('refresh TOKEN');
        if (state_machine.is(STATE_READY)) {
            socket_connection.send(getReadyRequest(NOP_REQUEST, user_info.refresh_token));
        } else {
            clearInterval(refresh_token_interval);
        }
    }, (user_info.ttl - 2000));
};

var socketOnError = function (data) {
    state_machine.disconnect('WebSocket exception (URL - ' + socket_connection.url + ')');
};

var socketOnOpen = function () {
    chrome.storage.sync.get(STORAGE_RSA_KEY, function (data) {
        console.log(data);
        if (STORAGE_RSA_KEY in data) {
            user_info.rsa_private_key = data[STORAGE_RSA_KEY];
            state_machine.handshake('WebSocket connection opened: Url - ' + socket_connection.url);
        } else {
            state_machine.register('WebSocket connection opened: Url - ' + socket_connection.url);
        }
    });
};

var socketOnClose = function () {
    state_machine.disconnect('WebSocket connection closed: Url - ' + socket_connection.url);
};

var socketOnSend = function (request) {
    console.log('REQUEST: ', request);
    socket_connection.send_(request);
    increaseRequestCounter();
    clearInterval(session_alive_interval);
    keepAlive();
};

var socketOnMessage = function (event) {
    var data = JSON.parse(event.data);
    console.log(data);
    if (state_machine.is(STATE_REGISTRATION_HANDSHAKE) || state_machine.is(STATE_REGULAR_HANDSHAKE)) {
        user_info.token = data.header.token;
        user_info.refresh_token = data.msg.refreshToken;
        user_info.ttl = data.msg.ttl * 1000;
        if('key' in data.msg){
            user_info.rsa_private_key = data.msg.key;
            var rsa_private_key = {};
            rsa_private_key[STORAGE_RSA_KEY] = user_info.rsa_private_key;
            chrome.storage.sync.set(rsa_private_key);
        }
        state_machine.ready('Handshake was successful!\nToken: ' + user_info.token + '\nRefresh token: ' + user_info.refresh_token);
    } else if (state_machine.is(STATE_READY)) {
        if (data.msg.oid == 'nop' && user_info.token != data.header.token) {
            user_info.token = data.header.token;
            clearInterval(refresh_token_interval);
            refresh_token();
        }
    }
};

var onConnect = function (event, from, to, msg) {
    console.log(msg);
    socket_connection = new WebSocket(SERVER_URL);
    socket_connection.onerror = socketOnError;
    socket_connection.onopen = socketOnOpen;
    socket_connection.onclose = socketOnClose;
    socket_connection.send_ = socket_connection.send;
    socket_connection.send = socketOnSend;
    socket_connection.onmessage = socketOnMessage;
};

var onRegister = function (event, from, to, msg) {
    console.log(msg);
    console.log('Started registration....');
    socket_connection.send(getHandshakeRequest('secret'));
};

var onHandshake = function (event, from, to, msg) {
    console.log(msg);
    console.log('Starting regular handshake....');
    socket_connection.send(getHandshakeRequest());
};

var onReady = function (event, from, to, msg) {
    console.log(msg);
    if (from == STATE_REGISTRATION_HANDSHAKE) {
        console.log('Sending ACK');
        socket_connection.send(getReadyRequest(ACK_REQUEST, user_info.token));
    }else if(from == STATE_REGULAR_HANDSHAKE){
        console.log('Sending DIGEST');
        var rsa = new RSAKey();
        rsa.readPrivateKeyFromPEMString(user_info.rsa_private_key);
        console.log(getHeaderString(user_info.token));
        var hSig = rsa.signString(/*getHeaderString(user_info.token)*/"Neque porro quisquam est qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit...", 'sha1');
        console.log(hSig);
        socket_connection.send(getDigestRequest(hSig, user_info.token));
    }
    clearInterval(session_alive_interval);
    clearInterval(refresh_token_interval);
    keepAlive();
    refresh_token();
};

var onDisconnect = function (event, from, to, msg) {
    console.log(msg);
};

state_machine = StateMachine.create({
    events: [
        {name: 'connect', from: 'none', to: STATE_CONNECTED},
        {name: 'register', from: STATE_CONNECTED, to: STATE_REGISTRATION_HANDSHAKE},
        {name: 'handshake', from: [STATE_CONNECTED, STATE_REGISTRATION_HANDSHAKE], to: STATE_REGULAR_HANDSHAKE},
        {name: 'ready', from: [STATE_REGISTRATION_HANDSHAKE, STATE_REGULAR_HANDSHAKE], to: STATE_READY},
        {name: 'disconnect', from: '*', to: STATE_DISCONNECTED}
    ],
    callbacks: {
        onconnect: onConnect,
        onregister: onRegister,
        onhandshake: onHandshake,
        onready: onReady,
        ondisconnect: onDisconnect
    }
});

state_machine.connect('Connecting to websocket - ' + SERVER_URL);
