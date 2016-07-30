var MAX_FILE_SIZE = 150000,
    EMAIL_PARTS_SEPARATOR = '#-#-#',
    FILE_PARTS_SEPARATOR = '#--#',
    FILE_NAME_SEPARATOR = '##-##',
    KEY_PREFIX = 'BioMio ',
    TEMP_PUB_KEYRING = 'TEMP_PUB_KEYRING';

function PGPInterface(account_email) {
    this._account_email = account_email;
    this._pgpContext = new e2e.openpgp['ContextImpl']();
    this._pgpContext.setArmorHeader('Version', 'BioMio v1.0');
    this._results_callback = null;
    this._encrypted_file_parts = {};
    this._decrypted_files = {};
}

PGPInterface.prototype._prepare_import = function(keys_data) {

}

PGPInterface.prototype.set_account_email = function(account_email){
    this._account_email = account_email;
};


/**
 * Imports public/private keys into OpenPGP keyring with given pass phrase.
 * @param {Object} keys_data with all required information.
 * @private
 */
PGPInterface.prototype._import_keys = function (keys_data) {
    var pass_phrase = keys_data.hasOwnProperty('pass_phrase') ? keys_data['pass_phrase'] : '';
    try {
        if (keys_data.hasOwnProperty('public_pgp_keys')) {
            log(LOG_LEVEL.INFO, 'Importing public keys...');
            var public_keys = keys_data['public_pgp_keys'];
            log(LOG_LEVEL.DEBUG, public_keys);
            this._resetKeyRing(TEMP_PUB_KEYRING);
            this._pgpContext.setKeyRingPassphrase('', TEMP_PUB_KEYRING);
            public_keys = public_keys.split(',');
            for (var i = 0; i < public_keys.length; i++) {
                this._pgpContext.importKey(function () {
                    return null;
                }, public_keys[i], pass_phrase);
            }
        } else {
            if (keys_data.hasOwnProperty('private_pgp_key')) {
                this._resetKeyRing(this._account_email);
            }
            this._pgpContext.setKeyRingPassphrase(pass_phrase, this._account_email);
            if (keys_data.hasOwnProperty('private_pgp_key')) {
                alert("Keys have been imported! Please close gmail tabs and reopen."); 
                log(LOG_LEVEL.INFO, 'Importing PRIVATE PGP KEYS');
                var private_pgp_key = keys_data['private_pgp_key'];
                log(LOG_LEVEL.INFO, private_pgp_key);
                this._pgpContext.importKey(function () {
                    return null;
                }, private_pgp_key, pass_phrase);
                this._clearPublicKeys();
                log(LOG_LEVEL.INFO, "Successfully imported key!!"); 
                var encrypted_private_pgp = this._pgpContext.exportKeyring(true);
                storage_helper.set_chrome_data(storage_helper.PGP_BACKUP_STORAGE_KEY + this._account_email,
                    encrypted_private_pgp.result_, false);
            }
        }
    } catch (e) {
        log(LOG_LEVEL.SEVERE, 'Unable to setup KeyRing: ' + e.message);
        log(LOG_LEVEL.SEVERE, e);
        this._results_callback({error: ERROR_MESSAGES.KEYRING_IMPORT_ERROR}, true);
    }
};

/**
 * Deletes public keys from KeyRing for given array of emails.
 * @private
 */
PGPInterface.prototype._clearPublicKeys = function () {
    var pubKeys = this._pgpContext.getAllKeys(false);
    pubKeys = pubKeys.result_;
    for (var uid in pubKeys) {
        if (pubKeys.hasOwnProperty(uid)) {
            this._pgpContext.deletePublicKey(uid);
        }
    }
    log(LOG_LEVEL.INFO, 'Deleted PUBLIC PGP KEYS from KeyRing');
};

/**
 * Resets user's keyring, use with care cos it deletes all user's keys.
 * @param account_to_reset
 * @private
 */
PGPInterface.prototype._resetKeyRing = function (account_to_reset) {
    this._pgpContext.resetKeyring(account_to_reset);
    log(LOG_LEVEL.INFO, 'Keyring ' + account_to_reset + ' was cleared.');
};

/**
 * Parses required data from data object and encrypts it.
 * @param {Object} data with required information for encryption.
 * @param {Object} keys_data with required information for keys import.
 * @param {function} results_callback
 */
