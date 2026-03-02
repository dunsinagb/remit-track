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
  Emergency: "#FF6B00",
  Savings: "#22C55E",
  Gift: "#A855F7",
  Charity: "#14B8A6",
  Other: "#94A3B8",
}

export const CATEGORY_CARD_COLORS: Record<Purpose, { bg: string; text: string; accent: string }> = {
  Family:    { bg: "#FBCFE8", text: "#831843", accent: "#F472B6" },
  Friend:    { bg: "#BFDBFE", text: "#1E3A8A", accent: "#60A5FA" },
  Church:    { bg: "#FED7AA", text: "#7C2D12", accent: "#FB923C" },
  Education: { bg: "#A5F3FC", text: "#164E63", accent: "#67E8F9" },
  Rent:      { bg: "#DDD6FE", text: "#3730A3", accent: "#A78BFA" },
  Business:  { bg: "#BBF7D0", text: "#14532D", accent: "#86EFAC" },
  Medical:   { bg: "#FECDD3", text: "#881337", accent: "#FDA4AF" },
  Emergency: { bg: "#FDBA74", text: "#7C2D12", accent: "#FB923C" },
  Savings:   { bg: "#D1FAE5", text: "#14532D", accent: "#6EE7B7" },
  Gift:      { bg: "#E9D5FF", text: "#5B21B6", accent: "#C084FC" },
  Charity:   { bg: "#CCFBF1", text: "#0F766E", accent: "#5EEAD4" },
  Other:     { bg: "#E2E8F0", text: "#334155", accent: "#CBD5E1" },
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
