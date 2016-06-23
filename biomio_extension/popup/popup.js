var Popup = (function ($) {

  var NOT_YOU_MESSAGE = 'If it is not you, please close all opened gmail tabs and login into your Gmail account in a new tab.';
  var NO_ACCOUNT_MESSAGE = 'Please close all opened gmail tabs and login into your Gmail account in a new tab.';
  var SERVER_REST_URL = 'https://gate.biom.io';
  var REST_NEW_EMAIL_COMMAND = '/new_email/';

  var TIME_TO_WAIT_PROBE = 300;
  var showTimer;

  var currentGmailUser = null;
  var $currentUser;
  var $message;
  var $lastErrors;
  var $registerCode;
  var $renewPgpBtn;
  var $registerBtn;
  var $resetConnectionBtn;
  var $exportBtn;
  var $importBtn;

  var view = {};

  var init = function () {

    view.$register = $('#state-register');
    view.$status = $('#state-status');
    view.$exp = $('#state-export');
    view.$imp = $('#state-import');
    $currentUser = $('#current_user > span');
    $message = $('#info_message');
    $lastErrors = $('#last_errors');
    $registerCode = $('#registerCode');
    $renewPgpBtn = $('#renew_pgp_keys');
    $registerBtn = $('#registerBtn');
    $resetConnectionBtn = $('#reset_connection_button');
    $exportBtn = $('#exportBtn');
    $importBtn = $('#importBtn'); 

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

    /** Load export keys view when export keys button is clicked **/
    $exportBtn.on('click', function (e) {
      e.preventDefault();
      toState('export'); 
    });

    /** Load import keys view when import keys button is clicked **/
    $importBtn.on('click', function (e) {
      e.preventDefault();
      toState('import'); 
    });

    /** When user cancels on export keys view **/
    $('#biomio_cancel_button').on('click', function (e) {
      e.preventDefault();
      clearInterval(showTimer);
      toState('status'); 
    });

    document.getElementById('fileinput').addEventListener('change', function(){
      var file = this.files[0];
      // This code is only for demo ...
      console.log("name : " + file.name);
      console.log("size : " + file.size);
      console.log("type : " + file.type);
      console.log("date : " + file.lastModified);
    }, false);
  };

  

  var toState = function (state) {
    switch (state) {
      case 'register':
        stateRegister();
        break;
      case 'export':
        stateExport();
        break;
      case 'import':
        stateImport();
        break;
      case 'status':
      default:
        stateStatus();
    }
  };

  var stateRegister = function () {
    view.$register.show();
  };

  var stateExport = function() {
    view.$status.hide(); 
    view.$exp.show();
    calculateTime();
    chrome.extension.sendRequest({export_key: currentGmailUser}, function (data) {
      console.log(data);
      clearInterval(showTimer);
      if (data.hasOwnProperty('error')) {
        //showPopup.find('.biomio_wait_message').html(data.error);
      } else {
        //showPopup.hide();
        toState('status');
        //$('#actions_panel').show();
        var fileUrl = generateKeyFile(data.exported_key);
        var fileName = currentGmailUser.replace(/[\/\\]/g, '.') + 'keyring-private.asc';
        var fileLink = document.createElement('a');
        fileLink.download = fileName;
        fileLink.href = fileUrl;
        fileLink.click();
      }
    });
  };

  var stateImport = function() {
    view.$status.hide();
    view.$imp.show(); 
  };

  var stateStatus = function () {
    view.$exp.hide(); 
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

  return {
    init: init
  }

})(jQuery);

jQuery(document).ready(function () {
  Popup.init();
});
