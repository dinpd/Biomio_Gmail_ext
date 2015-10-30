function WebSocketImpl(messages_callback, error_callback, disconnect_callback) {
    this._connection = null;
    this._messages_callback = messages_callback;
    this._error_callback = error_callback;
    this._disconnect_callback = disconnect_callback;
    this._secret = null;
    this._connection_data = {
        token: '',
        refresh_token: '',
        connection_ttl: 0,
        session_ttl: 0
    };
    this._app_data = {
        app_id: null,
        app_key: null
    };
    this._setup_app_data();
    this._keep_alive_interval = null;
    this._refresh_token_interval = null;
}

WebSocketImpl.prototype._setup_app_data = function () {
    var app_id = storage_helper.get_data(storage_helper.APP_ID_STORAGE_KEY);
    var app_key = storage_helper.get_data(storage_helper.APP_KEY_STORAGE_KEY);
    if (app_id != null && app_key != null) {
        app_key = storage_helper.decrypt_private_app_key(app_key);
        this._app_data.app_id = app_id;
        this._app_data.app_key = app_key;
    }else{
        chrome.browserAction.setBadgeText({text: "!"});
    }
    socket_helper.set_app_id(this._app_data.app_id);
};

WebSocketImpl.prototype.app_data_exists = function () {
    return this._app_data.app_id != null && this._app_data.app_key != null;
};

WebSocketImpl.prototype._on_error_callback = function () {
    var self = this;
    return function () {
        log(LOG_LEVEL.ERROR, 'There was an error in socket connection...');
        self._error_callback();
    };
};

WebSocketImpl.prototype._on_open_callback = function () {
    var self = this;
    return function () {
        var request;
        if (self.app_data_exists()) {
            request = socket_helper.get_handshake_request();
        } else {
            request = socket_helper.get_handshake_request(self._secret);
        }
        self._send_request(request);
    };
};

WebSocketImpl.prototype._on_close_callback = function () {
    var self = this;
    return function () {
        log(LOG_LEVEL.INFO, 'Socket Connection closed...');
        self._disconnect_callback();
    };
};

WebSocketImpl.prototype._on_message_callback = function () {
    var self = this;
    return function (message) {
        var data = JSON.parse(message.data);
        log(LOG_LEVEL.INFO, 'Received oid: ' + data.msg.oid);
        log(LOG_LEVEL.DEBUG, 'Request:');
        log(LOG_LEVEL.DEBUG, data);
        self._messages_callback(data);
    };
};

WebSocketImpl.prototype._send_request = function (request) {
    var message;
    if (typeof request == 'string') {
        log(LOG_LEVEL.INFO, 'Sending oid: auth');
        message = request;
    } else {
        log(LOG_LEVEL.INFO, 'Sending oid: ' + request.msg.oid);
        message = JSON.stringify(request);
    }
    log(LOG_LEVEL.DEBUG, 'Sending request:');
    log(LOG_LEVEL.DEBUG, request);
    this._connection.send(message);
    socket_helper.increase_request_counter();
    clearInterval(this._keep_alive_interval);
    this._keep_alive_connection();
};

WebSocketImpl.prototype.reset_connection_data = function () {
    if (this.is_connected()) {
        this._connection.close();
    }
    this._connection_data = {
        token: '',
        refresh_token: '',
        connection_ttl: 0,
        session_ttl: 0
    };
    this._app_data = {
        app_id: null,
        app_key: null
    };
    this._setup_app_data();
};

WebSocketImpl.prototype.connect = function (secret) {
    log(LOG_LEVEL.INFO, 'Initializing socket connection...');
    var self = this;
    storage_helper.get_chrome_data(storage_helper.SETTINGS_CHROME_STORAGE_KEY, true, function (result) {
        var settings = result[storage_helper.SETTINGS_CHROME_STORAGE_KEY];
        if (!settings) {
            settings = {server_url: 'wss://gate.biom.io:8080/websocket'};
        }
        var server_url = settings.server_url;
        log(LOG_LEVEL.INFO, 'Connection URL: ' + server_url);
        self._secret = secret;
        self._connection = new WebSocket(server_url);
        self._connection.onopen = self._on_open_callback();
        self._connection.onerror = self._on_error_callback();
        self._connection.onmessage = self._on_message_callback();
        self._connection.onclose = self._on_close_callback();
    });
};

WebSocketImpl.prototype._keep_alive_connection = function () {
    if (this._connection_data.connection_ttl > 0) {
        var self = this;
        this._keep_alive_interval = setInterval(function () {
            if (self.is_connected()) {
                log(LOG_LEVEL.DEBUG, 'Keep Alive Connection...');
                self._send_request(socket_helper.get_nop_request(self._connection_data.token));
            } else {
                clearInterval(self._keep_alive_interval);
            }
        }, (this._connection_data.connection_ttl - 2000));
    }
};

