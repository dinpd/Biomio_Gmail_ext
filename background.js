var STATE_CONNECTED = 'connected';
var STATE_REGISTRATION_HANDSHAKE = 'registration';
var STATE_REGULAR_HANDSHAKE = 'regular_handshake';
var STATE_READY = 'connection_ready';
var STATE_DISCONNECTED = 'disconnected';
var socket_connection;
//var SERVER_URL = "wss://gb.vakoms.com:8080/websocket";
var SERVER_URL = "wss://localhost:8080/websocket";
var STORAGE_RSA_KEY = 'biomio_private_key';
var user_info = {};

var state_machine;
var session_alive_interval;
var refresh_token_interval;

var iterations = 0;

var CURRENT_EMAIL_TEST = 'andriy.lobashchuk@vakoms.com';
var RECIPIENT_EMAIL_TEST = 'orrionandi@gmail.com';

var keepAlive = function () {
    session_alive_interval = setInterval(function () {
        console.log('keepAlive');
        if (state_machine.is(STATE_READY)) {
            socket_connection.send(getCustomRequest(NOP_REQUEST, user_info.token));
            iterations++;
        } else {
            clearInterval(session_alive_interval);
        }
        if (iterations == 2) {
            sendRpcRequest(RPC_GET_PASS_PHRASE_METHOD, {'email': CURRENT_EMAIL_TEST});
        }
        if(iterations == 4){
            sendRpcRequest(RPC_GET_PUBLIC_KEY_METHOD, {'email': RECIPIENT_EMAIL_TEST});
        }
        if (iterations > 6){
            socket_connection.disconnect('WebSocket connection closed: Url - ' + socket_connection.url);
        }
    }, (SOCKET_CONNECTION_TIMEOUT - 2000));
};

function sendRpcRequest(method, keyValueDict){
    if(state_machine.is(STATE_READY)){
        socket_connection.send(getRpcRequest(user_info.token, method, keyValueDict));
    }else{
        console.log("Message cannot be sent, because state machine is currently in state: ", state_machine.current);
    }
}

var refresh_token = function () {
    refresh_token_interval = setInterval(function () {
        console.log('refresh TOKEN');
        if (state_machine.is(STATE_READY)) {
            socket_connection.send(getCustomRequest(NOP_REQUEST, user_info.refresh_token));
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
    if(!state_machine.is(STATE_DISCONNECTED)){
        state_machine.disconnect('WebSocket connection closed: Url - ' + socket_connection.url);
    }
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
    if(data.msg.oid == 'bye') return;
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
        }else if(data.msg.oid == 'rpcResp'){
            var dataResp = data.msg.data;
            if(dataResp.keys.indexOf('error') > -1){
                console.log('Error received from rpc method: ', dataResp.values[0]);
            }else{
                if(data.msg.call == RPC_GET_PASS_PHRASE_METHOD){
                    console.log('=======================================');
                    console.log('Received data from ' + RPC_GET_PASS_PHRASE_METHOD + ' method: ');
                    for(var i = 0; i < dataResp.keys.length; i++){
                        console.log(dataResp.keys[i], dataResp.values[i]);
                    }
                    console.log('=======================================');
                }else if(data.msg.call == RPC_GET_PUBLIC_KEY_METHOD){
                    console.log('=======================================');
                    console.log('Received data from ' + RPC_GET_PUBLIC_KEY_METHOD + ' method: ');
                    for(var i = 0; i < dataResp.keys.length; i++){
                        console.log(dataResp.keys[i], dataResp.values[i]);
                    }
                    console.log('=======================================');
                }
            }
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
        socket_connection.send(getCustomRequest(ACK_REQUEST, user_info.token));
    }else if(from == STATE_REGULAR_HANDSHAKE){
        console.log('Sending DIGEST');
        var rsa = new RSAKey();
        rsa.readPrivateKeyFromPEMString(user_info.rsa_private_key);
        console.log(getHeaderString(user_info.token));
        var hSig = rsa.signString(getHeaderString(user_info.token), 'sha1');
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
    if(socket_connection.readyState != 3){
        socket_connection.send(getCustomRequest(BYE_REQUEST, user_info.token));
    }
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


