p = 'src/renderer/components/FlatFieldList.vue'
with open(p, encoding='utf-8') as f:
    txt = f.read()

# 1. import virtual scroller
old_imp = """import { computed } from 'vue'
import { useConfigStore } from '../stores/config'
import { useSchemaStore } from '../stores/schema'
import { useUiStore } from '../stores/ui'
import FieldRow from './FieldRow.vue'"""
new_imp = """import { computed } from 'vue'
import { RecycleScroller } from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import { useConfigStore } from '../stores/config'
import { useSchemaStore } from '../stores/schema'
import { useUiStore } from '../stores/ui'
import FieldRow from './FieldRow.vue'"""
assert old_imp in txt
txt = txt.replace(old_imp, new_imp, 1)

# 2. Replace flat rows rendering with RecycleScroller
old_template = """    <div v-else class="rows">
      <FieldRow
        v-for="row in filteredRows"
        :key="row.fieldPath"
        :field-name="row.fieldName"
        :field-path="row.fieldPath"
        :field-type="row.fieldType"
        :description="row.description"
        :enum-values="row.enumValues"
        :enum-str-values="row.enumStrValues"
        :is-read-only="row.isReadOnly"
        :is-modified="row.isModified"
        :depth="row.depth"
        :has-children="row.hasChildren"
      />
    </div>"""
new_template = """    <div v-else class="rows-scroller">
      <RecycleScroller
        :items="filteredRows"
        :item-size="62"
        key-field="fieldPath"
        v-slot="{ item }"
      >
        <FieldRow
          :field-name="item.fieldName"
          :field-path="item.fieldPath"
          :field-type="item.fieldType"
          :description="item.description"
          :enum-values="item.enumValues"
          :enum-str-values="item.enumStrValues"
          :is-read-only="item.isReadOnly"
          :is-modified="item.isModified"
          :depth="item.depth"
          :has-children="item.hasChildren"
        />
      </RecycleScroller>
    </div>"""
assert old_template in txt
txt = txt.replace(old_template, new_template, 1)

# 3. Update CSS for scroller
old_css = """.flat-list {
  flex: 1;
  overflow: auto;
  background: white;
}
.empty {
  padding: 80px 40px;
  text-align: center;
  color: #999;
}
.rows {
  padding: 8px 0;
}"""
new_css = """.flat-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: white;
  min-height: 0;
}
.empty {
  padding: 80px 40px;
  text-align: center;
  color: #999;
}
.rows-scroller {
  flex: 1;
  min-height: 0;
}"""
assert old_css in txt
txt = txt.replace(old_css, new_css, 1)

with open(p, 'w', encoding='utf-8') as f:
    f.write(txt)
print('ok')
