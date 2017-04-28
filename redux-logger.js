/**
 * Get log level string based on supplied params
 *
 * @param {string | function | object} level - console[level]
 * @param {object} action - selected action
 * @param {array} payload - selected payload
 * @param {string} type - log entry type
 *
 * @returns {string} level
 */
function getLogLevel(level, action, payload, type) {
  switch (typeof level) {
    case 'object':
      return typeof level[type] === 'function' ? level[type](...payload) : level[type];
    case 'function':
      return level(action);
    default:
      return level;
  }
}

function defaultTitleFormatter(options) {
  const {
    timestamp,
    duration,
  } = options;

  return (action, time, took) => {
    const parts = ['action'];

    parts.push(`%c${String(action.type)}`);
    if (timestamp) parts.push(`%c@ ${time}`);
    if (duration) parts.push(`%c(in ${took.toFixed(2)} ms)`);

    return parts.join(' ');
  };
}

function printBuffer(buffer, options) {
  const {
    logger,
    actionTransformer,
    titleFormatter = defaultTitleFormatter(options),
    collapsed,
    colors,
    level,
    diff,
  } = options;

  const isUsingDefaultFormatter = typeof options.titleFormatter === 'undefined';

  buffer.forEach((logEntry, key) => {
    const { started, startedTime, action, prevState, error } = logEntry;
    let { took, nextState } = logEntry;
    const nextEntry = buffer[key + 1];

    if (nextEntry) {
      nextState = nextEntry.prevState;
      took = nextEntry.started - started;
    }

    // Message
    const formattedAction = actionTransformer(action);
    const isCollapsed = (typeof collapsed === 'function') ? collapsed(() => nextState, action, logEntry) : collapsed;

    const formattedTime = formatTime(startedTime);
    const titleCSS = colors.title ? `color: ${colors.title(formattedAction)};` : '';
    const headerCSS = ['color: gray; font-weight: lighter;'];
    headerCSS.push(titleCSS);
    if (options.timestamp) headerCSS.push('color: gray; font-weight: lighter;');
    if (options.duration) headerCSS.push('color: gray; font-weight: lighter;');
    const title = titleFormatter(formattedAction, formattedTime, took);

    // Render
    try {
      if (isCollapsed) {
        if (colors.title && isUsingDefaultFormatter) logger.groupCollapsed(`%c ${title}`, ...headerCSS);
        else logger.groupCollapsed(title);
      } else if (colors.title && isUsingDefaultFormatter) {
        logger.group(`%c ${title}`, ...headerCSS);
      } else {
        logger.group(title);
      }
    } catch (e) {
      logger.log(title);
    }

    const prevStateLevel = getLogLevel(level, formattedAction, [prevState], 'prevState');
    const actionLevel = getLogLevel(level, formattedAction, [formattedAction], 'action');
    const errorLevel = getLogLevel(level, formattedAction, [error, prevState], 'error');
    const nextStateLevel = getLogLevel(level, formattedAction, [nextState], 'nextState');

    if (prevStateLevel) {
      if (colors.prevState) logger[prevStateLevel]('%c prev state', `color: ${colors.prevState(prevState)}; font-weight: bold`, prevState);
      else logger[prevStateLevel]('prev state', prevState);
    }

    if (actionLevel) {
      if (colors.action) logger[actionLevel]('%c action    ', `color: ${colors.action(formattedAction)}; font-weight: bold`, formattedAction);
      else logger[actionLevel]('action    ', formattedAction);
    }

    if (error && errorLevel) {
      if (colors.error) logger[errorLevel]('%c error     ', `color: ${colors.error(error, prevState)}; font-weight: bold;`, error);
      else logger[errorLevel]('error     ', error);
    }

    if (nextStateLevel) {
      if (colors.nextState) logger[nextStateLevel]('%c next state', `color: ${colors.nextState(nextState)}; font-weight: bold`, nextState);
      else logger[nextStateLevel]('next state', nextState);
    }

    if (diff) {
      diffLogger(prevState, nextState, logger, isCollapsed);
    }

    try {
      logger.groupEnd();
    } catch (e) {
      logger.log('—— log end ——');
    }
  });
}

const repeat = (str, times) => (new Array(times + 1)).join(str);

const pad = (num, maxLength) => repeat('0', maxLength - num.toString().length) + num;

const formatTime = time => `${pad(time.getHours(), 2)}:${pad(time.getMinutes(), 2)}:${pad(time.getSeconds(), 2)}.${pad(time.getMilliseconds(), 3)}`;

