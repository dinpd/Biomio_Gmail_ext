var STATE_INITIALIZE = 'initialize_state',
    STATE_READY = 'ready_state',
    STATE_RPC_CALL_AUTH = 'rpc_call_auth_state',
    STATE_RPC_CALL_USER_CHECK = 'rpc_call_user_check',
    STATE_RPC_CALL_PASS_PHRASE = 'rpc_pass_phrase_state',
    STATE_RPC_CALL_PUBLIC_KEYS = 'rpc_call_public_keys',
    STATE_ENCRYPTION = 'encryption_state',
    STATE_DECRYPTION = 'decryption_state',
    STATE_EXPORT_KEY = 'export_key_state',
    STATE_CONNECTION_LOST = 'connection_lost_state',
    STATE_FINISH = 'finish_state';

function ClientInterface(account_email, tab_id, ready_callback) {
    this._on_behalf_of = account_email;
    this._ready_callback = ready_callback;
    this._additional_ready_callbacks = [];

    this._secret = null;
    this._sender = null;

    this.tab_id = tab_id;

    this._reconnect = false;
    this._waiting_action = null;

    this._response_callback = null;

    this._emails_list = [];

    this._pgp_interface = new PGPInterface(this._on_behalf_of);
    this._pgp_data = {};

    this._response_callbacks = [];

    this._subscribe_to_callbacks = true;

    this._state_machine = StateMachine.create({
        initial: 'none',
        events: [
            {name: '_initialize', from: ['none', STATE_CONNECTION_LOST], to: STATE_INITIALIZE},
            {
                name: '_ready',
                from: [STATE_INITIALIZE, STATE_RPC_CALL_AUTH, STATE_RPC_CALL_USER_CHECK, STATE_EXPORT_KEY,
                    STATE_RPC_CALL_PASS_PHRASE, STATE_RPC_CALL_PUBLIC_KEYS, STATE_ENCRYPTION, STATE_DECRYPTION],
                to: STATE_READY
            },
            {name: '_rpc_auth', from: [STATE_READY], to: STATE_RPC_CALL_AUTH},
            {name: '_check_user', from: [STATE_READY], to: STATE_RPC_CALL_USER_CHECK},
            {name: '_pass_phrase', from: STATE_READY, to: STATE_RPC_CALL_PASS_PHRASE},
            {name: '_public_keys', from: STATE_READY, to: STATE_RPC_CALL_PUBLIC_KEYS},
            {name: '_start_encryption', from: STATE_READY, to: STATE_ENCRYPTION},
            {name: '_start_decryption', from: STATE_READY, to: STATE_DECRYPTION},
            {name: '_export_key', from: STATE_READY, to: STATE_EXPORT_KEY},
            {name: '_connection_lost', from: STATE_READY, to: STATE_RPC_CALL_USER_CHECK},
            {name: '_finish', from: '*', to: STATE_FINISH}
        ],
        callbacks: {
            on_initialize: this._onInitialize,
            on_ready: this._onReady,
            on_rpc_auth: this._onRpcCallAuth,
            on_check_user: this._onCheckUser,
            on_pass_phrase: this._on_pass_phrase,
            on_public_keys: this._on_public_keys,
            on_start_encryption: this._on_start_encryption,
            on_start_decryption: this._on_start_decryption,
            on_export_key: this._on_export_key,
            on_connection_lost: this._on_connection_lost_ev,
            on_finish: this._onFinish
        }
    });
}

ClientInterface.prototype.register_app = function (secret) {
    this._secret = secret;
    this._state_machine._initialize('Initializing client interface (Registration)...', this);
};

ClientInterface.prototype.initialize_interface = function (subscribe) {
    this._subscribe_to_callbacks = subscribe;
    this._state_machine._initialize('Initializing client interface...', this);
};

ClientInterface.prototype._onInitialize = function (event, from, to, msg, self) {
    if (typeof  msg != 'undefined' && msg) {
        log(LOG_LEVEL.INFO, msg);
    } else {
        log(LOG_LEVEL.INFO, 'Initializing internal state machine.');
    }
    internal_state_machine.add_lost_connection_callback(self._lost_connection_callback());
    if (self._secret != null) {
        internal_state_machine.add_ready_callback(self._internal_ready_callback());
        internal_state_machine.initialize_state_machine(self._secret);
        self._secret = null;
    } else if (!internal_state_machine.is_ready()) {
        internal_state_machine.add_ready_callback(self._internal_ready_callback());
        if (internal_state_machine.is_disconnected()) {
            internal_state_machine.initialize_state_machine();
        }
    } else {
        self._internal_ready_callback()();
    }
};

