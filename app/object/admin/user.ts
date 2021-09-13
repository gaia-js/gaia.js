import { Request } from 'egg';
import GaiaRequest from '../../lib/request';
import BaseBSONDocObject from '../BaseBSONDocObject';
import { LoadAs } from '../../lib/model/ObjectModelService';
import AdminRole from './role';
import PermissionNode from './permission_node';

export default class AdminUser extends BaseBSONDocObject<string> {
  disabled: boolean;
  // roles: string[];
  token: string;
  ticket: string;

  type?: string; // 'crm' | 'wxworks'

  get username(): string {
    return this._id;
  }

  set username(username: string) {
    this.setProperty('username', username);
  }

  get nickname(): string {
    return this.getProperty('nickname', this.username);
  }

  get role(): string {
    const roles = this.roleNames;
    return this.getProperty('role') || (roles && roles[0]) || 'admin';
  }

  async getRoles(): Promise<AdminRole[]> {
    return await this.loadCacheableProperty(
      'roles',
      async () => {
        const roles: AdminRole[] = ((await this.ctx.service.admin.role.loadMulti(this.roleNames, {
          loadAs: LoadAs.array as any,
          skipEmpty: true,
        })) as unknown[]) as AdminRole[];
        if (!roles || roles.length === 0) {
          roles.push(((await this.ctx.service.admin.role.anonymous) as unknown) as AdminRole);
        }

        return (roles as unknown[]) as AdminRole[];
      },
      // 对象是不能从缓存中恢复的，只能每次从roles属性中加载
      { skipCache: true }
    );
  }

  get roleNames(): string[] {
    return this.getProperty('roles', [] as any) as unknown as string[];
  }

  get roles(): Promise<AdminRole[]> {
    return this.getRoles();
  }

  async hasPermission(req: GaiaRequest | Request): Promise<boolean> {
    const roles = await this.getRoles();

    for (const role of roles) {
      const permission = await role.hasPermission(req);
      if (typeof permission === 'undefined') {
        continue;
      } else {
        return !!permission;
      }
    }

    return false;
  }

  async hasPermissionNode(node: PermissionNode): Promise<boolean> {
    const roles = await this.getRoles();

    for (const role of roles) {
      const permission = await role.hasPermissionNode(node);
      if (typeof permission === 'undefined') {
        continue;
      } else {
        return !!permission;
      }
    }

    return false;
  }

  hasRole<TRole extends AdminRole = AdminRole>(role: TRole) {
    return this.roleNames.indexOf(role._id) >= 0;
  }

  async addRole<TRole extends AdminRole = AdminRole>(role: TRole) {
    this.roleNames.push(role._id);
    // @ts-ignore
    if (await this.ctx.service.admin.user.update(this as any, { roles: this.roleNames })) {
      await this.clearCacheableProperty('roles');

      return true;
    }

    return false;
  }

  async delRole<TRole extends AdminRole = AdminRole>(role: TRole) {
    const index = this.roleNames.indexOf(role._id);
    if (index >= 0) {
      this.roleNames.splice(index, 1);

      // @ts-ignore
      if (await this.ctx.service.admin.user.update(this as any, { roles: this.roleNames })) {
        await this.clearCacheableProperty('roles');
        return true;
      }

      return false;
    }

    return true;
  }
}
