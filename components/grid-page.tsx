"use client"

import { useState, useMemo, useRef } from "react"
import type { Transaction, Purpose } from "@/lib/types"
import { PASTEL_COLORS, CATEGORY_CARD_COLORS } from "@/lib/types"
import { ArrowLeft, Download, LayoutGrid, Circle, Calendar, TrendingUp, TrendingDown } from "lucide-react"
import { toPng } from "html-to-image"
import { toast } from "sonner"

type ViewMode = "grid" | "swarm" | "bubbles"

interface TimePeriod {
  key: string
  label: string
  filter: (t: Transaction) => boolean
  priorFilter?: (t: Transaction) => boolean
  priorLabel?: string
}

interface GridPageProps {
  transactions: Transaction[]
  onBack: () => void
}

interface GridItem {
  name: string
  totalSent: number
  count: number
  percentage: number
  sublabel: string
}

interface Comparison {
  byCategory: Map<string, { priorAmount: number; changePct: number; direction: "up" | "down" | "new" | "same" }>
  overallPrior: number
  overallChangePct: number
  overallDirection: "up" | "down" | "same"
  priorLabel: string
  overlapMonths: number
  currentMonths: number
}

function buildPeriods(transactions: Transaction[]): TimePeriod[] {
  if (transactions.length === 0) return [{ key: "all", label: "All time", filter: () => true }]

  const years = new Set<number>()
  for (const t of transactions) years.add(new Date(t.date).getFullYear())
  const sortedYears = Array.from(years).sort((a, b) => b - a)

  const now = new Date()
  const periods: TimePeriod[] = [{ key: "all", label: "All time", filter: () => true }]

  const thisYear = now.getFullYear()
  if (sortedYears.includes(thisYear)) {
    const priorYear = thisYear - 1
    periods.push({
      key: "ytd",
      label: `${thisYear} (YTD)`,
      filter: (t) => new Date(t.date).getFullYear() === thisYear,
      priorFilter: sortedYears.includes(priorYear) ? (t) => {
        const d = new Date(t.date)
        return d.getFullYear() === priorYear && d.getMonth() <= now.getMonth()
      } : undefined,
      priorLabel: sortedYears.includes(priorYear) ? `Jan-${now.toLocaleDateString("en-US", { month: "short" })} ${priorYear}` : undefined,
    })
  }

  for (const y of sortedYears) {
    if (y === thisYear) continue
    const priorYear = y - 1
    periods.push({
      key: `${y}`,
      label: `${y}`,
      filter: (t) => new Date(t.date).getFullYear() === y,
      priorFilter: sortedYears.includes(priorYear) ? (t) => new Date(t.date).getFullYear() === priorYear : undefined,
      priorLabel: sortedYears.includes(priorYear) ? `${priorYear}` : undefined,
    })
  }

  const sixMoAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1)
  const threeMoAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1)
  const priorSixStart = new Date(now.getFullYear(), now.getMonth() - 12, 1)
  const priorSixEnd = new Date(now.getFullYear(), now.getMonth() - 6, 1)
  const priorThreeStart = new Date(now.getFullYear(), now.getMonth() - 6, 1)
  const priorThreeEnd = new Date(now.getFullYear(), now.getMonth() - 3, 1)

  periods.push({
    key: "6m",
    label: "Last 6 months",
    filter: (t) => new Date(t.date) >= sixMoAgo,
    priorFilter: (t) => { const d = new Date(t.date); return d >= priorSixStart && d < priorSixEnd },
    priorLabel: `Prior 6 months`,
  })

  periods.push({
    key: "3m",
    label: "Last 3 months",
    filter: (t) => new Date(t.date) >= threeMoAgo,
    priorFilter: (t) => { const d = new Date(t.date); return d >= priorThreeStart && d < priorThreeEnd },
    priorLabel: `Prior 3 months`,
  })

  return periods
}