ClientInterface.prototype._lost_connection_callback = function () {
    var self = this;
    return function () {
        log(LOG_LEVEL.INFO, 'Internal state machine is in state DISCONNECTED.');
        if (!self._state_machine.is(STATE_FINISH)) {
            self._state_machine._finish('Client interface finalized.', false, self);
        }
        //if (self._state_machine.is(STATE_READY)) {
        //    self._state_machine['_connection_lost']('Will require re-connect.', self);
        //}
    };
};

ClientInterface.prototype._internal_ready_callback = function () {
    var self = this;
    return function (error) {
        if (typeof error != 'undefined' && error) {
            log(LOG_LEVEL.ERROR, 'Error during initialization: ' + error.error);
            self._ready_callback(error);
            for (var i = 0; i < self._additional_ready_callbacks.length; i++) {
                self._run_async_callback(self._additional_ready_callbacks[i], error);
            }
            self._additional_ready_callbacks = [];
            self._state_machine._finish('Error during initialization: ' + error.error, false, self);
        } else {
            self._state_machine['_ready']('Client interface is ready.', self);
        }
    };
};

ClientInterface.prototype._on_connection_lost_ev = function (event, from, to, msg, self) {
    log(LOG_LEVEL.INFO, msg);
    self._reconnect = true;
    self._waiting_action = null;
};

ClientInterface.prototype._onReady = function (event, from, to, msg, self) {
    log(LOG_LEVEL.INFO, msg);
    if (self._reconnect) {
        self._reconnect = false;
        if (self._waiting_action != null) {
            self._waiting_action();
            self._waiting_action = null;
        }
    } else if (from == STATE_INITIALIZE) {
        setTimeout(self._ready_callback, 1);
        for (var i = 0; i < self._additional_ready_callbacks.length; i++) {
            self._run_async_callback(self._additional_ready_callbacks[i], null);
        }
        self._additional_ready_callbacks = [];
    }
    if (self._on_behalf_of != null) {
        if (self._subscribe_to_callbacks) {
            internal_state_machine.subscribe_for_responses(self._on_behalf_of, self._rpc_response_callback());
        }
    } else {
        self._state_machine._finish('Registration finished.', false, self);
    }
};

ClientInterface.prototype._onRpcCallAuth = function (event, from, to, msg, self) {
    log(LOG_LEVEL.INFO, msg);
    internal_state_machine.run_verification(self._on_behalf_of);
};

ClientInterface.prototype._onCheckUser = function (event, from, to, msg, self) {
    log(LOG_LEVEL.INFO, msg);
    internal_state_machine.check_if_user_exists(self._on_behalf_of, self._rpc_response_callback());
};

ClientInterface.prototype._on_pass_phrase = function (event, from, to, msg, self) {
    log(LOG_LEVEL.INFO, msg);
    internal_state_machine.get_pass_phrase(self._on_behalf_of);
};

ClientInterface.prototype._on_public_keys = function (event, from, to, msg, self) {
    log(LOG_LEVEL.INFO, msg);
    internal_state_machine.get_public_keys(self._sender, self._on_behalf_of, self._emails_list);
};

ClientInterface.prototype._on_start_encryption = function (event, from, to, msg, self) {
    log(LOG_LEVEL.INFO, msg);
    self._pgp_interface.set_account_email(self._sender);
    self._pgp_interface.encrypt_data(self._pgp_data.data, self._pgp_data.keys_data, self._pgp_callback());
};

ClientInterface.prototype._on_start_decryption = function (event, from, to, msg, self) {
    log(LOG_LEVEL.INFO, msg);
    self._pgp_interface.set_account_email(self._on_behalf_of);
    self._pgp_interface.decrypt_data(self._pgp_data.data, self._pgp_data.keys_data, self._pgp_callback());
};

ClientInterface.prototype._on_export_key = function (event, from, to, msg, self) {
    log(LOG_LEVEL.INFO, msg);
    self._pgp_interface.set_account_email(self._on_behalf_of);
    self._pgp_interface.export_key(self._pgp_data.keys_data, self._pgp_callback());
};

