var gmail_scripts = ['internal_scripts/jquery-1.11.2.min.js', 'internal_scripts/gmail.js',
    'content_injections/gmail_executor.js'];
var gmail_scripts_urls = [];

//Get urls for each extension script that must be injected into page.
for (var i = 0; i < gmail_scripts.length; i++) {
    gmail_scripts_urls.push(chrome.extension.getURL(gmail_scripts[i]));
}

/**
 * Injects required scripts and elements into gmail page.
 */

window.onload = function () {
    chrome.extension.sendRequest({message: 'is_registered'}, function (response) {
        if (response.is_registered) {
            $('body').append('<div id="biomio_elements"></div>');
            var biomio_elements = $('#biomio_elements');
            biomio_elements.load(chrome.extension.getURL('content_injections/additional_html.html'), function () {
                $('#biomio_show_loading').show();
                for (i = 0; i < gmail_scripts_urls.length; i++) {
                    biomio_elements.append('<script src="' + gmail_scripts_urls[i] + '"></script>');
                }
                log(LOG_LEVEL.DEBUG, 'Scripts were injected.');
            });
            _initializeDefaults();
        }
    });
};


function _initializeDefaults() {
    console.log('Initializing defaults');
    window.addEventListener("message", function (event) {
        if (event.data.hasOwnProperty('data')) {
            var currData = event.data.data;
            try {
                if (event.data.hasOwnProperty('type') && event.data.type == WINDOW_REQUESTS.ENCRYPT) {
                    _prepareEncryptParameters(currData);
                    _sendBackgroundRequest(SOCKET_REQUEST_TYPES.ENCRYPT_CONTENT, currData);
                } else if (event.data.hasOwnProperty('type') && event.data.type == WINDOW_REQUESTS.DECRYPT) {
                    _prepareEncryptParameters(currData);
                    _sendBackgroundRequest(SOCKET_REQUEST_TYPES.DECRYPT_CONTENT, currData);
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
                    _sendResponse({error: error.message});
                }
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
            if ([REQUEST_COMMANDS.COMMON_RESPONSE, REQUEST_COMMANDS.SHOW_TIMER, REQUEST_COMMANDS.ERROR].indexOf(request.command) != -1) {
                _sendResponse(data);
            } else if (request.command == REQUEST_COMMANDS.EXPORT_KEY) {
                //_exportKey(request.data.pass_phrase_data);
            }
        }
    );
}

/**
 * Sends message to gmail_executor script.
 * @param {Object} message to send.
 */
function _sendResponse(message) {
    log(LOG_LEVEL.DEBUG, 'Sending message to gmail_executor script:');
    log(LOG_LEVEL.DEBUG, message);
    window.postMessage(message, '*');
}

/**
 * Sends request to background script.
 * @param {string} command
 * @param {Object} message
 * @private
 */
function _sendBackgroundRequest(command, message) {
    try {
        chrome.runtime.sendMessage({command: command, data: message});
    } catch (error) {
        throw {message: 'Error connecting to extension'};
    }
}

/**
 * Parses recipients list and generates array with recipients emails, also generates valid sender email UID.
 * @param {Object} data with required information.
 */
function _prepareEncryptParameters(data) {
//    data.account_email = '<' + data.account_email + '>';
    if (data.hasOwnProperty('recipients')) {
        var recipients_arr = data.recipients;
        for (var i = 0; i < recipients_arr.length; i++) {
            var recipient = recipients_arr[i].split(' ');
            recipients_arr[i] = recipient[recipient.length - 1];
        }
        data.recipients = recipients_arr;
    }
}
