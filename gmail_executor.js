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
    CANCEL_PROBE_MESSAGE_TYPE,
    PROBE_ERROR_MESSAGE,
    BIOMIO_INFO_MESSAGE,
    CONFIRMATION_SEND_MESSAGE,
    CONFIRMATION_ATTACH_MESSAGE;

/**
 * Initializes variables with default values.
 */
function setupDefaults() {
    gmail = Gmail($);
    sendContentMessage('persist_gmail_user', {current_gmail_user_biomio: '<' + gmail.get.user_email() + '>'});
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
    CANCEL_PROBE_MESSAGE_TYPE = 'cancel_probe';
    PROBE_ERROR_MESSAGE = "Your message wasn't encrypted because we were not able to identify you in time.";
    BIOMIO_INFO_MESSAGE = "This message is encrypted with BIOMIO biometric authentication. If you don’t have a BIOMIO" +
    " account yet, get it <a href='' target='_blank'>here</a>";
    CONFIRMATION_ATTACH_MESSAGE = "You are about to encrypt your attachment, if you proceed all next attachments " +
    "will be encrypted. Do you want to proceed?";
    CONFIRMATION_SEND_MESSAGE = "You're sending an encrypted message. Do you want to proceed?";

    $('#biomio_ok_button, #close_popup').on('click', function (e) {
        e.preventDefault();
        if ($(e.currentTarget).attr('data-composeId')) {
            manageEncryptionCheckbox($(e.currentTarget).attr('data-composeId'), true);
        }
        showHideInfoPopup('', true);
    });

    $('#biomio_yes_button, #biomio_no_button').on('click', function (e) {
        e.preventDefault();
        confirmationClicked(e);
    });


    $(document).on('click', '#biomio_decrypt_button', function (e) {
        e.preventDefault();
        decryptMessage(e);
    });

    $(document).on('click', '#biomio_send_button', function (e) {
        e.preventDefault();
        sendMessageClicked(e);
    });
    $(document).on('click', 'div #attach-button-id', function (e) {
        attachClicked(e);
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
            var isConfirmed = isEncryptionConfirmed(composeId);
            var compose = getComposeByID(composeId);
            var needToCheck = compose.find('#encrypt-body-' + compose.id());
            var encryptionRequired = encryptRequired(compose);
            if (isConfirmed && encryptionRequired) {
                var reader = new FileReader();
                reader.onload = (function (compose, fileName) {
                    return function (e) {
                        e.preventDefault();
                        showLoading.show();
                        showPopup.find('.biomio_wait_message').html(FILE_ENCRYPT_WAIT_MESSAGE);
                        showPopup.fadeIn(200, function () {
                            var dataURL = reader.result;
                            var recipients_arr = compose.to().concat(compose.cc()).concat(compose.bcc());
                            sendContentMessage("encrypt_sign", {
                                action: "encrypt_only",
                                content: dataURL,
                                currentUser: gmail.get.user_email(),
                                recipients: recipients_arr,
                                composeId: compose.id(),
                                encryptObject: 'file',
                                fileName: fileName
                            });
                        });
                    };
                })(compose, fileName);
                reader.readAsDataURL(file);
                hideBodyErrorsShowMessage(FILE_ENCRYPT_WAIT_MESSAGE);
                xhr.abort();
            } else if (isConfirmed && needToCheck.length && needToCheck.is(':checked')) {
                hideBodyErrorsShowMessage("It is required to specify recipients to be able to encrypt the attachment. " +
                "If you don't want to encrypt the files just uncheck 'Encrypt' checkbox");
                xhr.abort();
            } else if (!isConfirmed && encryptionRequired) {

                showConfirmationPopup(CONFIRMATION_ATTACH_MESSAGE, composeId, '#' + activeAttachBtn.attr('id'),
                    "Disable Encryption");
                hideBodyErrorsShowMessage("");
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
            + bioMioAttr.join('_') + '"><br><p>' + BIOMIO_INFO_MESSAGE + '</p><br><br></div>');
        }
    });

    gmail.observe.on('compose', function (compose, type) {
        var button = '<input type="checkbox" checked id="encrypt-body-' + compose.id() + '" title="Encrypt" class="aaA aWZ">';
        var transparentDiv = $('<div class="transparent_area" id="biomio_send_button" data-composeId="' + compose.id() + '"></div>');
        var attachmentDiv = $('<span class="transparent_area attach-button" id="attach-button-id" data-composeId="' + compose.id() + '" onclick="attachClicked(event)"></span>');
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
 * @param {string} message to show.
 */
function hideBodyErrorsShowMessage(message) {
    setTimeout(function () {
        var gm_errors;
        while (true) {
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
 * @param {string} infoMessage to show inside the popup
 * @param {boolean=} hide - false if is not specified.
 */
function showHideInfoPopup(infoMessage, hide) {
    $('#biomio_timer').hide();
    $('#biomio_ok_button').hide();
    $('#biomio_yes_button').hide();
    $('#biomio_no_button').hide();
    $('#close_popup').hide();
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
    var emailBodyAttr = $(event.currentTarget).attr('data-biomio-bodyattr');
    var emailBody = $('.' + emailBodyAttr.split('_').join('.'));
    emailBody.attr('data-biomio', 'biomio_' + emailBodyAttr);
    emailBody = emailBody.clone();
    emailBody.find('#biomio_decrypt_element').remove();
    var viewEntireEmailLink = emailBody.find('a[href*="?ui"]');
    if (viewEntireEmailLink.length) {
        $.ajax(
            {
                type: 'GET',
                url: viewEntireEmailLink.attr('href'),
                //xhr: function () {
                //    var xhr = new window.XMLHttpRequest();
                //    xhr.addEventListener("progress", function (evt) {
                //        var total_value = xhr.getResponseHeader('content-length') * 1.5;
                //        $('#biomio_progressbar').progressbar("value", (evt.loaded / total_value) * 100);
                //    }, false);
                //    return xhr;
                //},
                success: function (data) {
                    var emailBodyHtml = $(data).find('div[dir="ltr"]').html().replace(/BioMio v1.0<br>/g, 'BioMio v1.0').split('BioMio v1.0').join('BioMio v1.0<br>');
                    emailBody.html(emailBodyHtml);
                    sendDecryptMessage(emailBody);
                }
            }
        );
    } else {
        sendDecryptMessage(emailBody);
    }

}

/**
 * Sends content to contentscript for decryption.
 * @param {jQuery} emailBody of the current email.
 */
function sendDecryptMessage(emailBody) {
    var emailBodyText = $(emailBody).html();
    emailBodyText = $.trim(emailBodyText.replace(/<br>/g, '\n'));
    emailBody.html(emailBodyText);
    emailBodyText = $(emailBody).text();
    $(emailBody).remove();
    sendContentMessage("decryptMessage", {
        action: "decrypt_verify",
        content: emailBodyText,
        biomio_attr: $(emailBody).attr('data-biomio'),
        currentUser: gmail.get.user_email()
    });
}

/**
 * Handles event when 'Send' email button is clicked.
 * @param event
 */
function sendMessageClicked(event) {
    var currComposeID = $(event.currentTarget).attr('data-composeId');
    var compose = getComposeByID(currComposeID);
    if (compose) {
        var isConfirmed = isEncryptionConfirmed(currComposeID);
        var encryptionRequired = encryptRequired(compose);
        if (isConfirmed && encryptionRequired) {
            showHideInfoPopup(ENCRYPT_WAIT_MESSAGE);
            var recipients_arr = compose.to().concat(compose.cc()).concat(compose.bcc());
            $('#biomio-attachments-' + compose.id()).remove();
            sendContentMessage("encrypt_sign", {
                action: "encrypt_only",
                content: compose.body(),
                currentUser: gmail.get.user_email(),
                recipients: recipients_arr,
                composeId: compose.id(),
                encryptObject: 'text'
            });
        } else if (!isConfirmed && encryptionRequired) {
            showConfirmationPopup(CONFIRMATION_SEND_MESSAGE, currComposeID, '#' + $(event.currentTarget).attr('id'),
                'Send Unencrypted');
        } else {
            confirm = confirmOff();
            triggerSendButton(compose);
            confirm = confirmOn;
        }
    }
}

/**
 * Checks whether user confirmed that he wants to send encrypted emails.
 * @param {string} composeID
 * @returns {boolean}
 */
function isEncryptionConfirmed(composeID) {
    var encCheckBoxDisabled = $('#encrypt-body-' + composeID).attr('disabled');
    return typeof encCheckBoxDisabled != "undefined" && encCheckBoxDisabled;
}

/**
 * Shows confirmation popup to user.
 * @param {string} message to show to user.
 * @param {string} currComposeID
 * @param {string} elementToClick - element that should be clicked after Yes/No buttons clicked.
 * @param {string} noButtonValue - value to set as "No" button caption.
 */
function showConfirmationPopup(message, currComposeID, elementToClick, noButtonValue) {
    showHideInfoPopup(message);
    $('#close_popup').show();
    var yesButton = $('#biomio_yes_button');
    var noButton = $('#biomio_no_button');
    noButton.attr('value', noButtonValue);
    yesButton.attr('data-click-element', elementToClick);
    yesButton.attr('data-composeId', currComposeID);
    yesButton.show();
    noButton.attr('data-click-element', elementToClick);
    noButton.attr('data-composeId', currComposeID);
    noButton.show();
}

/**
 * Handles event when confirmation Yes/No buttons were clicked.
 * @param e
 */
function confirmationClicked(e) {
    var currentTarget = $(e.currentTarget);
    var currComposeID = currentTarget.attr('data-composeId');
    manageEncryptionCheckbox(currComposeID, currentTarget.attr('id') == 'biomio_no_button', true);
    showHideInfoPopup('', true);
    var elementToClick = currentTarget.attr('data-click-element');
    elementToClick = $(elementToClick + '[data-composeid="' + currComposeID + '"]');
    elementToClick.trigger('click');
}

/**
 * Disabled encryption checkbox and if required un-checks it.
 * @param {string} composeID
 * @param {boolean=false} unCheck
 * @param {boolean=false} disabled
 */
function manageEncryptionCheckbox(composeID, unCheck, disabled) {
    var encryptionCheckbox = $('#encrypt-body-' + composeID);
    if (unCheck) {
        encryptionCheckbox.attr('checked', false);
    }
    if (disabled) {
        encryptionCheckbox.attr('disabled', true);
    } else {
        encryptionCheckbox.removeAttr('disabled');
    }

}

/**
 * Checks whether encryption is required.
 * @param {gmail.dom.compose} compose - current compose window opened by user.
 * @returns {boolean}
 */
function encryptRequired(compose) {
    var hasRecipients = compose.to().length || compose.cc().length || compose.bcc().length;
    var needToCheck = compose.find('#encrypt-body-' + compose.id());
    return needToCheck.length && needToCheck.is(':checked') && hasRecipients;
}

/**
 * Returns Opened compose window by given compose ID.
 * @param {string} composeId of the required compose window.
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
    if (data.hasOwnProperty('error')) {
        showHideInfoPopup(data['error'], false);
        clearInterval(showTimer);
        var biomioOkButton = $('#biomio_ok_button');
        if (data.hasOwnProperty('composeId')) {
            biomioOkButton.attr('data-composeId', data['composeId']);
        }
        biomioOkButton.show();
    } else if (data.hasOwnProperty('showTimer')) {
        if (data['showTimer']) {
            showHideInfoPopup(data['msg']);
            calculateTime(data['timeout']);
        } else {
            clearInterval(showTimer);
            if (data.hasOwnProperty('msg')) {
                showHideInfoPopup(data['msg']);
            } else {
                showHideInfoPopup(ENCRYPT_WAIT_MESSAGE);
            }
        }
    } else if (data.hasOwnProperty('completedAction') && (data['completedAction'] == "encrypt_only")) {
        if (data.hasOwnProperty('encryptObject') && data['encryptObject'].length) {
            var compose = getComposeByID(data['composeId']);
            if (compose) {
                var content = $.trim(data['content']).replace(/(?:\r\n|\r|\n)/g, '<br>');
                var encryptedComposeFiles;
                if (data['encryptObject'] == 'file') {
                    if (data['composeId'] in encryptedFiles) {
                        encryptedComposeFiles = encryptedFiles[data['composeId']];
                        encryptedComposeFiles.push(data['content']);

                    } else {
                        encryptedComposeFiles = [data['content']];
                    }
                    encryptedFiles[data['composeId']] = encryptedComposeFiles;
                    updateEncryptedAttachmentsList(compose, data['fileName']);
                    showHideInfoPopup(FILE_ENCRYPT_SUCCESS_MESSAGE, true);
                } else {
                    if (data['composeId'] in encryptedFiles) {
                        encryptedComposeFiles = encryptedFiles[data['composeId']];
                        var contentToPush = NO_MESSAGE;
                        if (content.length) {
                            contentToPush = content;
                        }
                        encryptedComposeFiles.splice(0, 0, contentToPush);
                        content = encryptedComposeFiles.join(EMAIL_PARTS_SEPARATOR);
                        delete encryptedFiles[data['composeId']];
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
    } else if (data.hasOwnProperty('completedAction') && data['completedAction'] == "decrypt_verify") {
        var emailBody = $('div[data-biomio="' + data['biomio_attr'] + '"]');
        if (emailBody) {
            emailBody.html(data['content']);
            if (data.hasOwnProperty('decryptedFiles')) {
                var decryptedFiles = data['decryptedFiles'];
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
 * @param {jQuery.elem} emailBody of the current email
 * @param {string} emailBodyContent html of the current email.
 * @param {Object} fileObject with attached file data.
 */
function updateDecryptedAttachmentsList(emailBody, emailBodyContent, fileObject) {
    var linkId = fileObject.fileName.split(/\s|\./).join('-');
    emailBodyContent += '<br><a id="' + linkId + '" href="' + fileObject.decryptedFile + '" download="' + fileObject.fileName + '">' + fileObject.fileName + '</a>';
    emailBody.html(emailBodyContent);
}

/**
 * Generates/Updates encrypted attachments list.
 * @param {gmail.dom.compose} compose object of the current compose window.
 * @param {string} fileName of the attached encrypted file.
 */
function updateEncryptedAttachmentsList(compose, fileName) {
    var attachmentListId = 'biomio-attachments-' + compose.id();
    var attachmentListIdSelector = '#' + attachmentListId;
    var attachmentList = $(attachmentListIdSelector);
    if (!attachmentList.length) {
        var attachmentsListEl = '<br><br><div id="' + attachmentListId + '"><p>Attached and encrypted files:</p><ul></ul></div>';
        compose.body(compose.body() + attachmentsListEl);
    }
    attachmentList = $(attachmentListIdSelector);
    var fileNameId = fileName.split(/\s|\.|\(|\)/).join('-');
    if (!attachmentList.find('#' + fileNameId).length) {
        $(attachmentList.find('ul')).append('<li id="' + fileNameId + '">' + fileName + '</li>');

    }
}

/**
 * Sends the email by clicking 'Send' button.
 * @param {gmail.dom.compose} compose object of the current compose window.
 */
function triggerSendButton(compose) {
    compose.find('.T-I.J-J5-Ji[role="button"]').trigger('click');
}

/**
 * Shows timer for user. Time that user has to provide a probe from his device.
 */
function calculateTime(timeout) {
    var biomio_timer = $('#biomio_timer');
    biomio_timer.show();
    showTimer = setInterval(function () {
        timeout--;
        if (timeout <= 0) {
            sendContentMessage(CANCEL_PROBE_MESSAGE_TYPE, {});
            biomio_timer.text('');
            showHideInfoPopup(PROBE_ERROR_MESSAGE);
            $('#biomio_ok_button').show();
            biomio_timer.show();
            clearInterval(showTimer);
        }
        var minutes = Math.floor((timeout %= 3600) / 60);
        var seconds = timeout % 60;
        biomio_timer.text((minutes < 10 ? '0' + minutes : minutes) + ' : ' + (seconds < 10 ? '0' + seconds : seconds));
    }, 1000);
}

/**
 * Sends window message to content script.
 * @param {string} type of the message
 * @param {Object} message data object.
 */
function sendContentMessage(type, message) {
    var typePrefix = 'BIOMIO_';
    window.postMessage({type: typePrefix + type, data: message}, '*');
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
        $('#biomio_show_loading').hide();
    } else {
        setTimeout(checkLoaded, 100);
    }
};

checkLoaded();