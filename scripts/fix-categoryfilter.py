p = 'src/renderer/components/CategoryFilter.vue'
with open(p, encoding='utf-8') as f:
    txt = f.read()

old = """    <div class="header">
      <span class="title">类别</span>
      <button class="toggle-all" @click="toggleAll">
        {{ isAllOn() ? '全不选' : '全选' }}
      </button>
    </div>"""
new = """    <div class="header" title="勾选要在主区显示的类别">
      <span class="title">类别</span>
      <button class="toggle-all" @click="toggleAll">
        {{ isAllOn() ? '全不选' : '全选' }}
      </button>
    </div>"""
if old in txt:
    txt = txt.replace(old, new, 1)

# add tooltip to each item
old2 = """        <label>
          <input
            type="checkbox"
            :checked="isAllOn() || enabled.has(c.key)"
            @change="toggle(c.key)"
          />
          <code class="key">{{ c.key }}</code>
          <span class="count">{{ c.count }}</span>
        </label>"""
new2 = """        <label :title="`勾选后主区显示 ${c.key} 字段(${c.count} 个)`">
          <input
            type="checkbox"
            :checked="isAllOn() || enabled.has(c.key)"
            @change="toggle(c.key)"
          />
          <code class="key">{{ c.key }}</code>
          <span class="count">{{ c.count }}</span>
        </label>"""
if old2 in txt:
    txt = txt.replace(old2, new2, 1)

with open(p, 'w', encoding='utf-8') as f:
    f.write(txt)
print('ok')
