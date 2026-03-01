"use client"

import { useState, useRef, useCallback, useMemo } from "react"
import type { Transaction, Purpose } from "@/lib/types"
import { PURPOSES, PURPOSE_COLORS } from "@/lib/types"
import { parseFile, groupByRecipient } from "@/lib/pdf-parser"
import { EXAMPLE_TRANSACTIONS } from "@/lib/example-data"
import {
  Plus,
  Upload,
  FileSpreadsheet,
  FileText,
  Sparkles,
  Lock,
  X,
  ArrowRight,
  CheckCircle2,
  Zap,
  Loader2,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

const QUICK_PROVIDERS = [
  { name: "LemFi", domain: "lemfi.com", active: true },
  { name: "Wise", domain: "wise.com", active: false },
  { name: "WorldRemit", domain: "worldremit.com", active: false },
  { name: "Remitly", domain: "remitly.com", active: false },
  { name: "Sendwave", domain: "sendwave.com", active: false },
  { name: "MoneyGram", domain: "moneygram.com", active: false },
]

interface InputPageProps {
  onGenerate: (transactions: Transaction[]) => void
}

export function InputPage({ onGenerate }: InputPageProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [showManualAdd, setShowManualAdd] = useState(false)
  const [manualRecipient, setManualRecipient] = useState("")
  const [manualAmount, setManualAmount] = useState("")
  const [manualDate, setManualDate] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [parsing, setParsing] = useState(false)

  const [taggingPerson, setTaggingPerson] = useState<string | null>(null)
  const [expandedPerson, setExpandedPerson] = useState<string | null>(null)
  const [taggingTxnId, setTaggingTxnId] = useState<string | null>(null)

  const [importStats, setImportStats] = useState<{
    total: number
    people: number
    format: string
  } | null>(null)

  const grouped = useMemo(() => {
    const map = groupByRecipient(transactions)
    return Array.from(map.entries())
      .map(([name, txns]) => ({
        name,
        txns: txns.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
        total: txns.reduce((s, t) => s + t.amount, 0),
        count: txns.length,
        purposes: [...new Set(txns.filter(t => t.purpose).map(t => t.purpose))],
        untagged: txns.filter(t => !t.purpose).length,
        dateRange: {
          from: txns.reduce((min, t) => (t.date < min ? t.date : min), txns[0]?.date || ""),
          to: txns.reduce((max, t) => (t.date > max ? t.date : max), txns[0]?.date || ""),
        },
      }))
      .sort((a, b) => b.total - a.total)
  }, [transactions])

  const handleFile = useCallback(async (file: File) => {
    const validExts = [".csv", ".tsv", ".pdf", ".txt"]
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase()
    if (!validExts.includes(ext) && !file.type.includes("csv") && !file.type.includes("text") && !file.type.includes("pdf")) {
      toast.error("Upload a PDF statement or CSV file")
      return
    }
    setParsing(true)
    try {
      const result = await parseFile(file)
      if (result.transactions.length === 0) {
        toast.error("No outbound transfers found. Make sure the file contains 'Sent money to' transactions.")
        return
      }
      setTransactions(prev => [...prev, ...result.transactions])
      setImportStats({ total: result.stats.total, people: result.stats.people, format: result.format })
      toast.success(`Found ${result.stats.total} transfers to ${result.stats.people} people`)
    } catch (err) {
      console.error("[parse] Parse error:", err)
      toast.error("Failed to parse file. Try a CSV export instead.")
    } finally {
      setParsing(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleExampleData = () => {
    setTransactions(EXAMPLE_TRANSACTIONS)
    setImportStats(null)
  }

  const handleAddManual = () => {
    if (!manualRecipient || !manualAmount) return
    const txn: Transaction = {
      id: `manual-${Date.now()}`,
      date: manualDate || new Date().toISOString().split("T")[0],
      amount: parseFloat(manualAmount) || 0,
      currency: transactions[0]?.currency || "USD",
      description: `Sent money to ${manualRecipient}`,
      recipient: manualRecipient,
      purpose: "",
      tags: ["sent"],
      source: "Manual",
    }
    setTransactions(prev => [...prev, txn])
    setManualRecipient("")
    setManualAmount("")
    setManualDate("")
    setShowManualAdd(false)
  }

  const applyPurposeToPerson = (personName: string, purpose: Purpose) => {
    const group = grouped.find(g => g.name === personName)
    if (!group) return
    const txnIds = new Set(group.txns.map(t => t.id))
    setTransactions(prev =>
      prev.map(t => txnIds.has(t.id) ? { ...t, purpose } : t)
    )
    toast.success(`Tagged ${group.count} transfers to "${personName}" as "${purpose}"`)
    setTaggingPerson(null)
  }

  const applyPurposeToTxn = (txnId: string, purpose: Purpose) => {
    setTransactions(prev =>
      prev.map(t => t.id === txnId ? { ...t, purpose } : t)
    )
    setTaggingTxnId(null)
    toast.success(`Transaction re-tagged as "${purpose}"`)
  }

  const hasData = transactions.length > 0
  const totalAmount = transactions.reduce((s, t) => s + t.amount, 0)
  const currency = transactions[0]?.currency || "USD"
  const totalUntagged = transactions.filter(t => !t.purpose).length
  const totalPeople = grouped.length

  function formatDate(dateStr: string) {
    try {
      return new Date(dateStr).toLocaleDateString("en-US", { month: "short", year: "numeric" })
    } catch { return dateStr }
  }

  return (
    <div className="max-w-xl mx-auto px-4 pb-36" style={{ minHeight: "calc(100vh - 80px)" }}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.tsv,.pdf,.txt,text/csv,text/plain,application/pdf"
        className="hidden"
        onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFile(file); e.target.value = "" }}
      />

      {/* Empty state / Upload zone */}
      <div
        className={`mt-6 border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-200 animate-fade-up cursor-pointer ${
          dragOver ? "border-indigo-500 bg-indigo-50" : hasData ? "border-slate-200 bg-white" : "border-slate-200 bg-white"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !hasData && !parsing && fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload file"
        style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.03), 0 2px 8px rgba(0,0,0,0.04)" }}
      >
        {parsing ? (
          <>
            <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mx-auto" />
            <p className="text-lg font-semibold text-slate-600 mt-4">Parsing your statement...</p>
            <p className="text-sm text-slate-400 mt-1">Extracting sent transactions</p>
          </>
        ) : hasData ? (
          <>
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
            <p className="text-lg font-semibold text-slate-700 mt-4">
              {transactions.length} transfer{transactions.length !== 1 ? "s" : ""} found
            </p>
            <p className="text-sm text-slate-400 mt-1">
              {currency} {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} sent to {totalPeople} {totalPeople === 1 ? "person" : "people"}
            </p>
            <button
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
              className="mt-4 text-sm font-medium text-indigo-500 hover:text-indigo-600 inline-flex items-center gap-1.5"
            >
              <Upload className="w-4 h-4" />
              Add more from file
            </button>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mx-auto">
              <Plus className="w-6 h-6 text-slate-300" />
            </div>
            <p className="text-lg font-semibold text-slate-600 mt-4">Add first transfer</p>
            <p className="text-sm text-slate-400 mt-1">LemFi, Wise, WorldRemit, etc.</p>
          </>
        )}
      </div>

      {/* Try with example data */}
      {!hasData && (
        <div className="mt-3 text-center animate-fade-up-1">
          <button
            onClick={handleExampleData}
            className="text-sm text-indigo-500 hover:text-indigo-600 font-medium inline-flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Try with example data
          </button>
          <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-slate-400">
            <Lock className="w-3 h-3" />
            Your data stays in your browser
          </div>
        </div>
      )}

      {/* Import stats */}
      {importStats && hasData && (
        <div className="mt-4 rounded-2xl bg-emerald-50 border border-emerald-100 p-4 animate-scale-in">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-emerald-600" />
            <span className="text-sm font-semibold text-emerald-700">{importStats.format} parsed</span>
          </div>
          <p className="text-xs text-emerald-600">
            Found {importStats.total} outbound transfers to {importStats.people} people.
            Similar names have been grouped automatically.
          </p>
          {totalUntagged > 0 && (
            <p className="text-xs text-emerald-700 font-semibold mt-1.5">
              Tap a person below to assign their category (Family, Friend, Church, etc.)
            </p>
          )}
          <button onClick={() => setImportStats(null)} className="mt-2 text-xs text-emerald-400 hover:text-emerald-600 min-h-[32px]">
            Dismiss
          </button>
        </div>
      )}

      {/* People groups */}
      {hasData && (
        <div className="mt-6 animate-fade-up-2">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 tracking-wide uppercase">
              People ({totalPeople})
            </span>
            <button
              onClick={() => { setTransactions([]); setImportStats(null) }}
              className="text-xs text-slate-400 hover:text-red-500 font-medium inline-flex items-center gap-1 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Clear all
            </button>
          </div>

          <div className="space-y-2">
            {grouped.map(({ name, total, count, purposes, untagged, dateRange }) => {
              const isTagging = taggingPerson === name
              const primaryPurpose = purposes[0] || null
              const purposeColor = primaryPurpose ? PURPOSE_COLORS[primaryPurpose as Purpose] || "#94A3B8" : null

              return (
                <div key={name} className="rounded-2xl bg-white border border-slate-100 overflow-hidden transition-all" style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.03), 0 2px 8px rgba(0,0,0,0.04)" }}>
                  <button
                    onClick={() => {
                      if (isTagging) setTaggingPerson(null)
                      else setTaggingPerson(name)
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left min-h-[64px] hover:bg-slate-50/50 transition-colors"
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold shrink-0"
                      style={{
                        backgroundColor: purposeColor ? `${purposeColor}18` : "#F1F5F9",
                        color: purposeColor || "#64748B",
                      }}
                    >
                      {name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-700 truncate">{name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="text-xs text-slate-400">{count} transfer{count !== 1 ? "s" : ""}</span>
                        <span className="text-[10px] text-slate-300">
                          {formatDate(dateRange.from)}{dateRange.from !== dateRange.to ? ` - ${formatDate(dateRange.to)}` : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        {purposes.map(p => (
                          <span
                            key={p}
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{
                              backgroundColor: `${PURPOSE_COLORS[p as Purpose] || "#94A3B8"}18`,
                              color: PURPOSE_COLORS[p as Purpose] || "#94A3B8",
                            }}
                          >
                            {p}
                          </span>
                        ))}
                        {untagged > 0 && purposes.length === 0 && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-100">
                            Tap to categorize
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-slate-900 tabular-nums">
                        ${total.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                      </p>
                    </div>
                  </button>

                  {isTagging && (
                    <div className="border-t border-slate-100 bg-slate-50/50 animate-scale-in">
                      <div className="px-4 pt-3 pb-3">
                        <p className="text-xs font-semibold text-slate-400 mb-2.5">
                          Category for all {count} transfers:
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {PURPOSES.map(p => (
                            <button
                              key={p}
                              onClick={() => applyPurposeToPerson(name, p)}
                              className="px-3 min-h-[36px] rounded-xl text-xs font-semibold transition-all"
                              style={
                                purposes.includes(p) && purposes.length === 1
                                  ? { backgroundColor: PURPOSE_COLORS[p], color: "#FFFFFF" }
                                  : { backgroundColor: `${PURPOSE_COLORS[p]}15`, color: PURPOSE_COLORS[p] }
                              }
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setExpandedPerson(expandedPerson === name ? null : name)
                        }}
                        className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-indigo-500 border-t border-slate-100 hover:bg-indigo-50/50 transition-colors min-h-[40px]"
                      >
                        {expandedPerson === name ? "Hide" : "View"} individual transfers
                        <svg
                          className={`w-3.5 h-3.5 transition-transform ${expandedPerson === name ? "rotate-180" : ""}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {expandedPerson === name && (
                        <div className="border-t border-slate-100">
                          {grouped.find(g => g.name === name)?.txns.map((txn) => {
                            const txnPurpose = txn.purpose as Purpose | ""
                            const isPickingThis = taggingTxnId === txn.id
                            return (
                              <div key={txn.id} className="border-b border-slate-50 last:border-b-0">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setTaggingTxnId(isPickingThis ? null : txn.id)
                                  }}
                                  className="w-full flex items-center gap-3 px-4 py-3 text-left min-h-[52px] hover:bg-slate-50 transition-colors"
                                >
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs text-slate-400 tabular-nums">
                                      {new Date(txn.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                    </p>
                                    <p className="text-[11px] text-slate-300 truncate mt-0.5">
                                      {txn.description}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {txnPurpose && (
                                      <span
                                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                        style={{
                                          backgroundColor: `${PURPOSE_COLORS[txnPurpose as Purpose] || "#94A3B8"}18`,
                                          color: PURPOSE_COLORS[txnPurpose as Purpose] || "#94A3B8",
                                        }}
                                      >
                                        {txnPurpose}
                                      </span>
                                    )}
                                    <span className="text-sm font-bold text-slate-700 tabular-nums">
                                      ${txn.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                </button>

                                {isPickingThis && (
                                  <div className="px-4 pb-3 pt-1 animate-scale-in">
                                    <p className="text-[10px] font-semibold text-slate-400 mb-2">Re-categorize this transfer:</p>
                                    <div className="flex flex-wrap gap-1">
                                      {PURPOSES.map(p => (
                                        <button
                                          key={p}
                                          onClick={(e) => { e.stopPropagation(); applyPurposeToTxn(txn.id, p) }}
                                          className="px-2.5 min-h-[32px] rounded-lg text-[11px] font-semibold transition-all"
                                          style={
                                            txnPurpose === p
                                              ? { backgroundColor: PURPOSE_COLORS[p], color: "#FFFFFF" }
                                              : { backgroundColor: `${PURPOSE_COLORS[p]}12`, color: PURPOSE_COLORS[p] }
                                          }
                                        >
                                          {p}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Manual add */}
      {hasData && !showManualAdd && (
        <button
          onClick={() => setShowManualAdd(true)}
          className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white px-4 min-h-[48px] text-sm font-medium text-slate-400 transition-all hover:text-slate-600 hover:border-slate-300"
        >
          <Plus className="w-4 h-4" />
          Add manually
        </button>
      )}

      {showManualAdd && (
        <div className="mt-3 rounded-2xl bg-white border border-slate-100 p-4 animate-scale-in" style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.03), 0 2px 8px rgba(0,0,0,0.04)" }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700">Add transfer</h3>
            <button onClick={() => setShowManualAdd(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Recipient name"
              value={manualRecipient}
              onChange={(e) => setManualRecipient(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            <input
              type="number"
              placeholder="Amount"
              value={manualAmount}
              onChange={(e) => setManualAmount(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            <input
              type="date"
              value={manualDate}
              onChange={(e) => setManualDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            <button
              onClick={handleAddManual}
              disabled={!manualRecipient || !manualAmount}
              className="w-full rounded-xl bg-slate-900 text-white font-semibold py-3 text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 transition-colors"
            >
              Save Item
            </button>
          </div>
        </div>
      )}

      {/* Quick add providers */}
      {!hasData && (
        <div className="mt-8 animate-fade-up-2">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 tracking-wide uppercase">Quick Add</span>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-xs text-indigo-500 hover:text-indigo-600 font-medium"
            >
              Browse all &rarr;
            </button>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {QUICK_PROVIDERS.map(provider => (
              <button
                key={provider.name}
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-slate-50 transition-colors group"
              >
                <img
                  src={`https://logo.clearbit.com/${provider.domain}`}
                  alt={provider.name}
                  className="w-10 h-10 rounded-xl"
                  style={{
                    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                    filter: provider.active ? "none" : "grayscale(1) opacity(0.45)",
                  }}
                  onError={(e) => {
                    const target = e.target as HTMLImageElement
                    target.style.display = "none"
                    const fallback = target.nextElementSibling as HTMLElement
                    if (fallback) fallback.style.display = "flex"
                  }}
                />
                <div
                  className="w-10 h-10 rounded-xl items-center justify-center text-xs font-bold bg-slate-100 text-slate-400 hidden"
                >
                  {provider.name.slice(0, 2).toUpperCase()}
                </div>
                <span className="text-[11px] text-slate-500 group-hover:text-slate-700 truncate max-w-full transition-colors">
                  {provider.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Import section */}
      {!hasData && (
        <div className="mt-6 animate-fade-up-3">
          <span className="text-xs font-semibold text-slate-400 tracking-wide uppercase">Import</span>
          <div className="mt-3 space-y-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50/50 transition-all text-left group"
              style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.03), 0 2px 8px rgba(0,0,0,0.04)" }}
            >
              <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center group-hover:bg-white transition-colors">
                <FileSpreadsheet className="w-5 h-5 text-slate-400" />
              </div>
              <div>
                <div className="text-sm font-medium text-slate-700">Import transaction history</div>
                <div className="text-xs text-slate-400">CSV file with your transactions</div>
              </div>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50/50 transition-all text-left group"
              style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.03), 0 2px 8px rgba(0,0,0,0.04)" }}
            >
              <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center group-hover:bg-white transition-colors">
                <FileText className="w-5 h-5 text-slate-400" />
              </div>
              <div>
                <div className="text-sm font-medium text-slate-700">Import from PDF statement</div>
                <div className="text-xs text-slate-400">PDF statement from LemFi or others</div>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent pt-6 pb-4 px-4 safe-area-pb">
        <div className="max-w-xl mx-auto">
          {hasData && (
            <div className="flex justify-end mb-2">
              <button
                onClick={() => { setTransactions([]); setImportStats(null) }}
                className="text-xs text-slate-400 hover:text-red-500 font-medium inline-flex items-center gap-1 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                Clear All
              </button>
            </div>
          )}
          <button
            onClick={() => onGenerate(transactions)}
            disabled={!hasData}
            className="w-full py-3.5 bg-slate-900 text-white rounded-2xl font-semibold text-sm hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Generate Grid
            <ArrowRight className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
