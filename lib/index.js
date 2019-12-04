'use strict';
/**
 * logstashHTTP appender sends JSON formatted log events to logstashHTTP receivers.
 */
const util = require('util');
const axios = require('axios');

function wrapErrorsWithInspect(items) {
  return items.map((item) => {
    if ((item instanceof Error) && item.stack) {
      return {
        inspect: function () {
          return `${util.format(item)}\n${item.stack}`;
        }
      };
    }

    return item;
  });
}

function format(logData) {
  return util.format.apply(util, wrapErrorsWithInspect(logData));
}
function b64EncodeUnicode(str) {
  if((typeof Buffer)!="undefined"){
      return new Buffer(str).toString();
   }
  // first we use encodeURIComponent to get percent-encoded UTF-8,
  // then we convert the percent encodings into raw bytes which
  // can be fed into btoa.
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
      function toSolidBytes(match, p1) {
          return String.fromCharCode('0x' + p1);
  }));
}
function logstashHTTPAppender(config) {
  let basicString='';
  let cusHeaders= { 'Content-Type': 'application/x-ndjson' }
  if(config.user){
      var authStr=b64EncodeUnicode(`${config.user}:${config.pass}`);
      basicString=`Basic ${authStr}`;
      cusHeaders['Authorization']=basicString;
  }
  const sender = axios.create({
    baseURL: config.url,
    timeout: config.timeout || 5000,
    headers:cusHeaders,
    withCredentials: true,
  });

  return function log(event) {
    const logstashEvent = [
      {
        index: {
          _index: config.index,
          _type: 'doc',
        },
      },
      {
        message: format(event.data),
        level: event.level.level / 100,
        log_level: event.level.levelStr,
        type: config.logType,
        timestamp: (new Date(event.startTime)).toISOString()
      },
    ];
    let keys = Object.keys(event.context).filter((k) => k.endsWith('_json'))
    keys.forEach((k) => {
        let newKey = k.substring(0, k.length - 5)
        if(event.context[k]){
            logstashEvent[1][newKey] = event.context[k]
        }
        
    })
    const logstashJSON = `${JSON.stringify(logstashEvent[0])}\n${JSON.stringify(logstashEvent[1])}\n`;

    // send to server
    sender.post('', logstashJSON)
      .catch((error) => {
        if (error.response) {
       //   console.error(`log4js.logstashHTTP Appender error posting to ${config.url}: ${error.response.status} - ${error.response.data}`);
          return;
        }
       // console.error(`log4js.logstashHTTP Appender error: ${error.message}`);
      });
  };
}

function configure(config) {
  return logstashHTTPAppender(config);
}

module.exports.configure=configure