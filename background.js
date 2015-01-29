var STATE_CONNECTED = 'connected';
var STATE_REGISTRATION_HANDSHAKE = 'registration';
var STATE_REGULAR_HANDSHAKE = 'regular_handshake';
var STATE_READY = 'connection_ready';
var STATE_DISCONNECTED = 'disconnected';
var STATE_PASS_PHRASE = 'get_pass_phrase';
var STATE_PUBLIC_KEYS = 'get_public_keys';
var socket_connection;
//var SERVER_URL = "wss://gb.vakoms.com:8080/websocket";
var SERVER_URL = "wss://192.168.157.172:8081/websocket";
var STORAGE_RSA_KEY = 'biomio_private_key';
var session_info = {
    public_keys_required: false,
    pass_phrase_data: {
        pass_phrase: '',
        current_acc: ''
    },
    token: '',
    refresh_token: '',
    ttl: '',
    rsa_private_key: '',
    tab_id: ''
};
var COMMON_RESPONSE_TYPE = 'socket_response';
var TIMER_RESPONSE_TYPE = 'show_timer';

var APP_ID_STORAGE_KEY = 'BIOMIO_APP_ID';

var state_machine;
var session_alive_interval;
var refresh_token_interval;

var currentRequestData = {};

/**
 * Gets or creates applications APP_ID
 */
chrome.storage.sync.get(APP_ID_STORAGE_KEY, function (data) {
    var appId;
    if (APP_ID_STORAGE_KEY in data) {
        appId = data[APP_ID_STORAGE_KEY];
        log(LOG_LEVEL.DEBUG, 'APP_ID exists');
    } else {
        appId = randomString(32, '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ');
        var app_id_storage = {};
        app_id_storage[APP_ID_STORAGE_KEY] = appId;
        chrome.storage.sync.set(app_id_storage);
        log(LOG_LEVEL.DEBUG, 'APP_ID created');
    }
    log(LOG_LEVEL.DEBUG, appId);
    setAppID(appId);
});

/**
 * Generates random string for app_id
 * @param length of the string
 * @param chars that should be used for random selection
 * @returns {string}
 */
function randomString(length, chars) {
    var result = '';
    for (var i = length; i > 0; --i) result += chars[Math.round(Math.random() * (chars.length - 1))];
    return result;
}

/**
 * Keeps session alive. Runs each connection timeout value seconds.
 */
var keepAlive = function () {
    session_alive_interval = setInterval(function () {
        log(LOG_LEVEL.DEBUG, 'keep alive nop');
        if (!state_machine.is(STATE_DISCONNECTED)) {
            socket_connection.send(getCustomRequest(NOP_REQUEST, session_info.token));
        } else {
            clearInterval(session_alive_interval);
        }
    }, (SOCKET_CONNECTION_TIMEOUT - 2000));
};

/**
 * Sends RPC request.
 * @param {string} method RPC method type.
 * @param {Object} keyValueDict - rpc method input values.
 */
function sendRpcRequest(method, keyValueDict) {
    if (state_machine.is(STATE_PASS_PHRASE) || state_machine.is(STATE_PUBLIC_KEYS)) {
        socket_connection.send(getRpcRequest(session_info.token, method, keyValueDict));
    } else {
        log(LOG_LEVEL.WARNING, "Message cannot be sent, because state machine is currently in state: " + state_machine.current);
    }
}

/**
 * Refreshes session token. Runs each ttl seconds.
 */
var refresh_token = function () {
    refresh_token_interval = setInterval(function () {
        log(LOG_LEVEL.DEBUG, 'refresh token nop');
        if (!state_machine.is(STATE_DISCONNECTED)) {
            socket_connection.send(getCustomRequest(NOP_REQUEST, session_info.refresh_token));
        } else {
            clearInterval(refresh_token_interval);
        }
    }, (session_info.ttl - 2000));
};

/**
 * Handles WebSocket exceptions.
 */
var socketOnError = function () {
    state_machine.disconnect('WebSocket exception (URL - ' + socket_connection.url + ')');
};

/**
 * Handles WebSocket open event
 */