WebSocketImpl.prototype._refresh_connection_token = function () {
    if (this._connection_data.session_ttl > 0) {
        var self = this;
        this._refresh_token_interval = setInterval(function () {
            if (self.is_connected()) {
                log(LOG_LEVEL.DEBUG, 'Refresh Connection Token...');
                self._send_request(socket_helper.get_nop_request(self._connection_data.refresh_token));
            } else {
                clearInterval(self._refresh_token_interval);
            }
        }, (this._connection_data.session_ttl - 2000));
    }
};

WebSocketImpl.prototype.send_ack_request = function () {
    this._send_request(socket_helper.get_ack_request(this._connection_data.token));
};

WebSocketImpl.prototype.send_digest_request = function () {
    var rsa = new RSAKey();
    rsa.readPrivateKeyFromPEMString(this._app_data.app_key);
    var hSig = rsa.signString(socket_helper.get_header_string(this._connection_data.token), 'sha1');
    log(LOG_LEVEL.DEBUG, 'Generated digest:');
    log(LOG_LEVEL.DEBUG, hSig);
    this._send_request(socket_helper.get_digest_request(hSig, this._connection_data.token));
};

WebSocketImpl.prototype.set_nop_tokens = function (connection_data_json) {
    if (this._connection_data.token != connection_data_json.header.token) {
        this._connection_data.token = connection_data_json.header.token;
        clearInterval(this._refresh_token_interval);
        this._refresh_connection_token();
    }
};

WebSocketImpl.prototype.start_connection_loops = function () {
    clearInterval(this._refresh_token_interval);
    clearInterval(this._keep_alive_interval);
    this._keep_alive_connection();
    this._refresh_connection_token();
};

WebSocketImpl.prototype.set_connection_data = function (connection_data_json) {
    this._connection_data.token = connection_data_json.header.token;
    this._connection_data.refresh_token = connection_data_json.msg['refreshToken'];
    this._connection_data.session_ttl = connection_data_json.msg['sessionttl'] * 1000;
    this._connection_data.connection_ttl = connection_data_json.msg['connectionttl'] * 1000;
    if ('key' in connection_data_json.msg && 'fingerprint' in connection_data_json.msg) {
        var app_id = connection_data_json.msg['fingerprint'];
        var app_key = connection_data_json.msg.key;
        log(LOG_LEVEL.INFO, 'Received app ID and app KEY from server: ' + app_id + ', ' + app_key);
        app_key = storage_helper.encrypt_private_app_key(app_key);
        storage_helper.store_data(storage_helper.APP_ID_STORAGE_KEY, app_id);
        storage_helper.store_data(storage_helper.APP_KEY_STORAGE_KEY, app_key);
        this._setup_app_data();
    }
};

WebSocketImpl.prototype.send_rpc_auth_request = function (on_behalf_of, key_value_dict) {
    this._send_request(socket_helper.get_rpc_request(this._connection_data.token,
        socket_helper.RPC_PROCESS_AUTH_METHOD, socket_helper.RPC_AUTH_CLIENT_NAMESPACE, on_behalf_of, key_value_dict));
};

WebSocketImpl.prototype.send_rpc_check_user_request = function (on_behalf_of, key_value_dict) {
    this._send_request(socket_helper.get_rpc_request(this._connection_data.token,
        socket_helper.RPC_CHECK_USER_EXISTS_METHOD, socket_helper.RPC_AUTH_CLIENT_NAMESPACE,
        on_behalf_of, key_value_dict));
};

WebSocketImpl.prototype.send_rpc_pass_phrase_request = function (on_behalf_of, key_value_dict) {
    this._send_request(socket_helper.get_rpc_request(this._connection_data.token,
        socket_helper.RPC_GET_PASS_PHRASE_METHOD, socket_helper.RPC_PGP_NAMESPACE, on_behalf_of, key_value_dict));
};

WebSocketImpl.prototype.send_rpc_public_keys_request = function (on_behalf_of, key_value_dict) {
    this._send_request(socket_helper.get_rpc_request(this._connection_data.token,
        socket_helper.RPC_GET_PUBLIC_KEY_METHOD, socket_helper.RPC_PGP_NAMESPACE, on_behalf_of, key_value_dict));
};

WebSocketImpl.prototype.send_bye_request = function () {
    this._send_request(socket_helper.get_bye_request(this._connection_data.token));
};

WebSocketImpl.prototype.is_connected = function () {
    return this._connection.readyState == 1;
};

WebSocketImpl.prototype.reset_app_registration = function(){
    storage_helper.remove_data(storage_helper.APP_ID_STORAGE_KEY);
    storage_helper.remove_data(storage_helper.APP_KEY_STORAGE_KEY);
    this.reset_connection_data();
};