var gmail,
    encryptedFiles,
    confirmOn,
    confirmOff,
    showLoading,
    showPopup,
    showTimer,
    compose_email_errors,
    file_parts_progress,
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
    showLoading = $('#biomio_show_loading');
    try {
        gmail = Gmail($);
    } catch (e) {
        if (e.message.indexOf('GLOBALS') != -1) {
            console.log(e.message);
            showLoading.hide();
            return;
        } else if (e.message == 'Gmail is not defined') {

            window.location.reload();
        }
        console.error(e);
        showLoading.hide();
        return;
    }
    sendContentMessage('persist_gmail_user', {current_gmail_user_biomio: '<' + gmail.get.user_email() + '>'});
    encryptedFiles = {};
    confirmOn = confirm;
    confirmOff = function () {
        return function () {
            return true;
        }
    };
    showPopup = $('#biomio_show_popup');
    compose_email_errors = {};
    file_parts_progress = {};
    DECRYPT_WAIT_MESSAGE = 'Please wait, we are decrypting your message...';
    ENCRYPT_WAIT_MESSAGE = 'Please wait, we are encrypting your message...';
    ENCRYPT_SUCCESS_MESSAGE = 'Your message was successfully encrypted.';
    FILE_ENCRYPT_WAIT_MESSAGE = 'Please wait, we are encrypting your attachments...';
    FILE_ENCRYPT_SUCCESS_MESSAGE = "Your attachment was successfully encrypted.";
    DECRYPT_SUCCESS_MESSAGE = 'Message successfully decrypted';
    NO_MESSAGE = '[NO_MESSAGE]';
    EMAIL_PARTS_SEPARATOR = '#-#-#';
    CANCEL_PROBE_MESSAGE_TYPE = 'cancel_probe';
    PROBE_ERROR_MESSAGE = "Your message wasn't decrypted because we were not able to identify you in time.";
    BIOMIO_INFO_MESSAGE = '<div style="font-family:\'Helvetica Neue\';font-size:14px">' +
    '<div style="display: none !important;">biomio_encryption</div>' +
    '<div><b>This message is encrypted</b></div>' +
    '<div><span style="font-size:11px">' +
    '<span style="font-family:arial,sans-serif">This message is encrypted and protected with BIOMIO ' +
    'password-less&nbsp;multi-factor authentication.</span></span></div>' +
    '<div style="font-family:\'Helvetica Neue\';font-size:14px">' +
    '<span style="font-size:11px">The sender of this message wants this communication to be protected ' +
    'for yours and their benefit as regular email is inherently insecure and lacks privacy.</span></div>' +
    '<div style="font-family:\'Helvetica Neue\';font-size:14px">' +
    '<span style="font-size:11px"><br></span></div>' +
    '<div style="font-family:\'Helvetica Neue\';font-size:14px">' +
    '<span style="font-size:11px"><span style="font-family:arial,sans-serif">If you don’t have a BIOMIO ' +
    'account yet, you will need to register here -&nbsp;</span>' +
    '<a href="https://biom.io/#emailprotector" target="_blank">https://biom.io/#<wbr>emailprotector</a></span></div>' +
    '<div style="font-family:\'Helvetica Neue\';font-size:14px">' +
    '<span style="font-size:11px">Once set up, you will be able to decrypt and ' +
    'encrypt messages quickly and without typing any passwords.</span></div>' +
    '<div style="font-family:\'Helvetica Neue\';font-size:14px"></div></div>';
    CONFIRMATION_ATTACH_MESSAGE = "You are about to encrypt your attachment, if you proceed all next attachments " +
    "will be encrypted. Do you want to proceed?";
    CONFIRMATION_SEND_MESSAGE = "You're sending an encrypted message. Do you want to proceed?";

    $('#biomio_ok_button, #bio_close_popup').on('click', function (e) {
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

    $('#biomio_cancel_button').on('click', function (e) {
        e.preventDefault();
        clearInterval(showTimer);
        sendContentMessage(CANCEL_PROBE_MESSAGE_TYPE, {account_email: gmail.get.user_email()});
        $('#biomio_timer').text('');
        showHideInfoPopup('', true);
    });


    $(document).on('click', '#biomio_decrypt_button', function (e) {
        e.preventDefault();
        decryptMessage(e);
    });

    $(document).on('click', '.bio-enc-btn', function (e) {
        e.preventDefault();
        $(e.currentTarget).toggleClass('down');
    });

    $(document).on('click', '#biomio_send_button', function (e) {
        e.preventDefault();
        sendMessageClicked(e);
    });
    $(document).on('click', 'div #attach-button-id', function (e) {
        attachClicked(e);
    });

    initializeGmailJSEvents();
    showLoading.hide();

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
                var unique_file_id = generate_file_id();
                var reader = new FileReader();
                reader.onload = (function (compose, fileName) {
                    return function (e) {
                        e.preventDefault();
                        showLoading.show();
                        showPopup.find('.biomio_wait_message').html(FILE_ENCRYPT_WAIT_MESSAGE);
                        showPopup.fadeIn(200, function () {
                            var dataURL = reader.result;
                            var recipients_arr = compose.recipients({
                                type: 'to',
                                flat: true
                            }).concat(compose.recipients({
                                type: 'cc',
                                flat: true
                            })).concat(compose.recipients({type: 'bcc', flat: true}));
                            sendContentMessage("encrypt_sign", {
                                action: "encrypt_only",
                                content: dataURL,
                                account_email: compose.from(),
                                recipients: recipients_arr,
                                composeId: compose.id(),
                                encryptObject: 'file',
                                fileName: fileName,
                                unique_file_id: unique_file_id
                            });
                        });
                    };
                })(compose, fileName);
                reader.readAsDataURL(file);
                hideBodyErrorsShowMessage(FILE_ENCRYPT_WAIT_MESSAGE);
                show_file_progress_bar(fileName, unique_file_id);
                xhr.abort();
            } else if (isConfirmed && needToCheck.length && needToCheck.hasClass('down')) {
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
        var email_id = emailBodyObj.id;
        var biomio_encryption = emailBody.find('div:contains("biomio_encryption"):last');
        if (biomio_encryption.length) {
            biomio_encryption = biomio_encryption.parent();
            var bioMioAttr = emailBody.attr('class').split(' ');
            $('#biomio_decrypt_button').remove();
            $('<div id="biomio_decrypt_element">' + biomio_encryption.html() +
            '<br>' + '<input type="button" value="Decrypt" id="biomio_decrypt_button" data-biomio-bodyattr="'
            + bioMioAttr.join('_') + '" data-email-id="' + email_id + '" data-current-page="' +
            gmail.get.current_page() + '"><br><br></div>').insertBefore(biomio_encryption);
            biomio_encryption.remove();
        }
    });

    gmail.observe.on('compose', function (compose, type) {
        var button = '<div class="bio-enc-btn down" type="checkbox" id="encrypt-body-' + compose.id() + '" title="Encrypt" class="aaA aWZ"></div>';
        var transparentDiv = $('<div class="transparent_area" id="biomio_send_button" data-composeId="' + compose.id() + '"></div>');
        var attachmentDiv = $('<span class="transparent_area attach-button" id="attach-button-id" data-composeId="' + compose.id() + '" onclick="attachClicked(event)"></span>');
        setTimeout(function () {
            compose.find('.a8X.gU > div:first-child').append(button);
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

function show_file_progress_bar(file_name, unique_file_id) {
    var progress_el = '<div class="progress-container" id="progress-container-id-' + unique_file_id + '">' +
        '<div class="progress-label">Processed ' + '<span id="progress-value-' + unique_file_id +
        '">0</span>% of ' + file_name + '</div>' +
        '<div class="progress-indicator">' +
        '<div class="progress-bar" id="progress-bar-id-' + unique_file_id + '"></div></div></div>';
    $(progress_el).insertAfter('.biomio_wait_message');
}

function show_download_spinner(text_to_show, remove) {
    if (!remove) {
        var spinner_el = '<div class="progress-container">' +
            '<div class="progress-label progress-spinner">' + text_to_show + '</div>' +
            '<div class="spinner-loader"></div>' +
            '</div>';
        $(spinner_el).insertAfter('.biomio_wait_message');
    } else {
        $('.progress-container').remove();
    }
}

function generate_file_id() {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
    }

    return s4() + s4();
}

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
    $('#biomio_cancel_button').hide();
    $('#bio_close_popup').hide();
    $('#biomio_error_emails_list').hide();
    $('.progress-container').remove();
    showPopup.find('#bio_bottom_message').hide();
    if (hide) {
        showLoading.hide();
        showPopup.fadeOut(500);
    } else {
        showLoading.show();
        var wait_msg = showPopup.find('.biomio_wait_message');
        wait_msg.html(infoMessage);
        wait_msg.show();
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
    var target = $(event.currentTarget);
    var email_source = gmail.get.email_source(target.attr('data-email-id'));
    var current_user = gmail.get.user_email();
    var is_in_sent = target.attr('data-current-page') == 'sent';
    var start_text = 'X-Gmail-Fetch-Info:';
    if (is_in_sent) {
        start_text = 'From:';
    }
    var start_index = email_source.indexOf(start_text);
    if (start_index != -1) {
        var last_text = 'Delivered-To:';
        if (is_in_sent) {
            last_text = 'To:';
        }
        var last_index = email_source.indexOf(last_text, start_index);
        var pop_account_data = email_source.substring(start_index + start_text.length, last_index).trim();
        pop_account_data = pop_account_data.split(' ');
        for (var i = 0; i < pop_account_data.length; i++) {
            if (pop_account_data[i].indexOf('@') != -1) {
                current_user = parse_recipients([pop_account_data[i].trim()])[0];
                break;
            }
        }
    }
    showHideInfoPopup(DECRYPT_WAIT_MESSAGE);
    var emailBodyAttr = target.attr('data-biomio-bodyattr');
    var emailBody = $('.' + emailBodyAttr.split('_').join('.'));
    emailBody.attr('data-biomio', 'biomio_' + emailBodyAttr);
    emailBody = emailBody.clone();
    emailBody.find('#biomio_decrypt_element').remove();
    var viewEntireEmailLink = emailBody.find('a[href*="?ui"]');
    show_file_progress_bar('decryption', 'biomio_' + emailBodyAttr);
    if (viewEntireEmailLink.length) {
        show_download_spinner('', true);
        show_download_spinner('Downloading the content of your email...', false);
        setTimeout(function () {
            var request = $.ajax({type: 'GET', url: viewEntireEmailLink.attr('href'), async: false});
            show_download_spinner('', true);
            var email_body_el = $(request.responseText).find('div[dir="ltr"]');
            if (!email_body_el.length) {
                email_body_el = $(request.responseText).find('div.maincontent table.message tr table');
            }
            var emailBodyHtml = email_body_el.html().replace(/BioMio v1.0<br>/g, 'BioMio v1.0').split('BioMio v1.0').join('BioMio v1.0<br>');
            emailBody.html(emailBodyHtml);
            sendDecryptMessage(emailBody, current_user, is_in_sent);
        }, 500);
        //$.ajax(
        //    {
        //        type: 'GET',
        //        url: viewEntireEmailLink.attr('href'),
        //        success: function (data) {
        //
        //        }
        //    }
        //);
    } else {
        sendDecryptMessage(emailBody, current_user, is_in_sent);
    }

}

/**
 * Sends content to contentscript for decryption.
 * @param {jQuery} emailBody of the current email.
 * @param {string} delivered_to receiver address.
 * @param {boolean} is_in_sent indicates wether user tries to decrypt message from his sent box.
 */
function sendDecryptMessage(emailBody, delivered_to, is_in_sent) {
    var emailBodyText = $(emailBody).html();
    //emailBodyText = $.trim(emailBodyText.replace(/<br>\n/g, '<br>'));
    //emailBodyText = $.trim(emailBodyText.replace(/<br>\n/g, '<br>'));
    //emailBodyText = $.trim(emailBodyText.replace(/<br>\n/g, '<br>'));
    emailBodyText = $.trim(emailBodyText.replace(/<br>/g, '\n'));
    if (emailBodyText.indexOf('\n\n\n\n') != -1) {
        var email_parts = emailBodyText.split('#-#-#');
        email_parts[0] = $.trim(email_parts[0].replace(/\n\n\n\n/g, '<br><br>'));
        email_parts[0] = $.trim(email_parts[0].replace(/\n\n/g, '<br>'));
        email_parts[0] = $.trim(email_parts[0].replace(/<br>/g, '\n'));
        if (email_parts.length > 1) {
            var file_parts = email_parts[1].split('#--#');
            for (var i = 0; i < file_parts.length; i++) {
                file_parts[i] = $.trim(file_parts[i].replace(/<br>\n/g, '<br>'));
                file_parts[i] = $.trim(file_parts[i].replace(/<br>/g, '\n'));
                file_parts[i] = $.trim(file_parts[i].replace(/\n\n/g, '\n'));
                file_parts[i] = $.trim(file_parts[i].replace(/ =/g, '\n='));
                var start_text = 'BioMio v1.0';
                var start_index = file_parts[i].indexOf(start_text) + start_text.length;
                var last_text = ' -----END PGP';
                var last_index = file_parts[i].indexOf(last_text);
                var proper_header = "-----BEGIN PGP MESSAGE-----\nCharset: UTF-8\nVersion: BioMio v1.0\n";
                var proper_footer = "\n-----END PGP MESSAGE-----";
                file_parts[i] = proper_header + file_parts[i].substring(start_index, last_index) + proper_footer;
            }
            email_parts[1] = file_parts.join('#--#');
        }
        emailBodyText = email_parts.join('#-#-#');
    }
    emailBody.html(emailBodyText);
    emailBodyText = $(emailBody).text();
    $(emailBody).remove();
    sendContentMessage("decryptMessage", {
        action: "decrypt_verify",
        content: emailBodyText,
        own_sent_email: is_in_sent,
        biomio_attr: $(emailBody).attr('data-biomio'),
        account_email: delivered_to
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
            var recipients_arr = compose.recipients({type: 'to', flat: true}).concat(compose.recipients({
                type: 'cc',
                flat: true
            })).concat(compose.recipients({type: 'bcc', flat: true}));
            $('#biomio-attachments-' + compose.id()).remove();
            sendContentMessage("encrypt_sign", {
                action: "encrypt_only",
                content: compose.body(),
                account_email: compose.from(),
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
    var encCheckBoxDisabled = $('#encrypt-body-' + composeID).hasClass('disabled');
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
    $('#bio_close_popup').show();
    var yesButton = $('#biomio_yes_button');
    var noButton = $('#biomio_no_button');
    noButton.text(noButtonValue);
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
        // encryptionCheckbox.attr('checked', false);
        encryptionCheckbox.removeClass('down');
    }
    if (disabled) {
        encryptionCheckbox.addClass('disabled');
    } else {
        encryptionCheckbox.removeClass('disabled');
    }

}

/**
 * Checks whether encryption is required.
 * @param {gmail.dom.compose} compose - current compose window opened by user.
 * @returns {boolean}
 */
function encryptRequired(compose) {
    var hasRecipients = compose.recipients({type: 'to', flat: true}).length || compose.recipients({
            type: 'cc',
            flat: true
        }).length || compose.recipients({type: 'bcc', flat: true}).length;
    var needToCheck = compose.find('#encrypt-body-' + compose.id());
    return needToCheck.length && needToCheck.hasClass('down') && hasRecipients;
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


window.addEventListener("message", function (event) {
    var data = event.data;
    var biomioOkButton = $('#biomio_ok_button');
    if (data.hasOwnProperty('error')) {
        showHideInfoPopup(data['error'], false);
        clearInterval(showTimer);
        if (data.hasOwnProperty('composeId')) {
            biomioOkButton.attr('data-composeId', data['composeId']);
        }
        biomioOkButton.show();
    } else if (data.hasOwnProperty('show_email_errors')) {
        show_email_errors(data['show_email_errors']);
        biomioOkButton.show();
    } else if (data.hasOwnProperty('showTimer')) {
        if (data['showTimer']) {
            calculateTime(data['timeout'], data['msg']);
        } else {
            clearInterval(showTimer);
            if (data.hasOwnProperty('msg')) {
                showHideInfoPopup(data['msg']);
            } else {
                showHideInfoPopup(DECRYPT_WAIT_MESSAGE);
            }
        }
    } else if (data.hasOwnProperty('file_parts_count')) {
        file_parts_progress[data.unique_file_id] = {total: data.file_parts_count, current: 0};
        if (data.unique_file_id.indexOf('biomio_') != -1) {
            showHideInfoPopup(DECRYPT_WAIT_MESSAGE, false);
            show_file_progress_bar('your attachments.', data.unique_file_id);
        }
    } else if (data.hasOwnProperty('processed_part')) {
        var current_data = file_parts_progress[data.processed_part];
        current_data.current = current_data.current + 1;
        var completed_percents = Math.round((current_data.current * 100) / current_data.total);
        $('#progress-value-' + data.processed_part).text(completed_percents);
        $('#progress-bar-id-' + data.processed_part).css('width', completed_percents + '%');
        if (completed_percents == 100) {
            delete file_parts_progress[data.processed_part];
            setTimeout(function () {
                $('#progress-container-id-' + data.processed_part).fadeOut(100);
            }, 700);
        }
    } else if (data.hasOwnProperty('completedAction') && (data['completedAction'] == "encrypt_only")) {
        if (data.hasOwnProperty('encryptObject') && data['encryptObject'].length) {
            var compose = getComposeByID(data['composeId']);
            if (compose) {
                var content = BIOMIO_INFO_MESSAGE + $.trim(data['content']).replace(/(?:\r\n|\r|\n)/g, '<br>');
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
                    setTimeout(function () {
                        if ($('.progress-container:visible').length == 0) {
                            showHideInfoPopup(FILE_ENCRYPT_SUCCESS_MESSAGE, true);
                        }
                    }, 2000)
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
                    var show_message = true;
                    if (compose_email_errors.hasOwnProperty(compose.id())) {
                        show_message = false;
                        var emails_to_remove = compose_email_errors[compose.id()];
                        var current_recipients = compose.recipients({
                            type: 'to',
                            flat: true
                        });
                        if (current_recipients.length > 0) {
                            var existing_els = compose.find('.vR');
                            for (var el = 0; el < existing_els.length; el++) {
                                if ($(existing_els[el]).find('input[name=to]').length > 0) {
                                    $(existing_els[el]).remove();
                                }
                            }
                            current_recipients = parse_recipients(current_recipients);
                            current_recipients = current_recipients.filter(function (e1) {
                                return emails_to_remove.indexOf(e1) < 0;
                            });
                            if (current_recipients.length > 0) {
                                compose.to(current_recipients.join());
                            } else {
                                compose.to('');
                            }
                        }
                        current_recipients = compose.recipients({
                            type: 'cc',
                            flat: true
                        });
                        if (current_recipients.length > 0) {
                            existing_els = compose.find('.vR');
                            for (var el = 0; el < existing_els.length; el++) {
                                if ($(existing_els[el]).find('input[name=cc]').length > 0) {
                                    $(existing_els[el]).remove();
                                }
                            }
                            current_recipients = parse_recipients(current_recipients);
                            current_recipients = current_recipients.filter(function (e1) {
                                return emails_to_remove.indexOf(e1) < 0;
                            });
                            if (current_recipients.length > 0) {
                                compose.cc(current_recipients.join());
                            } else {
                                compose.cc('');
                            }
                        }
                        current_recipients = compose.recipients({
                            type: 'bcc',
                            flat: true
                        });
                        if (current_recipients.length > 0) {
                            existing_els = compose.find('.vR');
                            for (var el = 0; el < existing_els.length; el++) {
                                if ($(existing_els[el]).find('input[name=bcc]').length > 0) {
                                    $(existing_els[el]).remove();
                                }
                            }
                            current_recipients = parse_recipients(current_recipients);
                            current_recipients = current_recipients.filter(function (e1) {
                                return emails_to_remove.indexOf(e1) < 0;
                            });
                            if (current_recipients.length > 0) {
                                compose.bcc(current_recipients.join());
                            } else {
                                compose.bcc('');
                            }
                        }
                        delete compose_email_errors[compose.id()];
                    }
                    triggerSendButton(compose);
                    if (show_message) {
                        showHideInfoPopup(ENCRYPT_SUCCESS_MESSAGE, true);
                    }
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
function calculateTime(timeout, message) {
    if (showTimer) {
        clearInterval(showTimer);
    }
    $('#biomio_ok_button').hide();
    $('#biomio_yes_button').hide();
    $('#biomio_no_button').hide();
    $('#bio_close_popup').hide();
    $('#biomio_error_emails_list').hide();
    $('.progress-container').remove();
    showLoading.show();
    showPopup.find('.biomio_wait_message').hide();
    var bottom_msg = showPopup.find('#bio_bottom_message');
    bottom_msg.html(message);
    bottom_msg.show();
    showPopup.fadeIn(500);
    var biomio_timer = $('#biomio_timer');
    biomio_timer.show();
    var cancel_button = $('#biomio_cancel_button');
    cancel_button.show();
    showTimer = setInterval(function () {
        timeout--;
        if (timeout <= 0) {
            sendContentMessage(CANCEL_PROBE_MESSAGE_TYPE, {account_email: gmail.get.user_email()});
            biomio_timer.text('');
            biomio_timer.hide();
            bottom_msg.html(PROBE_ERROR_MESSAGE);
            cancel_button.hide();
            $('#biomio_ok_button').show();
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
    console.log('Sending message:', message);
    window.postMessage({type: typePrefix + type, data: message}, '*');
}


function show_email_errors(email_errors_data) {
    manageEncryptionCheckbox(email_errors_data.compose_id, false, false);
    showHideInfoPopup('Unfortunately we were not able to send encrypted email to the following addresses:', false);
    var error_emails_list_ul = $('#biomio_error_emails_list');
    error_emails_list_ul.empty();
    var email_errors = email_errors_data.emails.split(',,,');
    var emails_with_errors = [];
    for (var i = 0; i < email_errors.length; i++) {
        var email_errors_json = email_errors[i].replace(/'/g, '"');
        email_errors_json = JSON.parse(email_errors_json);
        emails_with_errors.push(email_errors_json.email);
        error_emails_list_ul.append('<li>' + email_errors_json.email + ' - ' + email_errors_json.error + '</li>');
    }
    compose_email_errors[email_errors_data.compose_id] = emails_with_errors;
    error_emails_list_ul.show();
}

function parse_recipients(recipients) {
    for (var i = 0; i < recipients.length; i++) {
        var recipient = recipients[i].split(' ');
        recipient = recipient[recipient.length - 1];
        recipient = recipient.replace(/</g, '');
        recipient = recipient.replace(/>/g, '');
        recipients[i] = recipient;
    }
    return recipients
}


/**
 * Checks when jQuery is loaded and starts script initialization.
 */
var checkLoaded = function () {
    if (window.jQuery && window.Gmail) {
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
    } else {
        setTimeout(checkLoaded, 100);
    }
};

checkLoaded();