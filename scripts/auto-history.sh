#!/bin/bash
set -e
F='src/renderer/components/FieldRow.vue'

# 1. inject pushChange function after `const annotations = useAnnotationsStore()`
awk '
  /const annotations = useAnnotationsStore\(\)/ {
    print
    print ""
    print "function pushChange(newValue: unknown) {"
    print "  const old = currentValue()"
    print "  if (old !== newValue)"
    print "    annotations.pushHistory({ path: props.field.fieldPath, oldValue: old, newValue, type: '\''modify'\'' })"
    print "}"
    next
  }
  { print }
' "$F" > "$F.new" && mv "$F.new" "$F"

# 2. add pushChange(v) before each set call
sed -i 's|configStore\.current = set(configStore\.current as JsonValue, props\.field\.fieldPath, v as JsonValue)|pushChange(v)\n  configStore.current = set(configStore.current as JsonValue, props.field.fieldPath, v as JsonValue)|g' "$F"

echo "ok"
