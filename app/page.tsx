"use client"

import { useState } from "react"
import type { Transaction } from "@/lib/types"
import { InputPage } from "@/components/input-page"
import { GridPage } from "@/components/grid-page"

export default function Page() {
  const [step, setStep] = useState<"input" | "grid">("input")
  const [transactions, setTransactions] = useState<Transaction[]>([])

  const stepNum = step === "input" ? 1 : 2

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 max-w-xl mx-auto">
        <div className="flex items-center gap-3">
          <a
            href="https://github.com/dunsinagb/remit-track"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="GitHub"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
            </svg>
          </a>
          <a
            href="https://x.com/dunsinagb"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
            <span className="text-xs">@dunsinagb</span>
          </a>
        </div>
        <span className="text-xs text-slate-400 tracking-wide">STEP {stepNum} OF 2</span>
      </div>

      {/* Progress bar */}
      <div className="max-w-xl mx-auto px-4">
        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-indigo-600 transition-all duration-500 ease-out"
            style={{ width: stepNum === 1 ? "50%" : "100%" }}
          />
        </div>
      </div>

      {step === "input" ? (
        <InputPage
          onGenerate={(txns) => {
            setTransactions(txns)
            setStep("grid")
          }}
        />
      ) : (
        <GridPage
          transactions={transactions}
          onBack={() => setStep("input")}
        />
      )}
    </div>
  )
}
