function InternalStateMachine() {
    this._STATE_DISCONNECTED = 'disconnected';
    this._STATE_CONNECTED = 'connected';
    this._STATE_REGISTRATION_HANDSHAKE = 'registration';
    this._STATE_REGULAR_HANDSHAKE = 'regular_handshake';
    this._STATE_READY = 'state_ready';

    this._subscribed_callbacks = {};
    this._temp_keys_subscriptions = {};
    this._ready_callbacks = [];
    this._lost_connection_callbacks = [];
    this._pending_requests = {};
    this._secret = null;

    this._socket_client = new WebSocketImpl(this._message_listener_callback(), this._error_callback(), this._close_callback());
    this._state_machine = StateMachine.create({
        initial: this._STATE_DISCONNECTED,
        events: [
            {name: '_connect', from: this._STATE_DISCONNECTED, to: this._STATE_CONNECTED},
            {name: '_register', from: this._STATE_CONNECTED, to: this._STATE_REGISTRATION_HANDSHAKE},
            {name: '_handshake', from: this._STATE_CONNECTED, to: this._STATE_REGULAR_HANDSHAKE},
            {
                name: '_ready',
                from: [this._STATE_REGISTRATION_HANDSHAKE, this._STATE_REGULAR_HANDSHAKE],
                to: this._STATE_READY
            },
            {name: '_disconnect', from: '*', to: this._STATE_DISCONNECTED}
        ],
        callbacks: {
            on_connect: this._on_connect_event,
            on_register: this._on_register_event,
            on_handshake: this._on_handshake_event,
            on_ready: this._on_ready_event,
            on_disconnect: this._on_disconnect
        }
    });
}
InternalStateMachine.prototype.initialize_state_machine = function (secret) {
    if (!this._state_machine.is(this._STATE_DISCONNECTED)) {
        this._state_machine._disconnect('Resetting connection...', this);
    }
    if (typeof secret != 'undefined' && secret) {
        this._secret = secret;
    }
    this._state_machine['_connect']('Initializing internal state machine.', this);
};

InternalStateMachine.prototype._on_connect_event = function (event, from, to, msg, self) {
    log(LOG_LEVEL.INFO, msg);
    self._socket_client.connect(self._secret);
    self._secret = null;
};

InternalStateMachine.prototype._on_register_event = function (event, from, to, msg, self) {
    log(LOG_LEVEL.INFO, msg);
    self._socket_client.send_ack_request();
    self._state_machine['_ready']('Registration successful, going to READY.', self);
};

InternalStateMachine.prototype._on_handshake_event = function (event, from, to, msg, self) {
    log(LOG_LEVEL.INFO, msg);
    self._socket_client.send_digest_request();
    self._state_machine['_ready']('Handshake successful, going to READY.', self);
};

InternalStateMachine.prototype._on_ready_event = function (event, from, to, msg, self) {
    log(LOG_LEVEL.INFO, msg);
    self._socket_client.start_connection_loops();
    for (var i = 0; i < self._ready_callbacks.length; i++) {
        var ready_callback = self._ready_callbacks[i];
        setTimeout(ready_callback, 1);
    }
    self._ready_callbacks = [];
    var curr_pending_requests = self._pending_requests;
    self._pending_requests = {};
    for (var pending_request in curr_pending_requests) {
        if (curr_pending_requests.hasOwnProperty(pending_request)) {
            curr_pending_requests[pending_request](pending_request);
        }
    }
};

InternalStateMachine.prototype._on_disconnect = function (event, from, to, msg, self) {
    log(LOG_LEVEL.INFO, msg);
    self._socket_client.reset_connection_data();
    for (var i = 0; i < self._lost_connection_callbacks.length; i++) {
        var lost_connection_callback = self._lost_connection_callbacks[i];
        setTimeout(lost_connection_callback, 1);
    }
    self._lost_connection_callbacks = [];
};

InternalStateMachine.prototype.add_lost_connection_callback = function (lost_connection_callback) {
    this._lost_connection_callbacks.push(lost_connection_callback);
};

InternalStateMachine.prototype.subscribe_for_responses = function (on_behalf_of, callback) {
    this._subscribed_callbacks[on_behalf_of] = callback;
};

InternalStateMachine.prototype.unsubscribe_from_responses = function (on_behalf_of) {
    log(LOG_LEVEL.INFO, 'Unsubscribing client from response callbacks: ' + on_behalf_of);
    delete this._subscribed_callbacks[on_behalf_of];
};

InternalStateMachine.prototype.is_ready = function () {
    return this._state_machine.is(this._STATE_READY);
};

InternalStateMachine.prototype.is_disconnected = function () {
    return this._state_machine.is(this._STATE_DISCONNECTED);
};

InternalStateMachine.prototype.add_ready_callback = function (callback) {
    this._ready_callbacks.push(callback);
};

