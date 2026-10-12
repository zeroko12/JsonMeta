import { describe, expect, it } from 'vitest'
import { fastSearchTree } from '../../../src/shared/utils/tree-search'

describe('fastSearchTree', () => {
  const sampleJson = {
    server: {
      port: 8080,
      host: 'localhost',
      features: ['logging', 'metrics'],
    },
    database: {
      name: 'ion_db',
      replicaCount: 2,
    },
    molecules: [
      { id: 'mol-1', formula: 'H2O' },
      { id: 'mol-2', formula: 'CO2' },
    ],
  }

  const descriptions = {
    'server.port': '服务网络端口号',
    'server.host': '服务绑定主机',
    'database.name': '主数据库库名',
    'molecules.0.formula': '水分子化学式',
    'molecules.1.formula': '二氧化碳分子结构',
  }

  it('searches by description (desc)', () => {
    // 搜索"分子"
    const results = fastSearchTree(sampleJson, descriptions, '分子', 'desc')
    expect(results).toEqual(['molecules.0.formula', 'molecules.1.formula'])

    // 搜索"端口"
    const portResults = fastSearchTree(sampleJson, descriptions, '端口', 'desc')
    expect(portResults).toEqual(['server.port'])

    // 无匹配
    expect(fastSearchTree(sampleJson, descriptions, '不存在的内容', 'desc')).toEqual([])
  })

  it('searches by key (key)', () => {
    const results = fastSearchTree(sampleJson, descriptions, 'replica', 'key')
    expect(results).toEqual(['database.replicaCount'])

    const portResults = fastSearchTree(sampleJson, descriptions, 'port', 'key')
    expect(portResults).toEqual(['server.port'])
  })

  it('searches by value (val)', () => {
    const results = fastSearchTree(sampleJson, descriptions, '8080', 'val')
    expect(results).toEqual(['server.port'])

    const stringVal = fastSearchTree(sampleJson, descriptions, 'H2O', 'val')
    expect(stringVal).toEqual(['molecules.0.formula'])
  })

  it('searches across all (all)', () => {
    // 匹配 key
    expect(fastSearchTree(sampleJson, descriptions, 'database', 'all')).toContain('database')
    // 匹配 desc
    expect(fastSearchTree(sampleJson, descriptions, '水分子', 'all')).toContain(
      'molecules.0.formula',
    )
    // 匹配 val
    expect(fastSearchTree(sampleJson, descriptions, 'metrics', 'all')).toContain(
      'server.features.1',
    )
  })

  it('supports pinyin initials search for Chinese descriptions', () => {
    // "服务网络端口号" -> fwwldkh
    const results = fastSearchTree(sampleJson, descriptions, 'dkh', 'desc')
    expect(results).toEqual(['server.port'])
  })

  it('returns empty array when query is empty or input is null', () => {
    expect(fastSearchTree(null, descriptions, 'test', 'all')).toEqual([])
    expect(fastSearchTree(sampleJson, descriptions, '', 'all')).toEqual([])
    expect(fastSearchTree(sampleJson, descriptions, '   ', 'all')).toEqual([])
  })
})
