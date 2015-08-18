LOG_LEVEL = {
    SEVERE: 'SEVERE',
    DEBUG: '%c DEBUG',
    WARNING: '%c WARNING',
    INFO: '%c INFO',
    ERROR: 'ERROR'
};

var DEBUG_MODE = true;

/**
 * Logs given message according to given log TYPE.
 * @param {string} level
 * @param {(string|Object)} message
 */
function log(level, message) {
    var currentdate = new Date();
    var date = currentdate.getDate();
    date = date < 10 ? '0' + date : date;
    var month = currentdate.getMonth() + 1;
    month = month < 10 ? '0' + month : month;
    var hours = currentdate.getHours();
    hours = hours < 10 ? '0' + hours : hours;
    var minutes = currentdate.getMinutes();
    minutes = minutes < 10 ? '0' + minutes : minutes;
    var seconds = currentdate.getSeconds();
    seconds = seconds < 10 ? '0' + seconds : seconds;
    var dateTimeStr = date + "/" + month + "/" + currentdate.getFullYear() + " @ " + hours + ":" + minutes + ":" + seconds;
    var levelTime = level + ' | ' + dateTimeStr;
    if (level == LOG_LEVEL.SEVERE || level == LOG_LEVEL.ERROR) {
        console.error(levelTime, message);
        saveErrorLog(levelTime, message);
    } else {
        var levelColor = getLevelColor(level);
        if (level == LOG_LEVEL.WARNING) {
            console.warn(levelTime, levelColor, message);
        } else if (level == LOG_LEVEL.DEBUG && DEBUG_MODE) {
            console.log(levelTime, levelColor, message);
        } else if (level == LOG_LEVEL.INFO) {
            console.log(levelTime, levelColor, message);
        }
    }
}

/**
 * Returns css color string accroding to given log level.
 * @param {string} level
 * @returns {string}
 */
function getLevelColor(level) {
    if (level == LOG_LEVEL.DEBUG) {
        return 'color: #0000FF';
    } else if (level == LOG_LEVEL.WARNING) {
        return 'color: #FF9900';
    } else if (level == LOG_LEVEL.INFO) {
        return 'color: #00CC00';
    }
    return '';
}

function saveErrorLog(level, message) {
    chrome.storage.local.get('last_biomio_errors', function (data) {
        var currentErrors = data['last_biomio_errors']
        if (currentErrors) {
            while (currentErrors.length >= 5) {
                currentErrors.shift();
            }
        } else {
            currentErrors = [];
        }
        if (message instanceof Object) {
            message = JSON.stringify(message);
        }
        currentErrors.push(level + ' : ' + message);
        chrome.storage.local.set({'last_biomio_errors': currentErrors});
    });
}