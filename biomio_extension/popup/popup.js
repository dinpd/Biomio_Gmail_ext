var Popup = (function ($) {

  var NOT_YOU_MESSAGE = 'If it is not you, please close all opened gmail tabs and login into your Gmail account in a new tab.';
  var NO_ACCOUNT_MESSAGE = 'Please close all opened gmail tabs and login into your Gmail account in a new tab.';
  var SERVER_REST_URL = 'https://gate.biom.io';
  var REST_NEW_EMAIL_COMMAND = '/new_email/';

  var currentGmailUser = null;
  var $currentUser;
  var $message;
  var $lastErrors;
  var $registerCode;
  var $renewPgpBtn;
  var $registerBtn;
  var $resetConnectionBtn;

  var view = {};

  var init = function () {

    view.$register = $('#state-register');
    view.$status = $('#state-status');
    $currentUser = $('#current_user > span');
    $message = $('#info_message');
    $lastErrors = $('#last_errors');
    $registerCode = $('#registerCode');
    $renewPgpBtn = $('#renew_pgp_keys');
    $registerBtn = $('#registerBtn');
    $resetConnectionBtn = $('#reset_connection_button');

    initEvents();

    chrome.extension.sendRequest({message: 'is_registered'}, function (response) {
      if (response.is_registered) {
        toState('status');
      } else {
        toState('register');
      }
    });
  };

  var initEvents = function () {

    /** register app */
    $registerBtn.on('click', function (e) {
      console.info('register');
      e.preventDefault();
      $(e.currentTarget).attr('disabled', 'disabled');
      var code = $registerCode.val();

      chrome.extension.sendRequest({secret_code: code}, function (responseData) {
        console.log(responseData);
        if (responseData.result) {
          window.location.reload();
        } else {
          alert(responseData.error);
          $(e.currentTarget).removeAttr('disabled');
        }
      });
    });

    /** renew PGP keys*/
    $renewPgpBtn.on('click', function (e) {
      e.preventDefault();
      var currentTarget = $(e.currentTarget);
      currentTarget.attr('disabled', 'disabled');
      currentTarget.val('Working....');
      if (currentGmailUser) {
        $.ajax({
          url: SERVER_REST_URL + REST_NEW_EMAIL_COMMAND + currentGmailUser,
          type: 'post',
          data: {},
          success: function () {
            currentTarget.val('Successfully updated PGP keys for user - ' + currentGmailUser);
          },
          error: function () {
            /*@todo: ?*/
            currentTarget.val('Successfully updated PGP keys for user - ' + currentGmailUser);
          }
        });
      } else {
        currentTarget.val('Please open the Gmail tab.');
      }
    });

    /** reset connection */
    $resetConnectionBtn.on('click', function (e) {
      e.preventDefault();
      chrome.runtime.sendMessage({command: 'biomio_reset_server_connection', data: {}});
      $(e.currentTarget).attr('disabled', 'disabled');
      $(e.currentTarget).val('Done');
    });
  };

  var toState = function (state) {
    switch (state) {
      case 'register':
        stateRegister();
        break;
      case 'status':
      default:
        stateStatus();
    }
  };

  var stateRegister = function () {
    view.$register.show();

  };

  var stateStatus = function () {
    view.$status.show();

    /** load current Gmail user */
    chrome.storage.local.get('current_gmail_user_biomio', function (data) {
      currentGmailUser = data['current_gmail_user_biomio'];

      if (currentGmailUser) {
        currentGmailUser = currentGmailUser.replace(/<|>/g, '');
        $currentUser.text(currentGmailUser);
        $message.text(NOT_YOU_MESSAGE);
        $renewPgpBtn.show();
      } else {
        $currentUser.text('None');
        $message.text(NO_ACCOUNT_MESSAGE);
        $renewPgpBtn.hide();
      }
    });

    /** load last errors */
    chrome.storage.local.get('last_biomio_errors', function (data) {
      var lastErrors = data['last_biomio_errors'];
      var errorsHtml = '';

      if (lastErrors) {
        for (var i = 0; i < lastErrors.length; i++) {
          errorsHtml += '<li>' + lastErrors[i] + '</li>';
        }
      } else {
        errorsHtml += '<li>No errors</li>';
      }

      $lastErrors.append(errorsHtml);
    });

  };

  return {
    init: init
  }

})(jQuery);

jQuery(document).ready(function () {
  Popup.init();
});
