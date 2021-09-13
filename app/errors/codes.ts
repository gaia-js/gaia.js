export default {
  NO_AUTH: { status: 401, code: 401, msg: '请重新登录' },
  REQUEST_ERROR: { status: 406, code: 406, msg: '请求错误' },
  PARAMETER: { status: 406, code: 406, msg: '参数错误' },
  SERVER_ERROR: { status: 500, code: 503, msg: '系统错误' },
  ACCESS_DENIED: { code: 403, msg: '拒绝访问', status: 403 },
  PERMISSION_DENIED: { code: 403, msg: '无权限', status: 403 },
  NO_RESPONSE: { code: 504, msg: '服务超时', status: 504 },
  DOWNGRADED: { code: 903, msg: '服务暂时不可用', status: 503 },
};
