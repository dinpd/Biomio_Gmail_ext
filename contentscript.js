var MAX_FILE_SIZE = 150000;
var EMAIL_PARTS_SEPARATOR = '#-#-#';
var FILE_PARTS_SEPARATOR = '#--#';
var FILE_NAME_SEPARATOR = '##-##';
var gmail_scripts = ['gmail.js', 'gmail_executor.js'];
var gmail_scripts_urls = [];
var KEY_PREFIX = 'BioMio ';

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

/**
 * Window listener which listens for messages from gmail_executor script.
 */
window.addEventListener("message", function (event) {
    var currData = event.data.data;
    if (event.data.hasOwnProperty('type') && event.data.type == "encrypt_sign") {
        prepareEncryptParameters(currData);
        chrome.runtime.sendMessage({command: 'get_phrase_keys', data: currData});
    } else if (event.data.hasOwnProperty('type') && event.data.type == "decryptMessage") {
        prepareEncryptParameters(currData);
        chrome.runtime.sendMessage({command: 'get_phrase', data: currData});
    }
}, false);

/**
 * Chrome requests listener which listens for messages from background script.
 */
chrome.extension.onRequest.addListener(
    function (request) {
        console.log(request);
        if (request.command == 'socket_response') {
            var data = request.data;
            if (data.hasOwnProperty('error')) {
                sendResponse({'error': data['error']})
            } else {
                var callback = ''
                if (data['action'] == 'encrypt_only') {
                    callback = encryptMessage;
                } else {
                    callback = decryptMessage;
                }
                _importKeys(data, callback);
            }
        }
    }
);

/**
 * Parses required data from data object and encrypts it.
 * @param {Object=} data with required information for encryption.
 */
function encryptMessage(data) {
    console.log('Encrypt: ', data);
    var keys = [];
    var sender_private_key = pgpContext.searchPrivateKey(KEY_PREFIX + data.currentUser).result_[0];
    for (var i = 0; i < data.recipients.length; i++) {
        var pub_key = pgpContext.searchPublicKey(KEY_PREFIX + data.recipients[i]);
        if (pub_key.result_) {
            $.extend(keys, pub_key.result_);
        }
    }
    console.log(keys);
    if (data.hasOwnProperty('encryptObject') && data.encryptObject == 'file') {
        data.content = encryptFile(data, keys, sender_private_key);
    } else {
        data.content = _encryptMessage(data.content, keys, sender_private_key);
    }
    data.completedAction = 'encrypt_only';
    sendResponse(data);
}

/**
 * Encrypts given content with array of public keys and signs it with sender's private key.
 * @param {string=} content to encrypt
 * @param {Array=} keys array of public key objects.
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
    if (data.hasOwnProperty('recipients')) {
        var recipients_arr = data.recipients;
        for (var i = 0; i < recipients_arr.length; i++) {
            var recipient = recipients_arr[i].split(' ');
            recipients_arr[i] = recipient[recipient.length - 1];
        }
        data.recipients = recipients_arr;
    }
    data.currentUser = '<' + data.currentUser + '>';
}

/**
 * Encrypts given file with array of public keys and sender's private key.
 * @param {Object=} data with required encryption information.
 * @param {Array=} public_keys array of Key objects with recipients public keys.
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

/**
 * Imports public/private keys into OpenPGP keyring with given pass phrase.
 * @param {Object=} data with all required information.
 * @param {function(Object)=} callback which should be executed after keys are imported.
 * @private
 */
function _importKeys(data, callback) {
    var pass_phrase = data.pass_phrase
    pgpContext.setKeyRingPassphrase(pass_phrase);
    if (data.hasOwnProperty('private_pgp_key')) {
        pgpContext.importKey(function () {
            return null
        }, data['private_pgp_key'], pass_phrase);
    }
    if (data.hasOwnProperty('public_pgp_keys')) {
        var public_pgp_keys = data['public_pgp_keys'].split(',');
        for (var i = 0; i < public_pgp_keys.length; i++) {
            pgpContext.importKey(function () {
                return null
            }, public_pgp_keys[i], pass_phrase);
        }
    }
    if (callback) {
        callback(data);
    }
}