var socketOnOpen = function () {
    chrome.storage.sync.get(STORAGE_RSA_KEY, function (data) {
        log(LOG_LEVEL.DEBUG, 'STORAGE_RSA_KEY:');
        log(LOG_LEVEL.DEBUG, data);
        if (STORAGE_RSA_KEY in data) {
            session_info.rsa_private_key = data[STORAGE_RSA_KEY];
            state_machine.handshake('WebSocket connection opened: Url - ' + socket_connection.url);
        } else {
            state_machine.register('WebSocket connection opened: Url - ' + socket_connection.url);
        }
    });
};

/**
 * Handles WebSocket close event.
 */
var socketOnClose = function () {
    if (!state_machine.is(STATE_DISCONNECTED)) {
        state_machine.disconnect('WebSocket connection closed: Url - ' + socket_connection.url);
    }
};

/**
 * Method overrides WebSocket.send() method.
 * @param {string} request to send to server.
 */
var socketOnSend = function (request) {
    log(LOG_LEVEL.DEBUG, 'REQUEST: ' + request);
    socket_connection.send_(request);
    increaseRequestCounter();
    clearInterval(session_alive_interval);
    keepAlive();
};

/**
 * Handles socket messages from server.
 * @param event
 */
var socketOnMessage = function (event) {
    var data = JSON.parse(event.data);
    log(LOG_LEVEL.DEBUG, 'Received message from server:');
    log(LOG_LEVEL.DEBUG, data);
    if (data.msg.oid == 'bye') return;
    if (state_machine.is(STATE_REGISTRATION_HANDSHAKE) || state_machine.is(STATE_REGULAR_HANDSHAKE)) {
        session_info.token = data.header.token;
        session_info.refresh_token = data.msg.refreshToken;
        session_info.ttl = data.msg.ttl * 1000;
        if ('key' in data.msg) {
            session_info.rsa_private_key = data.msg.key;
            var rsa_private_key = {};
            rsa_private_key[STORAGE_RSA_KEY] = session_info.rsa_private_key;
            chrome.storage.sync.set(rsa_private_key);
        }
        state_machine.ready('Handshake was successful!\nToken: ' + session_info.token + '\nRefresh token: ' + session_info.refresh_token);
    } else if ([STATE_READY, STATE_PASS_PHRASE, STATE_PUBLIC_KEYS].indexOf(state_machine.current) != -1) {
        if (data.msg.oid == 'nop' && session_info.token != data.header.token) {
            session_info.token = data.header.token;
            clearInterval(refresh_token_interval);
            refresh_token();
        } else if (data.msg.oid == 'rpcResp') {
            var dataResp = data.msg.data;
            if (dataResp.keys.indexOf('error') > -1) {
                log(LOG_LEVEL.ERROR, 'Error received from rpc method: ' + dataResp.values[0]);
                currentRequestData['error'] = dataResp.values[0];
                sendResponse(COMMON_RESPONSE_TYPE, currentRequestData);
            } else {
                for (var i = 0; i < dataResp.keys.length; i++) {
                    if (dataResp.keys[i] == 'pass_phrase') {
                        session_info.pass_phrase_data.pass_phrase = dataResp.values[i];
                        session_info.pass_phrase_data.current_acc = currentRequestData['currentUser'];
                        sendResponse(TIMER_RESPONSE_TYPE, {showTimer: false});
                    } else {
                        currentRequestData[dataResp.keys[i]] = dataResp.values[i];
                    }
                }
                if (state_machine.is(STATE_PASS_PHRASE) && session_info.public_keys_required) {
                    state_machine.public_keys('Getting public keys...');
                } else {
                    if (!currentRequestData.hasOwnProperty('pass_phrase_data')) {
                        currentRequestData.pass_phrase_data = session_info.pass_phrase_data;
                    }
                    sendResponse(COMMON_RESPONSE_TYPE, currentRequestData);
                    state_machine.ready('Ready state...', true);
                }
            }
        }
    }
};

/**
 * Handles state machine 'connected' state.
 * @param event
 * @param from
 * @param to
 * @param {string} msg to print inside console.
 */
