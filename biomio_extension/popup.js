var NOT_YOU_MESSAGE = 'If it is not you, please close all opened gmail tabs and login into your Gmail account in a new tab.';
var NO_ACCOUNT_MESSAGE = 'Please close all opened gmail tabs and login into your Gmail account in a new tab.';
var current_gmail_user;
var SERVER_REST_URL = 'https://gate.biom.io';
var REST_NEW_EMAIL_COMMAND = '/new_email/';
$(document).ready(function () {
    chrome.extension.sendRequest({message: 'is_registered'}, function (response) {
        if (response.is_registered) {
            $('#renew_pgp_keys').show();
            chrome.storage.local.get('current_gmail_user_biomio', function (data) {
                current_gmail_user = data['current_gmail_user_biomio'];
                var currUserElement = $('#current_user');
                var infoMessage = $('#info_message');
                if (current_gmail_user) {
                    current_gmail_user = current_gmail_user.replace(/<|>/g, '');
                    currUserElement.text(currUserElement.text() + current_gmail_user);
                    infoMessage.text(NOT_YOU_MESSAGE);
                } else {
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

        } else {
            $('#current_user').hide();
            $('#info_message').html('To enable extension you need to register account at <a target="_blank" href="http://biom.io/#signup">Biom.io</a>');
            $('#errors').hide();
            $('#secret_input').show();
            $('#renew_pgp_keys').hide();
            var register_app_btn = $('#register_app_button');
            register_app_btn.show();
            register_app_btn.on('click', function (e) {
                e.preventDefault();
                $(e.currentTarget).attr('disabled', 'disabled');
                var secret_code = $('#secret_code').val();
                chrome.extension.sendRequest({secret_code: secret_code}, function (responseData) {
                    console.log(responseData);
                    if (responseData.result) {
                        window.location.reload();
                    } else {
                        alert(responseData.error);
                        $(e.currentTarget).removeAttr('disabled');
                    }
                });
            });
        }
    });
    $('#renew_pgp_keys').on('click', function (e) {
        e.preventDefault();
        var currentTarget = $(e.currentTarget);
        currentTarget.attr('disabled', 'disabled');
        currentTarget.val('Working....');
        if (current_gmail_user) {
            $.ajax({
                url: SERVER_REST_URL + REST_NEW_EMAIL_COMMAND + current_gmail_user,
                type: 'post',
                data: {},
                success: function () {
                    currentTarget.val('Successfully updated PGP keys for user - ' + current_gmail_user);
                },
                error: function () {
                    currentTarget.val('Successfully updated PGP keys for user - ' + current_gmail_user);
                }
            });
        } else {
            currentTarget.val('Please open the Gmail tab.');
        }
    });
    $('#reset_connection_button').on('click', function (e) {
        e.preventDefault();
        chrome.runtime.sendMessage({command: 'biomio_reset_server_connection', data: {}});
        $(e.currentTarget).attr('disabled', 'disabled');
        $(e.currentTarget).val('Done');
    });

});