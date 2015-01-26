var gmail,
    encryptedFiles,
    confirmOn,
    confirmOff,
    showLoading,
    showPopup,
    showTimer,
    DECRYPT_WAIT_MESSAGE,
    FILE_ENCRYPT_WAIT_MESSAGE,
    FILE_ENCRYPT_SUCCESS_MESSAGE,
    DECRYPT_SUCCESS_MESSAGE,
    NO_MESSAGE,
    EMAIL_PARTS_SEPARATOR,
    ENCRYPT_WAIT_MESSAGE,
    ENCRYPT_SUCCESS_MESSAGE,
    TIME_TO_WAIT_PROBE, //seconds
    PROBE_WAIT_MESSAGE,
    CANCEL_PROBE_MESSAGE_TYPE,
    PROBE_ERROR_MESSAGE;

/**
 * Initializes variables with default values.
 */
function setupDefaults() {
    gmail = Gmail($);
    encryptedFiles = {};
    confirmOn = confirm;
    confirmOff = function () {
        return function () {
            return true;
        }
    };
    showLoading = $('#biomio_show_loading');
    showPopup = $('#biomio_show_popup');
    DECRYPT_WAIT_MESSAGE = 'Please wait, we are getting the content of your email to decrypt it....';
    ENCRYPT_WAIT_MESSAGE = 'Please wait, we are encrypting your message...';
    ENCRYPT_SUCCESS_MESSAGE = 'Your message was successfully decrypted.';
    FILE_ENCRYPT_WAIT_MESSAGE = 'Please wait, we are encrypting your attachments...';
    FILE_ENCRYPT_SUCCESS_MESSAGE = "Your attachment was successfully encrypted.";
    DECRYPT_SUCCESS_MESSAGE = 'Message successfully decrypted';
    NO_MESSAGE = '[NO_MESSAGE]';
    EMAIL_PARTS_SEPARATOR = '#-#-#';
    TIME_TO_WAIT_PROBE = 300;
    PROBE_WAIT_MESSAGE = 'To proceed with encryption it is required to identify yourself on Biom.io service. Server will wait for your probe for 5 minutes.';
    CANCEL_PROBE_MESSAGE_TYPE = 'cancel_probe';
    PROBE_ERROR_MESSAGE = "Your message wasn't encrypted because we were not able to identify you in time.";

    $('#biomio_ok_button').on('click', function (e) {
        e.preventDefault();
        showHideInfoPopup('', true);
    });

    $(document).on('click', '#biomio_decrypt_button', function (e) {
        e.preventDefault();
        decryptMessage(e);
    });
}

/**
 * Initializes Gmail JS events.
 */
