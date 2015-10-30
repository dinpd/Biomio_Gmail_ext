function StorageHelper() {
    this.APP_ID_STORAGE_KEY = 'BIOMIO_APP_ID_KEY';
    this.APP_KEY_STORAGE_KEY = 'biomio_private_rsa_key';
    this.PGP_BACKUP_STORAGE_KEY = 'BIOMIO_PGP_BACKUP_KEY_';
    this.SETTINGS_CHROME_STORAGE_KEY = 'biomio_settings';

    this._pgpContext = new e2e.openpgp['ContextImpl']();
}

StorageHelper.prototype.store_data = function (key, value) {
    log(LOG_LEVEL.DEBUG, 'Storing data into HTML5LocalStorage');
    log(LOG_LEVEL.DEBUG, 'Key: ' + key);
    log(LOG_LEVEL.DEBUG, 'Value: ' + value);
    this._pgpContext.keyRingStorageMechanism_.set(key, value);
};

StorageHelper.prototype.get_data = function (key) {
    log(LOG_LEVEL.DEBUG, 'Getting data from HTML5LocalStorage');
    log(LOG_LEVEL.DEBUG, 'Key: ' + key);
    return this._pgpContext.keyRingStorageMechanism_.get(key);
};

StorageHelper.prototype.remove_data = function (key) {
    log(LOG_LEVEL.DEBUG, 'Removing data from HTML5LocalStorage');
    log(LOG_LEVEL.DEBUG, 'Key: ' + key);
    this._pgpContext.keyRingStorageMechanism_.remove(key);
};

StorageHelper.prototype.get_chrome_data = function (key, local, callback) {
    var storage_type = local ? 'local' : 'sync';
    log(LOG_LEVEL.DEBUG, 'Getting data from chrome ' + storage_type + ' storage.');
    log(LOG_LEVEL.DEBUG, 'Key: ' + key);
    if (local) {
        chrome.storage.local.get(key, function (data) {
            callback(data);
        });
    } else {
        chrome.storage.sync.get(key, function (data) {
            callback(data);
        });
    }
};

StorageHelper.prototype.set_chrome_data = function (key, value, local) {
    var storage_type = local ? 'local' : 'sync';
    log(LOG_LEVEL.DEBUG, 'Storing data info chrome ' + storage_type + ' storage.');
    log(LOG_LEVEL.DEBUG, 'Key: ' + key);
    log(LOG_LEVEL.DEBUG, 'Value: ' + value);
    var data_to_set = {};
    data_to_set[key] = value;
    if (local) {
        chrome.storage.local.set(data_to_set);
    } else {
        chrome.storage.sync.set(data_to_set);
    }
};

StorageHelper.prototype.encrypt_private_app_key = function (app_key) {
    var pgpContext = new e2e.openpgp['ContextImpl']();
    pgpContext.setArmorHeader(
        'Version',
        'BioMio v1.0');
    pgpContext.setKeyRingPassphrase('', 'biomio_data');
    var pass_phrase = 'IHXn6VlEyYlKj9Emz5419nDd7Ip8JgYw';
    var result = pgpContext.encryptSign(app_key, [], [], [pass_phrase]);
    return result.result_;
};

StorageHelper.prototype.decrypt_private_app_key = function (encrypted_key) {
    var pgpContext = new e2e.openpgp['ContextImpl']();
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
};

var storage_helper = new StorageHelper();
