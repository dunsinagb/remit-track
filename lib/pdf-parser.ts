"use client"

import type { Transaction, Purpose } from "./types"

function generateId(): string {
  return `txn-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

function titleCase(name: string): string {
  return name
    .toLowerCase()
    .split(" ")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

// ──────────────────────────────────────────
// PDF binary → text extraction via pdfjs-dist
// ──────────────────────────────────────────

async function extractTextFromPDF(arrayBuffer: ArrayBuffer): Promise<string> {
  // Dynamic import so pdfjs-dist is only loaded when needed
  const pdfjsLib = await import("pdfjs-dist")

  // Disable worker -- runs in main thread, fine for statement files (<50 pages)
  if (typeof window !== "undefined") {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`
  }

  const pdf = await pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
  }).promise
  const pageTexts: string[] = []

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()

    // Sort items by Y position (top to bottom) then X position (left to right)
    const items = content.items
      .filter((item): item is { str: string; transform: number[] } => "str" in item && item.str.trim() !== "")
      .map(item => ({
        text: item.str,
        x: item.transform[4],
        y: item.transform[5],
      }))

    if (items.length === 0) continue

    // Group by approximate Y position (same row = within 3 units)
    const rows: { y: number; items: { text: string; x: number }[] }[] = []
    for (const item of items) {
      const existingRow = rows.find(r => Math.abs(r.y - item.y) < 3)
      if (existingRow) {
        existingRow.items.push({ text: item.text, x: item.x })
      } else {
        rows.push({ y: item.y, items: [{ text: item.text, x: item.x }] })
      }
    }

    // Sort rows top-to-bottom (highest Y first in PDF coords)
    rows.sort((a, b) => b.y - a.y)

    for (const row of rows) {
      row.items.sort((a, b) => a.x - b.x)
      const lineText = row.items.map(i => i.text).join(" ")
      pageTexts.push(lineText)
    }
  }

  return pageTexts.join("\n")
}

// ──────────────────────────────────────────
// LemFi text parser
// Scans every line for "Sent money to NAME" pattern
// ──────────────────────────────────────────

const DATE_RE = /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s*\d{4})/
const SENT_RE = /Sent\s+money\s+to\s+(.+)/i
const MONEY_RE = /\$([\d,.]+)\s*\$([\d,.]+)\s*\$([\d,.]+)/

function parseDateStr(str: string): string {
  try {
    const cleaned = str.replace(",", ", ").replace(/\s+/g, " ").trim()
    const d = new Date(cleaned)
    if (!isNaN(d.getTime()) && d.getFullYear() > 2000) {
      return d.toISOString().split("T")[0]
    }
  } catch { /* fallthrough */ }
  return new Date().toISOString().split("T")[0]
}

export function parseLemFiText(text: string): Transaction[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const transactions: Transaction[] = []

  // Strategy: find all "Sent money to" lines, then look backwards for the date
  // and forwards for the money amount.

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Check if this line (or combined with next) contains "Sent money to"
    let sentLine = ""
    let sentIdx = i

    if (SENT_RE.test(line)) {
      sentLine = line
    } else if (
      i + 1 < lines.length &&
      (line.endsWith("Sent") || line.endsWith("Sent money") || line.endsWith("Sent money to")) &&
      SENT_RE.test(line + " " + lines[i + 1])
    ) {
      sentLine = line + " " + lines[i + 1]
      sentIdx = i + 1
    } else {
      continue
    }

    const sentMatch = sentLine.match(SENT_RE)
    if (!sentMatch) continue

    let recipientRaw = sentMatch[1].trim()

    // The name might be followed by "| ACCOUNT_NUMBER" on same line or next line
    // E.g. "JOHN DOE | 1234567890" or "JOHN DOE |"  then "1234567890" on next line
    if (recipientRaw.includes("|")) {
      recipientRaw = recipientRaw.split("|")[0].trim()
    } else if (sentIdx + 1 < lines.length && /^\d{5,}$/.test(lines[sentIdx + 1].trim())) {
      // Name wraps: "JOHN DOE" then next line is "| 1234567890" or just the account number
      // Name is already clean
    } else if (recipientRaw.endsWith("|") || (sentIdx + 1 < lines.length && lines[sentIdx + 1].trim().startsWith("|"))) {
      recipientRaw = recipientRaw.replace(/\s*\|$/, "").trim()
    } else {
      // Check if next line is the account number part: "| DIGITS" or just digits
      if (sentIdx + 1 < lines.length) {
        const nextLine = lines[sentIdx + 1].trim()
        if (/^\|?\s*\d{5,}/.test(nextLine)) {
          // Name is complete, next is account number
        } else if (!DATE_RE.test(nextLine) && !MONEY_RE.test(nextLine) && !SENT_RE.test(nextLine) && !/Debit|Credit|ID:|^[0-9a-f]{8}-/.test(nextLine)) {
          // Might be name continuation (long name wrapping)
          const continued = nextLine.replace(/\s*\|.*$/, "").trim()
          if (continued && /^[A-Z\s]+$/i.test(continued) && continued.length > 2) {
            recipientRaw = recipientRaw + " " + continued
          }
        }
      }
    }

    // Clean up the name
    recipientRaw = recipientRaw.replace(/\s*\|.*$/, "").trim()
    recipientRaw = recipientRaw.replace(/\s+/g, " ").trim()

    // Skip self-transfers to card
    if (/^card\s+\*{2,}/i.test(recipientRaw)) continue
    if (!recipientRaw || recipientRaw.length < 2) continue

    // Look backwards for the nearest date
    let dateStr = ""
    for (let j = sentIdx; j >= Math.max(0, sentIdx - 8); j--) {
      const dm = lines[j].match(DATE_RE)
      if (dm) {
        dateStr = dm[1]
        break
      }
    }

    // Look forwards for the money amount ($X.XX$Y.YY$Z.ZZ)
    let moneyOut = 0
    for (let j = sentIdx; j < Math.min(lines.length, sentIdx + 6); j++) {
      const mm = lines[j].match(MONEY_RE)
      if (mm) {
        moneyOut = parseFloat(mm[1].replace(/,/g, "")) || 0
        break
      }
    }

    if (moneyOut <= 0) continue

    transactions.push({
      id: generateId(),
      date: parseDateStr(dateStr),
      amount: moneyOut,
      currency: "USD",
      description: sentLine.substring(0, 120),
      recipient: titleCase(recipientRaw),
      purpose: "" as Purpose,
      tags: ["sent"],
      source: "LemFi",
    })
  }

  return transactions
}