ClientInterface.prototype._onFinish = function (event, from, to, msg, disconnect, self) {
    log(LOG_LEVEL.INFO, msg);
    if (self._on_behalf_of != null && self._subscribe_to_callbacks) {
        internal_state_machine.unsubscribe_from_responses(self._on_behalf_of);
    }
    self._ready_callback = null;
    self._response_callback = null;
    self._response_callbacks = [];
    self._ready_callbacks = [];
    if (disconnect) {
        if (!internal_state_machine.is_disconnected()) {
            internal_state_machine.send_bye();
        }
    }
};

ClientInterface.prototype._rpc_response_callback = function () {
    var self = this;
    return function (response) {
        log(LOG_LEVEL.DEBUG, 'Received RPC response:');
        log(LOG_LEVEL.DEBUG, response);
        var result = {};
        var switch_to_ready = true;
        var switch_to_finish = false;
        if ('error' in response) {
            if (self._state_machine.is(STATE_RPC_CALL_AUTH)) {
                result = {
                    result: false,
                    error: response.error,
                    status: 'error'
                };
            } else {
                result = {
                    error: response.error
                };
            }
            switch_to_finish = true;
        } else {
            if (self._state_machine.is(STATE_RPC_CALL_AUTH)) {
                if (response.keys.indexOf('error') != -1) {
                    result = {
                        result: false,
                        error: response.values[0],
                        status: 'error'
                    };
                } else if (response.status == 'inprogress') {
                    if (response.keys.indexOf('timeout') != -1) {
                        result = {
                            message: response.values[0],
                            timeout: response.values[1],
                            status: 'in_progress'
                        };
                    } else {
                        result = {
                            message: response.values[0],
                            status: 'in_progress'
                        };
                    }
                } else {
                    result = {
                        result: true,
                        status: 'completed'
                    };
                }
                if (result.status == 'in_progress') {
                    switch_to_ready = false;
                }
            } else if ([STATE_RPC_CALL_PASS_PHRASE, STATE_RPC_CALL_PUBLIC_KEYS].indexOf(self._state_machine.current) != -1) {
                for (var i = 0; i < response.keys.length; i++) {
                    result[response.keys[i]] = response.values[i];
                }
                if (self._state_machine.is(STATE_RPC_CALL_PASS_PHRASE)) {
                    if (response.status == 'inprogress') {
                        result['showTimer'] = result.hasOwnProperty('timeout');
                        switch_to_ready = false;
                    }
                }
            }
        }
        if (self._state_machine.is(STATE_RPC_CALL_PUBLIC_KEYS)) {
            var response_callbacks = self._response_callbacks;
            self._response_callbacks = [];
            if (switch_to_finish) {
                self._state_machine._finish('Finalizing client interface due to received error: ' + result, false, self);
            } else if (switch_to_ready) {
                self._state_machine['_ready']('Finished RPC processing, becoming READY.', self);
            }
            for (var response_index = 0; response_index < response_callbacks.length; response_index++) {
                if (response_index == 0 && result.hasOwnProperty('emails_with_errors')) {
                    var result_copy = {};
                    for (var copy in result) {
                        if (result.hasOwnProperty(copy)) {
                            result_copy[copy] = result[copy];
                        }
                    }
                    self._run_async_callback(response_callbacks[response_index], result_copy);
                    delete result['emails_with_errors'];
                } else {
                    self._run_async_callback(response_callbacks[response_index], result);
                }
            }
        } else {
            if (self._response_callback != null) {
                setTimeout(function () {
                    self._response_callback(result);
                }, 1);
            }
            if (switch_to_finish) {
                self._state_machine._finish('Finalizing client interface due to received error: ' + result, false, self);
            } else if (switch_to_ready) {
                self._state_machine['_ready']('Finished RPC processing, becoming READY.', self);
            }
        }

    };
};

ClientInterface.prototype._run_async_callback = function (callback, result) {
    var callback_to_run = callback;
    var result_to_return = result;
    setTimeout(function () {
        callback_to_run(result_to_return);
    }, 1);
};

ClientInterface.prototype.run_auth = function (response_callback) {
    this._response_callback = response_callback;
    if (this._validate_state()) {
        if (this._state_machine.is(STATE_CONNECTION_LOST)) {
            var self = this;
            this._waiting_action = function () {
                self._state_machine['_rpc_auth']('Running authentication on behalf of - ' + self._on_behalf_of, self);
            };
            this._state_machine._initialize('Re-Initializing internal state machine.', this);
        } else {
            this._state_machine['_rpc_auth']('Running authentication on behalf of - ' + this._on_behalf_of, this);
        }
    }
};

