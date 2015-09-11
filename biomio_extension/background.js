var STATE_CONNECTED = 'connected';
var STATE_REGISTRATION_HANDSHAKE = 'registration';
var STATE_REGULAR_HANDSHAKE = 'regular_handshake';
var STATE_READY = 'connection_ready';
var STATE_DISCONNECTED = 'disconnected';
var STATE_PASS_PHRASE = 'get_pass_phrase';
var STATE_PUBLIC_KEYS = 'get_public_keys';
var STATE_REMOTE_AUTH = 'remote_auth';
var socket_connection;
var state_machine;

var SERVER_URL;

var export_key_result = null;
var registration_result = null;
var registration_error_msg = '';

var registration_secret = null;

var client_auth_email = null;
var client_auth_result = null;
var client_auth_code = null;

var is_registered = false;

var session_info = {
    last_state: '',
    reconnect: false,
    public_keys_required: false,
    export_key_required: false,
    pass_phrase_data: {
        pass_phrase: '',
        current_acc: ''
    },
    token: '',
    refresh_token: '',
    session_ttl: 0,
    connection_ttl: 0,
    rsa_private_key: '',
    tab_id: ''
};

var session_alive_interval;
var refresh_token_interval;

var currentRequestData = {};


/**
 * Initializes APP
 */
function initializeApp() {
    setupDefaults();
    session_info.rsa_private_key = getFromStorage(STORAGE_KEYS.STORAGE_RSA_KEY);
    var app_id = getFromStorage(STORAGE_KEYS.STORAGE_APP_ID_KEY);
    if (session_info.rsa_private_key != null && app_id != null) {
        is_registered = true;
        session_info.rsa_private_key = decrypt_private_app_key(session_info.rsa_private_key);
        setAppID(app_id);
    }
    if (!is_registered) {
        chrome.browserAction.setBadgeText({text: "!"});
    }
    chrome.storage.local.get('biomio_settings', function (data) {
        var settings = data['biomio_settings'];
        if (settings) {
            SERVER_URL = settings['server_url'];
        } else {
            SERVER_URL = "wss://gate.biom.io:8080/websocket";
        }
        log(LOG_LEVEL.DEBUG, SERVER_URL);
    });
    log(LOG_LEVEL.DEBUG, app_id);
}

initializeApp();

/**
 * Keeps session alive. Runs each connection timeout value seconds.
 */
var keepAlive = function () {
    if (session_info.connection_ttl > 0) {
        session_alive_interval = setInterval(function () {
            log(LOG_LEVEL.DEBUG, 'keep alive nop');
            if (!state_machine.is(STATE_DISCONNECTED)) {
                socket_connection.send(getCustomRequest(NOP_REQUEST, session_info.token));
            } else {
                clearInterval(session_alive_interval);
            }
        }, (session_info.connection_ttl - 2000));
    }
};

/**
 * Sends RPC request.
 * @param {string} method RPC method type.
 * @param {string} onBehalfOf current User email.
 * @param {Object} keyValueDict - rpc method input values.
 */
function sendRpcRequest(method, onBehalfOf, keyValueDict) {
    onBehalfOf = prepare_email(onBehalfOf);
    if (state_machine.is(STATE_PASS_PHRASE) || state_machine.is(STATE_PUBLIC_KEYS)) {
        socket_connection.send(getRpcRequest(session_info.token, method, onBehalfOf, keyValueDict));
    } else {
        log(LOG_LEVEL.WARNING, "Message cannot be sent, because state machine is currently in state: " + state_machine.current);
    }
}

/**
 * Refreshes session token. Runs each session_ttl seconds.
 */
var refresh_token = function () {
    if (session_info.session_ttl > 0) {
        refresh_token_interval = setInterval(function () {
            log(LOG_LEVEL.DEBUG, 'refresh token nop');
            if (!state_machine.is(STATE_DISCONNECTED)) {
                socket_connection.send(getCustomRequest(NOP_REQUEST, session_info.refresh_token));
            } else {
                clearInterval(refresh_token_interval);
            }
        }, (session_info.session_ttl - 2000));
    }
};

/**
 * Handles WebSocket exceptions.
 */
