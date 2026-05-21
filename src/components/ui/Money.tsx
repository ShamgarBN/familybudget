import clsx from 'clsx'

const fmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

interface Props {
  value: number
  /** If true, prepend explicit + for positive values. */
  signed?: boolean
  className?: string
  /** Color signal: positive → green, negative → red, neutral → muted italic. */
  tone?: 'auto' | 'plain' | 'income' | 'expense' | 'projected' | 'overspend' | 'neutral'
}

export function Money({ value, signed = false, className, tone = 'plain' }: Props) {
  const safe = Number.isFinite(value) ? value : 0
  const abs = Math.abs(safe)
  const text = (signed && safe > 0 ? '+' : safe < 0 ? '-' : '') + fmt.format(abs)
  let toneClass = ''
  if (tone === 'auto') {
    if (safe > 0) toneClass = 'text-income'
    else if (safe < 0) toneClass = 'text-overspend'
  } else if (tone === 'income') toneClass = 'text-income'
  else if (tone === 'expense') toneClass = 'text-ink'
  else if (tone === 'projected') toneClass = 'text-projected'
  else if (tone === 'overspend') toneClass = 'text-overspend'
  else if (tone === 'neutral') toneClass = 'text-muted italic'
  return (
    <span className={clsx('num', toneClass, className)}>{text}</span>
  )
}

export const formatMoney = (n: number): string =>
  fmt.format(Number.isFinite(n) ? n : 0)
