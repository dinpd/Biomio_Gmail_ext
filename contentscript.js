window.onload = function () {

    var overlay_element = document.createElement('div');
    overlay_element.className  = "black_overlay";
    overlay_element.id = "show_loading";
    var popup_element = document.createElement('div');
    popup_element.className  = "white_content";
    popup_element.id = 'show_popup';
    var progressbar_el = document.createElement('div');
    progressbar_el.id = "progressbar";
    popup_element.appendChild(progressbar_el);
    var wait_message = document.createElement('p');
    wait_message.className  = "wait_message";
    popup_element.appendChild(wait_message);
    document.getElementsByTagName('body')[0].appendChild(overlay_element);
    document.getElementsByTagName('body')[0].appendChild(popup_element);

    var jq = document.createElement('script');
    jq.src = chrome.extension.getURL("jquery-1.11.1.js");
    document.getElementsByTagName('body')[0].appendChild(jq);

    var sm = document.createElement('script');
    sm.src = chrome.extension.getURL("gmail.js");
    document.getElementsByTagName('body')[0].appendChild(sm);

    var jq_ui = document.createElement('script');
    jq_ui.src = '//code.jquery.com/ui/1.11.2/jquery-ui.js';
    document.getElementsByTagName('body')[0].appendChild(jq_ui);

    var jq_ui_css = document.createElement('link');
    jq_ui_css.setAttribute('rel', 'stylesheet');
    jq_ui_css.setAttribute('href', '//code.jquery.com/ui/1.11.2/themes/smoothness/jquery-ui.css');
    document.getElementsByTagName('body')[0].appendChild(jq_ui_css);

    var st_mch = document.createElement('script');
    st_mch.src = chrome.extension.getURL("state-machine.js");
    document.getElementsByTagName('body')[0].appendChild(st_mch);

    var gex = document.createElement('script');
    gex.src = chrome.extension.getURL("gmail_executor.js");
    document.getElementsByTagName('body')[0].appendChild(gex);
    var port = chrome.runtime.connect({});
    window.addEventListener("message", function (event) {
        if (event.data.type && (event.data.type == "show_email_address")) {
            port.postMessage({ type: "show_email_address_background", data: event.data.data});
        }
        else if (event.data.type && (event.data.type == "show_email_details")) {
            port.postMessage({ type: "show_email_details_background", data: event.data.data});
        } else if (event.data.type && (event.data.type == "test_encrypt_sign")) {
            console.log(event.data.data);
            port.postMessage(event.data.data);
        } else if (event.data.type && (event.data.type == "encrypted_body")) {
            console.log('contentscript - encrypted_body');
        } else if (event.data.type && (event.data.type == "decrypt_message")) {
            console.log(event.data.data);
            port.postMessage(event.data.data);
        }
    }, false);
    port.onMessage.addListener(function (message) {
        console.log(message);
        window.postMessage(message, '*');
    });
};