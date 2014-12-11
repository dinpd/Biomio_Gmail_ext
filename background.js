var pgpContext = new e2e.openpgp.ContextImpl();
var ctxApi = new e2e.ext.api.Api(pgpContext);
pgpContext.setKeyRingPassphrase('');
pgpContext.setArmorHeader(
    'Version',
    'BioMio v1.0');

ctxApi.installApi();
//console.log(ctxApi.pgpCtx_.importKey(function(){}, "-----BEGIN RSA PRIVATE KEY-----\nMIICWwIBAAKBgQCbJ1wAitBwoICb4n8anXMkPMRUPXBB+F5+aFyNPcX/t/AmxQ2i\ndxw85t+bPJ3AjfXmTXZ1jVMgcyc4GkXQkBgUvzXiuYcPNKHHwoGFvG/TTgkr/TW7\n8/wrXi17x8OAtiWVXKhRPjtBL6YCgVIbCywggk7Yj7NuF9BBUbyvGWC4+wIDAQAB\nAoGAFMAd2OC34ehFaxPOxgN6y8ToyQ9yfRA3qxZQEn/JhFrYXocKPMlLWIXUMBHa\nU09pLMT9a9lb3cIo46L35V3wKljazqo00kG+MOMkmShXZ1Zs+72JRUWGs+HAMoCJ\nwltyavf3ckBXhu5cY+eyPTLYasqioVIzWeMLy+XGwvcpQMkCQQDDnC20EO/+BLyV\nnxMBIGI/iQb34Ww1VpELJR4m/hVpuMWmkTaNtGYgagGKuF3qaUcQAIffKTsSK7yF\nzGm151O3AkEAyw3CxwgdU92pFpXbwxebaXEoEofWoQChHcku9nx9/Cuq3rSGJgiG\n8kfiHjr3A5C2IjUyyVih4Wfqa6cdaAYs3QJAU+UMBQquo7fMWi+bqwQEn1NZ1b6s\n9kNmee01fWvEK0/AFax6RVR16LkOaDyiqwL0I3zWyXOZjjWL6aa+P/IzCQJAfLjs\nHhLW6M+rb8sG3LOga0jtI0y6wdRAIqqTpSVcwUsVPoxGJhBwy1rqAkWXumHl7ecd\nVd2SOYD51bwlbOL2JQJAfgH31nXQm9sW3NPm8WYMHV1akZ2bN5b1nU8L8ofA/Juv\n939MM1FGkJ53OHnbaGdjnAwRuVWDRIGKV0IVVjYBjQ==\n-----END RSA PRIVATE KEY-----"));

var STATE_CONNECTED = 'connected';
var STATE_REGISTRATION_HANDSHAKE = 'registration';
var STATE_REGULAR_HANDSHAKE = 'handshake';
var STATE_READY = 'ready';
var STATE_DISCONNECTED = 'disconnected';
var socket_connection;
var SERVER_URL = "wss://gb.vakoms.com:8080/websocket";

var user_info = {};

var state_machine = StateMachine.create({
    events: [
        {name: 'connect', from: 'none', to: STATE_CONNECTED},
        {name: 'register', from: STATE_CONNECTED, to: STATE_REGISTRATION_HANDSHAKE},
        {name: 'handshake', from: STATE_REGISTRATION_HANDSHAKE, to: STATE_REGULAR_HANDSHAKE},
        {name: 'ready', from: STATE_REGULAR_HANDSHAKE, to: STATE_READY},
        {name: 'disconnect', from: ['none', STATE_CONNECTED, STATE_REGISTRATION_HANDSHAKE, STATE_REGULAR_HANDSHAKE, STATE_READY], to: STATE_DISCONNECTED}
    ]
});

var socketOnError = function(data){
    console.log('WebSocket exception (URL - ' + socket_connection.url + '): ', data);
    state_machine.disconnect();
};

var socketOnOpen = function(){
    state_machine.connect('WebSocket connection opened: Url - ', socket_connection.url);
};

var socketOnClose = function(){
    console.log('WebSocket connection closed: Url - ', socket_connection.url);
    state_machine.disconnect();
};

var socketOnMessage = function(event){
    var data = event.data;
    if(state_machine.is('register')){
        user_info.token = data.header.token;
        user_info.refresh_token = data.msg.refresh_token;
        state_machine.handshake('Successfully registered!\nToken: ' + user_info.token
        + '\nRefresh token: ' + user_info.refresh_token);
    }
};

var onConnect = function(event, from, to, msg){
    console.log(msg);
    var registration_req = getHandshakeRequest('secret');
    state_machine.registration('Started registration, request: ' + registration_req);
    socket_connection.send(registration_req);
};

var onRegister = function(event, from, to, msg){
    console.log(msg);
};

var onHandshake = function(event, from, to, msg){
    console.log(msg);
    var ack_req = getReadyRequest(ACK_REQUEST, user_info.token);
    console.log('ACK, request: ' + ack_req);
    socket_connection.send(ack_req);
    //var regular_req = getHandshakeRequest(); //TODO: regular handshake
    state_machine.ready();
};

var onReady = function(event, from, to, msg){

};

socket_connection = new WebSocket(SERVER_URL);
socket_connection.onerror = socketOnError;
socket_connection.onopen = socketOnOpen;
socket_connection.onclose = socketOnClose;


