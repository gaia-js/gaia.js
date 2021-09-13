// import BaseModelObject from '../../object/BaseModelObject';
// import DBModelService, { Dao } from './DBModelService';

// export default class Pagination<KT = KeyType, T extends BaseModelObject<KT> = BaseModelObject<KT>, TDao extends Dao<KT, T> = Dao<KT, T>> extends DBModelService<KT, T, TDao> {
//   dbModelService: DBModelService<KT, T, TDao>;
//   pageSize: number;

//   constructor(dbModelService: DBModelService<KT, T, TDao>, pageSize: number) {
//     super((dbModelService as any).ctx, (dbModelService as any).daoName);

//     this.dbModelService = dbModelService;
//     this.pageSize = pageSize;
//   }

//   protected get dao(): TDao {
//     return (this.dbModelService as any).dao();
//   }

//   async page(clause: any, page = 0) {
//     return this.loadMultiWith(clause, { fetchOptions: { skip: page, limit: this.pageSize } });
//   }
// }
