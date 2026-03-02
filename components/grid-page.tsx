"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import type { Transaction, Purpose } from "@/lib/types"
import { PASTEL_COLORS, CATEGORY_CARD_COLORS } from "@/lib/types"
import { ArrowLeft, Download, LayoutGrid, Circle, Calendar, TrendingUp, TrendingDown, Settings, Sparkles } from "lucide-react"
import { toPng } from "html-to-image"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

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

function summarize(transactions: Transaction[], monthSpan: number): GridItem[] {
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
    .map(([name, data]) => {
      const monthlyAvg = data.total / monthSpan
      const yearlyProjection = monthlyAvg * 12

      return {
        name,
        totalSent: data.total,
        count: data.count,
        percentage: grandTotal > 0 ? Math.round((data.total / grandTotal) * 100) : 0,
        sublabel: `~$${fmt(yearlyProjection)}/yr`,
      }
    })
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
  const minR = 24
  const maxR = Math.min(width, height) * 0.16

  const cx = width / 2
  const cy = height / 2

  // Sort items by size (largest first) and create circles
  const sortedItems = items
    .map((item, originalIndex) => ({ item, originalIndex }))
    .sort((a, b) => b.item.totalSent - a.item.totalSent)

  const circles = sortedItems.map((data, i) => {
    const ratio = data.item.totalSent / maxAmount
    const r = minR + (maxR - minR) * Math.sqrt(ratio)

    // Place largest circle at center, others in a spiral pattern
    let x, y
    if (i === 0) {
      x = cx
      y = cy
    } else {
      const angle = (i / sortedItems.length) * Math.PI * 2
      const spiralRadius = 60 + (i * 15)
      x = cx + Math.cos(angle) * spiralRadius
      y = cy + Math.sin(angle) * spiralRadius
    }

    return {
      item: data.item,
      r,
      x,
      y,
      color: getItemColor(data.item, data.originalIndex)
    }
  })

  for (let iter = 0; iter < 300; iter++) {
    for (let i = 0; i < circles.length; i++) {
      // Very weak centering force - only to keep pack from drifting
      circles[i].x += (cx - circles[i].x) * 0.005
      circles[i].y += (cy - circles[i].y) * 0.005

      for (let j = i + 1; j < circles.length; j++) {
        const dx = circles[j].x - circles[i].x
        const dy = circles[j].y - circles[i].y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const minDist = circles[i].r + circles[j].r + 8
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
      circles[i].x = Math.max(circles[i].r + 16, Math.min(width - circles[i].r - 16, circles[i].x))
      circles[i].y = Math.max(circles[i].r + 16, Math.min(height - circles[i].r - 16, circles[i].y))
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
  const [showSettings, setShowSettings] = useState(false)
  const [selectedCurrency, setSelectedCurrency] = useState("USD")
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({})
  const [loadingRates, setLoadingRates] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)

  // Currency symbols mapping
  const CURRENCY_SYMBOLS: Record<string, string> = {
    USD: "$",
    EUR: "€",
    GBP: "£",
    NGN: "₦",
    GHS: "₵",
    KES: "KSh",
    ZAR: "R",
    CAD: "C$",
    AUD: "A$",
    INR: "₹",
    JPY: "¥",
    CNY: "¥",
  }

  // Fetch exchange rates on mount
  useEffect(() => {
    const fetchRates = async () => {
      setLoadingRates(true)
      try {
        const response = await fetch(
          'https://v6.exchangerate-api.com/v6/95b18d8324f589dcb2ad1a43/latest/USD'
        )
        const data = await response.json()
        if (data.conversion_rates) {
          setExchangeRates(data.conversion_rates)
        }
      } catch (error) {
        console.error('Failed to fetch exchange rates:', error)
        toast.error('Failed to load exchange rates')
      } finally {
        setLoadingRates(false)
      }
    }
    fetchRates()
  }, [])

  // Load saved currency preference
  useEffect(() => {
    const saved = localStorage.getItem('remittrack-currency')
    if (saved) {
      setSelectedCurrency(saved)
    }
  }, [])

  // Persist currency selection
  useEffect(() => {
    localStorage.setItem('remittrack-currency', selectedCurrency)
  }, [selectedCurrency])

  // Convert amount from USD to selected currency
  const convertCurrency = (amountUSD: number): number => {
    if (selectedCurrency === 'USD' || !exchangeRates[selectedCurrency]) {
      return amountUSD
    }
    return amountUSD * exchangeRates[selectedCurrency]
  }

  // Format currency with symbol
  const formatCurrency = (amount: number): string => {
    const symbol = CURRENCY_SYMBOLS[selectedCurrency] || selectedCurrency
    const converted = convertCurrency(amount)
    const decimals = ['JPY', 'KRW'].includes(selectedCurrency) ? 0 : 2

    return `${symbol}${converted.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    })}`
  }

  const periods = useMemo(() => buildPeriods(transactions), [transactions])
  const activePeriod = periods.find((p) => p.key === periodKey) || periods[0]

  const filtered = useMemo(() => transactions.filter(activePeriod.filter), [transactions, activePeriod])

  const dates = useMemo(() => filtered.map((t) => new Date(t.date)), [filtered])
  const minDate = dates.length > 0 ? new Date(Math.min(...dates.map((d) => d.getTime()))) : new Date()
  const maxDate = dates.length > 0 ? new Date(Math.max(...dates.map((d) => d.getTime()))) : new Date()
  const monthSpan = useMemo(
    () => Math.max(1, (maxDate.getFullYear() - minDate.getFullYear()) * 12 + (maxDate.getMonth() - minDate.getMonth()) + 1),
    [minDate, maxDate]
  )

  const items = useMemo(() => summarize(filtered, monthSpan), [filtered, monthSpan])
  const gridLayout = useMemo(() => computeGridLayout(items), [items])
  const bubbles = useMemo(() => packCircles(items, 500, 380), [items])
  const totalAmount = filtered.reduce((s, t) => s + t.amount, 0)

  const comparison = useMemo<Comparison | null>(() => {
    if (!activePeriod.priorFilter || !activePeriod.priorLabel) return null
    const priorTxns = transactions.filter(activePeriod.priorFilter)
    return computeComparison(filtered, priorTxns, activePeriod.priorLabel)
  }, [transactions, filtered, activePeriod])

  const monthlyAvg = totalAmount / monthSpan
  const yearlyProjection = monthlyAvg * 12

  const handleExport = async () => {
    if (!gridRef.current) return
    try {
      toast.info("Generating image...")
      const dataUrl = await toPng(gridRef.current, {
        backgroundColor: "#FFFFFF",
        pixelRatio: 2,
        cacheBust: true,
      })
      const link = document.createElement("a")
      link.download = `remittrack-${viewMode}-${new Date().getTime()}.png`
      link.href = dataUrl
      link.click()
      toast.success("Exported as PNG!")
    } catch (error) {
      console.error("Export failed:", error)
      toast.error("Export failed. Trying CSV fallback...")
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
    <div className="max-w-xl mx-auto px-4 pb-16 pt-12">
      {/* View mode switcher */}
      <div className="flex items-center justify-between mb-12 animate-fade-up">
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
      <div ref={gridRef} className="mt-4 rounded-3xl p-4 animate-fade-up-1" style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.03), 0 2px 8px rgba(0,0,0,0.04)", background: "linear-gradient(180deg, #FEFEFE 0%, #FAFBFF 100%)" }}>
        {/* GRID VIEW */}
        {viewMode === "grid" && (
          <div
            className="grid gap-2.5"
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
                  className="rounded-2xl p-4 flex flex-col justify-between transition-all duration-200 cursor-pointer hover:scale-[1.02] hover:shadow-lg"
                  style={{
                    gridRow: `${cell.row} / span ${cell.rowSpan}`,
                    gridColumn: `${cell.col} / span ${cell.colSpan}`,
                    background: `linear-gradient(135deg, rgba(255,255,255,0.4) 0%, ${cell.color.bg} 100%)`,
                    minHeight: cell.rowSpan > 1 ? "180px" : "90px",
                  }}
                >
                  {cell.rowSpan > 1 ? (
                    <>
                      <div className="flex items-start justify-between">
                        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl"
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
                        <p className="text-2xl font-bold mt-1 tabular-nums" style={{ color: cell.color.text }}>
                          ${fmt(cell.item.totalSent)}
                        </p>
                        <p className="text-[11px] mt-1.5 opacity-60" style={{ color: cell.color.text }}>{cell.item.sublabel}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-start justify-between">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
                          style={{ backgroundColor: cell.color.accent, color: cell.color.text }}>
                          {getIcon(cell.item)}
                        </div>
                        <div className="flex items-center gap-1">
                          {catComp && <ComparisonBadge changePct={catComp.changePct} direction={catComp.direction} />}
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: cell.color.accent, color: cell.color.text }}>{cell.item.percentage}%</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold truncate" style={{ color: cell.color.text }}>
                          {cell.item.name}
                        </p>
                        <p className="text-sm font-bold tabular-nums" style={{ color: cell.color.text }}>
                          ${fmt(cell.item.totalSent)}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* SWARM VIEW */}
        {viewMode === "swarm" && (
          <div className="flex flex-col items-center">
            <div className="relative w-full rounded-xl overflow-hidden" style={{ height: "400px", backgroundColor: "#F1F5F9" }}>
              {/* Average reference line */}
              <div className="absolute left-4 right-4 border-t border-slate-300/40" style={{ top: "50%" }} />

              {items.slice(0, 12).sort((a, b) => a.totalSent - b.totalSent).map((item, i) => {
                const originalIndex = items.findIndex(it => it.name === item.name)
                const color = getItemColor(item, originalIndex)
                const maxAmt = Math.max(...items.map((it) => it.totalSent))
                const itemMonthlyAvg = item.totalSent / monthSpan
                const sizeRatio = Math.sqrt(item.totalSent / maxAmt)
                const size = 36 + sizeRatio * 36

                const n = Math.min(items.length, 12)
                const xOffset = ((i + 0.5) / Math.min(n, 6)) * 100
                const row = Math.floor(i / 6)

                // Alternating above/below pattern to ensure both zones are populated
                // Even indices (0, 2, 4, 6, 8, 10) → above the line
                // Odd indices (1, 3, 5, 7, 9, 11) → below the line
                const ABOVE_MIN = 15  // 15% from top
                const ABOVE_MAX = 45  // to 45% (just above center line)
                const BELOW_MIN = 55  // 55% from top (just below center line)
                const BELOW_MAX = 85  // to 85%

                // Calculate value range for all displayed items
                const displayedItems = items.slice(0, 12).sort((a, b) => a.totalSent - b.totalSent)
                const displayedValues = displayedItems.map(it => (it.totalSent / monthSpan))
                const minValue = Math.min(...displayedValues)
                const maxValue = Math.max(...displayedValues)
                const valueRange = maxValue - minValue || 1  // Prevent division by zero

                // Normalize item's value within the overall range (0 to 1)
                const normalizedValue = (itemMonthlyAvg - minValue) / valueRange

                // Alternate between above/below zones based on index
                const isEvenIndex = i % 2 === 0
                const zone = isEvenIndex ? [ABOVE_MIN, ABOVE_MAX] : [BELOW_MIN, BELOW_MAX]
                const yOffset = zone[0] + normalizedValue * (zone[1] - zone[0])

                return (
                  <div
                    key={item.name}
                    className="absolute flex flex-col items-center transition-all duration-500 group"
                    style={{ left: `${Math.min(Math.max(xOffset, 10), 90)}%`, top: `${Math.min(Math.max(yOffset, 8), 70)}%`, transform: "translate(-50%, -50%)", zIndex: 10 }}
                  >
                    {/* Tooltip with 2 rows on hover - always above circle */}
                    <div
                      className="absolute opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-20"
                      style={{
                        left: xOffset < 25 ? 'auto' : xOffset > 75 ? 'auto' : '50%',
                        right: xOffset > 75 ? '0' : 'auto',
                        bottom: '100%',
                        transform: xOffset >= 25 && xOffset <= 75 ? 'translateX(-50%)' : 'none',
                        marginBottom: '8px'
                      }}
                    >
                      <div className="bg-slate-900 text-white rounded-lg px-3 py-2 shadow-lg">
                        <p className="text-xs font-semibold whitespace-nowrap leading-tight">
                          {item.name}
                        </p>
                        <p className="text-[11px] text-slate-300 whitespace-nowrap leading-tight mt-0.5">
                          ${fmt(item.totalSent / monthSpan)}/mo
                        </p>
                      </div>
                      <div className="w-2 h-2 bg-slate-900 rotate-45 mx-auto -mt-1" />
                    </div>
                    <div
                      className="rounded-full flex items-center justify-center font-bold text-xl transition-transform duration-200 hover:scale-110"
                      style={{
                        width: size, height: size,
                        backgroundColor: color.bg, color: color.text,
                        border: `2.5px solid ${color.accent}`,
                        boxShadow: `0 2px 8px ${color.accent}40`,
                      }}
                    >
                      {getIcon(item)}
                    </div>
                  </div>
                )
              })}

              {/* Monthly Amount label inside container */}
              <p className="absolute bottom-3 left-0 right-0 text-center text-[10px] font-semibold text-slate-400 tracking-[0.2em] uppercase">
                Monthly Amount
              </p>
            </div>
          </div>
        )}

        {/* BUBBLES VIEW */}
        {viewMode === "bubbles" && (
          <div className="flex flex-col items-center">
            <div className="relative w-full rounded-xl overflow-hidden" style={{ height: "400px", backgroundColor: "#F1F5F9" }}>
              {bubbles.map((b) => {
                const perMonth = b.item.totalSent / monthSpan
                const d = b.r * 2
                const pctX = (b.x / 500) * 100
                const pctY = (b.y / 380) * 100
                const pctR = (b.r / 500) * 100

                // Calculate responsive font sizes based on radius
                const nameFontSize = Math.max(8, Math.min(b.r * 0.2, 12))
                const priceFontSize = Math.max(9, Math.min(b.r * 0.24, 14))
                const iconFontSize = Math.max(b.r * 0.5, 14)

                // Three tiers: icon+name+price, name+price only, icon only
                const showIconNamePrice = b.r >= 50
                const showNamePrice = b.r >= 35 && b.r < 50
                const showIconOnly = b.r < 35

                return (
                  <div
                    key={b.item.name}
                    className="absolute flex flex-col items-center justify-center rounded-full transition-all duration-200 group cursor-pointer hover:scale-105 hover:z-50"
                    style={{
                      width: `${pctR * 2}%`, aspectRatio: "1",
                      left: `${pctX}%`, top: `${pctY}%`,
                      transform: "translate(-50%, -50%)",
                      background: `linear-gradient(135deg, ${b.color.bg} 0%, ${b.color.accent} 100%)`,
                      border: `3px solid ${b.color.accent}`,
                      willChange: "transform",
                      WebkitTapHighlightColor: "transparent",
                    }}
                  >
                    {/* Tooltip with 2 rows on hover - always above circle */}
                    <div
                      className="absolute opacity-0 group-hover:opacity-100 group-active:opacity-100 pointer-events-none transition-opacity duration-200 z-20"
                      style={{
                        left: pctX < 25 ? 'auto' : pctX > 75 ? 'auto' : '50%',
                        right: pctX > 75 ? '0' : 'auto',
                        bottom: '100%',
                        transform: pctX >= 25 && pctX <= 75 ? 'translateX(-50%)' : 'none',
                        marginBottom: '8px'
                      }}
                    >
                      <div className="bg-slate-900 text-white rounded-lg px-3 py-2 shadow-lg">
                        <p className="text-xs font-semibold whitespace-nowrap leading-tight">
                          {b.item.name}
                        </p>
                        <p className="text-[11px] text-slate-300 whitespace-nowrap leading-tight mt-0.5">
                          ${fmt(perMonth)}/mo
                        </p>
                      </div>
                      <div className="w-2 h-2 bg-slate-900 rotate-45 mx-auto -mt-1" />
                    </div>

                    {/* Large circles: Show icon + name + price */}
                    {showIconNamePrice && (
                      <>
                        <span style={{ fontSize: `${iconFontSize}px`, color: b.color.text }}>
                          {getIcon(b.item)}
                        </span>
                        <p className="font-semibold text-center leading-tight mt-1 px-2" style={{
                          color: b.color.text,
                          fontSize: `${nameFontSize}px`,
                          maxWidth: d * 0.8,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}>
                          {b.item.name}
                        </p>
                        <p className="font-bold tabular-nums" style={{
                          color: b.color.text,
                          fontSize: `${priceFontSize}px`
                        }}>
                          ${fmt(perMonth)}
                        </p>
                      </>
                    )}

                    {/* Medium circles: Show name + price only */}
                    {showNamePrice && (
                      <>
                        <p className="font-semibold text-center leading-tight px-2" style={{
                          color: b.color.text,
                          fontSize: `${nameFontSize}px`,
                          maxWidth: d * 0.8,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}>
                          {b.item.name}
                        </p>
                        <p className="font-bold tabular-nums mt-0.5" style={{
                          color: b.color.text,
                          fontSize: `${priceFontSize}px`
                        }}>
                          ${fmt(perMonth)}
                        </p>
                      </>
                    )}

                    {/* Small circles: Show icon only */}
                    {showIconOnly && (
                      <span style={{ fontSize: `${iconFontSize}px`, color: b.color.text }}>
                        {getIcon(b.item)}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Summary stats inside viz card */}
        <div className="flex items-end justify-between mt-4 rounded-xl px-5 py-4" style={{ backgroundColor: "#F1F5F9" }}>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-[10px] font-semibold text-slate-400 tracking-[0.15em] uppercase">Total / Month</p>
              {selectedCurrency !== 'USD' && (
                <span className="text-[9px] font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                  {selectedCurrency}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-slate-900 tabular-nums">{formatCurrency(monthlyAvg)}</span>
              {comparison && <ComparisonBadge changePct={comparison.overallChangePct} direction={comparison.overallDirection} size="md" />}
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold text-slate-400 tracking-[0.15em] uppercase mb-1">Yearly Projection</p>
            <span className="text-2xl font-bold text-indigo-600 tabular-nums">{formatCurrency(yearlyProjection)}</span>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Currency Section */}
            <div>
              <label className="text-xs font-semibold text-slate-400 tracking-wide uppercase mb-2 block">
                Currency
              </label>
              <select
                value={selectedCurrency}
                onChange={(e) => setSelectedCurrency(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                <option value="USD">$ USD - US Dollar</option>
                <option value="EUR">€ EUR - Euro</option>
                <option value="GBP">£ GBP - British Pound</option>
                <option value="NGN">₦ NGN - Nigerian Naira</option>
                <option value="GHS">₵ GHS - Ghanaian Cedi</option>
                <option value="KES">KSh KES - Kenyan Shilling</option>
                <option value="ZAR">R ZAR - South African Rand</option>
                <option value="CAD">C$ CAD - Canadian Dollar</option>
                <option value="AUD">A$ AUD - Australian Dollar</option>
                <option value="INR">₹ INR - Indian Rupee</option>
                <option value="JPY">¥ JPY - Japanese Yen</option>
                <option value="CNY">¥ CNY - Chinese Yuan</option>
              </select>
              <p className="text-xs text-slate-400 mt-2">
                All prices will be converted using approximate exchange rates
              </p>
            </div>

            {/* Future settings sections can go here */}
          </div>
        </DialogContent>
      </Dialog>

      {/* Bottom bar */}
      <div className="flex items-center justify-between mt-10 animate-fade-up-3 gap-3">
        {/* Settings Icon Button */}
        <button
          onClick={() => setShowSettings(true)}
          className="w-10 h-10 rounded-full bg-white border border-slate-100 flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-all"
          style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.03), 0 2px 8px rgba(0,0,0,0.04)" }}
        >
          <Settings className="w-4 h-4" />
        </button>

        {/* Back, Export, Premium Pills */}
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-slate-100 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-all"
            style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.03), 0 2px 8px rgba(0,0,0,0.04)" }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </button>

          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-slate-100 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-all"
            style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.03), 0 2px 8px rgba(0,0,0,0.04)" }}
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>

          <button
            onClick={() => toast.info("Premium features coming soon! 🚀")}
            className="flex items-center gap-2 px-4 py-2 rounded-full font-semibold text-sm text-white transition-all hover:shadow-lg hover:scale-105"
            style={{
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
            }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Upgrade to Pro
          </button>
        </div>
      </div>
    </div>
  )
}
