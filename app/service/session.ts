import { v4 as uuidv4 } from 'uuid';

import BaseService from '../lib/BaseService';
import Session from '../object/session';

/**
 * @deprecated 可直接使用ctx.session，支持自动load和commit
 */
export default class SessionService extends BaseService {
  // tslint:disable-next-line: no-reserved-keywords
  async get(sessionId?: string) {
    let sid = sessionId || this.ctx.cookies.get('sess_id', { signed: false, encrypt: false }) || this.ctx.get('x-sess-id');

    if (sid) {
      const session = await this.service.cache.redis.get(sid);
      if (session) {
        return this.ctx.object.Session.create(session);
      }
    } else {
      sid = uuidv4();
    }

    const session = this.ctx.object.Session.create({ id: sid });

    // await this.service.cache.redis.set(sid, session, { expires: 3600 });

    this.ctx.setCookie('sess_id', sid, { overwrite: true });

    return session;
  }

  async save(session: Session) {
    this.ctx.setCookie('sess_id', session.id, { overwrite: true });
    // this.ctx.get('origin') && (this.ctx.get('origin') !== this.ctx.origin) && this.ctx.secure && this.ctx.setCookie('sess_id', session.id, { overwrite: false, sameSite: 'none' });

    await this.service.cache.redis.set(session.id, session.getProperties(), { expires: 3600 });
  }
}
