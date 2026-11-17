/**
 * 品类需求表单 · 页面 mixin
 *
 * 三个发布入口（demand-publish / merchant-console / order-create）共用同一套
 * 动态字段渲染与取值逻辑，避免三份重复代码。
 *
 * 用法：
 *   const reqForm = require('../../utils/req-form')
 *   Page(Object.assign({}, reqForm.methods, {
 *     data: Object.assign({ ...页面自己的 data }, reqForm.data()),
 *     onLoad() { this.setReqCategory(...) },  // 按当前品类初始化
 *     onSubmit() {
 *       const err = this.reqValidate()
 *       if (err) return wx.showToast({ title: err, icon: 'none' })
 *       const payload = this.reqPayload()   // { reqCatId, reqCatName, reqFields, reqText }
 *     }
 *   }))
 *
 * WXML 里遍历 reqFields，按 item.type 分支渲染 input / textarea / picker / date，
 * 事件统一绑下面四个 onReq* 方法，样式类用全局 .req-*（见 app.wxss）。
 */
const tpl = require('./requirement-templates')

function data(extra) {
  return Object.assign({
    reqCatId: 0,
    reqCatName: '综合服务',
    reqCatSummary: '',
    reqFields: [],
    reqError: ''
  }, extra || {})
}

const methods = {
  /**
   * 切换/初始化品类。同名 key 的已填值会保留，避免用户换品类后白填。
   * @param {*} key 数字 id / slug / 中文名 / {id,slug,name} 对象
   */
  setReqCategory(key) {
    const t = tpl.resolve(key)
    // 只保留「同 key + 同 type + 同 label」的已填值，防止跨品类同名字段串值
    // （例：婚礼跟拍的「交付物」不能带到品牌宣传片的「交付格式」）。
    const keep = {}
    t.fields.forEach((nf) => {
      const old = (this.data.reqFields || []).filter((x) => x.key === nf.key && x.type === nf.type && x.label === nf.label)[0]
      if (old && String(old.value || '').trim()) keep[nf.key] = String(old.value).trim()
    })
    this.setData({
      reqCatId: t.id,
      reqCatName: t.name,
      reqCatSummary: t.summary,
      reqFields: tpl.fieldsFor(t.id, keep),
      reqError: ''
    })
  },

  /** 输入类字段（input / textarea 共用） */
  onReqInput(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const patch = {}
    patch['reqFields[' + idx + '].value'] = e.detail.value
    patch.reqError = ''
    this.setData(patch)
    if (typeof this.onReqChange === 'function') this.onReqChange()
  },

  /** picker 选项字段 */
  onReqPicker(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const opt = Number(e.detail.value)
    const field = (this.data.reqFields || [])[idx]
    if (!field) return
    this.setData({
      ['reqFields[' + idx + '].optionIndex']: opt,
      ['reqFields[' + idx + '].value']: String((field.options || [])[opt] || ''),
      reqError: ''
    })
    if (typeof this.onReqChange === 'function') this.onReqChange()
  },

  /** 日期字段（mode=date） */
  onReqDate(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    this.setData({
      ['reqFields[' + idx + '].value']: e.detail.value,
      reqError: ''
    })
    if (typeof this.onReqChange === 'function') this.onReqChange()
  },

  /** 校验，返回错误文案（无错误返回空串） */
  reqValidate() {
    const err = tpl.validate(this.data.reqFields || [])
    if (err) this.setData({ reqError: err })
    return err
  },

  /**
   * 生成提交载荷。
   * reqText 是写回原 requirement / description 字段的规范文本（云端零改动）；
   * reqFields 是本地结构化副本，供展示端键值渲染。
   */
  reqPayload() {
    const fields = this.data.reqFields || []
    return {
      reqCatId: this.data.reqCatId,
      reqCatName: this.data.reqCatName,
      reqCategorySlug: tpl.resolve(this.data.reqCatId).slug,
      reqFields: fields.map((x) => ({ key: x.key, label: x.label, value: String(x.value || '').trim() })),
      reqValues: tpl.valuesOf(fields),
      reqText: tpl.buildText(fields, this.data.reqCatId)
    }
  },

  /** 发布成功后清空表单（保留当前品类） */
  resetReqFields() {
    this.setData({
      reqFields: tpl.fieldsFor(this.data.reqCatId),
      reqError: ''
    })
  }
}

module.exports = { data, methods }