function summarize(transactions: Transaction[]): GridItem[] {
  const map = new Map<string, { total: number; count: number; subs: Set<string> }>()
  const grandTotal = transactions.reduce((s, t) => s + t.amount, 0)

  for (const txn of transactions) {
    const key = txn.purpose || "Other"
    const sub = txn.recipient || ""
    const existing = map.get(key)
    if (existing) {
      existing.total += txn.amount
      existing.count += 1
      if (sub) existing.subs.add(sub)
    } else {
      map.set(key, { total: txn.amount, count: 1, subs: sub ? new Set([sub]) : new Set() })
    }
  }

  return Array.from(map.entries())
    .map(([name, data]) => ({
      name,
      totalSent: data.total,
      count: data.count,
      percentage: grandTotal > 0 ? Math.round((data.total / grandTotal) * 100) : 0,
      sublabel: `${data.subs.size} ${data.subs.size === 1 ? "person" : "people"}`,
    }))
    .sort((a, b) => b.totalSent - a.totalSent)
}

function computeComparison(
  currentTxns: Transaction[],
  priorTxns: Transaction[],
  priorLabel: string,
): Comparison | null {
  if (priorTxns.length === 0) return null

  const currentMonthSet = new Set<string>()
  const priorMonthSet = new Set<string>()

  for (const t of currentTxns) {
    const d = new Date(t.date)
    currentMonthSet.add(`${d.getMonth()}`)
  }
  for (const t of priorTxns) {
    const d = new Date(t.date)
    priorMonthSet.add(`${d.getMonth()}`)
  }

  const overlapMonths = new Set([...currentMonthSet].filter((m) => priorMonthSet.has(m)))
  if (overlapMonths.size === 0) return null

  const currentFiltered = currentTxns.filter((t) => overlapMonths.has(`${new Date(t.date).getMonth()}`))
  const priorFiltered = priorTxns.filter((t) => overlapMonths.has(`${new Date(t.date).getMonth()}`))

  const currentByCat = new Map<string, number>()
  const priorByCat = new Map<string, number>()

  for (const t of currentFiltered) {
    const cat = t.purpose || "Other"
    currentByCat.set(cat, (currentByCat.get(cat) || 0) + t.amount)
  }
  for (const t of priorFiltered) {
    const cat = t.purpose || "Other"
    priorByCat.set(cat, (priorByCat.get(cat) || 0) + t.amount)
  }

  const allCats = new Set([...currentByCat.keys(), ...priorByCat.keys()])
  const byCategory = new Map<string, { priorAmount: number; changePct: number; direction: "up" | "down" | "new" | "same" }>()

  for (const cat of allCats) {
    const curr = currentByCat.get(cat) || 0
    const prior = priorByCat.get(cat) || 0
    if (prior === 0 && curr > 0) {
      byCategory.set(cat, { priorAmount: 0, changePct: 100, direction: "new" })
    } else if (prior > 0) {
      const pct = Math.round(((curr - prior) / prior) * 100)
      byCategory.set(cat, {
        priorAmount: prior,
        changePct: Math.abs(pct),
        direction: pct > 0 ? "up" : pct < 0 ? "down" : "same",
      })
    }
  }

  const overallCurrent = currentFiltered.reduce((s, t) => s + t.amount, 0)
  const overallPrior = priorFiltered.reduce((s, t) => s + t.amount, 0)
  const overallPct = overallPrior > 0 ? Math.round(((overallCurrent - overallPrior) / overallPrior) * 100) : 0

  return {
    byCategory,
    overallPrior,
    overallChangePct: Math.abs(overallPct),
    overallDirection: overallPct > 0 ? "up" : overallPct < 0 ? "down" : "same",
    priorLabel,
    overlapMonths: overlapMonths.size,
    currentMonths: currentMonthSet.size,
  }
}

function getItemColor(item: GridItem, index: number) {
  const catColor = CATEGORY_CARD_COLORS[item.name as Purpose]
  if (catColor) return catColor
  return PASTEL_COLORS[index % PASTEL_COLORS.length]
}

