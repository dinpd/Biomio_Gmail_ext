var defaultSettings = {
    server_url: "wss://gb.vakoms.com:8080/websocket"
};
var NOT_YOU_MESSAGE = ', If it is not you, please close all opened gmail tabs and login into your Gmail account in a new tab.';
var NO_ACCOUNT_MESSAGE = 'Please close all opened gmail tabs and login into your Gmail account in a new tab.';
var showTimer;
var current_gmail_user;
var TIME_TO_WAIT_PROBE = 300;
$(document).ready(function () {
    chrome.storage.local.get('biomio_settings', function (data) {
        var settings = data['biomio_settings'];
        if (!settings) {
            chrome.storage.local.set({biomio_settings: defaultSettings});
            settings = defaultSettings;
        }
        var biomioServerUrl = $('#biomio_server_url');
        biomioServerUrl.val(settings['server_url']);
        $('#biomio_update_url_button').on('click', function (e) {
            e.preventDefault();
            if (biomioServerUrl.val() != '' && biomioServerUrl != settings['server_url']) {
                settings['server_url'] = biomioServerUrl.val();
                chrome.storage.local.set({biomio_settings: settings});
                chrome.extension.sendRequest({changed_url: settings['server_url']});
            }
        });
        $('#biomio_export_button').on('click', function (e) {
            e.preventDefault();
            if (current_gmail_user) {
                $('#actions_panel').hide();
                var showPopup = $('#biomio_show_popup');
                showPopup.show();
                showPopup.find('.biomio_wait_message').html('Please provide a probe for BioMio service authentication.');
                calculateTime();
                chrome.extension.sendRequest({export_key: current_gmail_user}, function (data) {
                    console.log(data);
                    clearInterval(showTimer);
                    if (data.hasOwnProperty('error')) {
                        showPopup.find('.biomio_wait_message').html(data.error);
                        $('#biomio_ok_button').show();
                    } else {
                        showPopup.hide();
                        $('#biomio_ok_button').hide();
                        $('#actions_panel').show();
                        var fileUrl = generateKeyFile(data.exported_key);
                        var fileName = current_gmail_user.replace(/[\/\\]/g, '.') + 'keyring-private.asc';
                        var fileLink = document.createElement('a');
                        fileLink.download = fileName;
                        fileLink.href = fileUrl;
                        fileLink.click();
                    }
                });
            }
        });
        $('#biomio_ok_button').on('click', function () {
            $('#biomio_show_popup').hide();
            $('#biomio_ok_button').hide();
            $('#actions_panel').show();
        });
    });
    chrome.extension.sendRequest({message: 'is_registered'}, function (response) {
        if (!response.is_registered) {
            $('#user_info').hide();
            $('#secret_input').show();
            $('#register_app_button').on('click', function (e) {
                e.preventDefault();
                $(e.currentTarget).attr('disabled', 'disabled');
                var secret_code = $('#secret_code').val();
                chrome.extension.sendRequest({secret_code: secret_code}, function (responseData) {
                    console.log(responseData);
                    if (responseData.result) {
                        $('#secret_input').hide();
                        $('#user_info').show();
                    }
                });
            });
        }

    });
    chrome.storage.local.get('current_gmail_user_biomio', function (data) {
        current_gmail_user = data['current_gmail_user_biomio'];
        var exportButton = $('#biomio_export_button');
        if (current_gmail_user) {
            $('#current_gmail_user').text(current_gmail_user + NOT_YOU_MESSAGE);
            exportButton.removeAttr('disabled');
        } else {
            exportButton.attr('disabled', true);
            $('#current_gmail_user').text(NO_ACCOUNT_MESSAGE);
        }
    });

    chrome.storage.onChanged.addListener(function (changes, areaName) {
        if (areaName == 'local' && changes.hasOwnProperty('current_gmail_user_biomio')
            && changes['current_gmail_user_biomio'].hasOwnProperty('newValue')) {
            var exportButton = $('#biomio_export_button');
            if (changes['current_gmail_user_biomio']['newValue'] == '') {
                current_gmail_user = undefined;
                exportButton.attr('disabled', true);
                $('#current_gmail_user').text(NO_ACCOUNT_MESSAGE);
            } else {
                exportButton.removeAttr('disabled');
                current_gmail_user = changes['current_gmail_user_biomio']['newValue'];
                $('#current_gmail_user').text(current_gmail_user + NOT_YOU_MESSAGE);
            }
        }
    });
});

/**
 * Shows timer for user. Time that user has to provide a probe from his device.
 */
function calculateTime() {
    var timer = TIME_TO_WAIT_PROBE;
    var biomio_timer = $('#biomio_timer');
    biomio_timer.show();
    showTimer = setInterval(function () {
        timer--;
        if (timer <= 0) {
            chrome.extension.sendRequest({cancel_probe: "We were not ale to receive your probe results from server, please try again later."});
            $('#biomio_ok_button').show();
            biomio_timer.show();
            clearInterval(showTimer);
        }
        var minutes = Math.floor((timer %= 3600) / 60);
        var seconds = timer % 60;
        biomio_timer.text((minutes < 10 ? '0' + minutes : minutes) + ' : ' + (seconds < 10 ? '0' + seconds : seconds));
    }, 1000);
}

/**
 * Generates file data url with given string content.
 * @param {string}content
 * @returns {string}
 */
function generateKeyFile(content) {
    var blob = new Blob(
        [content], {type: 'application/pgp-keys; format=text;'});
    return URL.createObjectURL(blob);
}