var socketOnError = function () {
    var errorResponse = {error: ''};
    if (currentRequestData.hasOwnProperty('composeId')) {
        errorResponse['composeId'] = currentRequestData.composeId;
    }
    if (state_machine.current == STATE_CONNECTED) {
        errorResponse.error = ERROR_MESSAGES.SERVER_CONNECTION_ERROR;
    } else {
        errorResponse.error = ERROR_MESSAGES.SERVER_ERROR;
    }
    sendResponse(REQUEST_COMMANDS.ERROR, errorResponse);
    state_machine.disconnect('WebSocket exception (URL - ' + socket_connection.url + ')');
};

/**
 * Handles WebSocket open event
 */
var socketOnOpen = function () {
    if (!is_registered) {
        state_machine.register('WebSocket connection opened: Url - ' + socket_connection.url);
    } else {
        state_machine.handshake('WebSocket connection opened: Url - ' + socket_connection.url);
    }
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
    if (data.msg.oid == 'bye') {
        //if(!session_info.connection_retried && !state_machine.is(STATE_READY) && !state_machine.is(STATE_DISCONNECTED)){
        //    session_info.connection_retried = true;
        //    session_info.last_state = state_machine.current;
        //    socket_connection.close();
        //    return;
        //}
        socket_connection.close();
        if (data.hasOwnProperty('status')) {
            log(LOG_LEVEL.DEBUG, data.status);
            if (data.status.indexOf('Invalid token') != -1) {
                session_info.reconnect = true;
                return;
            }
            if ((state_machine.is(STATE_REGISTRATION_HANDSHAKE) && data.status.indexOf('app is already registered') != -1)
                || (state_machine.is(STATE_REGULAR_HANDSHAKE) && data.status.indexOf('registration handshake first') != -1)) {
                currentRequestData['error'] = 'Your APP registration was canceled, it is required that you register it again.';
                sendResponse(REQUEST_COMMANDS.ERROR, currentRequestData);
                resetAllData();
                resetAppRegistrationData();
                return;
            } else if (state_machine.is(STATE_REGISTRATION_HANDSHAKE)) {
                registration_error_msg = data.status;
            }
        }
        if (!state_machine.is(STATE_READY) && !state_machine.is(STATE_DISCONNECTED)) {
            var errorResponse = {error: ''};

            if (currentRequestData.hasOwnProperty('composeId')) {
                errorResponse['composeId'] = currentRequestData.composeId;
            }
            errorResponse.error = 'Server closed connection with status: ' + data.status;
            try {
                sendResponse(REQUEST_COMMANDS.ERROR, errorResponse);
            } catch (err) {
                log(LOG_LEVEL.ERROR, err.message);
            }
        }
        resetAllData();
        return;
    }
    if (state_machine.is(STATE_REGISTRATION_HANDSHAKE) || state_machine.is(STATE_REGULAR_HANDSHAKE)) {
        session_info.token = data.header.token;
        session_info.refresh_token = data.msg["refreshToken"];
        session_info.session_ttl = data.msg["sessionttl"] * 1000;
        session_info.connection_ttl = data.msg["connectionttl"] * 1000;
        if ('key' in data.msg) {
            session_info.rsa_private_key = data.msg.key;
            setToStorage(STORAGE_KEYS.STORAGE_RSA_KEY, encrypt_private_app_key(session_info.rsa_private_key));
        }
        if ('fingerprint' in data.msg) {
            var app_id = data.msg.fingerprint;
            setToStorage(STORAGE_KEYS.STORAGE_APP_ID_KEY, app_id);
            setAppID(app_id);
            log(LOG_LEVEL.DEBUG, app_id);
        }
        is_registered = true;
        state_machine.ready('Handshake was successful!');
    } else if ([STATE_READY, STATE_PASS_PHRASE, STATE_PUBLIC_KEYS, STATE_REMOTE_AUTH].indexOf(state_machine.current) != -1) {
        if (data.msg.oid == 'nop' && session_info.token != data.header.token) {
            session_info.token = data.header.token;
            clearInterval(refresh_token_interval);
            refresh_token();
        } else if (data.msg.oid == 'rpcResp') {
            var dataResp = data.msg.data;
            var rspStatus = data.msg['rpcStatus'];
            if (dataResp.keys.indexOf('error') != -1) {
                log(LOG_LEVEL.ERROR, 'Error received from rpc method: ' + dataResp.values[0]);
                if (state_machine.is(STATE_REMOTE_AUTH)) {
                    client_auth_result = {
                        result: false,
                        error: dataResp.values[0],
                        status: 'error'
                    };
                } else {
                    currentRequestData['error'] = dataResp.values[0];
                    sendResponse(REQUEST_COMMANDS.ERROR, currentRequestData);
                }
                state_machine.ready('Ready state...', true);
            } else if (rspStatus == "inprogress") {
                if (dataResp.keys.indexOf('timeout') != -1) {
                    if (state_machine.is(STATE_REMOTE_AUTH)) {
                        client_auth_result = {
                            message: dataResp.values[0],
                            timeout: dataResp.values[1],
                            status: 'in_progress'
                        };
                    } else {
                        sendResponse(REQUEST_COMMANDS.SHOW_TIMER, {
                            showTimer: true,
                            msg: dataResp.values[0],
                            timeout: dataResp.values[1]
                        });
                    }
                } else {
                    if (state_machine.is(STATE_REMOTE_AUTH)) {
                        client_auth_result = {
                            message: dataResp.values[0],
                            status: 'in_progress'
                        };
                    } else {
                        sendResponse(REQUEST_COMMANDS.SHOW_TIMER, {
                            showTimer: false,
                            msg: dataResp.values[0]
                        });
                    }
                }
            } else {
                if (state_machine.is(STATE_REMOTE_AUTH)) {
                    client_auth_result = {
                        result: true,
                        status: 'completed'
                    };
                    state_machine.ready('Ready state...', true);
                } else {
                    for (var i = 0; i < dataResp.keys.length; i++) {
                        if (dataResp.keys[i] == 'pass_phrase') {
                            session_info.pass_phrase_data.pass_phrase = dataResp.values[i];
                            session_info.pass_phrase_data.current_acc = currentRequestData['currentUser'];
                            if (session_info.export_key_required) {
                                currentRequestData.pass_phrase_data = session_info.pass_phrase_data;
                                sendResponse(REQUEST_COMMANDS.EXPORT_KEY, currentRequestData);
                            } else {
                                sendResponse(REQUEST_COMMANDS.SHOW_TIMER, {showTimer: false});
                            }
                        } else {
                            currentRequestData[dataResp.keys[i]] = dataResp.values[i];
                        }
                    }
                    if (session_info.export_key_required) {
                        state_machine.ready('Ready state...', true);
                    } else {
                        if (state_machine.is(STATE_PASS_PHRASE) && session_info.public_keys_required) {
                            state_machine.public_keys('Getting public keys...');
                        } else {
                            if (!currentRequestData.hasOwnProperty('pass_phrase_data')) {
                                currentRequestData.pass_phrase_data = session_info.pass_phrase_data;
                            }
                            sendResponse(REQUEST_COMMANDS.COMMON_RESPONSE, currentRequestData);
                            state_machine.ready('Ready state...', true);
                        }
                    }
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
    setupDefaults();
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
    socket_connection.send(getHandshakeRequest(registration_secret));
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
    if (registration_secret != null) {
        registration_secret = null;
        registration_result = {result: true};
        state_machine.disconnect('App successfully registered');
    }
    else if (typeof noActionRequired == 'undefined' || !noActionRequired) {
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
        if (client_auth_email != null && client_auth_code != null) {
            state_machine.process_remote_auth('starting Client Authentication on behalf of - ' + client_auth_email, client_auth_email, client_auth_code);
        }
        else if (session_info.public_keys_required) {
            state_machine.public_keys('Getting public keys...');
        }
        else if (session_info.pass_phrase_data.pass_phrase == '' || session_info.pass_phrase_data.current_acc == '' || session_info.export_key_required) {
            state_machine.pass_phrase('Getting pass phrase');
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
    if (session_info.reconnect) {
        clearInterval(session_alive_interval);
        clearInterval(refresh_token_interval);
        restoreConnection();
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
    sendRpcRequest(RPC_GET_PASS_PHRASE_METHOD, currentRequestData.currentUser, {'email': currentRequestData.currentUser});
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
    sendRpcRequest(RPC_GET_PUBLIC_KEY_METHOD, currentRequestData.currentUser,
        {'emails': currentRequestData.recipients.join(',')});
};

var onRemoteAuth = function (event, from, to, msg, email, auth_code) {
    log(LOG_LEVEL.DEBUG, msg);
    socket_connection.send(getRpcAuthRequest(session_info.token, email, {email: email, auth_code: auth_code}));
    client_auth_email = null;
    client_auth_code = null;
};

/**
 * State machine initialization.
 */
state_machine = StateMachine.create({
    initial: STATE_DISCONNECTED,
    events: [
        {name: 'connect', from: STATE_DISCONNECTED, to: STATE_CONNECTED},
        {name: 'register', from: STATE_CONNECTED, to: STATE_REGISTRATION_HANDSHAKE},
        {name: 'handshake', from: STATE_CONNECTED, to: STATE_REGULAR_HANDSHAKE},
        {
            name: 'ready',
            from: [STATE_REGISTRATION_HANDSHAKE, STATE_REGULAR_HANDSHAKE, STATE_PASS_PHRASE, STATE_PUBLIC_KEYS, STATE_REMOTE_AUTH],
            to: STATE_READY
        },
        {name: 'pass_phrase', from: STATE_READY, to: STATE_PASS_PHRASE},
        {name: 'public_keys', from: [STATE_READY, STATE_PASS_PHRASE], to: STATE_PUBLIC_KEYS},
        {name: 'process_remote_auth', from: STATE_READY, to: STATE_REMOTE_AUTH},
        {name: 'disconnect', from: '*', to: STATE_DISCONNECTED}
    ],
    callbacks: {
        onconnect: onConnect,
        onregister: onRegister,
        onhandshake: onHandshake,
        onready: onReady,
        onpass_phrase: onPassPhrase,
        onpublic_keys: onPublicKeys,
        onprocess_remote_auth: onRemoteAuth,
        ondisconnect: onDisconnect
    }
});

/**
 * Chrome message listener which listens for messages from content script.
 */
chrome.runtime.onMessage.addListener(
    function (request, sender) {
        if (request.command == 'biomio_reset_server_connection') {
            log(LOG_LEVEL.DEBUG, 'Received request from popup script:');
            log(LOG_LEVEL.DEBUG, request);
            session_info.last_state = '';
            state_machine.disconnect('Server connection reset.');
            resetAllData();
            return;
        }
        log(LOG_LEVEL.DEBUG, 'Received request from content script:');
        log(LOG_LEVEL.DEBUG, request);
        session_info.tab_id = sender.tab.id;
        if (request.command == SOCKET_REQUEST_TYPES.CANCEL_PROBE) {
            state_machine.disconnect();
            resetAllData();
        } else if (request.command == SOCKET_REQUEST_TYPES.PERSIST_GMAIL_USER) {
            chrome.storage.local.set(request.data);
        }
        else if (request.command == REQUEST_COMMANDS.EXPORT_KEY) {
            export_key_result = request.data.exported_key;
            log(LOG_LEVEL.DEBUG, export_key_result);
            session_info.export_key_required = false;
        }
        else if ([SOCKET_REQUEST_TYPES.GET_PUBLIC_KEYS, SOCKET_REQUEST_TYPES.GET_PASS_PHRASE].indexOf(request.command) != -1) {
            currentRequestData = request.data;
            session_info.pass_phrase_data.current_acc = '';
            if (session_info.pass_phrase_data.pass_phrase == ''
                || currentRequestData['currentUser'] != session_info.pass_phrase_data.current_acc) {
                session_info.pass_phrase_data.current_acc = '';
                if (state_machine.is(STATE_PASS_PHRASE)) {
                    state_machine.ready('Ready state...', true);
                }
            }
            if (request.command == SOCKET_REQUEST_TYPES.GET_PUBLIC_KEYS) {
                session_info.public_keys_required = true;
                if (state_machine.is(STATE_DISCONNECTED)) {
                    state_machine.connect('Connecting to websocket - ' + SERVER_URL);
                } else {
                    state_machine.public_keys('Getting public keys...');
                    //if (session_info.pass_phrase_data.current_acc == '') {
                    //    state_machine.pass_phrase('Getting pass phrase');
                    //} else {
                    //
                    //}
                }
            } else if (request.command == SOCKET_REQUEST_TYPES.GET_PASS_PHRASE) {
                session_info.public_keys_required = false;
                session_info.pass_phrase_data.current_acc = '';
                if (session_info.pass_phrase_data.current_acc != '') {
                    currentRequestData['pass_phrase_data'] = session_info.pass_phrase_data;
                    sendResponse(REQUEST_COMMANDS.COMMON_RESPONSE, currentRequestData);
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
 * @param {string} command
 * @param {Object} response
 */
function sendResponse(command, response) {
    chrome.tabs.sendRequest(session_info.tab_id, {command: command, data: response});
    if ([REQUEST_COMMANDS.COMMON_RESPONSE, REQUEST_COMMANDS.ERROR].indexOf(command) != -1) {
        currentRequestData = {};
    }
}

/**
 * Chrome tabs listener which listens for tab close event.
 * After gmail tab is closed it disconnets from server.
 */
chrome.tabs.onRemoved.addListener(function (tabId) {
    if (tabId == session_info.tab_id) {
        log(LOG_LEVEL.DEBUG, 'Gmail tab closed. Resetting connection info.');
        if (!state_machine.is(STATE_DISCONNECTED)) {
            state_machine.disconnect();
        }
        chrome.storage.local.set({current_gmail_user_biomio: ''});
        resetAllData();
    }
});

/**
 * Resets all session data.
 */
function resetAllData() {
    currentRequestData = {};
    export_key_result = null;
    session_info = {
        last_state: '',
        reconnect: false,
        public_keys_required: false,
        export_key_required: false,
        pass_phrase_data: {
            pass_phrase: '',
            current_acc: ''
        },
        token: '',
        refresh_token: '',
        session_ttl: 0,
        connection_ttl: 0,
        rsa_private_key: '',
        tab_id: ''
    };
    setupDefaults();
    initializeApp();
}

/**
 * Requests listener that listens for requests from options page.
 */
chrome.extension.onRequest.addListener(function (request, sender, sendOptionsResponse) {
    log(LOG_LEVEL.DEBUG, 'Received request from options page:');
    log(LOG_LEVEL.DEBUG, request);
    if (request.hasOwnProperty('changed_url')) {
        SERVER_URL = request['changed_url'];
        state_machine.disconnect('Server URL changed: ' + SERVER_URL);
    } else if (request.hasOwnProperty('export_key')) {
        currentRequestData.currentUser = request['export_key'];
        session_info.pass_phrase_data = {};
        session_info.export_key_required = true;
        if (state_machine.is(STATE_DISCONNECTED)) {
            state_machine.connect('Connecting to websocket - ' + SERVER_URL);
        } else {
            state_machine.pass_phrase('Getting pass phrase for user: ' + request['export_key']);
        }
        var responseInterval = setInterval(function () {
            console.log('running');
            if (export_key_result != null) {
                console.log(export_key_result);
                sendOptionsResponse({exported_key: export_key_result});
                export_key_result = null;
                clearInterval(responseInterval);
            }
        }, 1000);
        responseInterval;
    } else if (request.hasOwnProperty('message') && request.message == 'is_registered') {
        sendOptionsResponse({is_registered: is_registered});
    } else if (request.hasOwnProperty('secret_code')) {
        register_extension(request.secret_code, sendOptionsResponse)
    }
});

function register_extension(secret_code, registerResponse) {
    registration_secret = secret_code;
    state_machine.connect();
    var registrationResponseInterval = setInterval(function () {
        console.log('registration is running...');
        if (state_machine.is(STATE_DISCONNECTED) && registration_result == null) {
            registration_result = {
                result: false,
                error: 'Registration was unsuccessful'
            };
            if (registration_error_msg.length) {
                registration_result.error = registration_result.error + ': ' + registration_error_msg;
                registration_error_msg = '';
            }

        }
        if (registration_result != null) {
            log(LOG_LEVEL.DEBUG, 'Registration Result:');
            log(LOG_LEVEL.DEBUG, registration_result);
            if (registration_result.result) {
                chrome.browserAction.setBadgeText({text: ""});
            }
            try {
                registerResponse(registration_result);
            }
            catch (e) {
                log(LOG_LEVEL.ERROR, e);
            }
            registration_result = null;
            registration_secret = null;
            clearInterval(registrationResponseInterval);
        }
    }, 1000);
    registrationResponseInterval;
}


//chrome.runtime.onMessageExternal.addListener(function (request, sender, sendExternalResponse) {
//    log(LOG_LEVEL.DEBUG, 'Received request from external source:');
//    log(LOG_LEVEL.DEBUG, request);
//    log(LOG_LEVEL.DEBUG, sender);
//    if (request.hasOwnProperty('command') && request.command == 'register_biomio_extension' && !is_registered) {
//        log(LOG_LEVEL.DEBUG, 'Started extension registration.');
//        register_extension(request.data.secret_code, sendExternalResponse);
//        log(LOG_LEVEL.DEBUG, 'Finished extension registration.');
//    }
//});


chrome.runtime.onConnectExternal.addListener(function (port) {
    console.log(port);
    port.onMessage.addListener(function (request) {
        log(LOG_LEVEL.DEBUG, 'Received request from external source:');
        log(LOG_LEVEL.DEBUG, request);
        if (request.hasOwnProperty('command') && request.command == 'register_biomio_extension' && !is_registered) {
            log(LOG_LEVEL.DEBUG, 'Started extension registration.');
            register_extension(request.data.secret_code, function (result) {
                port.postMessage(result)
            });
            log(LOG_LEVEL.DEBUG, 'Finished extension registration.');
        } else if (request.hasOwnProperty('command') && request.command == 'run_auth' && request.hasOwnProperty('auth_code')) {
            if (!is_registered) {
                port.postMessage({error: 'Extension is not registered.', status: 'error'});
            } else {
                var client_email = '';
                if (request.hasOwnProperty('email')) {
                    client_email = request.email;
                }
                if (!state_machine.is(STATE_READY)) {
                    session_info.reconnect = true;
                    client_auth_email = client_email;
                    client_auth_code = request.auth_code;
                    state_machine.disconnect('Resetting connection, current_state - ' + state_machine.current);
                } else {
                    state_machine.process_remote_auth('Running Client Authentication on behalf of - ' + client_email, client_email, request.auth_code);
                }
                var auth_result_response_interval = setInterval(function () {
                    console.log('Client Authentication is running....');
                    if (state_machine.is(STATE_DISCONNECTED) && client_auth_result == null && !session_info.reconnect) {
                        client_auth_result = {
                            result: false,
                            error: 'Authentication was unsuccessful',
                            status: 'error'
                        }
                    }
                    if (client_auth_result != null) {
                        log(LOG_LEVEL.DEBUG, 'Authentication result:');
                        log(LOG_LEVEL.DEBUG, client_auth_result);
                        try {
                            port.postMessage(client_auth_result);
                        }
                        catch (e) {
                            log(LOG_LEVEL.ERROR, e);
                        }
                        var auth_status = client_auth_result.status;
                        client_auth_result = null;
                        client_email = null;
                        client_auth_code = null;
                        if (auth_status == 'completed' || auth_status == 'error') {
                            if (!state_machine.is(STATE_DISCONNECTED)) {
                                state_machine.disconnect('Client Authentication is finished with status - ' + auth_status);
                            }
                            clearInterval(auth_result_response_interval);
                        }
                    }
                }, 1000);
                auth_result_response_interval;
            }
        } else if (request.hasOwnProperty('command') && request.command == 'is_registered') {
            port.postMessage({is_registered: is_registered});
        }
    });
});


/**
 * Resets APP information saved in storage.
 */
function resetAppRegistrationData() {
    is_registered = false;
    removeFromStorage(STORAGE_KEYS.STORAGE_APP_ID_KEY);
    setAppID(null);
    initializeApp();
}

function restoreConnection() {
    session_info.token = '';
    session_info.refresh_token = '';
    setupDefaults();
    session_info.reconnect = false;
    state_machine.connect();
}

function encrypt_private_app_key(app_key) {
    var pgpContext = new e2e.openpgp.ContextImpl();
    pgpContext.setArmorHeader(
        'Version',
        'BioMio v1.0');
    pgpContext.setKeyRingPassphrase('', 'biomio_data');
    var pass_phrase = 'IHXn6VlEyYlKj9Emz5419nDd7Ip8JgYw';
    var result = pgpContext.encryptSign(app_key, [], [], [pass_phrase]);
    return result.result_;
}

function decrypt_private_app_key(encrypted_key) {
    var pgpContext = new e2e.openpgp.ContextImpl();
    pgpContext.setArmorHeader(
        'Version',
        'BioMio v1.0');
    pgpContext.setKeyRingPassphrase('', 'biomio_data');
    var pass_phrase = 'IHXn6VlEyYlKj9Emz5419nDd7Ip8JgYw';
    var decrypt_result = pgpContext.verifyDecrypt(function (uid, passphraseCallback) {
        passphraseCallback(pass_phrase);
    }, encrypted_key);
    decrypt_result = decrypt_result.result_.decrypt;
    decrypt_result = e2e.byteArrayToStringAsync(decrypt_result.data, decrypt_result.options.charset);
    return decrypt_result.result_;
}

function prepare_email(email) {
    email = email.replace(/</g, '');
    email = email.replace(/>/g, '');
    return email;
}
