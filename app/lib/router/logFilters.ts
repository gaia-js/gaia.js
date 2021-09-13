import { LOG_DATA } from "../../extend/context";
import { sensitivePhone } from "../string";

export function removeBodyField(fields: string[]) {
  return (log: LOG_DATA) => {
    fields.forEach(field => {
      delete log.request.post[field];
    });
  }
}

export function obscureQueryField(fields: string[] | string) {
  return (log: LOG_DATA) => {
    (Array.isArray(fields) ? fields : [fields]).forEach(field => {
      log.request.url = log.request.url.replace(new RegExp(`${field}=[^\&]+`), `${field}=***`);

      if (log.request.query[field]) {
        log.request.query[field] = `***`;
      }
    });
  };
}

export function obscureBodyField(fields: string[] | string) {
  return (log: LOG_DATA) => {
    (Array.isArray(fields) ? fields : [fields]).forEach(field => {
      if (log.request.post[field]) {
        log.request.post[field] = `***`;
      }
    });
  };
}

export function obscureBodyPhone(field: string) {
  return (log: LOG_DATA) => {
    if (log.request.post[field] && typeof log.request.post[field] === 'string') {
      log.request.post[field] = sensitivePhone(log.request.post[field]);
    }
  };
}
