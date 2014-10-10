window.onload = function () {

    var jq = document.createElement('script');
    jq.src = chrome.extension.getURL("jquery-1.11.1.js");
    document.getElementsByTagName('body')[0].appendChild(jq)

    var sm = document.createElement('script');
    sm.src = chrome.extension.getURL("gmail.js");
    document.getElementsByTagName('body')[0].appendChild(sm);

    var gex = document.createElement('script');
    gex.src = chrome.extension.getURL("gmail_executor.js");
    document.getElementsByTagName('body')[0].appendChild(gex);
    var port = chrome.runtime.connect({});
    window.addEventListener("message", function (event) {
        if (event.data.type && (event.data.type == "show_email_address")) {
            port.postMessage({ type: "show_email_address_background", data: event.data.data});
        }
        else if(event.data.type && (event.data.type == "show_email_details")){
            port.postMessage({ type: "show_email_details_background", data: event.data.data});
        }
    }, false);

    //var button = '<input type="checkbox" selected="selected" value="EXAMPLE!" class="aaA aWZ">';
//    $('.T-I.J-J5-Ji.T-I-KE.L3').on('click', function(){
//        console.log('ccc');
//        var tool_bar = $('.aWQ:not([data-biomio])');
//        setTimeout(function(){
//            tool_bar.prepend(button);
//            tool_bar.attr('data-biomio', 'true');
//        }, 1000);
//    });
//    $('.aWQ').elem.prepend(button);
}