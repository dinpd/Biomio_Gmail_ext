var MAX_FILE_SIZE = 150000;
var EMAIL_PARTS_SEPARATOR = '#-#-#';
var FILE_PARTS_SEPARATOR = '#--#';
var FILE_NAME_SEPARATOR = '##-##';
var gmail_scripts = ['gmail.js', 'gmail_executor.js'];
var gmail_scripts_urls = [];
var currentRequest;

//Get urls for each extension script that must be injected into page.
for (var i = 0; i < gmail_scripts.length; i++) {
    gmail_scripts_urls.push(chrome.extension.getURL(gmail_scripts[i]));
}

//OpenPGP instance.
var pgpContext = new e2e.openpgp.ContextImpl();
pgpContext.setArmorHeader(
    'Version',
    'BioMio v1.0');

/**
 * Injects required scripts and elements into gmail page.
 */
window.onload = function () {
    $('body').append('<div id="biomio_elements"></div>');
    var biomio_elems = $('#biomio_elements');
    biomio_elems.load(chrome.extension.getURL('additional_html.html'), function () {
        for (i = 0; i < gmail_scripts_urls.length; i++) {
            biomio_elems.append('<script src="' + gmail_scripts_urls[i] + '"></script>');
        }
    });
};

//////////////// SOCKET ////////////////////////

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

var publicKeysRequiredFlag = false;
var passPhraseRequiredFlag = false;

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
        if (iterations == 4) {
            sendRpcRequest(RPC_GET_PUBLIC_KEY_METHOD, {'email': RECIPIENT_EMAIL_TEST});
        }
        if (iterations > 6) {
            socket_connection.disconnect('WebSocket connection closed: Url - ' + socket_connection.url);
        }
    }, (SOCKET_CONNECTION_TIMEOUT - 2000));
};

