var connected_instances = {};

chrome.runtime.onMessage.addListener(
    function (request, sender) {
        if (request.command == 'biomio_reset_server_connection') {
            log(LOG_LEVEL.DEBUG, 'Resetting server connection.');
            for (var instance in connected_instances) {
                if (connected_instances.hasOwnProperty(instance)) {
                    connected_instances[instance].finish(true);
                }
            }
            connected_instances = {};
        } else if (request.command == SOCKET_REQUEST_TYPES.PERSIST_GMAIL_USER) {
            chrome.storage.local.set(request.data);
        } else {
            log(LOG_LEVEL.DEBUG, 'Received request from content script:');
            log(LOG_LEVEL.DEBUG, request);
            if (request.data.hasOwnProperty('account_email')) {
                var account_email = _prepare_email(request.data['account_email']);
                var instance_key = account_email + '_' + sender.tab.id;
                if (!(instance_key in connected_instances) || connected_instances[instance_key].is_finished()) {
                    connected_instances[instance_key] = new ClientInterface(account_email, sender.tab.id,
                        _interface_ready_callback(instance_key, request));
                    connected_instances[instance_key].initialize_interface(true);
                } else {
                    var client_interface = connected_instances[instance_key];
                    if (client_interface.is_initializing()) {
                        client_interface.add_ready_callback(_interface_ready_callback(instance_key, request));
                    } else {
                        _interface_ready_callback(instance_key, request)();
                    }
                }
            }
        }
    }
);

function _interface_ready_callback(instance_key, request) {
    return function (error) {
        var client_interface = connected_instances[instance_key];
        if (typeof error != 'undefined' && error) {
            if (Object.keys(connected_instances).length) {
                connected_instances = {};
                request.data.error = error.error;
                _send_response(client_interface.tab_id, REQUEST_COMMANDS.COMMON_RESPONSE, request.data);
            }
        } else {
            if (request.command == SOCKET_REQUEST_TYPES.CANCEL_PROBE) {
                client_interface.finish(true);
                connected_instances = {}
            }
            //else if (request.command == REQUEST_COMMANDS.EXPORT_KEY) {
            //    export_key_result = request.data.exported_key;
            //    log(LOG_LEVEL.DEBUG, export_key_result);
            //    session_info.export_key_required = false;
            //}
            else if (request.command == SOCKET_REQUEST_TYPES.ENCRYPT_CONTENT) {
                var recipients = request.data.recipients;
                var account_email = request.data['account_email'];
                if (recipients.indexOf(account_email) == -1 && recipients.indexOf('<' + account_email + '>') == -1) {
                    recipients.push(account_email);
                }
                client_interface.get_public_keys(recipients.join(','), _encrypt_callback(instance_key, request.data));
            }
            else if (request.command == SOCKET_REQUEST_TYPES.DECRYPT_CONTENT) {
                client_interface.get_pass_phrase(_decrypt_callback(instance_key, request.data));
            }
        }
    };
}

/**
 * Sends message to content script.
 * @param {int} tab_id
 * @param {string} command
 * @param {Object} response
 */
function _send_response(tab_id, command, response) {
    chrome.tabs.sendRequest(tab_id, {command: command, data: response});
}

function _encrypt_callback(instance_key, data) {
    return function (keys_data) {
        if (connected_instances.hasOwnProperty(instance_key)) {
            var client_interface = connected_instances[instance_key];
            if (keys_data.hasOwnProperty('error')) {
                data.error = keys_data.error;
                _send_response(client_interface.tab_id, REQUEST_COMMANDS.COMMON_RESPONSE, data);
                client_interface.finish(false);
                if (connected_instances.hasOwnProperty(instance_key)) {
                    delete connected_instances[instance_key];
                }
            } else {
                if (keys_data.hasOwnProperty('emails_with_errors')) {
                    _send_response(client_interface.tab_id, REQUEST_COMMANDS.ERROR, {
                        show_email_errors: {
                            emails: keys_data['emails_with_errors'],
                            compose_id: data.composeId
                        }
                    });
                } else if (!keys_data.hasOwnProperty('emails_with_errors') && keys_data['public_pgp_keys'].length == 0) {
                    _send_response(client_interface.tab_id, REQUEST_COMMANDS.ERROR, {error: ERROR_MESSAGES.NO_PUBLIC_KEYS_ERROR});
                }
                if (keys_data['public_pgp_keys'].length == 0) {
                    client_interface.finish(false);
                    if (connected_instances.hasOwnProperty(instance_key)) {
                        delete connected_instances[instance_key];
                    }
                } else {
                    var new_client_interface = new ClientInterface(client_interface._on_behalf_of, client_interface.tab_id, function (error) {
                        if (typeof error == 'undefined') {
                            new_client_interface.encrypt_content(data, keys_data, function (result, finished) {
                                _send_response(client_interface.tab_id, REQUEST_COMMANDS.COMMON_RESPONSE, result);
                                if (finished) {
                                    new_client_interface.finish(false);
                                }
                            });
                        }
                    });
                    new_client_interface.initialize_interface(false);
                }
            }
        }
    };
}

function _decrypt_callback(instance_key, data) {
    return function (keys_data) {
        var client_interface = connected_instances[instance_key];
        if (keys_data.hasOwnProperty('error')) {
            data.error = keys_data.error;
            _send_response(client_interface.tab_id, REQUEST_COMMANDS.COMMON_RESPONSE, data);
        } else if (keys_data.hasOwnProperty('showTimer')) {
            _send_response(client_interface.tab_id, REQUEST_COMMANDS.SHOW_TIMER, keys_data);
        } else {
            client_interface.decrypt_content(data, keys_data, function (result, finished) {
                _send_response(client_interface.tab_id, REQUEST_COMMANDS.COMMON_RESPONSE, result);
            });
        }
    };
}

