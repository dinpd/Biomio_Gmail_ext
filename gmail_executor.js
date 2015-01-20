var gmail = null;
var encryptedFiles = {};
var confirmOn = confirm;
var confirmOff = function () {
    return function () {
        return true;
    }
};
var show_loading;
var show_popup;
var DECRYPT_WAIT_MESSAGE = 'Please wait, we are getting the content of your email to decrypt it....';
var ENCRYPT_WAIT_MESSAGE = 'Please wait, we are encrypting your attachments...';
var initializeGmailJS = function () {
    gmail = Gmail($);
    show_loading = $('#show_loading');
    show_popup = $('#show_popup');
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
                        show_loading.show();
                        show_popup.find('.wait_message').html(ENCRYPT_WAIT_MESSAGE);
                        show_popup.fadeIn(200, function(){
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
                hideBodyErrosShowMessage(ENCRYPT_WAIT_MESSAGE);
                xhr.abort();
            } else if (needToCheck.length && needToCheck.is(':checked')) {
                hideBodyErrosShowMessage("It is required to specify recipients to be able to encrypt the attachment. " +
                "If you don't want to encrypt the files just uncheck 'BioMio encryption' checkbox");
                xhr.abort();
            }

        }
    });

    gmail.observe.on('load_email_menu', function (match) {
        console.log('Menu loaded', match);
        var biomioDecryptButton = $('#biomio_decrypt_button');
        if (biomioDecryptButton.length) {
            var biomioDecryptButtonCopy = biomioDecryptButton.clone();
            biomioDecryptButtonCopy.attr('id', biomioDecryptButton.attr('id') + '_inserted');
            match.append(biomioDecryptButtonCopy);
            biomioDecryptButton.remove();
            biomioDecryptButtonCopy.show();

        }
    });

    gmail.observe.on('view_thread', function (match) {

    });

    gmail.observe.on('view_email', function (emailBodyObj) {
        var emailBody = emailBodyObj.id_element;
        if (emailBody.html().indexOf('BEGIN PGP MESSAGE') != -1) {
            var bioMioAttr = emailBody.attr('class').split(' ');
            $('#biomio_decrypt_button').remove();
            var decryptButton = '<div class="J-N" style="-webkit-user-select: none;display: none;" data-biomio-bodyattr="'
                + bioMioAttr.join('_') + '" id="biomio_decrypt_button" role="menuitem" onclick="decryptMessage(event)"><div class="J-N-Jz">' +
                '<div><div class="cj"><img class="dS J-N-JX" src="images/cleardot.gif" alt>Decrypt message</div>' +
                '</div></div></div></div>';
            emailBody.after(decryptButton);
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

function hideBodyErrosShowMessage(message) {
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

function attachClicked(event) {
    var existingActiveAttach = $('.transparent_area.attach-button');
    if (existingActiveAttach.length) {
        existingActiveAttach.removeClass('active');
    }
    $(event.currentTarget).addClass('active');

}

function decryptMessage(event) {
    event.preventDefault();
    gmail.tools.infobox("Decrypting your message, please wait....");
    show_loading.show();
    show_popup.find('.wait_message').html(DECRYPT_WAIT_MESSAGE);
    show_popup.fadeIn(500);
    $('#progressbar').progressbar({value: 0});
    var currentTarget = $(event.currentTarget);
    var emailBody = $('.' + currentTarget.attr('data-biomio-bodyattr').split('_').join('.'));
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
                        $('#progressbar').progressbar("value", (evt.loaded / total_value) * 100);
                    }, false);
                    return xhr;
                },
                success: function (data) {
                    var emailBodyHtml = $(data).find('div[dir="ltr"]').html().replace(/BioMio v1.0<br>/g, 'BioMio v1.0').split('BioMio v1.0').join('BioMio v1.0<br>');
                    emailBody.html(emailBodyHtml);
                    sendDecryptMessage(currentTarget, emailBody);
                }
            }
        );
    } else {
        sendDecryptMessage(currentTarget, emailBody);
    }

}

function sendDecryptMessage(currentTarget, emailBody) {
    var bioMioAttr = 'biomio_' + currentTarget.attr('data-biomio-bodyattr');
    emailBody.attr('data-biomio', bioMioAttr);
    var emailBodyText = emailBody.html();
    emailBodyText = $.trim(emailBodyText.replace(/<br>/g, '\n'));
    emailBody.html(emailBodyText);
    emailBodyText = emailBody.text();
    var emailParts = emailBodyText.split('#-#-#');
    for (var i = 0; i < emailParts.length; i++) {
        var encryptObject = 'file';
        if (i == 0 && emailParts[i] != 'no_body') {
            encryptObject = 'text';
        }
        var lastItem = i == emailParts.length - 1;
        window.postMessage({
            "type": "decryptMessage",
            "data": {
                action: "decrypt_verify",
                content: emailParts[i],
                biomio_attr: bioMioAttr,
                encryptObject: encryptObject,
                file_name: 'attachment ' + i,
                lastItem: lastItem
            }
        }, '*');
    }
    currentTarget.remove();
}

