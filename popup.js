var NOT_YOU_MESSAGE = 'If it is not you, please close all opened gmail tabs and login into your Gmail account in a new tab.';
var NO_ACCOUNT_MESSAGE = 'Please close all opened gmail tabs and login into your Gmail account in a new tab.';
var current_gmail_user;

var REST_RESET_URL = '';

$(document).ready(function () {
    chrome.storage.local.get('current_gmail_user_biomio', function (data) {
        current_gmail_user = data['current_gmail_user_biomio'];
        var currUserElement = $('#current_user');
        var infoMessage = $('#info_message');
        if (current_gmail_user) {
            currUserElement.text(currUserElement.text() + current_gmail_user);
            infoMessage.text(NOT_YOU_MESSAGE);
        } else {
            $('#biomio_reset_keyring').attr('disabled', 'disabled');
            currUserElement.text(currUserElement.text() + 'None');
            infoMessage.text(NO_ACCOUNT_MESSAGE);
        }
    });
    chrome.storage.local.get('last_biomio_errors', function (data) {
        var last_errors = data['last_biomio_errors'];
        var list_errors = $('#last_errors');
        if (last_errors) {
            for (var i = 0; i < last_errors.length; i++) {
                list_errors.append('<li>' + last_errors[i] + '</li>');
            }
        } else {
            list_errors.append('<li>No errors</li>');
        }
    });

    $('#reset_connection_button').on('click', function (e) {
        e.preventDefault();
        chrome.runtime.sendMessage({command: 'biomio_reset_server_connection', data: {}});
        $(e.currentTarget).attr('disabled', 'disabled');
        $(e.currentTarget).val('Done');
    });
    $('#biomio_reset_keyring').on('click', function(e){
        e.preventDefault();
        var currentTarget = $(e.currentTarget);
        currentTarget.attr('disabled', 'disabled');
        currentTarget.val('Working....');
        $.ajax({
            url: REST_RESET_URL,
            type: 'post',
            data: {
                'email': current_gmail_user
            },
            success: function(){
                currentTarget.val('Done!');
            },
            error: function(error){
                console.log(error);
                currentTarget.val('Failed.');
            }
        });
    });
});