function _prepare_email(email) {
    email = email.replace(/</g, '');
    email = email.replace(/>/g, '');
    return email;
}


/**
 * Chrome tabs listener which listens for tab close event.
 * After gmail tab is closed it disconnets from server.
 */
chrome.tabs.onRemoved.addListener(function (tabId) {
    var available_instances = Object.keys(connected_instances);
    for (var i = 0; i < available_instances.length; i++) {
        if (available_instances[i].indexOf(tabId.toString()) != -1) {
            log(LOG_LEVEL.DEBUG, 'Gmail tab closed. Resetting connection info.');
            chrome.storage.local.set({current_gmail_user_biomio: ''});
            var client_interface = connected_instances[available_instances[i]];
            client_interface.finish(false);
            delete connected_instances[available_instances[i]];
        }
    }
});

/**
 * Requests listener that listens for requests from options page.
 */
chrome.extension.onRequest.addListener(function (request, sender, sendOptionsResponse) {
    log(LOG_LEVEL.DEBUG, 'Received request from options page:');
    log(LOG_LEVEL.DEBUG, request);
    if (request.hasOwnProperty('changed_url')) {
        log(LOG_LEVEL.INFO, 'Server URL was changed.');
        for (var instance in connected_instances) {
            if (connected_instances.hasOwnProperty(instance)) {
                connected_instances[instance].finish(true);
            }
        }
        connected_instances = {};
    } else if (request.hasOwnProperty('export_key')) {
        var client_interface = new ClientInterface(_prepare_email(request['export_key']), null, function (error) {
            if (typeof error != 'undefined' && error) {
                sendOptionsResponse({error: error.error});
            } else {
                client_interface.get_pass_phrase(function (keys_data) {
                    if (keys_data.hasOwnProperty('error')) {
                        sendOptionsResponse({error: keys_data.error});
                        client_interface.finish(false);
                    } else if (keys_data.hasOwnProperty('showTimer')) {
                        log(LOG_LEVEL.DEBUG, keys_data);
                    } else {
                        client_interface.export_key(keys_data, function (result, finished) {
                            sendOptionsResponse(result);
                            if (finished) {
                                client_interface.finish(true);
                                connected_instances = {};
                            }
                        });
                    }
                });
            }
        });
        client_interface.initialize_interface(true);
    } else if (request.hasOwnProperty('message') && request.message == 'is_registered') {
        sendOptionsResponse({is_registered: internal_state_machine.is_app_registered()});
    } else if (request.hasOwnProperty('secret_code')) {
        _register_extension(request.secret_code, sendOptionsResponse);
    }
});

function _register_extension(secret_code, registerResponse) {
    var client_interface = new ClientInterface(null, null, function (error) {
        try {
            if (typeof error != 'undefined' && error) {
                registerResponse({result: false, error: error});
            } else {
                chrome.browserAction.setBadgeText({text: ""});
                registerResponse({result: true});
            }
        } catch (e) {
            log(LOG_LEVEL.ERROR, e);
        }
    });
    client_interface.register_app(secret_code);
}

chrome.runtime.onConnectExternal.addListener(function (port) {
    port.onMessage.addListener(function (request) {
        log(LOG_LEVEL.DEBUG, 'Received request from external source:');
        log(LOG_LEVEL.DEBUG, request);
        if (request.hasOwnProperty('command') && request.command == 'register_biomio_extension' && !internal_state_machine.is_app_registered()) {
            log(LOG_LEVEL.DEBUG, 'Started extension registration.');
            _register_extension(request.data.secret_code, function (result) {
                port.postMessage(result)
            });
            log(LOG_LEVEL.DEBUG, 'Finished extension registration.');
        } else if (request.hasOwnProperty('command') && request.command == 'run_auth' && request.hasOwnProperty('auth_code')) {
            if (!internal_state_machine.is_app_registered()) {
                port.postMessage({error: 'Extension is not registered.', status: 'error'});
            } else {
                var instance_key = null;
                for (var conn_instance in connected_instances) {
                    if (connected_instances.hasOwnProperty(conn_instance)) {
                        if (conn_instance.indexOf(request['email']) != -1) {
                            instance_key = conn_instance;
                            break;
                        }
                    }
                }
                var client_interface;
                if (instance_key != null) {
                    client_interface = connected_instances[instance_key];
                } else {
                    client_interface = new ClientInterface(request['email'], null, function (error) {
                        var response;
                        if (typeof error != 'undefined' && error) {
                            response = {
                                result: false,
                                error: 'Authentication was unsuccessful',
                                status: 'error'
                            };
                            try {
                                port.postMessage(response);
                            }
                            catch (e) {
                                log(LOG_LEVEL.ERROR, e);
                            }
                        } else {
                            client_interface.run_auth(function (result) {
                                try {
                                    port.postMessage(result);
                                }
                                catch (e) {
                                    log(LOG_LEVEL.ERROR, e);
                                }
                                if (result.status != 'in-progress') {
                                    client_interface.finish(false);
                                }
                            });
                        }
                    });
                }
            }
        } else if (request.hasOwnProperty('command') && request.command == 'is_registered') {
            port.postMessage({is_registered: internal_state_machine.is_app_registered()});
        }
    });
});
