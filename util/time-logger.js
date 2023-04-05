
export const END = 'end';

export function TimeLogger(label, timeout = 120 * 1000) {
  console.time(label);

  let timer;

  function logger(...args) {
    if (args?.[0] === END) {
      clearTimeout(timer);
      args.length > 1 && console.timeLog(label, ...args.slice(1));
      console.timeEnd(label);
    } else {
      console.timeLog(label, ...args);
    }
  }

  if (timeout) {
    timer = setTimeout(logger, timeout, `WARNING! ${label} is timed out after ${(timeout / 1000).toFixed(2)} s.`);
  }

  return logger;
}

TimeLogger.END = END;

export default TimeLogger;
