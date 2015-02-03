var defaultSettings = {
    server_url: "wss://gb.vakoms.com:8080/websocket"
};
$(document).ready(function () {
    chrome.storage.local.get('settings', function (data) {
        var settings = data['settings'];
        if (!settings) {
            chrome.storage.local.set({settings: defaultSettings});
            settings = defaultSettings;
        }
        var biomioServerUrl = $('#biomio_server_url');
        biomioServerUrl.val(settings['server_url']);
        $('#biomio_update_url_button').on('click', function (e) {
            e.preventDefault();
            if (biomioServerUrl.val() != '' && biomioServerUrl != settings['server_url']) {
                settings['server_url'] = biomioServerUrl.val();
                chrome.storage.local.set({settings: settings});
            }
        });
        $('#biomio_export_button').on('click', function (e) {
            e.preventDefault();

        });
    });
});

