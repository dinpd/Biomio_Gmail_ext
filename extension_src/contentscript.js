var MAX_FILE_SIZE = 150000;
var EMAIL_PARTS_SEPARATOR = '#-#-#';
var FILE_PARTS_SEPARATOR = '#--#';
var FILE_NAME_SEPARATOR = '##-##';
var gmail_scripts = ['jquery-1.11.2.min.js', 'gmail.js', 'gmail_executor.js'];
var gmail_scripts_urls = [];
var KEY_PREFIX = 'BioMio ';
var TEMP_PUB_KEYRING = 'TEMP_PUB_KEYRING';

//Get urls for each extension script that must be injected into page.
for (var i = 0; i < gmail_scripts.length; i++) {
    gmail_scripts_urls.push(chrome.extension.getURL(gmail_scripts[i]));
}

//OpenPGP instance.
var pgpContext;

/**
 * Injects required scripts and elements into gmail page.
 */
window.onload = function () {
    chrome.extension.sendRequest({message: 'is_registered'}, function (response) {
        if (response.is_registered) {
            $('body').append('<div id="biomio_elements"></div>');
            var biomio_elems = $('#biomio_elements');
            biomio_elems.load(chrome.extension.getURL('additional_html.html'), function () {
                $('#biomio_show_loading').show();
                for (i = 0; i < gmail_scripts_urls.length; i++) {
                    biomio_elems.append('<script src="' + gmail_scripts_urls[i] + '"></script>');
                }
                log(LOG_LEVEL.DEBUG, 'Scripts were injected.');
            });
            initializeDefaults();
        }
    });
};


function initializeDefaults() {
    pgpContext = new e2e.openpgp.ContextImpl();
    pgpContext.setArmorHeader(
        'Version',
        'BioMio v1.0');
    /**
     * Window listener which listens for messages from gmail_executor script.
     */
    window.addEventListener("message", function (event) {
        var currData = event.data.data;
        try {
            if (event.data.hasOwnProperty('type') && event.data.type == WINDOW_REQUESTS.ENCRYPT) {
                prepareEncryptParameters(currData);
                _sendBackgroundRequest(SOCKET_REQUEST_TYPES.GET_PUBLIC_KEYS, currData);
            } else if (event.data.hasOwnProperty('type') && event.data.type == WINDOW_REQUESTS.DECRYPT) {
                prepareEncryptParameters(currData);
                _sendBackgroundRequest(SOCKET_REQUEST_TYPES.GET_PASS_PHRASE, currData);
            } else if (event.data.hasOwnProperty('type') && event.data.type == SOCKET_REQUEST_TYPES.CANCEL_PROBE) {
                _sendBackgroundRequest(SOCKET_REQUEST_TYPES.CANCEL_PROBE, currData);
            } else if (event.data.hasOwnProperty('type') && event.data.type == SOCKET_REQUEST_TYPES.PERSIST_GMAIL_USER) {
                _sendBackgroundRequest(SOCKET_REQUEST_TYPES.PERSIST_GMAIL_USER, currData);
            }
        } catch (error) {
            if (error.message.indexOf('Error connecting to extension') != -1) {
                //page was loaded before extension, reload is required.
                window.location.reload();
            } else {
                log(LOG_LEVEL.ERROR, error.message);
                sendResponse({error: error.message});
            }
        }
    }, false);

    /**
     * Chrome requests listener which listens for messages from background script.
     */
    chrome.extension.onRequest.addListener(
        function (request) {
            log(LOG_LEVEL.DEBUG, 'Received message from background script:');
            log(LOG_LEVEL.DEBUG, request);
            var data = request.data;
            if (request.command == REQUEST_COMMANDS.COMMON_RESPONSE) {
                var callback = function () {
                };
                if (data['action'] == 'encrypt_only') {
                    callback = encryptMessage;
                } else {
                    callback = decryptMessage;
                }
                _importKeys(data, callback);
            } else if (request.command == REQUEST_COMMANDS.EXPORT_KEY) {
                _exportKey(request.data.pass_phrase_data);
            }
            else if ([REQUEST_COMMANDS.SHOW_TIMER, REQUEST_COMMANDS.ERROR].indexOf(request.command) != -1) {
                if (request.command == REQUEST_COMMANDS.ERROR) {
                    log(LOG_LEVEL.ERROR, data);
                }
                sendResponse(data);
            }
        }
    );
}

/**
 * Parses required data from data object and encrypts it.
 * @param {Object} data with required information for encryption.
 */
function encryptMessage(data) {
    log(LOG_LEVEL.DEBUG, 'Data for encryption:');
    log(LOG_LEVEL.DEBUG, data);
    var keys = [];
    //var sender_private_key = pgpContext.searchPrivateKey(KEY_PREFIX + data.currentUser).result_[0];
    for (var i = 0; i < data.recipients.length; i++) {
        var pub_key = pgpContext.searchPublicKey(KEY_PREFIX + data.recipients[i]);
        if (pub_key.result_) {
            $.extend(keys, pub_key.result_);
        }
    }
    try {
        if (data.hasOwnProperty('encryptObject') && data.encryptObject == 'file') {
            data.content = encryptFile(data, keys);
        } else {
            data.content = _encryptMessage(data.content, keys);
        }
        data.completedAction = 'encrypt_only';
        sendResponse(data);
    } catch (error) {
        sendResponse({error: error, composeId: data.composeId});
    }
    _resetKeyRing(TEMP_PUB_KEYRING);
}

