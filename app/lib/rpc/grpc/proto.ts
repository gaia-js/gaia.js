import { Application } from 'egg';
import * as grpc from '@grpc/grpc-js';

let _instance: GrpcProto;

export class GrpcProto {
  app: Application;
  private readonly registeredProto: grpc.GrpcObject;

  constructor(app?: Application) {
    app && (this.app = app);

    this.registeredProto = {};
  }

  static get instance(): GrpcProto {
    if (!_instance) {
      _instance = new GrpcProto();
    }

    return _instance;
  }

  registerDefinition(def: grpc.GrpcObject) {
    for (const packageName of Object.keys(def)) {
      if (this.registeredProto[packageName]) {
        this.app.logger.error({ level: 'CRIT', msg: `grpc package ${packageName} already registered` });
      }
    }

    Object.assign(this.registeredProto, def);
  }

  getPackage(packageName: string) {
    return this.registeredProto[packageName];
  }

  getService(packageName: string, service: string): grpc.ServiceDefinition {
    return this.registeredProto[packageName][service].service;
  }

  newClient(packageName: string, service: string, address: string, credentials: grpc.ChannelCredentials = grpc.credentials.createInsecure(), options?: grpc.ClientOptions): grpc.Client {
    return new this.registeredProto[packageName][service](address, credentials, options);
  }

  hasService(packageName: string, service: string): boolean {
    return this.registeredProto[packageName] && this.registeredProto[packageName][service] || false;
  }
}

export default GrpcProto.instance;