var initializeGmailJSEvents = function () {
    gmail.observe.before("upload_attachment", function (file, xhr) {
        var activeAttachBtn = $('.transparent_area.attach-button.active');
        var fileName = file.name;
        if (activeAttachBtn.length) {
            var composeId = activeAttachBtn.attr('data-composeId');
            var compose = getComposeByID(composeId);
            var needToCheck = compose.find('#encrypt-body-' + compose.id());
            if (encryptRequired(compose)) {
                var reader = new FileReader();
                reader.onload = (function (compose, fileName) {
                    return function (e) {
                        e.preventDefault();
                        showLoading.show();
                        showPopup.find('.biomio_wait_message').html(FILE_ENCRYPT_WAIT_MESSAGE);
                        showPopup.fadeIn(200, function () {
                            var dataURL = reader.result;
                            var recipients_arr = compose.to().concat(compose.cc()).concat(compose.bcc());
                            window.postMessage({
                                "type": "encrypt_sign",
                                "data": {
                                    action: "encrypt_only",
                                    content: dataURL,
                                    currentUser: gmail.get.user_email(),
                                    recipients: recipients_arr,
                                    composeId: compose.id(),
                                    encryptObject: 'file',
                                    fileName: fileName
                                }
                            }, '*');
                        });
                    };
                })(compose, fileName);
                reader.readAsDataURL(file);
                hideBodyErrorsShowMessage(FILE_ENCRYPT_WAIT_MESSAGE);
                xhr.abort();
            } else if (needToCheck.length && needToCheck.is(':checked')) {
                hideBodyErrorsShowMessage("It is required to specify recipients to be able to encrypt the attachment. " +
                "If you don't want to encrypt the files just uncheck 'BioMio encryption' checkbox");
                xhr.abort();
            }

        }
    });

    gmail.observe.on('view_thread', function (match) {

    });

    gmail.observe.on('view_email', function (emailBodyObj) {
        var emailBody = emailBodyObj.id_element;
        if (emailBody.html().indexOf('BEGIN PGP MESSAGE') != -1) {
            var bioMioAttr = emailBody.attr('class').split(' ');
            $('#biomio_decrypt_button').remove();
            emailBody.find('div[dir="ltr"]').prepend('<div id="biomio_decrypt_element"><input type="button" value="Decrypt" id="biomio_decrypt_button" data-biomio-bodyattr="'
            + bioMioAttr.join('_') + '"><br><br></div>');
        }
    });

    gmail.observe.on('compose', function (compose, type) {
        var button = '<input type="checkbox" checked id="encrypt-body-' + compose.id() + '" title="BioMio encryption" class="aaA aWZ">';
        var transparentDiv = $('<div class="transparent_area" data-composeId="' + compose.id() + '" onclick="sendMessageClicked(event)"></div>');
        var attachmentDiv = $('<span class="transparent_area attach-button" data-composeId="' + compose.id() + '" onclick="attachClicked(event)"></span>');
        compose.find('.aWQ').prepend(button);
        setTimeout(function () {
            var attachButton = compose.find('.J-Z-I[command="Files"]');
            if (attachButton.length) {
                $(attachButton).append(attachmentDiv);
                $(attachButton).attr('attach-composeId', compose.id());
            }
        }, 500);
        var sendButton = compose.find('.T-I.J-J5-Ji[role="button"]');
        if (sendButton.length) {
            transparentDiv.insertBefore($(sendButton[0]));
        }
    });

};

/**
 * Hides gmail error messages and shows given message inside gmail info box.
 * @param {string=} message to show.
 */
function hideBodyErrorsShowMessage(message) {
    setTimeout(function () {
        var gm_errors;
        var i = 0;
        while (true) {
            i++;
            gm_errors = $('.dL');
            if (gm_errors.length) {
                gm_errors.remove();
                gmail.tools.infobox(message);
                break;
            }
        }
    }, 1);
}

/**
 * Handles event when attach file button is clicked.
 * @param event
 */
function attachClicked(event) {
    var existingActiveAttach = $('.transparent_area.attach-button');
    if (existingActiveAttach.length) {
        existingActiveAttach.removeClass('active');
    }
    $(event.currentTarget).addClass('active');

}

/**
 * Show/Hides info popup with given message to user. Also blocks entire page till action is completed.
 * @param {string=} infoMessage to show inside the popup
 * @param {boolean} hide - false if is not specified.
 */
function showHideInfoPopup(infoMessage, hide) {
    $('#biomio_timer').hide();
    $('#biomio_ok_button').hide();
    if (hide) {
        showLoading.hide();
        showPopup.fadeOut(500);
    } else {
        showLoading.show();
        showPopup.find('.biomio_wait_message').html(infoMessage);
        showPopup.fadeIn(500);
    }
    gmail.tools.infobox(infoMessage, 5000);
}

/**
 * handles event when decrypt button is clicked.
 * @param event
 */
function decryptMessage(event) {
    event.preventDefault();
    showHideInfoPopup(DECRYPT_WAIT_MESSAGE);
    $('#biomio_progressbar').progressbar({value: 0});
    var currentTarget = $(event.currentTarget);
    var emailBodyAttr = currentTarget.attr('data-biomio-bodyattr');
    currentTarget.parent().remove();
    var emailBody = $('.' + emailBodyAttr.split('_').join('.'));
    var viewEntireEmailLink = emailBody.find('a[href*="?ui"]');
    if (viewEntireEmailLink.length) {
        $.ajax(
            {
                type: 'GET',
                url: viewEntireEmailLink.attr('href'),
                xhr: function () {
                    var xhr = new window.XMLHttpRequest();
                    xhr.addEventListener("progress", function (evt) {
                        var total_value = xhr.getResponseHeader('content-length') * 1.5;
                        $('#biomio_progressbar').progressbar("value", (evt.loaded / total_value) * 100);
                    }, false);
                    return xhr;
                },
                success: function (data) {
                    var emailBodyHtml = $(data).find('div[dir="ltr"]').html().replace(/BioMio v1.0<br>/g, 'BioMio v1.0').split('BioMio v1.0').join('BioMio v1.0<br>');
                    emailBody.html(emailBodyHtml);
                    sendDecryptMessage(emailBodyAttr, emailBody);
                }
            }
        );
    } else {
        sendDecryptMessage(emailBodyAttr, emailBody);
    }

}

