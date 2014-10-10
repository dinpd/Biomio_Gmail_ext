chrome.runtime.onConnect.addListener(function(port) {
    port.onMessage.addListener(function(message) {
        if(message.type == "show_email_address_background") {
            console.log("Background - email_address", message.data)
        }
        else if(message.type == 'show_email_details_background'){
            var data_json = JSON.parseJSON(message.data);
            console.log('Background - URL', data_json.url);
            console.log('Background - BODY', data_json.body);
            console.log('Background - DATA', data_json.data);
            console.log('Background - XHR', data_json.xhr);
        }
    });
});