// ──────────────────────────────────────────
// Smart name deduplication
// ──────────────────────────────────────────

function nameWords(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 1)
    .sort()
}

function namesMatch(a: string, b: string): boolean {
  const wA = nameWords(a)
  const wB = nameWords(b)
  if (wA.join(" ") === wB.join(" ")) return true

  const [shorter, longer] = wA.length <= wB.length ? [wA, wB] : [wB, wA]
  if (shorter.length === 0) return false

  let matched = 0
  for (const sw of shorter) {
    if (longer.some(lw => lw === sw || (lw.length >= 3 && sw.length >= 3 && (lw.startsWith(sw) || sw.startsWith(lw))))) {
      matched++
    }
  }
  return matched >= 2 && matched >= shorter.length * 0.6
}

export function groupByRecipient(transactions: Transaction[]): Map<string, Transaction[]> {
  const clusters: { canonical: string; names: Set<string>; txns: Transaction[] }[] = []

  for (const txn of transactions) {
    const name = txn.recipient || "Unknown"
    let foundCluster = false
    for (const cluster of clusters) {
      if (cluster.names.has(name) || [...cluster.names].some(n => namesMatch(n, name))) {
        cluster.txns.push(txn)
        cluster.names.add(name)
        if (name.length > cluster.canonical.length) cluster.canonical = name
        foundCluster = true
        break
      }
    }
    if (!foundCluster) {
      clusters.push({ canonical: name, names: new Set([name]), txns: [txn] })
    }
  }

  const result = new Map<string, Transaction[]>()
  clusters.sort((a, b) => {
    const totalA = a.txns.reduce((s, t) => s + t.amount, 0)
    const totalB = b.txns.reduce((s, t) => s + t.amount, 0)
    return totalB - totalA
  })
  for (const cluster of clusters) {
    result.set(cluster.canonical, cluster.txns)
  }
  return result
}

// ──────────────────────────────────────────
// CSV parser
// ──────────────────────────────────────────

function splitCSVRow(row: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false
  for (let c = 0; c < row.length; c++) {
    const ch = row[c]
    if (ch === '"') {
      if (inQuotes && row[c + 1] === '"') { current += '"'; c++ }
      else inQuotes = !inQuotes
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim()); current = ""
    } else { current += ch }
  }
  result.push(current.trim())
  return result
}

function detectDelimiter(headerLine: string): string {
  const delimiters = ["\t", ",", ";", "|"]
  let best = ","
  let maxCols = 0
  for (const d of delimiters) {
    const cols = splitCSVRow(headerLine, d).length
    if (cols > maxCols) { maxCols = cols; best = d }
  }
  return best
}

