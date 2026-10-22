const { cloud } = require('./cloud')

/**
 * 宣传样片上传（小程序）
 * 视频用 wx.chooseVideo 选，图片用 wx.chooseMedia 选。
 * 小程序无 File 对象，需用 FileSystemManager 读成 ArrayBuffer 再上传。
 */

const MAX_VIDEO_MB = 100
const MAX_IMAGE_MB = 10

function randomId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < 32; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

/** 读本地文件为 ArrayBuffer */
function readFile(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      success: (res) => resolve(res.data),
      fail: (err) => reject(new Error(err.errMsg || '文件读取失败'))
    })
  })
}

/** 猜扩展名 */
function extOf(name, kind) {
  const m = String(name || '').match(/\.([a-z0-9]{2,5})$/i)
  if (m) return m[1].toLowerCase()
  return kind === 'video' ? 'mp4' : 'jpg'
}

/**
 * 上传一个视频样片。
 * @param {string} tempFilePath wx.chooseVideo 返回的本地路径
 * @param {object} ctx { serviceId, providerId, providerOwnerId, title, description, duration, size }
 */
async function uploadVideo(tempFilePath, ctx) {
  const size = ctx.size || 0
  if (size > MAX_VIDEO_MB * 1024 * 1024) {
    throw new Error(`视频过大（${(size / 1024 / 1024).toFixed(1)}MB），不能超过 ${MAX_VIDEO_MB}MB`)
  }
  const ownerSegment = ctx.providerOwnerId || 'platform'
  const ext = extOf(ctx.name, 'video')
  const path = `shared/${ownerSegment}/samples/${ctx.serviceId}/${randomId()}.${ext}`

  const buffer = await readFile(tempFilePath)
  const uploaded = await cloud.storage.upload(path, buffer, {
    contentType: 'video/mp4',
    cacheControl: '3600',
    upsert: false,
    metadata: { purpose: 'service_sample', service_id: String(ctx.serviceId) }
  })
  if (uploaded.error) throw new Error(uploaded.error.message || '视频上传失败')

  return {
    service_id: ctx.serviceId,
    provider_id: ctx.providerId,
    provider_owner_id: ctx.providerOwnerId || null,
    title: ctx.title || '宣传样片',
    description: ctx.description || '',
    media_type: 'video',
    file_path: path,
    file_name: ctx.name || 'sample.mp4',
    file_size: size,
    duration: ctx.duration || 0,
    sort_order: ctx.sortOrder || 0
  }
}

/**
 * 上传一个图片样片。
 * @param {string} tempFilePath 本地路径
 * @param {object} ctx 同上，额外含 width/height
 */
async function uploadImage(tempFilePath, ctx) {
  const size = ctx.size || 0
  if (size > MAX_IMAGE_MB * 1024 * 1024) {
    throw new Error(`图片过大（${(size / 1024 / 1024).toFixed(1)}MB），不能超过 ${MAX_IMAGE_MB}MB`)
  }
  const ownerSegment = ctx.providerOwnerId || 'platform'
  const ext = extOf(ctx.name, 'image')
  const path = `shared/${ownerSegment}/samples/${ctx.serviceId}/${randomId()}.${ext}`

  const buffer = await readFile(tempFilePath)
  const uploaded = await cloud.storage.upload(path, buffer, {
    contentType: 'image/jpeg',
    cacheControl: '3600',
    upsert: false,
    metadata: { purpose: 'service_sample', service_id: String(ctx.serviceId) }
  })
  if (uploaded.error) throw new Error(uploaded.error.message || '图片上传失败')

  return {
    service_id: ctx.serviceId,
    provider_id: ctx.providerId,
    provider_owner_id: ctx.providerOwnerId || null,
    title: ctx.title || '作品图',
    description: ctx.description || '',
    media_type: 'image',
    file_path: path,
    file_name: ctx.name || 'sample.jpg',
    file_size: size,
    sort_order: ctx.sortOrder || 0
  }
}

/**
 * 通用图片上传（评价晒图等场景）。
 * 上传到 shared/<owner>/<folder>/ 下，返回可长期访问的存储路径。
 * @param {string} tempFilePath 本地文件路径
 * @param {string} folder 用途目录，如 reviews
 * @param {string} ownerSegment 归属标识，默认 platform
 * @returns {Promise<string>} 存储中的文件路径
 */
async function uploadImageFile(tempFilePath, folder, ownerSegment) {
  const owner = ownerSegment || 'platform'
  const dir = folder || 'misc'
  const ext = extOf(tempFilePath, 'image')
  const path = `shared/${owner}/${dir}/${randomId()}.${ext}`

  const buffer = await readFile(tempFilePath)
  const uploaded = await cloud.storage.upload(path, buffer, {
    contentType: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg',
    cacheControl: '3600',
    upsert: false,
    metadata: { purpose: dir }
  })
  if (uploaded.error) throw new Error(uploaded.error.message || '图片上传失败')
  return path
}

/** 取样片可播放地址（签名链接） */
async function signedUrl(path, ttl) {
  if (!path) return ''
  // 已经是完整 http(s) 地址的，直接用（站点静态资源，无需签名）
  if (String(path).startsWith('http')) return path
  try {
    const res = await cloud.storage.createSignedUrl(path, ttl || 7200)
    if (res.error) return ''
    const d = res.data || {}
    return d.url || d.signedUrl || (typeof d === 'string' ? d : '')
  } catch (e) {
    console.error('[samples] signedUrl failed', JSON.stringify({ message: e.message }))
    return ''
  }
}

/** 批量取地址 */
async function signedUrls(samples) {
  const list = await Promise.all(
    (samples || []).map(async (s) => ({
      ...s,
      url: s.file_path ? await signedUrl(s.file_path) : ''
    }))
  )
  return list
}

/** 选视频：返回 { tempFilePath, name, size, duration } */
function chooseVideo() {
  return new Promise((resolve, reject) => {
    wx.chooseVideo({
      sourceType: ['album', 'camera'],
      maxDuration: 300,
      compressed: true,
      success: (res) => {
        resolve({
          tempFilePath: res.tempFilePath,
          name: (res.tempFilePath || '').split('/').pop() || 'sample.mp4',
          size: res.size || 0,
          duration: res.duration || 0,
          width: res.width || 0,
          height: res.height || 0
        })
      },
      fail: (err) => {
        if (String(err.errMsg || '').includes('cancel')) {
          reject(new Error('已取消'))
        } else {
          reject(new Error(err.errMsg || '选择视频失败'))
        }
      }
    })
  })
}

/** 选图片：返回数组 */
function chooseImages(count) {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: count || 9,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => {
        const list = (res.tempFiles || []).map((f) => ({
          tempFilePath: f.tempFilePath,
          name: (f.tempFilePath || '').split('/').pop() || 'sample.jpg',
          size: f.size || 0,
          width: f.width || 0,
          height: f.height || 0
        }))
        resolve(list)
      },
      fail: (err) => {
        if (String(err.errMsg || '').includes('cancel')) {
          reject(new Error('已取消'))
        } else {
          reject(new Error(err.errMsg || '选择图片失败'))
        }
      }
    })
  })
}

module.exports = {
  uploadVideo,
  uploadImage,
  uploadImageFile,
  signedUrl,
  signedUrls,
  chooseVideo,
  chooseImages,
  MAX_VIDEO_MB,
  MAX_IMAGE_MB
}
