const api = require('./utils/api')

App({
  globalData: {
    session: null,
    provider: null,
    isStaff: false,
    settings: null
  },

  onLaunch() {
    this.bootstrap()
  },

  /** 恢复会话与身份，全局只做一次 */
  async bootstrap() {
    try {
      const session = await api.getSession()
      this.globalData.session = session || null
      if (session) {
        await this.refreshIdentity(session)
      }
    } catch (e) {
      console.error('[app] bootstrap failed', JSON.stringify({ message: e.message }))
    }
  },

  /** 载入服务者身份与平台配置 */
  async refreshIdentity(session) {
    const uid = session && session.user ? session.user.id : ''
    try {
      const provider = await api.getMyProvider(uid)
      this.globalData.provider = provider || null
      this.globalData.isStaff = await api.isStaff(uid)
    } catch (e) {
      console.error('[app] refreshIdentity failed', JSON.stringify({ message: e.message }))
    }
    try {
      const settings = await api.getSettings()
      this.globalData.settings = settings
    } catch (e) {
      console.error('[app] loadSettings failed', JSON.stringify({ message: e.message }))
    }
  },

  /** 登录成功后刷新全局身份 */
  async onLogin(session) {
    this.globalData.session = session || null
    await this.refreshIdentity(session)
  },

  /** 退出登录 */
  async onLogout() {
    try {
      await api.signOut()
    } catch (e) {
      console.error('[app] signOut failed', JSON.stringify({ message: e.message }))
    }
    this.globalData.session = null
    this.globalData.provider = null
    this.globalData.isStaff = false
  }
})