// Use performance API if it's available in order to get better precision
const timer =
(typeof performance !== 'undefined' && performance !== null) && typeof performance.now === 'function' ?
  performance :
  Date;
  
default {
  level: 'log',
  logger: console,
  logErrors: true,
  collapsed: undefined,
  predicate: undefined,
  duration: false,
  timestamp: true,
  stateTransformer: state => state,
  actionTransformer: action => action,
  errorTransformer: error => error,
  colors: {
    title: () => 'inherit',
    prevState: () => '#9E9E9E',
    action: () => '#03A9F4',
    nextState: () => '#4CAF50',
    error: () => '#F20404',
  },
  diff: false,
  diffPredicate: undefined,

  // Deprecated options
  transformer: undefined,
};

/* eslint max-len: ["error", 110, { "ignoreComments": true }] */
/**
 * Creates logger with following options
 *
 * @namespace
 * @param {object} options - options for logger
 * @param {string | function | object} options.level - console[level]
 * @param {boolean} options.duration - print duration of each action?
 * @param {boolean} options.timestamp - print timestamp with each action?
 * @param {object} options.colors - custom colors
 * @param {object} options.logger - implementation of the `console` API
 * @param {boolean} options.logErrors - should errors in action execution be caught, logged, and re-thrown?
 * @param {boolean} options.collapsed - is group collapsed?
 * @param {boolean} options.predicate - condition which resolves logger behavior
 * @param {function} options.stateTransformer - transform state before print
 * @param {function} options.actionTransformer - transform action before print
 * @param {function} options.errorTransformer - transform error before print
 *
 * @returns {function} logger middleware
 */
function createLogger(options = {}) {
  const loggerOptions = {
    ...defaults,
    ...options,
  };

  const {
    logger,
    stateTransformer,
    errorTransformer,
    predicate,
    logErrors,
    diffPredicate,
  } = loggerOptions;

  // Return if 'console' object is not defined
  if (typeof logger === 'undefined') {
    return () => next => action => next(action);
  }

  // Detect if 'createLogger' was passed directly to 'applyMiddleware'.
  if (options.getState && options.dispatch) {
    // eslint-disable-next-line no-console
    console.error(`[redux-logger] redux-logger not installed. Make sure to pass logger instance as middleware:
// Logger with default options
import { logger } from 'redux-logger'
const store = createStore(
  reducer,
  applyMiddleware(logger)
)
// Or you can create your own logger with custom options http://bit.ly/redux-logger-options
import createLogger from 'redux-logger'
const logger = createLogger({
  // ...options
});
const store = createStore(
  reducer,
  applyMiddleware(logger)
)
`);

    return () => next => action => next(action);
  }

  const logBuffer = [];

  return ({ getState }) => next => (action) => {
    // Exit early if predicate function returns 'false'
    if (typeof predicate === 'function' && !predicate(getState, action)) {
      return next(action);
    }

    const logEntry = {};

    logBuffer.push(logEntry);

    logEntry.started = timer.now();
    logEntry.startedTime = new Date();
    logEntry.prevState = stateTransformer(getState());
    logEntry.action = action;

    let returnedValue;
    if (logErrors) {
      try {
        returnedValue = next(action);
      } catch (e) {
        logEntry.error = errorTransformer(e);
      }
    } else {
      returnedValue = next(action);
    }

    logEntry.took = timer.now() - logEntry.started;
    logEntry.nextState = stateTransformer(getState());

    const diff = loggerOptions.diff && typeof diffPredicate === 'function' ?
      diffPredicate(getState, action) :
      loggerOptions.diff;

    printBuffer(logBuffer, { ...loggerOptions, diff });
    logBuffer.length = 0;

    if (logEntry.error) throw logEntry.error;
    return returnedValue;
  };
}

// eslint-disable-next-line consistent-return
const defaultLogger = ({ dispatch, getState } = {}) => {
  if (typeof dispatch === 'function' || typeof getState === 'function') {
    return createLogger()({ dispatch, getState });
  }
    // eslint-disable-next-line no-console
  console.error(`
[redux-logger v3] BREAKING CHANGE
[redux-logger v3] Since 3.0.0 redux-logger exports by default logger with default settings.
[redux-logger v3] Change
[redux-logger v3] import createLogger from 'redux-logger'
[redux-logger v3] to
[redux-logger v3] import { createLogger } from 'redux-logger'
`);
};
