import BaseService from "../../../../app/lib/BaseService";
import classProfile from "../../../../app/lib/profiler/class";
import methodProfile from "../../../../app/lib/profiler/method";
import { sleep } from "../../../../app/lib/utils";

@classProfile()
export default class TestProfilerService extends BaseService {
  @methodProfile()
  async testMethod() {
    await sleep(500);
  }

  async testMethod2() {
    await sleep(500);
  }
}
