import { IncomingMessage } from "http";
import { sensitivePhone } from "../../string";

export type LOG_DATA = {
  service: string;
  method: string;
  params: any[];
  res?: IncomingMessage;
  data?: any
};

export function obscureParamsField(fields: number[] | number) {
  return (log: LOG_DATA) => {
    log.params && (Array.isArray(fields) ? fields : [fields]).forEach(field => {
      if (typeof log.params[field] === 'string') {
        log.params[field] = `***`;
      }
    });
  };
}

export function obscureParamsPhone(field: number) {
  return (log: LOG_DATA) => {
    if (typeof log.params[field] === 'string') {
      log.params[field] = sensitivePhone(log.params[field]);
    }
  };
}