var onConnect = function (event, from, to, msg) {
    log(LOG_LEVEL.DEBUG, msg);
    socket_connection = new WebSocket(SERVER_URL);
    socket_connection.onerror = socketOnError;
    socket_connection.onopen = socketOnOpen;
    socket_connection.onclose = socketOnClose;
    socket_connection.send_ = socket_connection.send;
    socket_connection.send = socketOnSend;
    socket_connection.onmessage = socketOnMessage;
};

/**
 * Handles state machine 'registration' state.
 * @param event
 * @param from
 * @param to
 * @param {string} msg to print inside console.
 */
var onRegister = function (event, from, to, msg) {
    log(LOG_LEVEL.DEBUG, msg);
    log(LOG_LEVEL.DEBUG, 'Started registration....');
    socket_connection.send(getHandshakeRequest('secret'));
};

/**
 * Handles state machine 'regular_handshake' state.
 * @param event
 * @param from
 * @param to
 * @param {string} msg to print inside console.
 */
var onHandshake = function (event, from, to, msg) {
    log(LOG_LEVEL.DEBUG, msg);
    log(LOG_LEVEL.DEBUG, 'Starting regular handshake....');
    socket_connection.send(getHandshakeRequest());
};

/**
 * Handles state machine 'connection_ready' state.
 * @param event
 * @param from
 * @param to
 * @param {string} msg to print inside console.
 * @param {boolean} noActionRequired optional parameter
 */
var onReady = function (event, from, to, msg, noActionRequired) {
    log(LOG_LEVEL.DEBUG, msg);
    if (typeof noActionRequired == 'undefined' || !noActionRequired) {
        if (from == STATE_REGISTRATION_HANDSHAKE) {
            log(LOG_LEVEL.DEBUG, 'Sending ACK');
            socket_connection.send(getCustomRequest(ACK_REQUEST, session_info.token));
        } else if (from == STATE_REGULAR_HANDSHAKE) {
            log(LOG_LEVEL.DEBUG, 'Sending DIGEST');
            var rsa = new RSAKey();
            rsa.readPrivateKeyFromPEMString(session_info.rsa_private_key);
            var hSig = rsa.signString(getHeaderString(session_info.token), 'sha1');
            socket_connection.send(getDigestRequest(hSig, session_info.token));
        }
        clearInterval(session_alive_interval);
        clearInterval(refresh_token_interval);
        keepAlive();
        refresh_token();
        if (session_info.pass_phrase_data.pass_phrase == '' || session_info.pass_phrase_data.current_acc == '') {
            state_machine.pass_phrase('Getting pass phrase');
        } else if (session_info.public_keys_required) {
            state_machine.public_keys('Getting public keys...');
        }
    }
};

/**
 * Handles state machine 'disconnected' state.
 * @param event
 * @param from
 * @param to
 * @param {string} msg to print inside console.
 */
var onDisconnect = function (event, from, to, msg) {
    log(LOG_LEVEL.DEBUG, msg);
    if (socket_connection && socket_connection.readyState != 3) {
        socket_connection.send(getCustomRequest(BYE_REQUEST, session_info.token));
    }
};

/**
 * Handles state machine 'get_pass_phrase' state.
 * @param event
 * @param from
 * @param to
 * @param {string} msg to print inside console.
 */
var onPassPhrase = function (event, from, to, msg) {
    log(LOG_LEVEL.DEBUG, msg);
    sendRpcRequest(RPC_GET_PASS_PHRASE_METHOD, {'email': currentRequestData.currentUser});
};

/**
 * Handles state machine 'get_public_keys' state.
 * @param event
 * @param from
 * @param to
 * @param {string} msg to print inside console.
 */
var onPublicKeys = function (event, from, to, msg) {
    log(LOG_LEVEL.DEBUG, msg);
    sendRpcRequest(RPC_GET_PUBLIC_KEY_METHOD, {'emails': currentRequestData.recipients.join(',')});
};

/**
 * State machine initialization.
 */
