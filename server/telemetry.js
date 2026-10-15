import * as Sentry from '@sentry/node';
export function createTelemetry(config){
  if(config.sentryDsn)Sentry.init({dsn:config.sentryDsn,environment:config.production?'production':'development',tracesSampleRate:1,sendDefaultPii:false,
    beforeSend(event){delete event.request;delete event.user;delete event.breadcrumbs;return event;},
    beforeSendSpan(span){if(span.data){for(const key of Object.keys(span.data)){if(/prompt|message|input\.value|output\.value|response\.text|instructions|tool\.input|tool\.output|request\.body/i.test(key))delete span.data[key];}}return span;}
  });
  return {traced:(op,name,fn)=>config.sentryDsn?Sentry.startSpan({op,name},fn):fn(null),
    captureError(error){if(config.sentryDsn)Sentry.captureException(new Error(`ScopeNote operation failed: ${error?.name||'Error'}`));},
    async close(){if(config.sentryDsn)await Sentry.close(2000);}};
}
