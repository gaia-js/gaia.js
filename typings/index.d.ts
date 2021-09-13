import './gaia';
import './app/service/index';
import './app/service/cache/index';
import { Context as EggContext } from 'egg';
import { RouterOptions, GaiaMiddleware } from '../app/lib/router/blueprint';
import ObjectProperties from '../app/object/BasePropertiesObject';
import { IGaiaService, IGaiaServiceAdmin, IGaiaServiceRpc } from './app';
import { Redis } from 'ioredis';
import RedisService from '../app/service/redis';
import ExtendContext from '../app/extend/context';
import { RequestOptions } from '../app/service/rpc/http';
import 'egg-mongoose';
import { ObjectClass } from '../app/lib/model/ObjectModelService';

type ExtendContextType = typeof ExtendContext;

interface ObjectCreator<T> { create: (properties: ObjectProperties<T>, ...params: any[]) => T, class: ObjectClass<T> }

type IAppModel = sequelize.Sequelize | any;


declare module 'egg' {
  interface IAppObject {
  }

  interface IServiceRpc extends IGaiaServiceRpc {
  }

  interface IServiceCache extends IGaiaServiceCache {
  }

  // 扩展 service
  interface IService extends IGaiaService {
    admin: IGaiaServiceAdmin;
    cache: IServiceCache;
    rpc: IServiceRpc;
    redis: RedisService & Redis;
  }

  interface IObject extends IAppObject, IGaiaObject {
    Admin: IGaiaObjectAdmin
  }

  interface IModel extends IAppModel, IGaiaModel {

  }

  // extend context
  interface Context extends ExtendContextType, gaia.Context, EggContext {
    service: IService;
    model: IModel;
    object: IObject;

    session: any;
  }

  interface Application extends IGaiaApplication {
    gaiaMiddlewares: GaiaMiddleware[];
  }

  interface EggAppConfig extends GaiaAppConfig { }
}
