import BaseModelObject from './BaseModelObject';
import ObjectModelService from '../lib/model/ObjectModelService';

export default class LazyLoadObject<KT, T extends BaseModelObject<KT>> implements PromiseLike<T|null> {
  private _id: KT;
  private modelService: ObjectModelService<KT, T>;

  constructor(id: KT, modelService: ObjectModelService<KT, T>) {
    this._id = id;
    this.modelService = modelService;
  }

  then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T|null) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): PromiseLike<TResult1 | TResult2> {
    return this.modelService.load(this._id).then(onfulfilled).catch(onrejected);
  }

  get id() {
    return this.id;
  }
}
