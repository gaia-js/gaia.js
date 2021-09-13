import BaseModelObject from './BaseModelObject';

export default class Session extends BaseModelObject {
  id: string;

  [ key: string ]: any;

  async save() {
    await this.ctx.service.session.save(this as any);
  }
}
