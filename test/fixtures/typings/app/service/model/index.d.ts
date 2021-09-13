// This file is created by egg-ts-helper@1.26.0
// Do not modify this file!!!!!!!!!

import 'egg';
import ExportMongoTest from '../../../../app/service/model/mongo_test';

declare module 'egg' {
  interface IAppServiceModel {
    mongoTest: ExportMongoTest;
  }
}
