import { v4 as uuid } from 'uuid'
import { Modal } from './ui/Modal'
import { useStore } from '../store/store'
import { sortedCategories } from '../store/selectors'
import { EmojiPicker } from './ui/EmojiPicker'
import type { Category, Subcategory } from '../types'

interface Props {
  onClose: () => void
}

export function CategoryManagerModal({ onClose }: Props) {
  const categories = useStore((s) => s.categories)
  const upsertCategory = useStore((s) => s.upsertCategory)
  const deleteCategory = useStore((s) => s.deleteCategory)
  const upsertSubcategory = useStore((s) => s.upsertSubcategory)
  const deleteSubcategory = useStore((s) => s.deleteSubcategory)

  const sorted = sortedCategories(categories)

  const addCategory = () => {
    upsertCategory({
      id: `cat_${uuid()}`,
      name: 'New category',
      emoji: '📌',
      color: '#64748b',
      allowsSubs: false,
      subs: [],
    })
  }

  const updateCat = (cat: Category, patch: Partial<Category>) => {
    upsertCategory({ ...cat, ...patch })
  }

  const updateSub = (cat: Category, sub: Subcategory, patch: Partial<Subcategory>) => {
    upsertSubcategory(cat.id, { ...sub, ...patch })
  }

  const addSub = (cat: Category) => {
    upsertSubcategory(cat.id, {
      id: `sub_${uuid()}`,
      name: 'New sub',
      emoji: '📎',
      color: cat.color,
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Categories"
      size="xl"
      footer={
        <>
          <button className="btn mr-auto" onClick={addCategory}>
            + Add category
          </button>
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <ul className="space-y-3">
        {sorted.map((c) => (
          <li
            key={c.id}
            className="rounded-lg border border-line p-3 bg-slate-50/40"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <EmojiPicker
                value={c.emoji}
                onChange={(e) => updateCat(c, { emoji: e })}
              />
              <input
                type="color"
                className="w-9 h-9 rounded-md border border-line bg-white cursor-pointer"
                value={c.color}
                onChange={(e) => updateCat(c, { color: e.target.value })}
              />
              <input
                className="input flex-1 min-w-[180px]"
                value={c.name}
                onChange={(e) => updateCat(c, { name: e.target.value })}
              />
              <label className="text-xs flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={c.allowsSubs}
                  onChange={(e) => updateCat(c, { allowsSubs: e.target.checked })}
                />
                Allow subs
              </label>
              {c.allowsSubs && (
                <button className="btn" onClick={() => addSub(c)}>
                  + Sub
                </button>
              )}
              {!c.isIncome && (
                <button
                  className="btn btn-danger"
                  onClick={() => {
                    if (
                      confirm(
                        `Delete category "${c.name}"? Existing transactions will keep their tag but show as missing.`,
                      )
                    ) {
                      deleteCategory(c.id)
                    }
                  }}
                >
                  Delete
                </button>
              )}
            </div>

            {c.allowsSubs && c.subs.length > 0 && (
              // Render subs in their stored insertion order while editing so
              // typing a new name doesn't rip the row out from under the
              // user's caret. Pickers elsewhere in the app re-sort A→Z
              // independently for display.
              <ul className="mt-2 ml-4 space-y-1.5">
                {c.subs.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-2 bg-white rounded-md border border-line p-2"
                  >
                    <EmojiPicker
                      value={s.emoji}
                      onChange={(e) => updateSub(c, s, { emoji: e })}
                    />
                    <input
                      type="color"
                      className="w-9 h-9 rounded-md border border-line bg-white cursor-pointer"
                      value={s.color}
                      onChange={(e) => updateSub(c, s, { color: e.target.value })}
                    />
                    <input
                      className="input flex-1"
                      value={s.name}
                      onChange={(e) => updateSub(c, s, { name: e.target.value })}
                    />
                    <button
                      className="btn btn-danger"
                      onClick={() => {
                        if (confirm(`Delete sub "${s.name}"?`)) {
                          deleteSubcategory(c.id, s.id)
                        }
                      }}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </Modal>
  )
}
