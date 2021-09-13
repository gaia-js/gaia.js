
import grpcProvider, { BaseGrpcService } from '../../../../../../../app/lib/rpc/grpc/provider';

@grpcProvider.expose('helloworld', 'Greeter')
export default class GreeterService extends BaseGrpcService {
  @grpcProvider.method()
  async SayHello(req: any) {
    console.log(req);

    return this.ctx.body = { message: `hello, ${req.name}` };
  }
}
