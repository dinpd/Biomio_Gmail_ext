var initializeGmailJS = function() {
    var gmail = Gmail($);

    var user_email = gmail.get.user_email();
    if (user_email) {
        console.log('user_email', user_email);
        window.postMessage({"type": "show_email_address", "data": user_email}, '*');
    }

    gmail.observe.before('send_message', function (url, body, data, xhr) {
       // console.log('url', url);
       //console.log('body', body);
        console.log('data', data);
        console.log('xhr', xhr);
        var needToCheck = $('#biomio-composeID-' + data.composeid);
        if(needToCheck.length && needToCheck.is(':checked')) {
//            console.log('CHECKED!');
//            xhr.xhrParams.body_params.body = "BODY REPLACEMENT!";
//            xhr.xhrParams.set("", "");
//            console.log(xhr);
            //TODO change email body.
        }

    });
    gmail.observe.on('compose', function(compose, type){
        console.log(compose);
        var button = '<input type="checkbox" selected="selected" id="biomio-composeID-' + compose.id() + '" title="BioMio encryption" class="aaA aWZ">';
        compose.find('.aWQ').prepend(button);
    });

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

        // your code
        initializeGmailJS();

    } else {
        setTimeout(checkLoaded, 100);
    }
}

checkLoaded();