PGPInterface.prototype.encrypt_data = function (data, keys_data, results_callback) {
    this._results_callback = results_callback;
    this._import_keys(keys_data);
    log(LOG_LEVEL.INFO, 'Starting data encryption');
    log(LOG_LEVEL.DEBUG, 'Data for encryption:');
    log(LOG_LEVEL.DEBUG, data);
    var keys = [];
    for (var i = 0; i < data.recipients.length; i++) {
        var recipient = data.recipients[i];
        if (recipient.indexOf('<') == -1) {
            recipient = '<' + recipient + '>';
        }
        var pub_key = this._pgpContext.searchPublicKey(KEY_PREFIX + recipient);
        if (pub_key.result_) {
            keys.push.apply(keys, pub_key.result_);
        }
    }
    if (data.hasOwnProperty('encryptObject') && data.encryptObject == 'file') {
        this._encryptFile(data, keys);
    } else {
        var self = this;
        if (data.recipients.indexOf(this._account_email) == -1 && data.recipients.indexOf('<' + this._account_email + '>')) {
            var current_email_account = this._account_email;
            if (current_email_account.indexOf('<') == -1) {
                current_email_account = '<' + current_email_account + '>';
            }
            pub_key = this._pgpContext.searchPublicKey(KEY_PREFIX + current_email_account);
            if (pub_key.result_) {
                keys.push.apply(keys, pub_key.result_);
            }
        }
        this._encryptMessage(data.content, keys, function (result, error) {
            if (typeof error != 'undefined' && error) {
                self._resetKeyRing(TEMP_PUB_KEYRING);
                self._results_callback({error: error, composeId: data.composeId}, true);
            } else {
                data.content = result;
                data.completedAction = 'encrypt_only';
                self._results_callback(data, true);
            }
        });
    }
};

/**
 * Encrypts given content with array of public keys.
 * @param {string} content to encrypt
 * @param {Array} keys array of public key objects.
 * @param {function} callback
 * @param {string=} file_id
 * @private
 */
PGPInterface.prototype._encryptMessage = function (content, keys, callback, file_id) {
    var encrypted_content = this._pgpContext.encryptSign(content, [], keys, []);
    log(LOG_LEVEL.INFO, 'Encryption result:');
    log(LOG_LEVEL.INFO, !encrypted_content.hadError_);
    log(LOG_LEVEL.INFO, encrypted_content.result_); 
    if (encrypted_content.hadError_) {
        log(LOG_LEVEL.ERROR, encrypted_content.result_.message);
        if (encrypted_content.result_.message.indexOf('No public key nor passphrase') != -1) {
            if (typeof file_id != 'undefined' && file_id) {
                callback(file_id, null, ERROR_MESSAGES.ENCRYPTION_DENIED_ERROR);
            } else {
                callback(null, ERROR_MESSAGES.ENCRYPTION_DENIED_ERROR);
            }
        } else {
            if (typeof file_id != 'undefined' && file_id) {
                callback(file_id, null, ERROR_MESSAGES.ENCRYPTION_UNKNOWN_ERROR);
            } else {
                callback(null, ERROR_MESSAGES.ENCRYPTION_UNKNOWN_ERROR);
            }
        }
    } else {
        if (typeof file_id != 'undefined' && file_id) {
            callback(file_id, encrypted_content.result_);
        } else {
            chrome.runtime.sendMessage({result: encrypted_content.result_}); 
            callback(encrypted_content.result_);
        }
    }
};

/**
 * Encrypts given file with array of public keys.
 * @param {Object} data with required encryption information.
 * @param {Array} public_keys array of Key objects with recipients public keys.
 * @private
 */
PGPInterface.prototype._encryptFile = function (data, public_keys) {
    var fileContent = data.content;
    var fileParts = [];
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
    this._results_callback({file_parts_count: fileParts.length, unique_file_id: data.unique_file_id}, false);
    this._encrypted_file_parts[data.unique_file_id] = {total: fileParts.length, ready_parts: [], current_data: data};
    for (var k = 0; k < fileParts.length; k++) {
        this._encryptMessage(fileParts[k], public_keys, this._encrypted_file_callback(), data.unique_file_id);
    }
};

