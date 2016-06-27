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
    // Our data begins at the first character index preceded by a blank line.
    //var body_begin_index  = data.search(/(\n|\r){2}/) + 2;
    var body_begin_index = 76; 

    // Our data ends right before the checksum line which starts with an "="
    var body_end_index    = data.search(/^\=/m);

    // Both of these indexes need to exist for the file to be readable.
    if (body_begin_index == -1 || body_end_index == -1) {
        alert('This is not a valid ASCII-Armored OpenPGP export file.');
        return false;
    }
    // Pull the body out of the data and strip all newlines from it
    var body = data.substring(body_begin_index, body_end_index);
    var body = body.replace(/(\r\n|\n|\r)/gm, '');

    // Grab the checksum while we're at it...
    var body_checksum = data.substr(body_end_index + 1, 4);
    //var body_checksum = "a7UR"; 
    console.log(body);
    console.log(body_checksum); 

    //var decoded_body = base_64.decode("mQENBFEN6EoBCADChZ+c6Q84tJ+WLTKYfhdN49OTUlxmoZD8cou6Bdi/EKXvpciAydnD+SmlYf4pjAOwEiEsKJ6swLORAam4q0pnW9gAALbclhwDf9J4sLwUkh4F4D9P6TJX2vPEk4WRkudkj2TW3H2Wn1d7fQ3zlwLtK/bC5YeajuAIAk1m5zCtMbeZoYGcFWU+Max2G4Xr1/5JmUzfVtVSlxdJj7SX1FtJ/zj/eWklKNtl05yBWA+NyFpkgkzRDP+oJYBPdNoyS5mqNNIEnIIjDAUiufhGzkk2+865gIOH9X2WWCB5p0EGsR8ZzZA6H379WPca+GTlu5JncEi7lLcg+eQRwxQu9S6XABEBAAG0QEplZmYgTCAoaHR0cDovL3J1YmJpbmdhbGNvaG9saWMuY29tKSA8amVmZkBydWJiaW5nYWxjb2hvbGljLmNvbT6JATgEEwECACIFAlEN6EoCGwMGCwkIBwMCBhUIAgkKCwQWAgMBAh4BAheAAAoJEJmhufkmy7JniVYH/3Mjgo2gDDsc8tTPaIsBbYacB40pMOMX7+KxSQktrUZkGqwJTlGnfBB4R8jz+32dBjX/OmeGYFTl9xFMBx+MuQlHW9Sl0ffV+Gpk9YbebBZaPn7Y5OpinF9e7zuFH7MyI72SIM7S1CvvfP3QrYj7viBitddJ+eW3Vx3ANgpkr8Bj9auHoT043dlfm/xpqozOLwbVM0BADJge0zQvNKGpoZjoHU2mNSSGhWhXAPCRp9wVOCCESxbL+2Wi++ZUQUXO9DIxAQJy6HJfPx+PvBeedGAisfovNwtT0tDfJvyyPnRTKtEzTWiWDYwNUY80A6o/KkmSxSs5OeSh4t08phBIzWu5AQ0EUQ3oSgEIAMZf+w8pVqj/ZUQtacxzDe52kz+HtljJq4ltxulxQtoln5VkP5vWGq3uF1RFBoLVZ0OE/61yZixG8pOPMiGzHWJtidtQk7GxT/Z/b34voeTeruZjpfm3ty14sQvmApaRpjEQaNFTPy7dDiJKqGkD7teb/Mx8rtWJpN60hTiww1cOP5VjBvC82mn6uZ9DU2vJ6VwBTmwYnZMaXLiGRIpEAOqtLag4XwYrHS04H7No3asxSGhlyVN2KnxvlIMwoTZ+bTVaOr2ivCICel1dY2kC5LsfMa04z2Ne7fme+pnGM62ufC+l/T9H58vsw1VFl5vanYmJugtFzxHFHzU3atdbHzEAEQEAAYkBHwQYAQIACQUCUQ3oSgIbDAAKCRCZobn5JsuyZ138CACumdutchMDVE7V8ewhzsOCHgSMQjnmkB0HFCll2RxbhLz6x8SmzcQK107XbHQwFCdFA5v4JgFtwb6b9W9WShemNvC7tNx/loo2C+EiUKA9tURo/rJORu6S1jR79BaaOUUjMsB/jxxF2eRzE86SzgWXj34pYyoqJeMaiLSdXcCNW8eyN1i3gf8XpMlM7Ldv0Bq7vqbU2sDXBQvPDbNyhVIZjqfjTOBJl54NWHYRXlybFaSrXb7Qg/9ac+54TPpgCBTs1kR/HSZDujWE891NqlKGpSN4MDyi3WRL2RVbW0s5+8f8odNJuswIo1tWiNXBHVXs2/eCtlrSbyoTGYj0ErY0");
    var decoded_body = base_64.decode(body); 
    console.log(decoded_body); 

    var decoded_checksum  = base_64.encode(crc24(decoded_body));
    console.log(decoded_checksum); 

if (body_checksum != decoded_checksum) {
    alert('Checksum mismatch! (Expected '+body_checksum+', got '+decoded_checksum+')');
    return false;
}
}

var base_64 = {
    chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',

    encode: function(data) {
        var output = '';
        for (i=0, c=data.length; i<c; i += 3)
        {
            var char1 = data.charCodeAt(i) >> 2;
            var char2 = ((data.charCodeAt(i) & 3) << 4) | data.charCodeAt(i+1) >> 4;
            var char3 = ((data.charCodeAt(i+1) & 15) << 2) | data.charCodeAt(i+2) >> 6;
            var char4 = data.charCodeAt(i+2) & 63;

            output  +=  this.chars.charAt(char1)
                        +   this.chars.charAt(char2)
                        + this.chars.charAt(char3)
                        + this.chars.charAt(char4);
        }
        if (c % 3 == 1)
            output = output.substr(0, output.length - 2) + '==';
        else if (c % 3 == 2)
            output = output.substr(0, output.length - 1) + '=';
        
        return output;
    },

    decode: function(str) {
        var data = '';

        for (i=0, c=str.length; i<c; i += 4)
        {
            var char1 = this.chars.indexOf(str.charAt(i));
            var char2 = this.chars.indexOf(str.charAt(i+1));
            var char3 = this.chars.indexOf(str.charAt(i+2));
            var char4 = this.chars.indexOf(str.charAt(i+3));

            data += String.fromCharCode(char1 << 2 | char2 >> 4);
            if (char3 != -1)
                data += String.fromCharCode((char2 & 15) << 4 | char3 >> 2)
            if (char4 != -1)
                data += String.fromCharCode((char3 & 3) << 6 | char4);
        }
        return data;
    }
}

var crc24 = function(data) {
    var crc = 0xb704ce;
    var len = data.length;
    while (len--) {
        crc ^= (data.charCodeAt((data.length-1) - len)) << 16;
        for (i=0; i<8; i++) {
            crc <<= 1;
            if (crc & 0x1000000)
                crc ^= 0x1864cfb;
        }
    }
    return number_to_binstring(crc, 24);
}

var number_to_binstring = function(bin, bits) {
    bits || (bits = 32);
    var text = Array();
    var i = (bits < 32 && bits > 0 && bits % 8 == 0) ? (bits / 8) : 4;
    while (i--) {
        if (((bin>>(i*8))&255) || text.length) {
            text.push(String.fromCharCode(((bin>>(i*8))&255)))
        }
    }
    return text.join('')
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
