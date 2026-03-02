# RemitTrack

A beautiful, modern web application for tracking and visualizing international money transfers (remittances). Built with Next.js, TypeScript, and Tailwind CSS.

## Features

### 📊 Three Visualization Modes

- **Grid View**: Category-based cards with vibrant gradients showing spending by category
- **Swarm View**: Interactive scatter plot with circles positioned above/below average spending line
- **Bubbles View**: Packed circle visualization with size representing spending amounts

### 💰 Smart Analytics

- Per-category spending breakdown with percentages
- Monthly averages and yearly projections
- Period-based comparisons (YTD, quarterly, yearly)
- Above/below average insights

### 🎨 Modern Design

- Vibrant pastel color gradients matching modern subscription card aesthetics
- Smooth animations and hover effects
- Responsive design for all devices
- Clean, minimal interface inspired by SubGrid

### 🌍 Multi-Currency Support

- Support for 12 currencies (USD, EUR, GBP, NGN, GHS, KES, ZAR, CAD, AUD, INR, JPY, CNY)
- Real-time exchange rate conversion via ExchangeRate API
- Currency preferences persist across sessions

### 📤 Data Management

- CSV import for bulk transaction uploads
- Manual transaction entry with quick provider shortcuts
- Bulk tagging for efficient categorization
- Custom category creation
- Export visualizations as PNG or CSV

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Radix UI (Dialog, etc.)
- **Icons**: Lucide React
- **Notifications**: Sonner (toast)
- **Image Export**: html-to-image

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd RemitTrack

# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for Production

```bash
npm run build
npm start
```

## Project Structure

```
RemitTrack/
├── app/                    # Next.js app router pages
├── components/
│   ├── grid-page.tsx      # Main visualization component
│   ├── input-page.tsx     # Transaction input interface
│   └── ui/                # Reusable UI components
├── lib/
│   ├── types.ts           # TypeScript interfaces and constants
│   └── utils.ts           # Utility functions
├── public/
│   └── logo/              # Provider logos
└── README.md
```

## Key Components

### Grid Page (`components/grid-page.tsx`)

Main visualization component featuring:
- Three view modes (Grid, Swarm, Bubbles)
- Period filtering (All time, YTD, yearly, quarterly)
- Currency conversion
- Export functionality
- Interactive tooltips

### Input Page (`components/input-page.tsx`)

Transaction management interface:
- CSV upload with parsing
- Manual entry form
- Quick provider shortcuts with logos
- Bulk tagging
- Custom category support

## Color System

Categories use distinct vibrant pastel gradients:

- **Family**: Pink gradient
- **Friend**: Blue gradient
- **Church**: Orange gradient
- **Education**: Cyan gradient
- **Rent**: Indigo gradient
- **Business**: Green gradient
- **Medical**: Rose gradient
- **Emergency**: Warm orange gradient
- **Savings**: Mint green gradient
- **Gift**: Purple gradient
- **Charity**: Teal gradient
- **Other**: Gray gradient

## API Integration

### ExchangeRate API

The app integrates with ExchangeRate API for real-time currency conversion:
- Endpoint: `https://v6.exchangerate-api.com/v6/{API_KEY}/latest/USD`
- Cached on component mount
- Supports 12+ currencies

## Features in Detail

### Swarm Visualization

- Items sorted left-to-right by spending amount (smallest to largest)
- Alternating above/below pattern ensures balanced distribution
- Horizontal line represents average monthly spending
- Circle size proportional to spending amount

### Grid Visualization

- Dynamic grid layout with responsive card sizing
- Gradient backgrounds (light top-left to darker bottom-right)
- Yearly projection estimates (~$XXX/yr)
- Percentage badges showing portion of total spending

### Bubbles Visualization

- Force-directed circle packing algorithm
- Largest circles positioned centrally
- Gradient fills with icons
- Smart tooltip positioning (always above circles)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

[Your License Here]

## Acknowledgments

- Design inspiration from [SubGrid](https://github.com/hoangvu12/subgrid)
- Icons by [Lucide](https://lucide.dev)
- Exchange rates by [ExchangeRate API](https://www.exchangerate-api.com)
