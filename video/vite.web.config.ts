import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {resolve} from 'path'

/**
 * 网页端嵌入包构建
 *
 * 产物：webapp/js/dataviz.js（IIFE，挂 window.WBDataViz）
 * 管理端 admin.html 直接 <script src="js/dataviz.js"> 引入即可。
 */
export default defineConfig({
  plugins: [react()],
  define: {
    // 浏览器里没有 process，React 依赖包里会引用 process.env.NODE_ENV
    'process.env.NODE_ENV': JSON.stringify('production')
  },
  build: {
    outDir: resolve(__dirname, '../webapp/js'),
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/web-entry.tsx'),
      name: 'WBDataViz',
      formats: ['iife'],
      fileName: () => 'dataviz.js'
    },
    rollupOptions: {
      output: {
        assetFileNames: 'dataviz.[ext]'
      }
    },
    chunkSizeWarningLimit: 2000
  }
})