function parseCSVText(text: string): Transaction[] {
  const rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (rawLines.length < 2) return []

  const delimiter = detectDelimiter(rawLines[0])
  const headers = splitCSVRow(rawLines[0], delimiter).map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, ""))

  // Find column indices for LemFi CSV headers
  const dateIdx = headers.findIndex(h => h === "datetime" || h === "date" || h.includes("date"))
  const typeIdx = headers.findIndex(h => h === "type")
  const descIdx = headers.findIndex(h => h === "description" || h === "details" || h === "memo" || h === "narrative")
  const outIdx = headers.findIndex(h => h.startsWith("money_out") || h.startsWith("moneyout") || h === "debit" || h === "amount_out")
  const inIdx = headers.findIndex(h => h.startsWith("money_in") || h.startsWith("moneyin") || h === "credit" || h === "amount_in")
  const recipientIdx = headers.findIndex(h => h === "recipient" || h === "beneficiary" || h === "payee")

  // Detect currency from header
  let currency = "USD"
  for (const h of headers) {
    const m = h.match(/(?:money_out|money_in|balance)_([a-z]{3})/)
    if (m) { currency = m[1].toUpperCase(); break }
  }

  const transactions: Transaction[] = []

  for (let r = 1; r < rawLines.length; r++) {
    const cols = splitCSVRow(rawLines[r], delimiter)
    const type = typeIdx >= 0 ? (cols[typeIdx] || "").toLowerCase().trim() : ""
    const desc = descIdx >= 0 ? (cols[descIdx] || "") : ""
    const amountOut = outIdx >= 0 ? parseFloat((cols[outIdx] || "0").replace(/[^0-9.\-]/g, "")) || 0 : 0

    // Only outbound "Sent money to" transactions
    const isSent = SENT_RE.test(desc)
    const isDebit = type === "debit"
    if (!isSent && (!isDebit || amountOut <= 0)) continue
    if (amountOut <= 0) continue

    // Extract recipient name
    let recipient = ""
    if (recipientIdx >= 0) {
      recipient = cols[recipientIdx] || ""
    }
    if (!recipient) {
      const m = desc.match(SENT_RE)
      if (m) {
        recipient = m[1].replace(/\s*\|.*$/, "").trim()
      }
    }
    if (/^card\s+\*{2,}/i.test(recipient)) continue
    if (!recipient) continue

    const dateStr = dateIdx >= 0 ? (cols[dateIdx] || "") : ""

    transactions.push({
      id: generateId(),
      date: parseDateStr(dateStr),
      amount: Math.abs(amountOut),
      currency,
      description: desc.substring(0, 120),
      recipient: titleCase(recipient),
      purpose: "" as Purpose,
      tags: ["sent"],
      source: "LemFi",
    })
  }

  return transactions
}

// ──────────────────────────────────────────
// Main entry point
// ──────────────────────────────────────────

export interface ParseResult {
  transactions: Transaction[]
  format: string
  stats: { total: number; people: number }
}

/**
 * Parse a file. For PDFs, pass the ArrayBuffer. For text/CSV, pass the text string.
 */
export async function parseFile(file: File): Promise<ParseResult> {
  const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase()
  const isPDF = ext === ".pdf" || file.type === "application/pdf"

  if (isPDF) {
    // Use pdfjs-dist to extract text from binary PDF
    const arrayBuffer = await file.arrayBuffer()
    const text = await extractTextFromPDF(arrayBuffer)

    console.log("[v0] PDF text extracted, length:", text.length)
    console.log("[v0] First 500 chars:", text.substring(0, 500))

    const txns = parseLemFiText(text)
    const people = new Set(txns.map(t => t.recipient)).size
    return { transactions: txns, format: "LemFi PDF", stats: { total: txns.length, people } }
  }

  // Text/CSV file
  const text = await file.text()

  // Check if text looks like LemFi statement text (has "Sent money to" pattern)
  if (text.includes("STATEMENT OF ACCOUNT") || text.includes("DebitDesc:") || text.includes("CreditDesc:")) {
    const txns = parseLemFiText(text)
    const people = new Set(txns.map(t => t.recipient)).size
    return { transactions: txns, format: "LemFi Statement", stats: { total: txns.length, people } }
  }

  // Try CSV
  const txns = parseCSVText(text)
  if (txns.length > 0) {
    const people = new Set(txns.map(t => t.recipient)).size
    return { transactions: txns, format: "CSV", stats: { total: txns.length, people } }
  }

  // Last resort: try parsing as LemFi text anyway
  const lastResort = parseLemFiText(text)
  if (lastResort.length > 0) {
    const people = new Set(lastResort.map(t => t.recipient)).size
    return { transactions: lastResort, format: "Statement", stats: { total: lastResort.length, people } }
  }

  return { transactions: [], format: "unknown", stats: { total: 0, people: 0 } }
}