function computeGridLayout(items: GridItem[]) {
  if (items.length === 0) return { cells: [], maxRow: 1 }

  type Cell = { row: number; col: number; rowSpan: number; colSpan: number; color: { bg: string; text: string; accent: string }; item: GridItem }
  const cells: Cell[] = []
  const n = items.length

  if (n === 1) {
    cells.push({ row: 1, col: 1, rowSpan: 2, colSpan: 3, color: getItemColor(items[0], 0), item: items[0] })
    return { cells, maxRow: 2 }
  }
  if (n === 2) {
    cells.push({ row: 1, col: 1, rowSpan: 2, colSpan: 2, color: getItemColor(items[0], 0), item: items[0] })
    cells.push({ row: 1, col: 3, rowSpan: 2, colSpan: 1, color: getItemColor(items[1], 1), item: items[1] })
    return { cells, maxRow: 2 }
  }

  cells.push({ row: 1, col: 1, rowSpan: 2, colSpan: 2, color: getItemColor(items[0], 0), item: items[0] })
  cells.push({ row: 1, col: 3, rowSpan: 1, colSpan: 1, color: getItemColor(items[1], 1), item: items[1] })
  cells.push({ row: 2, col: 3, rowSpan: 1, colSpan: 1, color: getItemColor(items[2], 2), item: items[2] })

  const remaining = items.slice(3)
  const rows: number[][] = []

  if (remaining.length > 0) {
    let i = 0
    while (i < remaining.length) {
      const left = remaining.length - i
      if (left === 4) { rows.push([i, i + 1]); rows.push([i + 2, i + 3]); i += 4 }
      else if (left === 2) { rows.push([i, i + 1]); i += 2 }
      else if (left === 1) { rows.push([i]); i += 1 }
      else { rows.push([i, i + 1, i + 2]); i += 3 }
    }
  }

  let currentRow = 3
  for (const rowIndices of rows) {
    const count = rowIndices.length
    if (count === 3) {
      for (let c = 0; c < 3; c++) {
        const idx = 3 + rowIndices[c]
        cells.push({ row: currentRow, col: c + 1, rowSpan: 1, colSpan: 1, color: getItemColor(items[idx], idx), item: items[idx] })
      }
    } else if (count === 2) {
      const flip = currentRow % 2 === 0
      const idx0 = 3 + rowIndices[0]
      const idx1 = 3 + rowIndices[1]
      if (flip) {
        cells.push({ row: currentRow, col: 1, rowSpan: 1, colSpan: 2, color: getItemColor(items[idx0], idx0), item: items[idx0] })
        cells.push({ row: currentRow, col: 3, rowSpan: 1, colSpan: 1, color: getItemColor(items[idx1], idx1), item: items[idx1] })
      } else {
        cells.push({ row: currentRow, col: 1, rowSpan: 1, colSpan: 1, color: getItemColor(items[idx0], idx0), item: items[idx0] })
        cells.push({ row: currentRow, col: 2, rowSpan: 1, colSpan: 2, color: getItemColor(items[idx1], idx1), item: items[idx1] })
      }
    } else if (count === 1) {
      const idx0 = 3 + rowIndices[0]
      cells.push({ row: currentRow, col: 1, rowSpan: 1, colSpan: 3, color: getItemColor(items[idx0], idx0), item: items[idx0] })
    }
    currentRow++
  }

  const maxRow = cells.length > 0 ? Math.max(...cells.map((c) => c.row + c.rowSpan - 1)) : 1
  return { cells, maxRow }
}

const CATEGORY_EMOJI: Record<string, string> = {
  Family: "\u{1F3E0}", Friend: "\u{1F91D}", Church: "\u{26EA}", Education: "\u{1F393}",
  Rent: "\u{1F3E2}", Business: "\u{1F4BC}", Medical: "\u{1F3E5}", Emergency: "\u{1F6A8}",
  Savings: "\u{1F4B0}", Gift: "\u{1F381}", Charity: "\u{1F49B}", Other: "\u{1F4CC}",
}

function categoryIcon(name: string) { return CATEGORY_EMOJI[name] || "\u{1F4CC}" }

