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
    $('.biomio_cancel_button').on('click', function (e) {
      e.preventDefault();
      clearInterval(showTimer);
      toState('status'); 
    });

    document.getElementById('fileinput').addEventListener('change', function(){
      var file = this.files[0];
      read_file(file, parse_ascii_keyfile);
      $('#timer_message').text('Please provide a probe for Biomio service authentication.');
      calculateTime(); 
    }, false);
  };

var read_file = function(file, callback) {
    var reader = new FileReader();
    reader.onload = function(evt) {
        var binary = evt.target.result;
        callback(binary);
    };
    reader.readAsBinaryString(file);
}

var parse_ascii_keyfile = function(data) {
  console.log(data); 
  chrome.extension.sendRequest({private_key: data}, function(d) {
    return null; 
  });
  chrome.extension.sendRequest({import_key: currentGmailUser}, function (data) {
      clearInterval(showTimer);
      if (data.hasOwnProperty('error')) {
        //showPopup.find('.biomio_wait_message').html(data.error);
      } else {
        //showPopup.hide();
        toState('status');
        //$('#actions_panel').show();
      }
    });
    
} 

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
    view.$imp.hide(); 
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

  document.addEventListener('DOMContentLoaded', function(){
    document.getElementById("enc").addEventListener("click", function(){openTab("enc", "Encrypt");});
    document.getElementById("dec").addEventListener("click", function(){openTab("dec", "Decrypt");});
    document.getElementById("gm").addEventListener("click", function(){openTab("gm", "Gmail");});
    document.getElementById("m").addEventListener("click", function(){openTab("m", "Misc");});
    document.getElementById("encryptButton").addEventListener("click", function(){encryptText();});
    document.getElementById("copyButton").addEventListener("click", function() {
      copyToClipboard(document.getElementById("resultInput"));
    });
    document.getElementById("decryptButton").addEventListener("click", function(){decryptText();});
  });
  
  /** Switch tabs when user clicks on a tab **/ 
  function openTab(tabId, tabName) {
    var i, x, tablinks;
    console.log(tabName); 
    if (document.getElementById('tabsDescription')){
      document.getElementById('mainTab').removeChild(document.getElementById('tabsDescription')); 
    }
    x = document.getElementsByClassName("tab");
    for (i = 0; i < x.length; i++) {
       x[i].style.display = "none";
    }
    tablinks = document.getElementsByClassName("tablink");
    for (i = 0; i < x.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" w3-orange", "");
    }
    document.getElementById(tabName).style.display = "block";
    document.getElementById(tabId).className += " w3-orange";
  }

  function encryptText() {
    document.getElementById("copyAlert").innerHTML = ""; 
    console.log("entered encrypttext function"); 
    var typePrefix = 'BIOMIO_';
    var type = "encrypt_content";
    var cont = document.getElementById('contentInput').value;
    var userEmail = document.getElementById('fromInput').value.trim();
    var recipEmail = document.getElementById('toInput').value.trim().split(','); 
    console.log(recipEmail); 
    var errorAlert = document.getElementById('errorAlert');
    if (!validateEmail(userEmail)) {
      document.getElementById('fromInput').focus(); 
      errorAlert.innerHTML = "Please only enter one valid email in the FROM box"; 
      return;
    }
    for (i = 0; i < recipEmail.length; i++) {
      recipEmail[i] = recipEmail[i].trim();
      if (!validateEmail(recipEmail[i])) {
        document.getElementById('toInput').focus();
        errorAlert.innerHTML = "In the TO box, remember to only use commas to separate emails. Ensure every email is valid."; 
        return; 
      }
    }
    errorAlert.innerHTML = ""; 
    var data = {
      action: "encrypt_only",
      content: cont,
      account_email: userEmail,
      sender: userEmail,
      recipients: recipEmail,
      composeId: "1",
      encryptObject: 'text'
    }; 
    console.log(data); 
    // chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    //   chrome.tabs.sendMessage(tabs[0].id, {command: typePrefix + type, data: data});  
    // });
    chrome.runtime.sendMessage({command: typePrefix + type, data: data}); 
    chrome.storage.local.get('encrypted_result', function (data) {
      result = data['encrypted_result'];
      console.log(result); 
      document.getElementById('resultInput').value = result;
    });
  }

  chrome.storage.onChanged.addListener(function(changes, namespace) {
     console.log("change recived!");
     console.log(changes["decrypted_result"]); 
     if (changes.hasOwnProperty('decrypted_result') && changes['decrypted_result'].newValue.decryptedResult) {
      document.getElementById('resultDecrypt').innerHTML = changes['decrypted_result'].newValue.decryptedResult; 
      document.getElementById('decryptAlert').innerHTML = ""; 
     } 
     chrome.storage.local.set({decrypted_result: ""}); 
  });

  function decryptText(){
    var typePrefix = 'BIOMIO_';
    var type = "decrypt_content";
    var cont = document.getElementById('contentInputD').value;
    var userEmail = document.getElementById('emailInput').value;
    var errorAlert = document.getElementById('decryptErrorAlert');
    if (!validateEmail(userEmail)) {
      document.getElementById('emailInput').focus(); 
      errorAlert.innerHTML = "Please only enter one valid email in the FROM box"; 
      return;
    }
    if (!validateDecryptBox(cont)) {
      document.getElementById("contentInputD").focus();
      errorAlert.innerHTML = "Please ensure that the input in the decrypt box has the proper header (-----BEGIN PGP MESSAGE-----) and footer (-----END PGP MESSAGE-----).";
      return; 
    }
    errorAlert.innerHTML = ""; 
    var data = {
      action: "decrypt_verify",
      content: cont,
      own_sent_email: false,
      account_email: userEmail
    };
    document.getElementById('decryptAlert').innerHTML = "Please open the Biomio app to provide a probe for authentication within the next 5 minutes."; 

    // send message to background script
    chrome.runtime.sendMessage({command: 'biomio_reset_server_connection', data: {}});
    setTimeout(function() {
      chrome.runtime.sendMessage({command: typePrefix + type, data: data}); 
    }, 2000);
    
  }

  function copyToClipboard(elem) {
    // create hidden text element, if it doesn't already exist
    var targetId = "_hiddenCopyText_";
    var isInput = elem.tagName === "INPUT" || elem.tagName === "TEXTAREA";
    var origSelectionStart, origSelectionEnd;
    if (isInput) {
        // can just use the original source element for the selection and copy
        target = elem;
        origSelectionStart = elem.selectionStart;
        origSelectionEnd = elem.selectionEnd;
    } else {
        // must use a temporary form element for the selection and copy
        target = document.getElementById(targetId);
        if (!target) {
            var target = document.createElement("textarea");
            target.style.position = "absolute";
            target.style.left = "-9999px";
            target.style.top = "0";
            target.id = targetId;
            document.body.appendChild(target);
        }
        target.textContent = elem.textContent;
    }
    // select the content
    var currentFocus = document.activeElement;
    target.focus();
    target.setSelectionRange(0, target.value.length);
    
    // copy the selection
    var succeed;
    try {
        succeed = document.execCommand("copy");
    } catch(e) {
        succeed = false;
    }
    // restore original focus
    if (currentFocus && typeof currentFocus.focus === "function") {
        currentFocus.focus();
    }
    
    if (isInput) {
        // restore prior selection
        elem.setSelectionRange(origSelectionStart, origSelectionEnd);
    } else {
        // clear temporary content
        target.textContent = "";
    }
    document.getElementById("copyAlert").innerHTML = "Copied to clipboard. Paste encrypted text in email."
    return succeed;
  }

  function validateEmail(email) {
    var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(email);
  }

  function validateDecryptBox(cont) {
    return cont.indexOf("-----BEGIN PGP MESSAGE-----") !== -1 && cont.indexOf("-----END PGP MESSAGE-----") !== -1; 
  }


    /**
   * Shows timer for user. Time that user has to provide a probe from his device.
   */
  function calculateTime() {
      var timer = TIME_TO_WAIT_PROBE;
      var biomio_timer = $('.biomio_timer');
      biomio_timer.show();
      showTimer = setInterval(function () {
          timer--;
          if (timer <= 0) {
              chrome.extension.sendRequest({cancel_probe: "We were not able to receive your probe results from server, please try again later."});
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
