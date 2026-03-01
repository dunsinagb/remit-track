export interface Transaction {
  id: string
  date: string
  amount: number
  currency: string
  description: string
  recipient: string
  purpose: string
  tags: string[]
  source: string
}

export interface RecipientSummary {
  name: string
  totalSent: number
  transactionCount: number
  percentage: number
  purposes: string[]
}

export type Purpose =
  | "Family"
  | "Friend"
  | "Church"
  | "Education"
  | "Rent"
  | "Business"
  | "Medical"
  | "Emergency"
  | "Savings"
  | "Gift"
  | "Charity"
  | "Other"

export const PURPOSES: Purpose[] = [
  "Family",
  "Friend",
  "Church",
  "Education",
  "Rent",
  "Business",
  "Medical",
  "Emergency",
  "Savings",
  "Gift",
  "Charity",
  "Other",
]

export const PURPOSE_COLORS: Record<Purpose, string> = {
  Family: "#EC4899",
  Friend: "#8B5CF6",
  Church: "#F59E0B",
  Education: "#3B82F6",
  Rent: "#6366F1",
  Business: "#10B981",
  Medical: "#EF4444",
  Emergency: "#DC2626",
  Savings: "#22C55E",
  Gift: "#F472B6",
  Charity: "#FBBF24",
  Other: "#94A3B8",
}

export const CATEGORY_CARD_COLORS: Record<Purpose, { bg: string; text: string; accent: string }> = {
  Family:    { bg: "#FDF2F8", text: "#831843", accent: "#FBCFE8" },
  Friend:    { bg: "#FAF5FF", text: "#581C87", accent: "#E9D5FF" },
  Church:    { bg: "#FFFBEB", text: "#78350F", accent: "#FDE68A" },
  Education: { bg: "#EFF6FF", text: "#1E3A5F", accent: "#BFDBFE" },
  Rent:      { bg: "#EEF2FF", text: "#3730A3", accent: "#C7D2FE" },
  Business:  { bg: "#F0FDFA", text: "#134E4A", accent: "#99F6E4" },
  Medical:   { bg: "#FFF1F2", text: "#881337", accent: "#FECDD3" },
  Emergency: { bg: "#FEF2F2", text: "#7F1D1D", accent: "#FECACA" },
  Savings:   { bg: "#F0FDF4", text: "#14532D", accent: "#BBF7D0" },
  Gift:      { bg: "#FFF7ED", text: "#7C2D12", accent: "#FED7AA" },
  Charity:   { bg: "#FEFCE8", text: "#713F12", accent: "#FEF08A" },
  Other:     { bg: "#F8FAFC", text: "#334155", accent: "#E2E8F0" },
}

export const PASTEL_COLORS = [
  { bg: "#FAF5FF", text: "#581C87", accent: "#E9D5FF" },
  { bg: "#EFF6FF", text: "#1E3A5F", accent: "#BFDBFE" },
  { bg: "#ECFEFF", text: "#164E63", accent: "#A5F3FC" },
  { bg: "#F0FDF4", text: "#14532D", accent: "#BBF7D0" },
  { bg: "#FEFCE8", text: "#713F12", accent: "#FEF08A" },
  { bg: "#FFF7ED", text: "#7C2D12", accent: "#FED7AA" },
  { bg: "#FDF2F8", text: "#831843", accent: "#FBCFE8" },
  { bg: "#FFF1F2", text: "#881337", accent: "#FECDD3" },
  { bg: "#F8FAFC", text: "#334155", accent: "#E2E8F0" },
  { bg: "#EEF2FF", text: "#3730A3", accent: "#C7D2FE" },
  { bg: "#F0FDFA", text: "#134E4A", accent: "#99F6E4" },
  { bg: "#FFFBEB", text: "#78350F", accent: "#FDE68A" },
]