function packCircles(items: GridItem[], width: number, height: number) {
  if (items.length === 0) return []
  const maxAmount = Math.max(...items.map((i) => i.totalSent))
  const minR = 28
  const maxR = Math.min(width, height) * 0.22

  const circles = items.map((item, i) => {
    const ratio = item.totalSent / maxAmount
    const r = minR + (maxR - minR) * Math.sqrt(ratio)
    return { item, r, x: width / 2, y: height / 2, color: getItemColor(item, i) }
  })

  const cx = width / 2
  const cy = height / 2
  for (let iter = 0; iter < 120; iter++) {
    for (let i = 0; i < circles.length; i++) {
      circles[i].x += (cx - circles[i].x) * 0.02
      circles[i].y += (cy - circles[i].y) * 0.02
      for (let j = i + 1; j < circles.length; j++) {
        const dx = circles[j].x - circles[i].x
        const dy = circles[j].y - circles[i].y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const minDist = circles[i].r + circles[j].r + 4
        if (dist < minDist) {
          const push = (minDist - dist) / 2
          const nx = dx / dist
          const ny = dy / dist
          circles[i].x -= nx * push
          circles[i].y -= ny * push
          circles[j].x += nx * push
          circles[j].y += ny * push
        }
      }
      circles[i].x = Math.max(circles[i].r + 4, Math.min(width - circles[i].r - 4, circles[i].x))
      circles[i].y = Math.max(circles[i].r + 4, Math.min(height - circles[i].r - 4, circles[i].y))
    }
  }
  return circles
}