function sendMessageClicked(event) {
    event.preventDefault();
    var currComposeID = $(event.currentTarget).attr('data-composeId');
    var compose = getComposeByID(currComposeID);
    if (compose) {
        if (encryptRequired(compose)) {
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

function encryptRequired(compose) {
    var hasRecipients = compose.to().length || compose.cc().length || compose.bcc().length;
    var needToCheck = compose.find('#encrypt-body-' + compose.id());
    return needToCheck.length && needToCheck.is(':checked') && hasRecipients;
}

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
    if (data.completedAction) {
        console.log(event);
    }
    if (data.completedAction && (data.completedAction == "encrypt_only")) {
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
                    var attachmentsList = $('#biomio-attachments-' + compose.id());
                    if (!attachmentsList.length) {
                        var attachmentsListEl = '<br><br><div id="biomio-attachments-' + compose.id() + '"><p>Attached and encrypted files:</p><ul></ul></div>';
                        compose.body(compose.body() + attachmentsListEl);
                    }
                    attachmentsList = $('#biomio-attachments-' + compose.id());
                    var fileNameId = data.fileName.split(/\s|\.|\(|\)/).join('-');
                    if (!attachmentsList.find('#' + fileNameId).length) {
                        $(attachmentsList.find('ul')).append('<li id="' + fileNameId + '">' + data.fileName + '</li>');
                    }
                    show_loading.hide();
                    show_popup.fadeOut(500);
                    gmail.tools.infobox("Your attachment was successfully encrypted.");
                } else {
                    if (data.composeId in encryptedFiles) {
                        encryptedComposeFiles = encryptedFiles[data.composeId];
                        var contentToPush = 'no_body';
                        if (content.length) {
                            contentToPush = content;
                        }
                        encryptedComposeFiles.splice(0, 0, contentToPush);
                        content = encryptedComposeFiles.join('#-#-#');
                        delete encryptedFiles[data.composeId];
                        confirm = confirmOff();
                    }
                    compose.body(content);
                    triggerSendButton(compose);
                    confirm = confirmOn;
                }
            }
        }
    } else if (data.completedAction && (data.completedAction == "decrypt_verify")) {
        if (data.biomio_attr && data.biomio_attr.length) {
            var emailBody = $('div[data-biomio="' + data.biomio_attr + '"]');
            if (emailBody) {
                if (data.encryptObject == 'text') {
                    emailBody.html(data.content);
                } else {
                    var emailBodyContent = emailBody.html();
                    var fileParts = data.content.split('##-##');
                    var fileName;
                    var dataContent;
                    if (fileParts.length > 2) {
                        fileName = fileParts[1];
                        dataContent = fileParts[2];
                    } else {
                        fileName = fileParts[0];
                        dataContent = fileParts[1];
                    }
                    var file_ext = fileName.split('.');
                    file_ext = file_ext[file_ext.length - 1];
                    if (dataContent.indexOf('data:') != -1) {
                        var splitDataContent = dataContent.split(';');
                        var dataType = splitDataContent[0].split(':');
                        if (dataType.length > 1) {
                            dataType[1] = 'attachment/' + file_ext;
                        } else {
                            dataType.push('attachment/' + file_ext);
                        }
                        dataType = dataType.join(':');
                        splitDataContent[0] = dataType;
                        dataContent = splitDataContent.join(';');
                    }
                    var linkId = fileName.split(/\s|\./).join('-');
                    var aLink = $(emailBody).find('#' + linkId);
                    if (aLink.length) {
                        aLink.attr('href', aLink.attr('href') + dataContent);
                    } else {
                        emailBodyContent += '<br><a id="' + linkId + '" href="' + dataContent + '" download="' + fileName + '">' + fileName + '</a>';
                        emailBody.html(emailBodyContent);
                    }
                }
                if ('lastItem' in data && data.lastItem) {
                    show_loading.hide();
                    show_popup.fadeOut(500);
                    gmail.tools.infobox('Message successfully decrypted', 5000);
                }
            }
        }
    }
});

function triggerSendButton(compose) {
    compose.find('.T-I.J-J5-Ji[role="button"]').trigger('click');
}

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
        initializeGmailJS();

    } else {
        setTimeout(checkLoaded, 100);
    }
};

checkLoaded();