/**
 * Sends content to contentscript for decryption.
 * @param currentTarget
 * @param {jQuery.element=} emailBody of the current email.
 */
function sendDecryptMessage(emailBodyAttr, emailBody) {
    var bioMioAttr = 'biomio_' + emailBodyAttr;
    emailBody.attr('data-biomio', bioMioAttr);
    var emailBodyText = emailBody.html();
    emailBodyText = $.trim(emailBodyText.replace(/<br>/g, '\n'));
    emailBody.html(emailBodyText);
    emailBodyText = emailBody.text();
    window.postMessage({
        "type": "decryptMessage",
        "data": {
            action: "decrypt_verify",
            content: emailBodyText,
            biomio_attr: bioMioAttr
        }
    }, '*');
}

/**
 * Handles event when 'Send' email button is clicked.
 * @param event
 */
function sendMessageClicked(event) {
    event.preventDefault();
    var currComposeID = $(event.currentTarget).attr('data-composeId');
    var compose = getComposeByID(currComposeID);
    if (compose) {
        if (encryptRequired(compose)) {
            showHideInfoPopup(ENCRYPT_WAIT_MESSAGE);
            var recipients_arr = compose.to().concat(compose.cc()).concat(compose.bcc());
            $('#biomio-attachments-' + compose.id()).remove();
            window.postMessage({
                "type": "encrypt_sign",
                "data": {
                    action: "encrypt_only",
                    content: compose.body(),
                    currentUser: gmail.get.user_email(),
                    recipients: recipients_arr,
                    composeId: compose.id(),
                    encryptObject: 'text'
                }
            }, '*');
        } else {
            triggerSendButton(compose);
        }
    }
}

/**
 * Checks whether encryption is required.
 * @param {gmail.dom.compose=} compose - current compose window opened by user.
 * @returns {boolean}
 */
function encryptRequired(compose) {
    var hasRecipients = compose.to().length || compose.cc().length || compose.bcc().length;
    var needToCheck = compose.find('#encrypt-body-' + compose.id());
    return needToCheck.length && needToCheck.is(':checked') && hasRecipients;
}

/**
 * Returns Opened compose window by given compose ID.
 * @param {string=} composeId of the required compose window.
 * @returns {gmail.dom.compose} or {null} if not found.
 */
function getComposeByID(composeId) {
    var availableComposes = gmail.dom.composes();
    for (var i = 0; i < availableComposes.length; i++) {
        var compose = availableComposes[i];
        if (compose.id() == composeId) {
            return compose;
        }
    }
    return null;
}

/**
 * Window events listener. Required to listen for messages from contentscript.
 */
