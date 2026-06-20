// utils/config.js
// 环境切换：
// - dev/prod：当前测试和生产都统一走 HTTPS 域名，避免微信小程序走开发环境或 IP。

const ENV = 'prod'

const configs = {
  dev: {
    env: 'dev',
    apiBaseUrl: 'https://www.duwei.cloud/api',
    minioBaseUrl: 'https://www.duwei.cloud',
    mediaBaseUrl: 'https://www.duwei.cloud',
    useBackendPoems: true,
    useDevLogin: false
  },
  prod: {
    env: 'prod',
    // 生产环境统一走 HTTPS 域名，满足微信小程序合法域名要求。
    // 注意：当前证书覆盖 www.duwei.cloud，裸域 duwei.cloud 证书不匹配。
    apiBaseUrl: 'https://www.duwei.cloud/api',
    minioBaseUrl: 'https://www.duwei.cloud',
    mediaBaseUrl: 'https://www.duwei.cloud',
    useBackendPoems: true,
    // 正式用户登录走 wx.login + 后端 /auth/wechat-login，确保每个微信用户独立学习数据
    useDevLogin: false
  }
}

module.exports = configs[ENV]
module.exports.configs = configs
