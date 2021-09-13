import { Context, Request } from 'egg';
import GaiaRequest from '../../lib/request';
import BaseBSONDocObject from '../BaseBSONDocObject';
import { LoadAs } from '../../lib/model/ObjectModelService';
import PermissionNode from './permission_node';
import { ObjectProperties } from '../BasePropertiesObject';

export const ROLE_ANONYMOUS = 'anonymous';

export default class AdminRole extends BaseBSONDocObject<string> {
  disabled: boolean;
  roles: string[];
  rules: {
    allow?: string[];
    deny?: string[];
  }

  // permissionNodes
  allow: string[];
  deny: string[];

  constructor(properties: ObjectProperties<AdminRole>, ctx: Context) {
    super(properties, ctx);

    if (!this.rules) {
      this.setProperty('rules', {});
    }
  }

  get name(): string {
    return this.getProperty('name', this.id);
  }

  async getRoles(): Promise<AdminRole[]> {
    const roleNames: string[] = this.getProperty('roles', []);
    if (!roleNames || roleNames.length === 0) {
      return [];
    }

    const roles = ((await this.ctx.service.admin.role.loadMulti(roleNames, { loadAs: LoadAs.array as any, skipEmpty: true })) as unknown[]) as AdminRole[];
    let additionals = roles;
    while (true) {
      let additionalRoles: string[] = [];
      for (const role of additionals) {
        if (role.roles) {
          role.roles.forEach(item => {
            // 有另外的角色就在去load
            if (item !== this._id && roleNames.indexOf(item) === -1) {
              additionalRoles.push(item);
            }
          });
        }
      }

      if (additionalRoles.length > 0) {
        additionals = ((await this.ctx.service.admin.role.loadMulti(additionalRoles, { loadAs: LoadAs.array as any, skipEmpty: true })) as unknown[]) as AdminRole[];

        roles.concat(additionals);
        roleNames.concat(additionalRoles);
      } else {
        break;
      }
    }

    return roles;
  }

  async hasPermission(req: GaiaRequest | Request): Promise<boolean | undefined> {
    if (await this.isDenied(req)) {
      return false;
    }

    if (await this.isAllowed(req)) {
      return true;
    }

    const roles = await this.getRoles();

    for (const role of roles) {
      if (await role.isDenied(req)) {
        return false;
      }
    }

    for (const role of roles) {
      if (await role.isAllowed(req)) {
        return true;
      }
    }

    return undefined;
  }

  async hasPermissionNode(node: PermissionNode): Promise<boolean | undefined> {
    if (this.allow) {
      if (this.allow.indexOf(node._id) >= 0) {
        return true;
      }
    }

    if (this.deny) {
      if (this.deny.indexOf(node._id) >= 0) {
        return false;
      }
    }

    return undefined;
  }

  async isAllowed(req: GaiaRequest | Request): Promise<boolean> {
    if (this.allow) {
      const permissionNodes = await this.ctx.service.admin.permissionNode.loadMulti(this.allow, { skipEmpty: true }) as unknown as Map<string, PermissionNode>;
      for (const node of permissionNodes.values()) {
        if (node && node.hit(req)) {
          return true;
        }
      }
    }

    const allows = (this.rules && this.rules.allow || []).filter(rule => rule && rule.length > 0).map(rule => new RegExp(rule));
    const pathname = `${req.method}:${(req.url && req.pathname) || ''}`;
    if (allows.some(reg => !!pathname.match(reg))) {
      return true;
    }

    if (pathname === 'GET:/admin/') {
      // 角色默认可以访问首页
      return true;
    }

    return false;
  }

  async isDenied(req: GaiaRequest | Request): Promise<boolean> {
    if (this.deny) {
      const permissionNodes = await this.ctx.service.admin.permissionNode.loadMulti(this.deny, { skipEmpty: true }) as unknown as Map<string, PermissionNode>;
      for (const node of permissionNodes.values()) {
        if (node && node.hit(req)) {
          return true;
        }
      }
    }

    const denies = ((this.rules && this.rules.deny) || []).filter(rule => rule && rule.length > 0).map(rule => new RegExp(rule));
    const pathname = `${req.method}:${(req.url && req.pathname) || ''}`;
    return denies.some(reg => !!pathname.match(reg));
  }
}