/**
 * Encrypts given content with array of public keys and signs it with sender's private key.
 * @param {string} content to encrypt
 * @param {Array} keys array of public key objects.
 * @param {Key} sender_key Private OpenPGP key.
 * @returns {string} encrypted content.
 * @throws {(ERROR_MESSAGES.ENCRYPTION_DENIED_ERROR|ERROR_MESSAGES.ENCRYPTION_UNKNOWN_ERROR)}
 * @private
 */
function _encryptMessage(content, keys) {
    var encrypted_content = pgpContext.encryptSign(content, [], keys, []);
    log(LOG_LEVEL.DEBUG, 'Encryption result:');
    log(LOG_LEVEL.DEBUG, encrypted_content);
    if (encrypted_content.hadError_) {
        log(LOG_LEVEL.ERROR, encrypted_content.result_.message);
        if (encrypted_content.result_.message.indexOf('No public key nor passphrase') != -1) {
            throw ERROR_MESSAGES.ENCRYPTION_DENIED_ERROR;
        }
        throw ERROR_MESSAGES.ENCRYPTION_UNKNOWN_ERROR;
    }
    return encrypted_content.result_;
}

/**
 * Parses required data for data object and decrypts it.
 * @param {Object} data with required information for decryption.
 */
function decryptMessage(data) {
    log(LOG_LEVEL.DEBUG, 'Data for decryption:');
    log(LOG_LEVEL.DEBUG, data);
    var emailParts = data.content.split(EMAIL_PARTS_SEPARATOR);
    try {
        data.content = _decryptMessage(emailParts[0]);
        if (emailParts.length > 1) {
            data['decryptedFiles'] = [];
            for (var i = 1; i < emailParts.length; i++) {
                data.decryptedFiles.push(decryptFile(emailParts[i]));
            }
        }
        data.completedAction = 'decrypt_verify';
        sendResponse(data);
    } catch (error) {
        sendResponse({error: error});
    }
}

/**
 * Decrypts given content
 * @param {string} content to decrypt
 * @returns {string} decrypted content.
 * @throws {(ERROR_MESSAGES.DECRYPTION_DENIED_ERROR|ERROR_MESSAGES.DECRYPTION_UNKNOWN_ERROR)}
 * @private
 */
function _decryptMessage(content) {
    var decryptedText = pgpContext.verifyDecrypt(function () {
    }, content);
    log(LOG_LEVEL.DEBUG, 'Decryption result:');
    log(LOG_LEVEL.DEBUG, decryptedText);
    if (decryptedText.hadError_) {
        log(LOG_LEVEL.ERROR, decryptedText.result_.message);
        if (decryptedText.result_.message.indexOf('No keys found') != -1) {
            throw ERROR_MESSAGES.DECRYPTION_DENIED_ERROR;
        }
        throw ERROR_MESSAGES.DECRYPTION_UNKNOWN_ERROR;
    }
    decryptedText = decryptedText.result_.decrypt;
    decryptedText = e2e.byteArrayToStringAsync(decryptedText.data, decryptedText.options.charset);
    return decryptedText.result_;
}

/**
 * Sends message to gmail_executor script.
 * @param {Object} message to send.
 */
function sendResponse(message) {
    log(LOG_LEVEL.DEBUG, 'Sending message to gmail_executor script:');
    log(LOG_LEVEL.DEBUG, message);
    window.postMessage(message, '*');
}

/**
 * Parses recipients list and generates array with recipients emails, also generates valid sender email UID.
 * @param {Object} data with required information.
 */
function prepareEncryptParameters(data) {
    data.currentUser = '<' + data.currentUser + '>';
    if (data.hasOwnProperty('recipients')) {
        var recipients_arr = data.recipients;
        for (var i = 0; i < recipients_arr.length; i++) {
            var recipient = recipients_arr[i].split(' ');
            recipients_arr[i] = recipient[recipient.length - 1];
        }
        data.recipients = recipients_arr;
    }
}

/**
 * Encrypts given file with array of public keys and sender's private key.
 * @param {Object} data with required encryption information.
 * @param {Array} public_keys array of Key objects with recipients public keys.
 * @param {Key} sender_key object with sender's private key.
 * @returns {string} encrypted file.
 * @throws {(ERROR_MESSAGES.ENCRYPTION_DENIED_ERROR|ERROR_MESSAGES.ENCRYPTION_UNKNOWN_ERROR)}
 */
