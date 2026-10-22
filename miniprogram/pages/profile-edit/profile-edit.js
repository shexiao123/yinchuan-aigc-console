const profileApi = require('../../utils/profile')
const samples = require('../../utils/samples')

const app = getApp()

/** 常用标签，供快速选择 */
const TAG_PRESETS = ['婚礼跟拍', '婚礼微电影', '商业摄影', '产品短视频', 'MV拍摄', '人像写真', '活动记录', '亲子拍摄', '品牌宣传片', '直播切片']

Page({
  data: {
    loading: true,
    saving: false,
    uploading: false,
    form: {
      nickname: '',
      avatarUrl: '',
      avatarPath: '',
      bio: '',
      city: '银川',
      phone: '',
      gender: '',
      birthday: '',
      tags: []
    },
    tagInput: '',
    tagPresets: TAG_PRESETS,
    genderOptions: [
      { value: '', label: '保密' },
      { value: 'male', label: '男' },
      { value: 'female', label: '女' }
    ],
    genderIndex: 0,
    genderLabel: '保密',
    cityOptions: ['银川', '北京', '上海', '广州', '深圳', '成都', '杭州', '西安', '其他'],
    cityIndex: 0,
    bioCount: 0,
    showPhone: false,
    showCity: true,
    error: ''
  },

  onLoad() {
    this.loadData()
  },

  async loadData() {
    const session = app.globalData.session
    if (!session || !session.user) {
      this.setData({ loading: false })
      wx.showToast({ title: '请先登录', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1200)
      return
    }
    const uid = session.user.id
    try {
      const p = await profileApi.getMyProfile(uid)
      const tags = (p && p.tags) || []
      // 头像存的是存储路径，显示时转签名地址
      let avatarUrl = ''
      if (p && p.avatar_url) {
        avatarUrl = p.avatar_url.startsWith('http')
          ? p.avatar_url
          : await samples.signedUrl(p.avatar_url, 7200)
      }
      const cityOptions = this.data.cityOptions
      let cityIndex = cityOptions.indexOf((p && p.city) || '银川')
      if (cityIndex < 0) cityIndex = 0
      let genderIndex = 0
      if (p && p.gender) {
        const gi = this.data.genderOptions.findIndex((g) => g.value === p.gender)
        if (gi > 0) genderIndex = gi
      }
      this.setData({
        loading: false,
        form: {
          nickname: (p && p.nickname) || (session.user.name || ''),
          avatarUrl,
          avatarPath: (p && p.avatar_url) || '',
          bio: (p && p.bio) || '',
          city: (p && p.city) || '银川',
          phone: (p && p.phone) || '',
          gender: (p && p.gender) || '',
          birthday: (p && p.birthday) || '',
          tags
        },
        showPhone: !!(p && p.show_phone),
        showCity: p ? p.show_city !== false : true,
        genderIndex,
        genderLabel: this.data.genderOptions[genderIndex].label,
        cityIndex,
        bioCount: ((p && p.bio) || '').length,
        tagPresets: this.decoratePresets(TAG_PRESETS, tags)
      })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: e.message || '资料加载失败', icon: 'none' })
    }
  },

  /** 常用标签的选中态（WXML 不支持在表达式里调数组方法） */
  decoratePresets(presets, selected) {
    const sel = selected || []
    return presets.map((t) => ({ text: t, selected: sel.indexOf(t) >= 0 }))
  },

  /* ---------------- 头像 ---------------- */

  async onChooseAvatar() {
    if (this.data.uploading) return
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const f = (res.tempFiles || [])[0]
        if (!f) return
        if (f.size > 5 * 1024 * 1024) {
          wx.showToast({ title: '图片不能超过 5MB', icon: 'none' })
          return
        }
        this.setData({ uploading: true })
        try {
          const uid = app.globalData.session.user.id
          const path = await samples.uploadImageFile(f.tempFilePath, 'avatars', uid)
          const url = await samples.signedUrl(path, 7200)
          this.setData({
            'form.avatarUrl': url,
            'form.avatarPath': path
          })
        } catch (e) {
          wx.showToast({ title: e.message || '上传失败', icon: 'none' })
        } finally {
          this.setData({ uploading: false })
        }
      },
      fail: (err) => {
        const msg = String(err.errMsg || '')
        if (!msg.includes('cancel')) {
          wx.showToast({ title: '选择图片失败', icon: 'none' })
        }
      }
    })
  },

  onRemoveAvatar() {
    this.setData({ 'form.avatarUrl': '', 'form.avatarPath': '' })
  },

  /* ---------------- 文本 ---------------- */

  onNicknameInput(e) {
    this.setData({ 'form.nickname': e.detail.value })
  },

  onBioInput(e) {
    this.setData({ 'form.bio': e.detail.value, bioCount: e.detail.value.length })
  },

  onPhoneInput(e) {
    this.setData({ 'form.phone': e.detail.value })
  },

  onBirthdayChange(e) {
    this.setData({ 'form.birthday': e.detail.value })
  },

  onCityChange(e) {
    const idx = Number(e.detail.value)
    this.setData({
      cityIndex: idx,
      'form.city': this.data.cityOptions[idx]
    })
  },

  onGenderChange(e) {
    const idx = Number(e.detail.value)
    this.setData({
      genderIndex: idx,
      genderLabel: this.data.genderOptions[idx].label,
      'form.gender': this.data.genderOptions[idx].value
    })
  },

  onTogglePhone(e) {
    this.setData({ showPhone: e.detail.value })
  },

  onToggleCity(e) {
    this.setData({ showCity: e.detail.value })
  },

  /* ---------------- 标签 ---------------- */

  onTagInput(e) {
    this.setData({ tagInput: e.detail.value })
  },

  onAddTag() {
    const v = String(this.data.tagInput || '').trim()
    if (!v) return
    const tags = this.data.form.tags || []
    if (tags.length >= 8) {
      wx.showToast({ title: '最多 8 个标签', icon: 'none' })
      return
    }
    if (tags.indexOf(v) >= 0) {
      wx.showToast({ title: '标签已存在', icon: 'none' })
      return
    }
    const next = tags.concat([v.slice(0, 12)])
    this.setData({
      'form.tags': next,
      tagInput: '',
      tagPresets: this.decoratePresets(TAG_PRESETS, next)
    })
  },

  onPickPreset(e) {
    const v = e.currentTarget.dataset.tag
    const tags = this.data.form.tags || []
    let next
    if (tags.indexOf(v) >= 0) {
      // 已选则取消
      next = tags.filter((t) => t !== v)
    } else {
      if (tags.length >= 8) {
        wx.showToast({ title: '最多 8 个标签', icon: 'none' })
        return
      }
      next = tags.concat([v])
    }
    this.setData({
      'form.tags': next,
      tagPresets: this.decoratePresets(TAG_PRESETS, next)
    })
  },

  onRemoveTag(e) {
    const v = e.currentTarget.dataset.tag
    const next = (this.data.form.tags || []).filter((t) => t !== v)
    this.setData({
      'form.tags': next,
      tagPresets: this.decoratePresets(TAG_PRESETS, next)
    })
  },

  /* ---------------- 保存 ---------------- */

  async onSave() {
    if (this.data.saving) return
    const session = app.globalData.session
    if (!session || !session.user) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    const f = this.data.form
    if (!String(f.nickname || '').trim()) {
      this.setData({ error: '请填写昵称' })
      wx.showToast({ title: '请填写昵称', icon: 'none' })
      return
    }
    this.setData({ saving: true, error: '' })
    try {
      await profileApi.saveMyProfile(session.user.id, {
        nickname: f.nickname,
        avatar_url: f.avatarPath || null,
        bio: f.bio,
        city: f.city,
        phone: f.phone,
        gender: f.gender,
        birthday: f.birthday || null,
        tags: f.tags,
        show_phone: this.data.showPhone,
        show_city: this.data.showCity
      })
      wx.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 700)
    } catch (e) {
      this.setData({ saving: false, error: e.message || '保存失败' })
      wx.showToast({ title: e.message || '保存失败', icon: 'none' })
    }
  }
})
