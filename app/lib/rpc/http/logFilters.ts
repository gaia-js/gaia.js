import { IncomingMessage } from "http";
import { sensitivePhone } from "../../string";

export type LOG_DATA = {
  url?: string;
  params?: any;
  res?: IncomingMessage;
  data?: any
};

export function obscureParamsField(fields: string[] | string) {
  return (log: LOG_DATA) => {
    (Array.isArray(fields) ? fields : [fields]).forEach(field => {
      if (log.params && typeof log.params[field] === 'string') {
        log.params[field] = `***`;
      }
    });
  };
}

export function obscureParamsPhone(field: string) {
  return (log: LOG_DATA) => {
    if (log.params && typeof log.params[field] === 'string') {
      log.params[field] = sensitivePhone(log.params[field]);
    }
  };
}
