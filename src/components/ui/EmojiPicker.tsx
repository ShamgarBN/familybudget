import { useState } from 'react'

const COMMON_EMOJIS =
  '💼 🧾 🏠 💡 💧 📶 📱 🛡️ 🔁 🤝 🛒 🛍️ 🚗 🏡 🍔 🧒 👧 👩 🎨 👨 🛠️ 🍞 🐶 🎄 📌 ☕ 🍕 🍷 🍺 🎁 ✈️ 🚌 🚇 ⛽ 🏥 💊 🎬 🎮 🎵 📚 ✂️ 🧹 🏋️ ⚽ 🛁 🛏️ 🪑 🍳 💸 💰 🏦 📈 📉 ⭐ 🔧 🔨 🌳 🌷 🐱 🐰 🦴 💍 🎂 🎓 🩺 🧴 🪥'.split(
    ' ',
  )

interface Props {
  value: string
  onChange: (e: string) => void
}

export function EmojiPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative inline-block">
      <button
        type="button"
        className="w-10 h-10 rounded-md border border-line bg-white text-xl hover:border-accent/40"
        onClick={() => setOpen((v) => !v)}
        aria-label="Pick emoji"
      >
        {value || '📌'}
      </button>
      {open && (
        <div
          className="absolute z-30 mt-1 left-0 card p-2 grid grid-cols-8 gap-1 max-h-56 overflow-y-auto w-72"
          onMouseLeave={() => setOpen(false)}
        >
          {COMMON_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              className="w-8 h-8 rounded hover:bg-slate-100 text-lg"
              onClick={() => {
                onChange(e)
                setOpen(false)
              }}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