function fmt(n: number) { return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

function ComparisonBadge({ changePct, direction, size = "sm" }: { changePct: number; direction: "up" | "down" | "new" | "same"; size?: "sm" | "md" }) {
  if (direction === "same") return null
  const isUp = direction === "up" || direction === "new"
  const color = isUp ? "#E53E3E" : "#38A169"
  const label = direction === "new" ? "New" : `${changePct}%`
  const sz = size === "md" ? "text-[11px] px-1.5 py-0.5" : "text-[9px] px-1 py-px"

  return (
    <span className={`inline-flex items-center gap-0.5 ${sz} rounded-full font-bold`}
      style={{ backgroundColor: `${color}18`, color }}>
      {isUp ? <TrendingUp className={size === "md" ? "w-3 h-3" : "w-2.5 h-2.5"} /> : <TrendingDown className={size === "md" ? "w-3 h-3" : "w-2.5 h-2.5"} />}
      {label}
    </span>
  )
}

export function GridPage({ transactions, onBack }: GridPageProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [periodKey, setPeriodKey] = useState("all")
  const [showPeriodPicker, setShowPeriodPicker] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)

  const periods = useMemo(() => buildPeriods(transactions), [transactions])
  const activePeriod = periods.find((p) => p.key === periodKey) || periods[0]

  const filtered = useMemo(() => transactions.filter(activePeriod.filter), [transactions, activePeriod])
  const items = useMemo(() => summarize(filtered), [filtered])
  const gridLayout = useMemo(() => computeGridLayout(items), [items])
  const bubbles = useMemo(() => packCircles(items, 340, 340), [items])
  const totalAmount = filtered.reduce((s, t) => s + t.amount, 0)

  const comparison = useMemo<Comparison | null>(() => {
    if (!activePeriod.priorFilter || !activePeriod.priorLabel) return null
    const priorTxns = transactions.filter(activePeriod.priorFilter)
    return computeComparison(filtered, priorTxns, activePeriod.priorLabel)
  }, [transactions, filtered, activePeriod])

  const dates = filtered.map((t) => new Date(t.date))
  const minDate = dates.length > 0 ? new Date(Math.min(...dates.map((d) => d.getTime()))) : new Date()
  const maxDate = dates.length > 0 ? new Date(Math.max(...dates.map((d) => d.getTime()))) : new Date()
  const monthSpan = Math.max(1, (maxDate.getFullYear() - minDate.getFullYear()) * 12 + (maxDate.getMonth() - minDate.getMonth()) + 1)
  const monthlyAvg = totalAmount / monthSpan
  const yearlyProjection = monthlyAvg * 12

  const handleExport = async () => {
    if (!gridRef.current) return
    try {
      const dataUrl = await toPng(gridRef.current, { backgroundColor: "#F8FAFC", pixelRatio: 3 })
      const link = document.createElement("a")
      link.download = "remittrack-categories.png"
      link.href = dataUrl
      link.click()
      toast.success("Exported as PNG")
    } catch {
      const csvRows = ["Category,Amount,Percentage,Transfers"]
      for (const r of items) csvRows.push(`"${r.name}",${r.totalSent},${r.percentage}%,${r.count}`)
      const blob = new Blob([csvRows.join("\n")], { type: "text/csv" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.download = "remittrack-summary.csv"
      link.href = url
      link.click()
      URL.revokeObjectURL(url)
      toast.success("Exported as CSV")
    }
  }

  const getIcon = (item: GridItem) => categoryIcon(item.name)
  const getCatComparison = (name: string) => comparison?.byCategory.get(name) ?? null

  return (
    <div className="max-w-4xl mx-auto px-4 pb-8">
      {/* View mode switcher */}
      <div className="flex items-center justify-between mt-6 animate-fade-up">
        <div className="inline-flex rounded-2xl bg-white p-1.5 gap-1" style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.03), 0 2px 8px rgba(0,0,0,0.04)" }}>
          {([
            { key: "grid" as ViewMode, icon: LayoutGrid, label: "Grid" },
            { key: "swarm" as ViewMode, icon: () => (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="3" cy="3" r="1.5" fill="currentColor"/><circle cx="7" cy="3" r="1.5" fill="currentColor"/><circle cx="11" cy="3" r="1.5" fill="currentColor"/><circle cx="5" cy="7" r="1.5" fill="currentColor"/><circle cx="9" cy="7" r="1.5" fill="currentColor"/><circle cx="3" cy="11" r="1.5" fill="currentColor"/><circle cx="7" cy="11" r="1.5" fill="currentColor"/><circle cx="11" cy="11" r="1.5" fill="currentColor"/></svg>
            ), label: "Swarm" },
            { key: "bubbles" as ViewMode, icon: Circle, label: "Bubbles" },
          ] as const).map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setViewMode(key)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5 ${
                viewMode === key ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowPeriodPicker(!showPeriodPicker)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-100 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.03), 0 2px 8px rgba(0,0,0,0.04)" }}
        >
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          {activePeriod.label}
        </button>
      </div>

      {showPeriodPicker && (
        <div className="mt-2 animate-scale-in">
          <div className="flex flex-wrap gap-1.5 bg-white rounded-xl border border-slate-100 p-2" style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.03), 0 2px 8px rgba(0,0,0,0.04)" }}>
            {periods.map((p) => (
              <button
                key={p.key}
                onClick={() => { setPeriodKey(p.key); setShowPeriodPicker(false) }}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  periodKey === p.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {comparison && (
        <p className="text-[11px] text-slate-400 mt-2">
          vs {comparison.priorLabel} ({comparison.overlapMonths} overlapping months)
        </p>
      )}

      {/* Visualization */}
      <div ref={gridRef} className="mt-4 rounded-3xl bg-white p-3 animate-fade-up-1" style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.03), 0 2px 8px rgba(0,0,0,0.04)" }}>
        {/* GRID VIEW */}
        {viewMode === "grid" && (
          <div
            className="grid gap-1.5"
            style={{
              gridTemplateColumns: "repeat(3, 1fr)",
              gridTemplateRows: `repeat(${gridLayout.maxRow}, 1fr)`,
            }}
          >
            {gridLayout.cells.map((cell) => {
              const catComp = getCatComparison(cell.item.name)
              return (
                <div
                  key={cell.item.name}
                  className="rounded-2xl p-3 flex flex-col justify-between transition-all hover:scale-[1.01]"
                  style={{
                    gridRow: `${cell.row} / span ${cell.rowSpan}`,
                    gridColumn: `${cell.col} / span ${cell.colSpan}`,
                    backgroundColor: cell.color.bg,
                    border: `1px solid ${cell.color.accent}`,
                    minHeight: cell.rowSpan > 1 ? "160px" : "80px",
                  }}
                >
                  {cell.rowSpan > 1 ? (
                    <>
                      <div className="flex items-start justify-between">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                          style={{ backgroundColor: cell.color.accent, color: cell.color.text }}>
                          {getIcon(cell.item)}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: cell.color.accent, color: cell.color.text }}>{cell.item.percentage}%</span>
                          {catComp && <ComparisonBadge changePct={catComp.changePct} direction={catComp.direction} size="md" />}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-semibold" style={{ color: cell.color.text }}>{cell.item.name}</p>
                        <p className="text-2xl font-bold mt-0.5 tabular-nums" style={{ color: cell.color.text }}>
                          ${fmt(cell.item.totalSent)}
                        </p>
                        <p className="text-[11px] mt-1 opacity-60" style={{ color: cell.color.text }}>{cell.item.sublabel}</p>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center py-1 relative">
                      {catComp && (
                        <div className="absolute top-0 right-0">
                          <ComparisonBadge changePct={catComp.changePct} direction={catComp.direction} />
                        </div>
                      )}
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg mb-1"
                        style={{ backgroundColor: cell.color.accent, color: cell.color.text }}>
                        {getIcon(cell.item)}
                      </div>
                      <p className="text-[11px] font-semibold truncate w-full" style={{ color: cell.color.text }}>
                        {cell.item.name}
                      </p>
                      <p className="text-sm font-bold tabular-nums" style={{ color: cell.color.text }}>
                        ${fmt(cell.item.totalSent)}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* SWARM VIEW */}
        {viewMode === "swarm" && (
          <div className="flex flex-col items-center">
            <div className="relative w-full" style={{ height: "320px" }}>
              {items.slice(0, 12).map((item, i) => {
                const color = getItemColor(item, i)
                const maxAmt = Math.max(...items.map((it) => it.totalSent))
                const sizeRatio = Math.sqrt(item.totalSent / maxAmt)
                const size = 32 + sizeRatio * 40

                const cols = Math.min(items.length, 4)
                const row = Math.floor(i / cols)
                const col = i % cols
                const totalRows = Math.ceil(Math.min(items.length, 12) / cols)
                const xOffset = ((col + 0.5) / cols) * 100
                const yOffset = ((row + 0.5) / totalRows) * 100

                return (
                  <div
                    key={item.name}
                    className="absolute flex flex-col items-center transition-all duration-500"
                    style={{ left: `${xOffset}%`, top: `${yOffset}%`, transform: "translate(-50%, -50%)" }}
                  >
                    <div
                      className="rounded-full flex items-center justify-center font-bold text-xl"
                      style={{
                        width: size, height: size,
                        backgroundColor: color.bg, color: color.text,
                        border: `2px solid ${color.accent}`,
                      }}
                    >
                      {getIcon(item)}
                    </div>
                    <p className="text-[10px] font-semibold text-slate-600 mt-1 text-center max-w-[60px] truncate">{item.name}</p>
                    <p className="text-[10px] font-bold text-slate-400 tabular-nums">${fmt(item.totalSent)}</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* BUBBLES VIEW */}
        {viewMode === "bubbles" && (
          <div className="flex flex-col items-center">
            <div className="relative" style={{ width: "340px", height: "340px" }}>
              {bubbles.map((b) => (
                <div
                  key={b.item.name}
                  className="absolute flex flex-col items-center justify-center rounded-full transition-all duration-500"
                  style={{
                    width: b.r * 2, height: b.r * 2,
                    left: b.x - b.r, top: b.y - b.r,
                    backgroundColor: b.color.bg,
                    border: `2px solid ${b.color.accent}`,
                  }}
                >
                  <div
                    className="rounded-full flex items-center justify-center font-bold text-lg"
                    style={{
                      width: Math.max(b.r * 0.6, 20), height: Math.max(b.r * 0.6, 20),
                      backgroundColor: b.color.accent, color: b.color.text,
                    }}
                  >
                    {getIcon(b.item)}
                  </div>
                  {b.r > 36 && (
                    <p className="text-[9px] font-semibold mt-0.5 text-center max-w-[60px] truncate" style={{ color: b.color.text }}>
                      {b.item.name}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 mt-4 animate-fade-up-2">
        <div className="bg-white rounded-2xl p-4 text-center" style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.03), 0 2px 8px rgba(0,0,0,0.04)" }}>
          <div className="text-xs text-slate-400 mb-1">Total Sent</div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">${fmt(totalAmount)}</div>
          {comparison && <ComparisonBadge changePct={comparison.overallChangePct} direction={comparison.overallDirection} size="md" />}
        </div>
        <div className="bg-white rounded-2xl p-4 text-center" style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.03), 0 2px 8px rgba(0,0,0,0.04)" }}>
          <div className="text-xs text-slate-400 mb-1">Yearly Projection</div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">${fmt(yearlyProjection)}</div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-between mt-6 animate-fade-up-3">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-5 py-2.5 bg-white rounded-xl border border-slate-100 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-all"
          style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.03), 0 2px 8px rgba(0,0,0,0.04)" }}
        >
          <Download className="w-4 h-4" />
          Export
        </button>
      </div>
    </div>
  )
}
