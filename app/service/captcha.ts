import * as gm from 'gm';
import BaseService from '../lib/BaseService';
import { getRandomStr } from '../lib/string';

interface CaptchaOptions {
  color: string;
  background: string;
  lineWidth: number;
  fontSize: number;
  canvasWidth: number;
  canvasHeight: number;
}

const MAX_SESSION_FAILURE = 1;
const MAX_USER_FAILED = 1;
const MAX_IP_FAILED = 10;

export default class CaptchaService extends BaseService {
  async imageWithCanvas(text: string, options?: Partial<CaptchaOptions>) {
    const params: Partial<CaptchaOptions> = options || {};
    params.color = params.color || 'rgb(0,100,100)';
    params.background = params.background || 'rgb(255,200,150)';
    params.lineWidth = params.lineWidth || 8;
    params.fontSize = params.fontSize || 80;
    params.canvasWidth = params.canvasWidth || 250;
    params.canvasHeight = params.canvasHeight || 100;

    const { createCanvas } = await import('canvas');

    const canvas = createCanvas(params.canvasWidth, params.canvasHeight);
    const ctx = canvas.getContext('2d');

    ctx.antialias = 'gray';
    ctx.fillStyle = params.background;
    ctx.fillRect(0, 0, params.canvasWidth, params.canvasHeight);
    ctx.fillStyle = params.color;
    ctx.lineWidth = params.lineWidth;
    ctx.strokeStyle = params.color;
    ctx.font = `${params.fontSize}px sans`;

    // draw two curve lines:
    for (let i = 0; i < 2; i++) {
      ctx.moveTo(Math.floor(0.08 * params.canvasWidth), Math.random() * params.canvasHeight);
      ctx.bezierCurveTo(Math.floor(0.32 * params.canvasWidth), Math.random() * params.canvasHeight, Math.floor(1.07 * params.canvasHeight), Math.random() * params.canvasHeight, Math.floor(0.92 * params.canvasWidth), Math.random() * params.canvasHeight);
      ctx.stroke();
    }

    // draw text:
    text.split('').forEach((char, i) => {
      ctx.setTransform(Math.random() * 0.5 + 1, Math.random() * 0.4, Math.random() * 0.4, Math.random() * 0.5 + 1, Math.floor(0.675 * params.fontSize!) * i + Math.floor(0.25 * params.fontSize!), Math.floor(1.25 * params.fontSize!));
      ctx.fillText(char, 0, 0);
    });

    return canvas.createJPEGStream();
  }

  async imageWithGm(text: string, options?: Partial<CaptchaOptions>) {
    const params: Partial<CaptchaOptions> = options || {};
    params.color = params.color || 'rgb(0,100,100)';
    params.background = params.background || 'rgb(255,200,150)';
    params.lineWidth = params.lineWidth || 8;
    params.fontSize = params.fontSize || 80;
    params.canvasWidth = params.canvasWidth || 250;
    params.canvasHeight = params.canvasHeight || 100;

    const image = gm.subClass({ imageMagick: true })(params.canvasWidth, params.canvasHeight, params.background)
      .background(params.background)
      .font('sans', params.fontSize)
      .stroke(params.color, params.lineWidth);

    for (let i = 0; i < 2; i++) {
      image.drawBezier([ Math.floor(0.08 * params.canvasWidth), Math.random() * params.canvasHeight ],
        [ Math.floor(0.32 * params.canvasWidth), Math.random() * params.canvasHeight ],
        [ Math.floor(1.07 * params.canvasHeight), Math.random() * params.canvasHeight ],
        [ Math.floor(0.92 * params.canvasWidth), Math.random() * params.canvasHeight ]);
    }

    const paddingLeft = (params.canvasWidth - params.fontSize / 2 * text.length) / 2;

    for (let i = 0; i < text.length; i++) {
      image.drawText(paddingLeft + params.fontSize / 2 * (i + (Math.random() - Math.random()) * 0.35), params.canvasHeight * (1 - 0.2 * Math.random()), text.charAt(i));
    }

    image.swirl((Math.random() - Math.random()) * 50).noise('impulse');

    return new Promise((resolve, reject) => {
      image.toBuffer('jpg', (err, out) => {
        if (err) {
          reject(err);
          return;
        }

        resolve(out);
      });
    });
  }

  async issue(sess_id?: string) {
    const text = getRandomStr(4, '0123456789');

    this.ctx.type = 'jpg';
    this.ctx.set('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0')
    this.ctx.set('Expires', 'Sun, 19 May 1984 02:00:00 GMT')

    const session = await this.ctx.getSession(sess_id);
    session.captcha = text;
    await session.save();

    return await this.imageWithCanvas(text);
  }

  async verify(captcha: string) {
    const session = await this.ctx.getSession();
    if (!session || !session.captcha || session.captcha.length === 0) {
      return false;
    }

    const captchaOrig = session.captcha;

    session.captcha = '';
    await session.save();

    return captchaOrig === captcha;
  }

  async verifyRequired(userid?: number|string, ip?: string) {
    const session = await this.ctx.getSession();
    if (session && session.captcha && session.captcha.length > 0) {
      return true;
    }

    let verify = await this.ctx.service.cache.couchbase.get('captcha:sess:' + session.id);
    if (verify > MAX_SESSION_FAILURE) {
      return true;
    }

    verify = await this.ctx.service.cache.couchbase.get('captcha:id:' + userid);
    if (verify > MAX_USER_FAILED) {
      return true;
    }

    verify = await this.ctx.service.cache.couchbase.get('captcha:' + (ip || this.ctx.client_ip));
    if (verify > MAX_IP_FAILED) {
      return true;
    }

    return false;
  }

  async retry(userid: number|string, ip?: string) {
    const session = await this.ctx.getSession();

    const resSess = await this.ctx.service.cache.couchbase.increment('captcha:sess:' + session.id);

    const resid = userid && (await this.ctx.service.cache.couchbase.increment('captcha:id:' + userid)) || 0;

    const resIp = await this.ctx.service.cache.couchbase.increment('captcha:' + (ip || this.ctx.client_ip));

    if (userid) {
      await this.ctx.service.cache.couchbase.set('user_try_login: ' + userid, {
        session: session && session.id,
        ip: ip || this.ctx.client_ip
      });
    }

    return resSess > MAX_SESSION_FAILURE || resid > MAX_USER_FAILED || resIp > MAX_IP_FAILED;
  }

  async reset(userid: number | string, ip?: string) {
    await this.ctx.service.cache.couchbase.remove('captcha:' + (ip || this.ctx.client_ip));
    if (userid) {
      await this.ctx.service.cache.couchbase.remove('captcha:id:' + userid);

      const userSession = await this.ctx.service.cache.couchbase.get('user_try_login: ' + userid);
      if (userSession) {
        userSession.session && await this.ctx.service.cache.couchbase.remove('captcha:sess:' + userSession.session);
        userSession.ip && await this.ctx.service.cache.couchbase.remove('captcha:' + userSession.ip);
      }
    }
  }
}
