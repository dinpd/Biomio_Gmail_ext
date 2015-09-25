var ERROR_MESSAGES = {

    KEYRING_IMPORT_ERROR: "Sorry, but we were not able to access your KeyRing.",

    KEYRING_EXPORT_ERROR: "Sorry, but we were not able to export your KeyRing",

    DECRYPTION_UNKNOWN_ERROR: "Sorry, but we were not able to decrypt your data. Please, " +
    "try to close this tab and open Gmail in new tab.",
    DECRYPTION_DENIED_ERROR: "Sorry, but it looks like that you are not allowed to decrypt this content.",

    ENCRYPTION_UNKNOWN_ERROR: "Sorry, but we were not able to encrypt your data. Please, " +
    "try to close this tab and open Gmail in new tab.",
    ENCRYPTION_DENIED_ERROR: "Sorry, but no keys were found to encrypt your data.",

    SERVER_CONNECTION_ERROR: "We were not able to connect to our server, try again later.",
    SERVER_RPC_ERROR: "RPC exception: ",
    SERVER_ERROR: "Error on server.",

    PROBE_ERROR: "We were not able to proceed your probe, please try again.",

    NO_PUBLIC_KEYS_ERROR: "No keys for encryption were received from server."


};

var NOTIFICATION_MESSAGES = {

    ENCRYPTION_FILES_SUCCESSFUL: "Your files were successfully encrypted.",
    ENCRYPTION_SUCCESSFUL: "Your data was successfully encrypted.",
    DECRYPTION_SUCCESSFUL: "Your data was successfully decrypted.",

    ENCRYPTION_WAIT_MESSAGE: "Please, wait while we are encrypting your content.",
    DECRYPTION_WAIT_MESSAGE: "Please, wait while we are decrypting your content.",
    PROBE_WAIT_MESSAGE: 'To proceed with encryption it is required to identify yourself on Biom.io service. Server will wait for your probe for 5 minutes.',

    NOT_VALID_ENCRYPTION_DATA: "Data provided for encryption is not valid."
};

var TYPE_PREFIX = 'BIOMIO_';

var REQUEST_COMMANDS = {

    ERROR: TYPE_PREFIX + 'error',
    COMMON_RESPONSE: TYPE_PREFIX + 'socket_response',
    SHOW_TIMER: TYPE_PREFIX + 'showTimer',
    EXPORT_KEY: TYPE_PREFIX + 'exportKey'
};

var SOCKET_REQUEST_TYPES = {
    GET_PASS_PHRASE: TYPE_PREFIX + 'get_pass_phrase',
    GET_PUBLIC_KEYS: TYPE_PREFIX + 'get_public_keys',
    PERSIST_GMAIL_USER: TYPE_PREFIX + 'persist_gmail_user',
    CANCEL_PROBE: TYPE_PREFIX + 'cancel_probe'
};

var WINDOW_REQUESTS = {
    ENCRYPT: TYPE_PREFIX + 'encrypt_sign',
    DECRYPT: TYPE_PREFIX + 'decryptMessage'
};

var STORAGE_KEYS = {
    STORAGE_RSA_KEY: 'biomio_private_rsa_key',
    STORAGE_APP_ID_KEY: 'BIOMIO_APP_ID_KEY',
    STORAGE_PGP_BACKUP_KEY: 'BIOMIO_PGP_BACKUP_KEY_'
};