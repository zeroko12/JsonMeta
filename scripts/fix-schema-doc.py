p = 'src/shared/csharp-parser/schema-builder.ts'
with open(p, encoding='utf-8') as f:
    txt = f.read()

old = '''export interface SchemaDocument {
  _meta: SchemaMeta
  _templates?: Record<string, SchemaField>
  [subConfig: string]: SchemaField | SchemaMeta | Record<string, SchemaField> | undefined
}'''
new = '''export interface SchemaDocument {
  _meta: SchemaMeta
  _templates?: Record<string, SchemaField>
  // 索引签名放宽为 unknown,避免和 SchemaField._fields 互相递归产生深类型实例化
  [subConfig: string]: unknown
}'''
assert old in txt
txt = txt.replace(old, new, 1)
with open(p, 'w', encoding='utf-8') as f:
    f.write(txt)
print('ok')