state_machine = StateMachine.create({
    initial: STATE_DISCONNECTED,
    events: [
        {name: 'connect', from: STATE_DISCONNECTED, to: STATE_CONNECTED},
        {name: 'register', from: STATE_CONNECTED, to: STATE_REGISTRATION_HANDSHAKE},
        {name: 'handshake', from: [STATE_CONNECTED, STATE_REGISTRATION_HANDSHAKE], to: STATE_REGULAR_HANDSHAKE},
        {
            name: 'ready',
            from: [STATE_REGISTRATION_HANDSHAKE, STATE_REGULAR_HANDSHAKE, STATE_PASS_PHRASE, STATE_PUBLIC_KEYS],
            to: STATE_READY
        },
        {name: 'pass_phrase', from: STATE_READY, to: STATE_PASS_PHRASE},
        {name: 'public_keys', from: [STATE_READY, STATE_PASS_PHRASE], to: STATE_PUBLIC_KEYS},
        {name: 'disconnect', from: '*', to: STATE_DISCONNECTED}
    ],
    callbacks: {
        onconnect: onConnect,
        onregister: onRegister,
        onhandshake: onHandshake,
        onready: onReady,
        onpass_phrase: onPassPhrase,
        onpublic_keys: onPublicKeys,
        ondisconnect: onDisconnect
    }
});

/**
 * Chrome message listener which listens for messages from content script.
 */
chrome.runtime.onMessage.addListener(
    function (request, sender) {
        log(LOG_LEVEL.DEBUG, 'Received request from content script:');
        log(LOG_LEVEL.DEBUG, request);
        session_info.tab_id = sender.tab.id;
        if (request.command == 'cancel_probe') {
            state_machine.disconnect();
        } else if (['get_phrase_keys', 'get_phrase'].indexOf(request.command) != -1) {
            currentRequestData = request.data;
            if (session_info.pass_phrase_data.pass_phrase == ''
                || currentRequestData['currentUser'] != session_info.pass_phrase_data.current_acc) {
                session_info.pass_phrase_data.current_acc = '';
                sendResponse(TIMER_RESPONSE_TYPE, {showTimer: true});
            }
            if (request.command == 'get_phrase_keys') {
                session_info.public_keys_required = true;
                if (state_machine.is(STATE_DISCONNECTED)) {
                    state_machine.connect('Connecting to websocket - ' + SERVER_URL);
                } else {
                    state_machine.public_keys('Getting public keys...');
                }
            } else if (request.command == 'get_phrase') {
                session_info.public_keys_required = false;
                if (session_info.pass_phrase_data.pass_phrase != ''
                    && currentRequestData['currentUser'] == session_info.pass_phrase_data.current_acc) {
                    currentRequestData['pass_phrase_data'] = session_info.pass_phrase_data;
                    sendResponse(COMMON_RESPONSE_TYPE, currentRequestData);
                } else if (state_machine.is(STATE_DISCONNECTED)) {
                    state_machine.connect('Connecting to websocket - ' + SERVER_URL);
                } else {
                    state_machine.pass_phrase('Getting pass phrase');
                }
            }
        }
    }
);

/**
 * Sends message to content script.
 */
function sendResponse(command, response) {
    chrome.tabs.sendRequest(session_info.tab_id, {command: command, data: response});
    if (command == COMMON_RESPONSE_TYPE) {
        currentRequestData = {};
    }
}

/**
 * Chrome tabs listener which listens for tab close event.
 * After gmail tab is closed it disconnets from server.
 */
chrome.tabs.onRemoved.addListener(function (tabId) {
    if (tabId == session_info.tab_id) {
        if (!state_machine.is(STATE_DISCONNECTED)) {
            state_machine.disconnect();
        }
        resetAllData();
    }
});

/**
 * Resets all session data.
 */
function resetAllData() {
    currentRequestData = {};
    session_info = {
        public_keys_required: false,
        pass_phrase_data: {
            pass_phrase: '',
            current_acc: ''
        },
        token: '',
        refresh_token: '',
        ttl: '',
        rsa_private_key: '',
        tab_id: ''
    };
    setupDefaults();
}

//chrome.storage.sync.remove('biomio_private_key', function(){
//    console.log('done');
//});
//chrome.storage.sync.get('biomio_private_key', function(data){
//    console.log(data);
//});
//
//chrome.storage.local.remove('UserKeyRing_<andriy.lobashchuk@vakoms.com>', function(){
//    console.log('done');
//});