import 'egg';
import { gaia } from '../../../';
import './app/service/index';
import './app/service/model/index';



declare module 'egg' {
  interface IService extends IAppService, gaia.IService {
    model: IAppServiceModel
  }

  interface IObject extends IAppObject, gaia.IObject {
  }

  // extend context
  interface Context extends gaia.Context, EggContext {
    service: IService;
    object: IObject;
  }

  type MongooseSingleton = {
    clients: Map<string, mongoose.Connection>;
    get(id: string): mongoose.Connection;
  };

  interface Application extends gaia.Application, IGaiaApplication, EggApplication {
    mongooseDB:  mongoose.Connection | MongooseSingleton;
  }

  interface EggAppConfig extends GaiaAppConfig { }
}