PGPInterface.prototype._encrypted_file_callback = function () {
    var self = this;
    return function (file_id, encrypted_file, error) {
        if (self._encrypted_file_parts.hasOwnProperty(file_id)) {
            var current_data = self._encrypted_file_parts[file_id].current_data;
            if (typeof error != 'undefined' && error) {
                self._resetKeyRing(TEMP_PUB_KEYRING);
                self._results_callback({error: error, composeId: current_data.composeId}, true);
                delete self._encrypted_file_parts[file_id];
            } else {
                self._results_callback({processed_part: file_id}, false);
                var ready_parts = self._encrypted_file_parts[file_id].ready_parts;
                var total_parts = self._encrypted_file_parts[file_id].total;
                ready_parts.push(encrypted_file);
                if (ready_parts.length == total_parts) {
                    current_data.content = ready_parts.join(FILE_PARTS_SEPARATOR);
                    current_data.completedAction = 'encrypt_only';
                    self._results_callback(current_data, true);
                    delete self._encrypted_file_parts[file_id];
                }
            }
        }
    };
};

/**
 * Parses required data for data object and decrypts it.
 * @param {Object} data with required information for decryption.
 * @param {Object} keys_data with required information for import keys.
 * @param {function} results_callback.
 */
PGPInterface.prototype.decrypt_data = function (data, keys_data, results_callback) {
    this._results_callback = results_callback;
    this._import_keys(keys_data);
    log(LOG_LEVEL.INFO, 'Starting decryption process.');
    log(LOG_LEVEL.DEBUG, 'Data for decryption:');
    log(LOG_LEVEL.DEBUG, data);
    var emailParts = data.content.split(EMAIL_PARTS_SEPARATOR);
    firstPart = "-----BEGIN PGP MESSAGE-----" + emailParts[0].split("-----BEGIN PGP MESSAGE-----")[1];
    var self = this;
    this._decryptMessage(firstPart, keys_data, function (result, error) {
        if (typeof error != "undefined" && error.length > 0) {
            self._results_callback({error: error}, true);
        } else {
            data.content = result;
            data.completedAction = 'decrypt_verify';
            if (emailParts.length > 1) { // && data.hasOwnProperty('own_sent_email') && !data['own_sent_email'] --> not sure why this was in if statement
                self._results_callback({
                    file_parts_count: (emailParts.length - 1),
                    unique_file_id: data.biomio_attr
                }, false);
                data['decryptedFiles'] = [];
                self._decrypted_files[data.biomio_attr] = {
                    total: emailParts.length - 1,
                    ready_files: [],
                    current_data: data
                };
                for (var i = 1; i < emailParts.length; i++) {
                    self._decryptFile(emailParts[i], keys_data, data.biomio_attr, self._decrypt_file_callback());
                }
            } else {
                self._results_callback(data, true);
            }
        }
    });
};

PGPInterface.prototype._decrypt_file_callback = function () {
    var self = this;
    return function (data) {
        var email_id = data.unique_file_id;
        if (self._decrypted_files.hasOwnProperty(email_id)) {
            if (data.hasOwnProperty('error')) {
                delete self._decrypted_files[email_id];
                self._results_callback(data, true);
            } else {
                self._results_callback({processed_part: email_id}, false);
                var ready_files = self._decrypted_files[email_id].ready_files;
                var total = self._decrypted_files[email_id].total;
                ready_files.push(data.result);
                if (ready_files.length == total) {
                    var current_data = self._decrypted_files[email_id].current_data;
                    current_data.decryptedFiles = ready_files;
                    self._results_callback(current_data, true);
                    delete self._decrypted_files[email_id];
                }
            }
        }
    };
};

/**
 * Decrypts given content
 * @param {string} content to decrypt
 * @param {Object} keys_data.
 * @param {function=} callbackFunction - in case of restoring from backup.
 * @private
 */
