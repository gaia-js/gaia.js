import './typings/gaia';
import './typings/app/extend/application';
import './typings/app/extend/context';
import './typings/app/middleware/index';
import './typings/config/index';
import './typings/config/plugin';
import './typings/app/service/index';
import './typings/app/index';
import './typings/app/object/index';
import './typings/app/object/content/index';
import './typings/app/object/order/index';
import './typings/app/object/user/index';
import './typings/app/object/admin/index';
import './typings/app/service/index';
import './typings/app/service/cache/index';
import './typings/app/service/admin/index';
import './typings/app/service/rpc/index';
import './app/lib/router/routers';
import GaiaRedisService from './app/service/redis';
import GaiaRequest from './app/lib/request';
import { RouterOptions } from './app/lib/router/routers';
import ExtendApplication from './app/extend/application';
import ExtendContext from './app/extend/context';
import { ObjectProperties } from './app/object/BasePropertiesObject';
import AdminUser from './app/object/admin/user';
import { IGaiaObject, IGaiaObjectAdmin, IGaiaService, IGaiaServiceAdmin, IGaiaServiceCache, IGaiaServiceRpc } from './typings/app/index';
import 'egg';
import { Commands } from 'ioredis';
import { Context as EggContext, Application as EggApplication, IGaiaApplication } from 'egg';
import { ObjectClass } from './app/lib/model/ObjectModelService';

declare namespace gaia {
  type GaiaApplicationType = typeof ExtendApplication;

  type GaiaContextType = typeof ExtendContext;

  interface IServiceAdmin extends IGaiaServiceAdmin {

  }

  interface IServiceRpc extends IGaiaServiceRpc {

  }


  // 扩展 service
  interface IService extends IGaiaService {
    cache: IGaiaServiceCache;
    rpc: IServiceRpc;
    admin: IServiceAdmin;

    redis: GaiaRedisService & Commands;
  }

  interface IObject extends IGaiaObject {
    Admin: IGaiaObjectAdmin;
  }

  interface Application extends IGaiaApplication {
  }

  // 扩展 context
  interface Context extends GaiaContextType {
    app: Application;
    object: IObject;

    apiReq: GaiaRequest;

    session: any;
    // user: User | AdminUser | null
  }
}

declare namespace Router {
  interface ILayerOptions {
    ignoreAuth?: boolean;
    gaia_ext?: RouterOptions;
  }
}

export interface RouteableModule<RequestType = GaiaRequest> {
  ctx: Egg.Context & EggContext;
  req: RequestType;
}

declare module 'egg' {
  type ObjectCreator<T> = { create: (properties: ObjectProperties<T>, ...params: any[]) => T; class: ObjectClass<T> }

  interface Application extends gaia.Application, EggApplication {

  }

  interface Context extends gaia.Context {

  }
}
