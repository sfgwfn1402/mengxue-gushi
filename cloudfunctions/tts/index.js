// 云函数入口文件 - 腾讯云TTS
const cloud = require('wx-server-sdk')
const https = require('https')
const crypto = require('crypto')
const { URL } = require('url')

cloud.init()

// 腾讯云配置
const CONFIG = {
  SecretId: process.env.TENCENT_SECRET_ID,
  SecretKey: process.env.TENCENT_SECRET_KEY
}

// 生成TC3-HMAC-SHA256签名
function generateTC3Signature(secretKey, date, service, strToSign) {
  const secretDate = crypto.createHmac('sha256', 'TC3' + secretKey).update(date).digest()
  const secretService = crypto.createHmac('sha256', secretDate).update(service).digest()
  const secretSigning = crypto.createHmac('sha256', secretService).update('tc3_request').digest()
  return crypto.createHmac('sha256', secretSigning).update(strToSign).digest('hex')
}

// 发送HTTPS请求
function httpsRequest(url, method, headers, data) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: headers
    }
    
    const req = https.request(options, (res) => {
      let chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        resolve(Buffer.concat(chunks))
      })
    })
    
    req.on('error', reject)
    
    if (data) {
      req.write(data)
    }
    req.end()
  })
}

// 云函数入口
exports.main = async (event, context) => {
  const text = (event.text || '').trim()
  
  if (!text) {
    return { success: false, message: '缺少朗读内容' }
  }

  if (text.length > 150) {
    return { success: false, message: '朗读内容过长，请分段朗读' }
  }

  if (!CONFIG.SecretId || !CONFIG.SecretKey) {
    return { success: false, message: '云函数TTS未配置密钥，当前小程序已改用同声传译插件朗读' }
  }
  
  try {
    const timestamp = Math.floor(Date.now() / 1000)
    const date = new Date(timestamp * 1000).toISOString().split('T')[0]
    
    // 腾讯云TTS API请求
    const endpoint = 'tts.tencentcloudapi.com'
    const action = 'TextToVoice'
    const version = '2019-08-23'
    const region = 'ap-guangzhou'
    const service = 'tts'
    const requestBody = JSON.stringify({
      Text: text,
      SessionId: `poem-${Date.now()}`,
      VoiceType: 1001,
      Codec: 'mp3',
      Speed: 0,
      Volume: 5,
      SampleRate: 16000,
      ModelType: 1
    })
    
    // 构建CanonicalRequest
    const httpRequestMethod = 'POST'
    const canonicalURI = '/'
    const canonicalQueryString = ''
    const canonicalHeaders = `content-type:application/json\nhost:${endpoint}\n`
    const signedHeaders = 'content-type;host'
    const hashedRequestPayload = crypto.createHash('sha256').update(requestBody).digest('hex')
    
    const canonicalRequest = [
      httpRequestMethod,
      canonicalURI,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      hashedRequestPayload
    ].join('\n')
    
    // 构建StringToSign
    const algorithm = 'TC3-HMAC-SHA256'
    const credentialScope = `${date}/${service}/tc3_request`
    const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex')
    const stringToSign = [
      algorithm,
      timestamp,
      credentialScope,
      hashedCanonicalRequest
    ].join('\n')
    
    // 生成签名
    const signature = generateTC3Signature(CONFIG.SecretKey, date, service, stringToSign)
    
    // 构建Authorization
    const authorization = `${algorithm} Credential=${CONFIG.SecretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
    
    // 发送请求
    const response = await httpsRequest(
      `https://${endpoint}/`,
      'POST',
      {
        'Content-Type': 'application/json',
        'Host': endpoint,
        'X-TC-Action': action,
        'X-TC-Version': version,
        'X-TC-Timestamp': timestamp,
        'X-TC-Region': region,
        'Authorization': authorization
      },
      requestBody
    )
    
    // 解析响应
    const result = JSON.parse(response.toString())
    
    if (result.Response && result.Response.Audio) {
      return {
        success: true,
        audio: result.Response.Audio
      }
    } else {
      return {
        success: false,
        message: result.Response && result.Response.Error ? result.Response.Error.Message : '语音合成失败',
        error: result
      }
    }
    
  } catch (err) {
    return {
      success: false,
      message: err.message
    }
  }
}