PGPInterface.prototype._decryptMessage = function (content, keys_data, callbackFunction) {
    var decryptedText = this._pgpContext.verifyDecrypt(function () {
    }, content);
    log(LOG_LEVEL.INFO, 'Decryption result:');
    log(LOG_LEVEL.INFO, !decryptedText.hadError_);
    var self = this;
    if (decryptedText.hadError_) {
        log(LOG_LEVEL.ERROR, decryptedText.result_.message);
        if (decryptedText.result_.message.indexOf('No keys found') != -1 && callbackFunction) {
            var storage_key = storage_helper.PGP_BACKUP_STORAGE_KEY + this._account_email;
            storage_helper.get_chrome_data(storage_key, false, function (result) {
                if (result.hasOwnProperty(storage_key)) {
                    var private_pgp_key = result[storage_key];
                    log(LOG_LEVEL.INFO, 'RESTORED private pgp key.');
                    log(LOG_LEVEL.DEBUG, private_pgp_key);
                    keys_data.private_pgp_key = private_pgp_key;
                    self._import_keys(keys_data);
                    decryptedText = self._pgpContext.verifyDecrypt(function () {
                    }, content);
                    log(LOG_LEVEL.INFO, 'Decryption result:');
                    log(LOG_LEVEL.INFO, !decryptedText.hadError_);
                    if (decryptedText.hadError_) {
                        log(LOG_LEVEL.ERROR, decryptedText.result_.message);
                        if (decryptedText.result_.message.indexOf('No keys found') != -1) {
                            callbackFunction(null, ERROR_MESSAGES.DECRYPTION_DENIED_ERROR);
                        } else {
                            callbackFunction(null, ERROR_MESSAGES.DECRYPTION_UNKNOWN_ERROR);
                        }
                    } else {
                        decryptedText = decryptedText.result_.decrypt;
                        decryptedText = e2e.byteArrayToStringAsync(decryptedText.data, decryptedText.options.charset);
                        callbackFunction(decryptedText.result_);
                    }
                } else {
                    callbackFunction(null, ERROR_MESSAGES.DECRYPTION_DENIED_ERROR);
                }
            });
        } else {
            return {result: ERROR_MESSAGES.DECRYPTION_UNKNOWN_ERROR, error: true};
        }
    } else {
        decryptedText = decryptedText.result_.decrypt;
        decryptedText = e2e.byteArrayToStringAsync(decryptedText.data, decryptedText.options.charset);
        if (callbackFunction) {
            callbackFunction(decryptedText.result_);
        } else {
            return {result: decryptedText.result_, error: false};
        }
    }

};

/**
 * Decrypts given file.
 * @param {string} encryptedFile to decrypt.
 * @param {object} keys_data.
 * @param {string} email_id.
 * @param {function} file_decrypt_callback
 */
PGPInterface.prototype._decryptFile = function (encryptedFile, keys_data, email_id, file_decrypt_callback) {
    var encryptedFileParts = encryptedFile.split(FILE_PARTS_SEPARATOR);
    var fileName = '';
    var decryptedFile = '';
    for (var i = 0; i < encryptedFileParts.length; i++) {
        var decryptedFilePart = this._decryptMessage(encryptedFileParts[i], keys_data);
        if (decryptedFilePart.error) {
            file_decrypt_callback({error: decryptedFilePart.result, unique_file_id: email_id});
            break;
        } else {
            decryptedFilePart = decryptedFilePart.result;
            if (!fileName.length) {
                var fileNamePart = decryptedFilePart.split(FILE_NAME_SEPARATOR);
                if (fileNamePart.length > 1) {
                    fileName = fileNamePart[0];
                    decryptedFilePart = fileNamePart[1];
                }
            }
            decryptedFile += decryptedFilePart;
        }
    }
    file_decrypt_callback({result: this._makeFileDownloadable(fileName, decryptedFile), unique_file_id: email_id});
};

/**
 * Adds some parameters to file's data URL so file becomes downloadable.
 * @param {string} fileName of the current decrypted file.
 * @param {string} decryptedFile
 * @returns {{fileName: string, decryptedFile: string}}
 * @private
 */
PGPInterface.prototype._makeFileDownloadable = function (fileName, decryptedFile) {
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
};


/**
 * Exports keyring
 * @param {Object} keys_data
 * @param {object} results_callback
 */
PGPInterface.prototype.export_key = function (keys_data, results_callback) {
    log(LOG_LEVEL.DEBUG, "Keys data: " + keys_data); 
    this._results_callback = results_callback;
    this._import_keys(keys_data);
    log(LOG_LEVEL.DEBUG, 'Exporting key for account - ' + this._account_email);
    try {
        this._clearPublicKeys();
        var exportedKey = this._pgpContext.exportKeyring(true);
        exportedKey = exportedKey.result_;
        this._results_callback({exported_key: exportedKey}, true);
    } catch (error) {
        log(LOG_LEVEL.SEVERE, 'Unable to export key for user - ' + this._account_email);
        this._results_callback({error: ERROR_MESSAGES.KEYRING_EXPORT_ERROR}, true);
    }
};