ClientInterface.prototype.get_pass_phrase = function (response_callback) {
    this._response_callback = response_callback;
    if (this._validate_state()) {
        if (this._state_machine.is(STATE_CONNECTION_LOST)) {
            var self = this;
            this._waiting_action = function () {
                self._state_machine['_pass_phrase']('Getting pass_phrase on behalf of - ' + self._on_behalf_of, self);
            };
            this._state_machine._initialize('Re-Initializing internal state machine.', this);
        } else {
            this._state_machine['_pass_phrase']('Getting pass_phrase on behalf of - ' + this._on_behalf_of, this);
        }
    }
};

ClientInterface.prototype.get_public_keys = function (sender, emails_list, response_callback) {
    this._response_callback = response_callback;
    this._response_callbacks.push(response_callback);
    if (!this._state_machine.is(STATE_RPC_CALL_PUBLIC_KEYS) && this._validate_state()) {
        this._emails_list = emails_list;
        this._sender = sender;
        if (this._state_machine.is(STATE_CONNECTION_LOST)) {
            var self = this;
            this._waiting_action = function () {
                self._state_machine['_public_keys']('Retrieving public keys for users: ' + self._emails_list, self);
            };
            this._state_machine._initialize('Re-Initializing internal state machine.', this);
        } else {
            this._state_machine['_public_keys']('Retrieving public keys for users: ' + this._emails_list, this);
        }
    }
};

ClientInterface.prototype.encrypt_content = function (data, keys_data, response_callback) {
    this._response_callback = response_callback;
    if (this._validate_state()) {
        this._pgp_data = {
            data: data,
            keys_data: keys_data
        };
        this._sender = data.sender;
        if (this._state_machine.is(STATE_CONNECTION_LOST)) {
            var self = this;
            this._waiting_action = function () {
                self._state_machine['_start_encryption']('Starting encryption process', self);
            };
            this._state_machine._initialize('Re-Initializing internal state machine.', this);
        } else {
            this._state_machine['_start_encryption']('Starting encryption process', this);
        }
    }
};

ClientInterface.prototype.decrypt_content = function (data, keys_data, response_callback) {
    this._response_callback = response_callback;
    if (this._validate_state()) {
        this._pgp_data = {
            data: data,
            keys_data: keys_data
        };
        if (this._state_machine.is(STATE_CONNECTION_LOST)) {
            var self = this;
            this._waiting_action = function () {
                self._state_machine['_start_decryption']('Starting decryption process', self);
            };
            this._state_machine._initialize('Re-Initializing internal state machine.', this);
        } else {
            this._state_machine['_start_decryption']('Starting decryption process', this);
        }
    }
};

ClientInterface.prototype.export_key = function (keys_data, response_callback) {
    this._response_callback = response_callback;
    if (this._validate_state()) {
        this._pgp_data['keys_data'] = keys_data;
        this._state_machine['_export_key']('Exporting key.', this);
    }
};

ClientInterface.prototype._pgp_callback = function () {
    var self = this;
    return function (result, finished) {
        log(LOG_LEVEL.DEBUG, 'PGP interface finished: ' + finished);
        log(LOG_LEVEL.DEBUG, 'PGP interface result:');
        log(LOG_LEVEL.DEBUG, result);
        if (finished) {
            self._state_machine['_ready']('Encryption/Decryption finished with result: ' + result, self);
        }
        self._response_callback(result, finished);
    };
};

ClientInterface.prototype._validate_state = function () {
    if (this._state_machine.is(STATE_FINISH)) {
        log(LOG_LEVEL.ERROR, 'Client interface is not initialized. See logs.');
        var result = {
            error: 'Client interface is not initialized. See logs. Try to re-initialize.'
        };
        if (this._response_callback != null) {
            var self = this;
            setTimeout(function () {
                self._response_callback(result);
            }, 1);
        }
        return false;
    }
    return true;
};

ClientInterface.prototype.finish = function (disconnect) {
    if (!this._state_machine.is(STATE_FINISH)) {
        this._state_machine._finish('Client interactions finalized.', disconnect, this);
    }
};

ClientInterface.prototype.is_initializing = function () {
    return this._state_machine.is(STATE_INITIALIZE);
};

ClientInterface.prototype.add_ready_callback = function (callback) {
    this._additional_ready_callbacks.push(callback);
};

ClientInterface.prototype.is_finished = function () {
    return this._state_machine.is(STATE_FINISH);
};