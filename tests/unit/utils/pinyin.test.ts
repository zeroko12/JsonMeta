import { describe, expect, it } from 'vitest'
import {
  getPinyinInitials,
  matchTextOrPinyin,
  highlightMatch,
} from '../../../src/shared/utils/pinyin'

describe('pinyin & search utils', () => {
  it('extracts pinyin initials correctly for common Chinese terms', () => {
    expect(getPinyinInitials('数据库')).toBe('sjk')
    expect(getPinyinInitials('超时时间')).toBe('cssj')
    expect(getPinyinInitials('连接池大小')).toBe('ljcdx')
    expect(getPinyinInitials('Port 8080')).toBe('port 8080')
  })

  it('matches direct substrings', () => {
    const res = matchTextOrPinyin('DatabasePort', 'base')
    expect(res.matched).toBe(true)
    expect(res.start).toBe(4)
    expect(res.end).toBe(8)
    expect(res.isPinyin).toBe(false)
  })

  it('matches Chinese via pinyin initials', () => {
    const res = matchTextOrPinyin('MySQL数据库连接', 'sjk')
    expect(res.matched).toBe(true)
    expect(res.start).toBe(5) // '数' is at index 5
    expect(res.end).toBe(8) // '数据库' (3 chars)
    expect(res.isPinyin).toBe(true)
  })

  it('highlights direct text match with mark tag', () => {
    const html = highlightMatch('server.port', 'port')
    expect(html).toBe('server.<mark class="search-kw">port</mark>')
  })

  it('highlights Chinese text when searched by pinyin initials', () => {
    const html = highlightMatch('默认数据库配置', 'sjk')
    expect(html).toBe('默认<mark class="search-kw">数据库</mark>配置')
  })

  it('escapes dangerous HTML chars', () => {
    const html = highlightMatch('<script>alert(1)</script>', 'alert')
    expect(html).toContain('&lt;script&gt;<mark class="search-kw">alert</mark>(1)&lt;/script&gt;')
  })
})