InternalStateMachine.prototype.check_if_user_exists = function (client_key, temp_callback) {
    this._pending_requests[client_key] = this.check_if_user_exists;
    if (typeof temp_callback != 'undefined' && temp_callback) {
        this._temp_keys_subscriptions[client_key] = temp_callback;
    }
    this._socket_client.send_rpc_check_user_request(client_key, {client_key: client_key});
};

InternalStateMachine.prototype.run_verification = function (on_behalf_of, auth_code) {
    this._pending_requests[on_behalf_of] = this.run_verification;
    this._socket_client.send_rpc_auth_request(on_behalf_of, {email: on_behalf_of, auth_code: auth_code});
};

InternalStateMachine.prototype.get_public_keys = function (on_behalf_of, emails_list) {
    this._socket_client.send_rpc_public_keys_request(on_behalf_of, {emails: emails_list});
};

InternalStateMachine.prototype.get_pass_phrase = function (on_behalf_of) {
    this._socket_client.send_rpc_pass_phrase_request(on_behalf_of, {email: on_behalf_of});
};

InternalStateMachine.prototype.send_bye = function () {
    this._socket_client.send_bye_request();
};

InternalStateMachine.prototype.is_app_registered = function () {
    return this._socket_client.app_data_exists();
};

InternalStateMachine.prototype._message_listener_callback = function () {
    var self = this;
    return function (message) {
        if (message.msg.oid == 'bye') {
            log(LOG_LEVEL.INFO, 'Received BYE message from server.');
            var disc_msg = 'Unknown reason.';
            if (message.hasOwnProperty('status')) {
                disc_msg = message.status;
            }
            if (self._state_machine.is(self._STATE_CONNECTED) && (disc_msg.indexOf('app is already registered') != -1
                || disc_msg.indexOf('registration handshake first')) != -1) {
                console.log('!!!!!!!!!!', disc_msg);
                self._socket_client.reset_app_registration();
                for (var i = 0; i < self._ready_callbacks.length; i++) {
                    self._ready_callbacks[i]({error: disc_msg});
                }
                self._ready_callbacks = [];
            }
            self._state_machine._disconnect('Server sent bye, reason: ' + disc_msg, self);
            if (disc_msg.indexOf('Invalid token') != -1) {
                self._state_machine['_connect']('Re-initializing socket connection due to invalid token error.', self);
            }
        } else if (message.msg.oid == 'nop') {
            self._socket_client.set_nop_tokens(message);
        } else if (self._state_machine.is(self._STATE_CONNECTED)) {
            self._socket_client.set_connection_data(message);
            if ('key' in message.msg) {
                self._state_machine['_register']('App was registered, sending ack.', self);
            } else {
                self._state_machine['_handshake']('Sending digest.', self);
            }
        } else if (self._state_machine.is(self._STATE_READY)) {
            if (message.msg.oid == 'rpcResp') {
                var response = message.msg.data;
                response.status = message.msg['rpcStatus'];
                var on_behalf_of = message.msg['onBehalfOf'];
                if (self._pending_requests.hasOwnProperty(on_behalf_of)) {
                    delete self._pending_requests[on_behalf_of];
                }
                if (self._subscribed_callbacks.hasOwnProperty(on_behalf_of)) {
                    self._run_async_callback(self._subscribed_callbacks[on_behalf_of], response);
                } else if (self._temp_keys_subscriptions.hasOwnProperty(on_behalf_of)) {
                    self._run_async_callback(self._temp_keys_subscriptions[on_behalf_of], response);
                    delete self._temp_keys_subscriptions[on_behalf_of];
                }
            }
        }
    };
};

InternalStateMachine.prototype._run_async_callback = function (callback, params) {
    setTimeout(function () {
        callback(params);
    }, 1);
};

InternalStateMachine.prototype._error_callback = function (error) {
    var self = this;
    return function (error) {
        var disc_msg = ERROR_MESSAGES.SERVER_CONNECTION_ERROR;
        if (typeof error != 'undefined' && error) {
            disc_msg = 'Socket error! - ' + error.toString();
        }
        for (var subscribed_key in self._subscribed_callbacks) {
            if (self._subscribed_callbacks.hasOwnProperty(subscribed_key)) {
                self._subscribed_callbacks[subscribed_key]({error: disc_msg});
            }
        }
        self._subscribed_callbacks = {};
        for (var temp_key in self._temp_keys_subscriptions) {
            if (self._temp_keys_subscriptions.hasOwnProperty(temp_key)) {
                self._temp_keys_subscriptions[temp_key]({error: disc_msg});
            }
        }
        self._temp_keys_subscriptions = {};
        for (var i = 0; i < self._ready_callbacks.length; i++) {
            self._ready_callbacks[i]({error: disc_msg});
        }
        self._ready_callbacks = [];
        self._state_machine._disconnect(disc_msg, self);
    };
};

InternalStateMachine.prototype._close_callback = function () {
    var self = this;
    return function () {
        if (!self._state_machine.is(self._STATE_DISCONNECTED)) {
            self._state_machine._disconnect('Socket connection was closed becoming DISCONNECTED.', self);
        }
    };
};

var internal_state_machine = new InternalStateMachine();