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

    PROBE_ERROR: "We were not able to proceed your probe, please try again."

};

var NOTIFICATION_MESSAGES = {

    ENCRYPTION_FILES_SUCCESSFUL: "YOur files were successfully encrypted.",
    ENCRYPTION_SUCCESSFUL: "Your data was successfully encrypted.",
    DECRYPTION_SUCCESSFUL: "Your data was successfully decrypted.",

    ENCRYPTION_WAIT_MESSAGE: "Please, wait while we are encrypting your content.",
    DECRYPTION_WAIT_MESSAGE: "Please, wait while we are decrypting your content.",
    PROBE_WAIT_MESSAGE: 'To proceed with encryption it is required to identify yourself on Biom.io service. Server will wait for your probe for 5 minutes.',

    NOT_VALID_ENCRYPTION_DATA: "Data provided for encryption is not valid."
};

var REQUEST_COMMANDS = {

    ERROR: 'error',
    COMMON_RESPONSE: 'socket_response',
    SHOW_TIMER: 'showTimer',
    EXPORT_KEY: 'exportKey'
};

var SOCKET_REQUEST_TYPES = {
    GET_PASS_PHRASE: 'get_pass_phrase',
    GET_PUBLIC_KEYS: 'get_public_keys',
    PERSIST_GMAIL_USER: 'persist_gmail_user',
    CANCEL_PROBE: 'cancel_probe'
};