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
    if (level == LOG_LEVEL.SEVERE || level == LOG_LEVEL.ERROR) {
        console.error(level, message);
    } else {
        var levelColor = getLevelColor(level);
        if (level == LOG_LEVEL.WARNING) {
            console.warn(level, levelColor, message);
        } else if (level == LOG_LEVEL.DEBUG && DEBUG_MODE) {
            console.log(level, levelColor, message);
        } else if (level == LOG_LEVEL.INFO) {
            console.log(level, levelColor, message);
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