function sendRpcRequest(method, keyValueDict) {
    if (state_machine.is(STATE_READY)) {
        socket_connection.send(getRpcRequest(user_info.token, method, keyValueDict));
    } else {
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
    if (!state_machine.is(STATE_DISCONNECTED)) {
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
    if (data.msg.oid == 'bye') return;
    if (state_machine.is(STATE_REGISTRATION_HANDSHAKE) || state_machine.is(STATE_REGULAR_HANDSHAKE)) {
        user_info.token = data.header.token;
        user_info.refresh_token = data.msg.refreshToken;
        user_info.ttl = data.msg.ttl * 1000;
        if ('key' in data.msg) {
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
        } else if (data.msg.oid == 'rpcResp') {
            var dataResp = data.msg.data;
            if (dataResp.keys.indexOf('error') > -1) {
                console.log('Error received from rpc method: ', dataResp.values[0]);
            } else {
                if (data.msg.call == RPC_GET_PASS_PHRASE_METHOD) {
                    console.log('=======================================');
                    console.log('Received data from ' + RPC_GET_PASS_PHRASE_METHOD + ' method: ');
                    for (var i = 0; i < dataResp.keys.length; i++) {
                        console.log(dataResp.keys[i], dataResp.values[i]);
                        user_info[dataResp.keys[i]] = dataResp.values[i];
                    }
                    pgpContext.setKeyRingPassphrase(user_info['pass_phrase']);
                    console.log('=======================================');
                    passPhraseRequiredFlag = false;
                    if(!publicKeysRequiredFlag){
                        window.postMessage(currentRequest);
                    }
                } else if (data.msg.call == RPC_GET_PUBLIC_KEY_METHOD) {
                    console.log('=======================================');
                    console.log('Received data from ' + RPC_GET_PUBLIC_KEY_METHOD + ' method: ');
                    for (var i = 0; i < dataResp.keys.length; i++) {
                        console.log(dataResp.keys[i], dataResp.values[i]);
                        user_info[dataResp.keys[i]] = dataResp.values[i];
                    }
                    console.log('=======================================');
                    publicKeysRequiredFlag = false;
                    data['gotPublicKeys'] = true;
                    if(!passPhraseRequiredFlag){
                        window.postMessage(currentRequest);
                    }
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
    } else if (from == STATE_REGULAR_HANDSHAKE) {
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
    if (socket_connection.readyState != 3) {
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

/**
 * Checks whether socket connection is initialized, if not - initializes it.
 *
 * @param {boolean=} publicKeysRequired indicates whether it is required to get public keys from server.
 * @param {Array.String=} emails to get public keys for.
 * @param {String=} currentUserEmail to get pass phrase for.
 * @returns {boolean}
 * @private
 */
function _isConnectionInitialized(publicKeysRequired, emails, currentUserEmail) {
    publicKeysRequiredFlag = publicKeysRequired && !publicKeysRequiredFlag;
    passPhraseRequiredFlag = !user_info.hasOwnProperty('pass_phrase') && !passPhraseRequiredFlag;
    if (state_machine.is(STATE_DISCONNECTED)) {
        state_machine.connect('Connecting to websocket - ' + SERVER_URL);
        return false;
    }else{
        if(publicKeysRequiredFlag){
            sendRpcRequest(RPC_GET_PUBLIC_KEY_METHOD, {'emails': emails});
        }
        if(passPhraseRequiredFlag){
            sendRpcRequest(RPC_GET_PASS_PHRASE_METHOD, {'email': currentUserEmail});
        }
    }
    return publicKeysRequiredFlag || passPhraseRequiredFlag;
}

////////////////// SOCKET ////////////////////


var uid = 'Autogenerated Key (Biomio) <test@mail.com>';

/**
 * Window listener which listens for messages from gmail_executor script.
 */
window.addEventListener("message", function (event) {
    currentRequest = event.data;
    if (currentRequest.hasOwnProperty('type') && currentRequest.type == "encrypt_sign") {
        encryptMessage(currentRequest.data);
    } else if (currentRequest.hasOwnProperty('type') && currentRequest.type == "decryptMessage") {
        decryptMessage(currentRequest.data);
    }
}, false);

/**
 * Parses required data from data object and encrypts it.
 * @param {Object=} data with required information for encryption.
 */
function encryptMessage(data) {
    console.log('Encrypt: ', data);
    prepareEncryptParameters(data);
    if(_isConnectionInitialized(true, data.recipients, data.currentUser)){
        var keys = [];
        var sender_private_key = pgpContext.searchPrivateKey(uid).result_[0];
        for (var i = 0; i < data.recipients.length; i++) {
            var pub_key = pgpContext.searchPublicKey(uid);
            if (pub_key.result_) {
                $.extend(keys, pub_key.result_);
            }
        }
        if (data.hasOwnProperty('encryptObject') && data.encryptObject == 'file') {
            data.content = encryptFile(data, keys, sender_private_key);
        } else {
            data.content = _encryptMessage(data.content, keys, sender_private_key);
        }
        data.completedAction = 'encrypt_only';
        sendResponse(data);
    }
}

/**
 * Encrypts given content with array of public keys and signs it with sender's private key.
 * @param {string=} content to encrypt
 * @param {Array.Key=} keys array of public key objects.
 * @param {Key=} sender_key Private OpenPGP key.
 * @returns {string} encrypted content.
 * @private
 */
function _encryptMessage(content, keys, sender_key) {
    var encrypted_content = pgpContext.encryptSign(content, [], keys, [], sender_key);
    return encrypted_content.result_;
}

/**
 * Parses required data fro data object and decrypts it.
 * @param {Object=} data with required information for decryption.
 */
function decryptMessage(data) {
    console.log('Decrypt: ', data);
    var emailParts = data.content.split(EMAIL_PARTS_SEPARATOR);
    data.content = _decryptMessage(emailParts[0]);
    if (emailParts.length > 1) {
        data['decryptedFiles'] = [];
        for (var i = 1; i < emailParts.length; i++) {
            data.decryptedFiles.push(decryptFile(emailParts[i]));
        }
    }
    data.completedAction = 'decrypt_verify';
    sendResponse(data);
}

/**
 * Decrypts given content
 * @param {string=} content to decrypt
 * @returns {string} decrypted content.
 * @private
 */
function _decryptMessage(content) {
    var decryptedText = pgpContext.verifyDecrypt(function () {
    }, content);
    decryptedText = decryptedText.result_.decrypt;
    decryptedText = e2e.byteArrayToStringAsync(decryptedText.data, decryptedText.options.charset);
    return decryptedText.result_;
}

/**
 * Sends message to gmail_executor script.
 * @param {Object=} message to send.
 */
function sendResponse(message) {
    console.log(message);
    window.postMessage(message, '*');
}

/**
 * Parses recipients list and generates array with recipients emails, also generates valid sender email UID.
 * @param {Object=} data with required information.
 */
function prepareEncryptParameters(data) {
    var recipients_arr = data.recipients;
    for (var i = 0; i < recipients_arr.length; i++) {
        var recipient = recipients_arr[i].split(' ');
        recipients_arr[i] = recipient[recipient.length - 1];
    }
    data.recipients = recipients_arr;
    data.currentUser = '<' + data.currentUser + '>';
}

/**
 * Encrypts given file with array of public keys and sender's private key.
 * @param {Object=} data with required encryption information.
 * @param {Array.Key=} public_keys array of Key objects with recipients public keys.
 * @param {Key} sender_key object with sender's private key.
 * @returns {string} encrypted file.
 */
function encryptFile(data, public_keys, sender_key) {
    var fileContent = data.content;
    var fileParts = [];
    var encryptedFileParts = [];
    if (fileContent.length >= MAX_FILE_SIZE) {
        for (var i = 0; i < fileContent.length; i += MAX_FILE_SIZE) {
            if (fileContent.length <= i + MAX_FILE_SIZE) {
                fileParts.push(data.fileName + FILE_NAME_SEPARATOR + fileContent.substring(i, fileContent.length));
                break;
            }
            fileParts.push(fileContent.substring(i, i + MAX_FILE_SIZE));
        }
    } else {
        fileParts = [data.fileName + FILE_NAME_SEPARATOR + fileContent];
    }
    for (var k = 0; k < fileParts.length; k++) {
        encryptedFileParts.push(_encryptMessage(fileParts[k], public_keys, sender_key));
    }
    return encryptedFileParts.join(FILE_PARTS_SEPARATOR);
}

/**
 * Decrypts given file.
 * @param {string=} encryptedFile to decrypt.
 * @returns {{fileName: string, decryptedFile: string}}
 */
function decryptFile(encryptedFile) {
    var encryptedFileParts = encryptedFile.split(FILE_PARTS_SEPARATOR);
    var fileName = '';
    var decryptedFile = '';
    for (var i = 0; i < encryptedFileParts.length; i++) {
        var decryptedFilePart = _decryptMessage(encryptedFileParts[i]);
        if (!fileName.length) {
            var fileNamePart = decryptedFilePart.split(FILE_NAME_SEPARATOR);
            if (fileNamePart.length > 1) {
                fileName = fileNamePart[0];
                decryptedFilePart = fileNamePart[1];
            }
        }
        decryptedFile += decryptedFilePart;
    }
    return makeFileDownloadable(fileName, decryptedFile);
}

/**
 * Adds some parameters to file's data URL so file becomes downloadable.
 * @param {string=} fileName of the current decrypted file.
 * @param {string=} decryptedFile
 * @returns {{fileName: string, decryptedFile: string}}
 */
function makeFileDownloadable(fileName, decryptedFile) {
    var file_ext = fileName.split('.');
    file_ext = file_ext[file_ext.length - 1];
    var splitDataContent = decryptedFile.split(';');
    var dataType = splitDataContent[0].split(':');
    if (dataType.length > 1) {
        dataType[1] = 'attachment/' + file_ext;
    } else {
        dataType.push('attachment/' + file_ext);
    }
    dataType = dataType.join(':');
    splitDataContent[0] = dataType;
    decryptedFile = splitDataContent.join(';');
    return {fileName: fileName, decryptedFile: decryptedFile};
}

