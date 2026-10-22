/**
 * 样片上传模块（网页版）
 * 视频/图片上传到云存储，样片记录写入 service_samples 表。
 */
window.SAMPLES = (function () {
  const cloud = window.cloud
  const API = window.API

  const MAX_VIDEO_MB = 100
  const MAX_IMAGE_MB = 10
  const ACCEPT = 'video/mp4,video/quicktime,video/x-m4v,video/webm,image/jpeg,image/png,image/webp'

  /** 判断是视频还是图片 */
  function kindOf(file) {
    if (file.type && file.type.startsWith('video/')) return 'video'
    if (file.type && file.type.startsWith('image/')) return 'image'
    const ext = (file.name || '').toLowerCase().split('.').pop()
    if (['mp4', 'mov', 'm4v', 'webm', 'avi'].includes(ext)) return 'video'
    return 'image'
  }

  function extOf(file, kind) {
    const ext = (file.name || '').toLowerCase().split('.').pop()
    if (ext && ext.length <= 5) return ext
    return kind === 'video' ? 'mp4' : 'jpg'
  }

  function randomId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID()
    return 'x' + Math.random().toString(36).slice(2) + Date.now().toString(36)
  }

  /**
   * 上传单个样片。
   * @param {File} file 浏览器选出的文件
   * @param {object} ctx { serviceId, providerId, providerOwnerId, title, description, sortOrder }
   */
  async function upload(file, ctx) {
    if (!file) throw new Error('请选择文件')

    const kind = kindOf(file)
    const limitMB = kind === 'video' ? MAX_VIDEO_MB : MAX_IMAGE_MB
    if (file.size > limitMB * 1024 * 1024) {
      throw new Error(`文件过大（${(file.size / 1024 / 1024).toFixed(1)}MB），${kind === 'video' ? '视频' : '图片'}不能超过 ${limitMB}MB`)
    }

    // 存储路径：shared/<ownerUid>/samples/<serviceId>/<uuid>.<ext>
    const ownerSegment = ctx.providerOwnerId || 'platform'
    const ext = extOf(file, kind)
    const path = `shared/${ownerSegment}/samples/${ctx.serviceId}/${randomId()}.${ext}`

    const uploaded = await cloud.storage.upload(path, file, {
      contentType: file.type || (kind === 'video' ? 'video/mp4' : 'image/jpeg'),
      cacheControl: '3600',
      upsert: false,
      metadata: { purpose: 'service_sample', service_id: String(ctx.serviceId) }
    })
    if (uploaded.error) {
      throw new Error(uploaded.error.message || '文件上传失败')
    }

    const record = {
      service_id: ctx.serviceId,
      provider_id: ctx.providerId,
      provider_owner_id: ctx.providerOwnerId || null,
      title: ctx.title || file.name || (kind === 'video' ? '宣传样片' : '作品图'),
      description: ctx.description || '',
      media_type: kind,
      file_path: path,
      file_name: file.name || '',
      file_size: file.size,
      sort_order: ctx.sortOrder || 0
    }
    const saved = await API.createSample(record)
    return saved
  }

  /**
   * 批量上传。返回成功与失败明细。
   */
  async function uploadMany(files, ctx) {
    const results = { ok: [], failed: [] }
    let order = ctx.sortOrder || 0
    for (const f of files) {
      try {
        const r = await upload(f, { ...ctx, sortOrder: order++ })
        results.ok.push(r)
      } catch (e) {
        results.failed.push({ name: f.name, message: e.message })
      }
    }
    return results
  }

  /** 取样片的可播放/可看地址（签名链接，有效期 2 小时） */
  async function signedUrl(path, ttl = 7200) {
    if (!path) return ''
    // 已经是完整 http(s) 地址的，直接用（站点静态资源，无需签名）
    if (String(path).startsWith('http')) return path
    const res = await cloud.storage.createSignedUrl(path, ttl)
    if (res.error) return ''
    return res.data && (res.data.url || res.data.signedUrl || res.data)
  }

  /** 批量取样片地址 */
  async function signedUrls(samples) {
    const list = await Promise.all(
      (samples || []).map(async (s) => {
        if (!s.file_path) return { ...s, url: '' }
        const url = await signedUrl(s.file_path)
        return { ...s, url }
      })
    )
    return list
  }

  return { upload, uploadMany, signedUrl, signedUrls, ACCEPT, MAX_VIDEO_MB, MAX_IMAGE_MB, kindOf }
})()
