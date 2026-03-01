import type { Transaction, Recipient } from "./types"

const STORAGE_KEY = "remittrack_data"

export function getTransactions(): Transaction[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as Transaction[]
  } catch {
    return []
  }
}

export function saveTransactions(transactions: Transaction[]) {
  if (typeof window === "undefined") return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions))
}

export function addTransactions(newTxns: Transaction[]) {
  const existing = getTransactions()
  const merged = [...existing, ...newTxns]
  saveTransactions(merged)
  return merged
}

export function updateTransaction(id: string, updates: Partial<Transaction>) {
  const txns = getTransactions()
  const idx = txns.findIndex((t) => t.id === id)
  if (idx !== -1) {
    txns[idx] = { ...txns[idx], ...updates }
    saveTransactions(txns)
  }
  return txns
}

export function bulkUpdateTransactions(
  ids: string[],
  updates: Partial<Transaction>
) {
  const txns = getTransactions()
  for (const id of ids) {
    const idx = txns.findIndex((t) => t.id === id)
    if (idx !== -1) {
      txns[idx] = { ...txns[idx], ...updates }
    }
  }
  saveTransactions(txns)
  return txns
}

export function deleteAllTransactions() {
  if (typeof window === "undefined") return
  localStorage.removeItem(STORAGE_KEY)
}

export function getRecipients(transactions: Transaction[]): Recipient[] {
  const recipientMap = new Map<string, Recipient>()

  for (const txn of transactions) {
    const name = txn.recipient || "Unknown"
    const existing = recipientMap.get(name)
    if (existing) {
      existing.totalSent += txn.amount
      existing.transactionCount += 1
      if (txn.date > existing.lastSent) {
        existing.lastSent = txn.date
      }
    } else {
      recipientMap.set(name, {
        name,
        totalSent: txn.amount,
        transactionCount: 1,
        lastSent: txn.date,
        defaultPurpose: txn.purpose || "",
      })
    }
  }

  return Array.from(recipientMap.values()).sort(
    (a, b) => b.totalSent - a.totalSent
  )
}
