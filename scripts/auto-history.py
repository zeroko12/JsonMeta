p = 'src/renderer/components/FieldRow.vue'
with open(p, encoding='utf-8') as f:
    txt = f.read()

old_stores = """const uiStore = useUiStore()

// 折叠/展开 object/array 子字段"""
new_stores = """const uiStore = useUiStore()
const annotations = useAnnotationsStore()

function pushChange(newValue: unknown) {
  const old = currentValue()
  if (old !== newValue)
    annotations.pushHistory({ path: props.field.fieldPath, oldValue: old, newValue, type: 'modify' })
}

// 折叠/展开 object/array 子字段"""
assert old_stores in txt
txt = txt.replace(old_stores, new_stores, 1)

old_set_funcs = '''function setBool(v: boolean) {
  configStore.current = set(configStore.current as JsonValue, props.field.fieldPath, v as JsonValue)
}
function setString(v: string) {
  configStore.current = set(configStore.current as JsonValue, props.field.fieldPath, v as JsonValue)
}
function setInt(v: number) {
  configStore.current = set(configStore.current as JsonValue, props.field.fieldPath, v as JsonValue)
}
function setDouble(v: number) {
  configStore.current = set(configStore.current as JsonValue, props.field.fieldPath, v as JsonValue)
}
function setEnum(v: string) {
  configStore.current = set(configStore.current as JsonValue, props.field.fieldPath, v as JsonValue)
}'''

new_set_funcs = '''function setBool(v: boolean) {
  pushChange(v)
  configStore.current = set(configStore.current as JsonValue, props.field.fieldPath, v as JsonValue)
}
function setString(v: string) {
  pushChange(v)
  configStore.current = set(configStore.current as JsonValue, props.field.fieldPath, v as JsonValue)
}
function setInt(v: number) {
  pushChange(v)
  configStore.current = set(configStore.current as JsonValue, props.field.fieldPath, v as JsonValue)
}
function setDouble(v: number) {
  pushChange(v)
  configStore.current = set(configStore.current as JsonValue, props.field.fieldPath, v as JsonValue)
}
function setEnum(v: string) {
  pushChange(v)
  configStore.current = set(configStore.current as JsonValue, props.field.fieldPath, v as JsonValue)
}'''
assert old_set_funcs in txt
txt = txt.replace(old_set_funcs, new_set_funcs, 1)

with open(p, 'w', encoding='utf-8') as f:
    f.write(txt)
print('ok')
