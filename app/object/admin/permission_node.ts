import { Request } from 'egg';
import BaseBSONDocObject from '../BaseBSONDocObject';
import GaiaRequest from '../../lib/request';

export default class PermissionNode extends BaseBSONDocObject<string> {
  disabled: boolean;
  rules: string[];

  get name(): string {
    return this.getProperty('name', this.id);
  }

  hit(req: GaiaRequest | Request): boolean {
    const rules = (this.getProperty('rules', []) as string[]).filter(rule => rule && rule.length > 0).map(rule => new RegExp(rule));

    const pathname = `${req.method}:${(req.pathname) || ''}`;
    return rules.some(reg => !!pathname.match(reg));
  }
}