function encryptFile(data, public_keys) {
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
        encryptedFileParts.push(_encryptMessage(fileParts[k], public_keys));
    }
    return encryptedFileParts.join(FILE_PARTS_SEPARATOR);
}

/**
 * Decrypts given file.
 * @param {string} encryptedFile to decrypt.
 * @returns {{fileName: string, decryptedFile: string}}
 * @throws {(ERROR_MESSAGES.DECRYPTION_DENIED_ERROR|ERROR_MESSAGES.DECRYPTION_UNKNOWN_ERROR)}
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
 * @param {string} fileName of the current decrypted file.
 * @param {string} decryptedFile
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

/**
 * Imports public/private keys into OpenPGP keyring with given pass phrase.
 * @param {Object} data with all required information.
 * @param {function(Object)=} callback which should be executed after keys are imported.
 * @private
 */
function _importKeys(data, callback) {
    var pass_phrase = data.pass_phrase_data.pass_phrase;
    var current_acc = data.pass_phrase_data.current_acc;
    log(LOG_LEVEL.DEBUG, 'Current account: ' + current_acc);
    try {
        if (data.hasOwnProperty('public_pgp_keys')) {
            _resetKeyRing(TEMP_PUB_KEYRING);
            log(LOG_LEVEL.DEBUG, 'Importing PUBLIC PGP KEYS');
            if(data.hasOwnProperty('emails_with_errors')){
                sendResponse({show_email_errors: data['emails_with_errors']});
            }
            if(data['public_pgp_keys'].length == 0){
                if(!data.hasOwnProperty('emails_with_errors')){
                    sendResponse({error: ERROR_MESSAGES.NO_PUBLIC_KEYS_ERROR});
                }
                return;
            }else{
                pgpContext.setKeyRingPassphrase('', TEMP_PUB_KEYRING);
                var public_pgp_keys = data['public_pgp_keys'].split(',');
                for (var i = 0; i < public_pgp_keys.length; i++) {
                    pgpContext.importKey(function () {
                        return null
                    }, public_pgp_keys[i], pass_phrase);
                }
            }
        } else {
            if (data.hasOwnProperty('private_pgp_key')) {
                _resetKeyRing(current_acc);
            }
            pgpContext.setKeyRingPassphrase(pass_phrase, current_acc);
            if (data.hasOwnProperty('private_pgp_key')) {
                log(LOG_LEVEL.DEBUG, 'Importing PRIVATE PGP KEYS');
                pgpContext.importKey(function () {
                    return null
                }, data['private_pgp_key'], pass_phrase);
            }
        }
        if (callback) {
            callback(data);
        }
    }
    catch
        (error) {
        log(LOG_LEVEL.SEVERE, 'Unable to setup KeyRing: ' + error.message);
        log(LOG_LEVEL.SEVERE, error);
        sendResponse({error: ERROR_MESSAGES.KEYRING_IMPORT_ERROR});
    }
}

/**
 * Exports keyring
 * @param {Object} pass_phrase_data
 * @private
 */
function _exportKey(pass_phrase_data) {
    var passPhrase = pass_phrase_data.pass_phrase;
    var currentAcc = pass_phrase_data.current_acc;
    log(LOG_LEVEL.DEBUG, 'Exporting key for account - ' + currentAcc);
    try {
        pgpContext.setKeyRingPassphrase(passPhrase, currentAcc);
        _clearPublicKeys();
        var exportedKey = pgpContext.exportKeyring(true);
        exportedKey = exportedKey.result_;
        log(LOG_LEVEL.DEBUG, exportedKey);
        _sendBackgroundRequest(REQUEST_COMMANDS.EXPORT_KEY, {exported_key: exportedKey});
    } catch (error) {
        log(LOG_LEVEL.SEVERE, 'Unable to export key for user - ' + currentAcc);
        log(LOG_LEVEL.SEVERE, error);
        _sendBackgroundRequest(REQUEST_COMMANDS.EXPORT_KEY, {error: ERROR_MESSAGES.KEYRING_EXPORT_ERROR});
    }
}

/**
 * Sends request to background script.
 * @param {string} command
 * @param {Object} message
 * @private
 */
function _sendBackgroundRequest(command, message) {
    chrome.runtime.sendMessage({command: command, data: message});
}

/**
 * Deletes public keys from KeyRing for given array of emails.
 * @private
 */
function _clearPublicKeys() {
    var pubKeys = pgpContext.getAllKeys(false);
    pubKeys = pubKeys.result_;
    for (var uid in pubKeys) {
        if (pubKeys.hasOwnProperty(uid)) {
            pgpContext.deletePublicKey(uid);
        }
    }
    log(LOG_LEVEL.DEBUG, 'Deleted PUBLIC PGP KEYS from KeyRing');
}

/**
 * Resets user's keyring, use with care cos it deletes all user's keys.
 * @param currAcc
 * @private
 */
function _resetKeyRing(currAcc) {
    pgpContext.resetKeyring(currAcc);
    log(LOG_LEVEL.DEBUG, 'Keyring ' + currAcc + ' was cleared.');
}