window.addEventListener("message", function (event) {
    var data = event.data;
    if (data.completedAction) {
        console.log(event);
    }
    if (data.hasOwnProperty('error')) {
        showHideInfoPopup(data['error'], true);
        alert(data['error']);
    } else if (data.hasOwnProperty('showTimer')) {
        if (data['showTimer']) {
            showHideInfoPopup(PROBE_WAIT_MESSAGE);
            calculateTime();
        } else {
            clearInterval(showTimer);
            showHideInfoPopup(ENCRYPT_WAIT_MESSAGE);
        }
    } else if (data.completedAction && (data.completedAction == "encrypt_only")) {
        if (data.encryptObject && data.encryptObject.length) {
            var compose = getComposeByID(data.composeId);
            if (compose) {
                var content = $.trim(data.content).replace(/(?:\r\n|\r|\n)/g, '<br>');
                var encryptedComposeFiles;
                if (data.encryptObject == 'file') {
                    if (data.composeId in encryptedFiles) {
                        encryptedComposeFiles = encryptedFiles[data.composeId];
                        encryptedComposeFiles.push(data.content);

                    } else {
                        encryptedComposeFiles = [data.content];
                    }
                    encryptedFiles[data.composeId] = encryptedComposeFiles;
                    updateEncryptedAttachmentsList(compose, data.fileName);
                    showHideInfoPopup(FILE_ENCRYPT_SUCCESS_MESSAGE, true);
                } else {
                    if (data.composeId in encryptedFiles) {
                        encryptedComposeFiles = encryptedFiles[data.composeId];
                        var contentToPush = NO_MESSAGE;
                        if (content.length) {
                            contentToPush = content;
                        }
                        encryptedComposeFiles.splice(0, 0, contentToPush);
                        content = encryptedComposeFiles.join(EMAIL_PARTS_SEPARATOR);
                        delete encryptedFiles[data.composeId];
                        confirm = confirmOff();
                        $('#biomio-attachments-' + compose.id()).remove();
                    }
                    compose.body(content);
                    triggerSendButton(compose);
                    showHideInfoPopup(ENCRYPT_SUCCESS_MESSAGE, true);
                    confirm = confirmOn;
                }
            }
        }
    } else if (data.hasOwnProperty('completedAction') && data.completedAction == "decrypt_verify") {
        var emailBody = $('div[data-biomio="' + data.biomio_attr + '"]');
        if (emailBody) {
            emailBody.html(data.content);
            if (data.hasOwnProperty('decryptedFiles')) {
                var decryptedFiles = data.decryptedFiles;
                emailBody.html(emailBody.html() + '<br><p>Email Attachments</p>');
                for (var i = 0; i < decryptedFiles.length; i++) {
                    updateDecryptedAttachmentsList(emailBody, emailBody.html(), decryptedFiles[i]);
                }
            }
            showHideInfoPopup(DECRYPT_SUCCESS_MESSAGE, true);
        }
    }
});

/**
 * Generates/Updates decrypted attachments list.
 * @param {jQuery.elem=} emailBody of the current email
 * @param {string=} emailBodyContent html of the current email.
 * @param {Object=} fileObject with attached file data.
 */
function updateDecryptedAttachmentsList(emailBody, emailBodyContent, fileObject) {
    var linkId = fileObject.fileName.split(/\s|\./).join('-');
    emailBodyContent += '<br><a id="' + linkId + '" href="' + fileObject.decryptedFile + '" download="' + fileObject.fileName + '">' + fileObject.fileName + '</a>';
    emailBody.html(emailBodyContent);
}

/**
 * Generates/Updates encrypted attachments list.
 * @param {gmail.dom.compose=} compose object of the current compose window.
 * @param {string=} fileName of the attached encrypted file.
 */
function updateEncryptedAttachmentsList(compose, fileName) {
    var attachmentListId = 'biomio-attachments-' + compose.id();
    var attachmentList = $('#' + attachmentListId);
    if (!attachmentList.length) {
        var attachmentsListEl = '<br><br><div id="' + attachmentListId + '"><p>Attached and encrypted files:</p><ul></ul></div>';
        compose.body(compose.body() + attachmentsListEl);
    }
    attachmentList = $('#' + attachmentListId);
    var fileNameId = fileName.split(/\s|\.|\(|\)/).join('-');
    if (!attachmentList.find('#' + fileNameId).length) {
        $(attachmentList.find('ul')).append('<li id="' + fileNameId + '">' + fileName + '</li>');

    }
}

/**
 * Sends the email by clicking 'Send' button.
 * @param {gmail.dom.compose=} compose object of the current compose window.
 */
function triggerSendButton(compose) {
    compose.find('.T-I.J-J5-Ji[role="button"]').trigger('click');
}

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
            sendContentMessage(CANCEL_PROBE_MESSAGE_TYPE, {});
            biomio_timer.text('');
            showHideInfoPopup(PROBE_ERROR_MESSAGE);
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
 * Sends window message to content script.
 * @param {String=} type of the message
 * @param {Object=} message data object.
 */
function sendContentMessage(type, message) {
    console.log('Type:', type);
    console.log('Message:', message);
    window.postMessage({type: type, data: message}, '*');
}

/**
 * Checks when jQuery is loaded and starts script initialization.
 */
var checkLoaded = function () {
    if (window.jQuery) {
        $.fn.onAvailable = function (e) {
            var t = this.selector;
            var n = this;
            if (this.length > 0) e.call(this);
            else {
                var r = setInterval(function () {
                    if ($(t).length > 0) {
                        e.call($(t));
                        clearInterval(r);
                    }
                }, 50);
            }
        };
        setupDefaults();
        initializeGmailJSEvents();

    } else {
        setTimeout(checkLoaded, 100);
    }
};

checkLoaded();