# Lytbub HQ v0.1

A minimal, production-ready personal control dashboard built with Next.js 14, TypeScript, TailwindCSS, and Supabase.

Track your Tasks, Revenue, Content performance, and Health metrics in one beautiful interface.

## 🚀 Features

- **Dashboard**: Overview of all metrics with today's stats
- **Tasks**: Full CRUD operations with completion tracking
- **Revenue**: Log income sources and track earnings
- **Content**: Monitor content performance across platforms
- **Health**: Daily wellness tracking (energy, sleep, workouts)

## 🛠 Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, TailwindCSS
- **UI**: shadcn/ui components
- **Backend**: Supabase (PostgreSQL)
- **Styling**: TailwindCSS with dark mode
- **Deployment**: Vercel (recommended)

## 📋 Prerequisites

- Node.js 18+
- A Supabase account ([supabase.com](https://supabase.com))

## 🏗 Setup Instructions

### 1. Clone and Install

```bash
# Install dependencies
npm install
```

### 2. Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com/dashboard)
2. Go to your project settings and copy:
   - Project URL
   - Project API Key (anon/public)

### 3. Database Setup

Run the SQL migrations in your Supabase SQL Editor (in order):

1. `migrations/001_create_tasks_table.sql`
2. `migrations/002_create_revenue_table.sql`
3. `migrations/003_create_content_table.sql`
4. `migrations/004_create_health_table.sql`

### 4. Environment Variables

Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see your dashboard!

## 🚀 Deployment to Vercel

### Option 1: One-Click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/jmorrow08/lytbub-hq)

### Option 2: Manual Deploy

1. **Connect Repository**
   - Push your code to GitHub
   - Connect your repo to Vercel

2. **Environment Variables**
   - In Vercel dashboard, go to your project settings
   - Add environment variables:
     ```
     NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
     NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
     ```

3. **Deploy**
   - Vercel will automatically detect Next.js and deploy
   - Your app will be live at `your-project.vercel.app`

## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # Root layout with navigation
│   ├── page.tsx           # Dashboard
│   ├── tasks/page.tsx     # Tasks management
│   ├── revenue/page.tsx   # Revenue tracking
│   ├── content/page.tsx   # Content analytics
│   └── health/page.tsx    # Health metrics
├── components/            # Reusable components
│   ├── ui/               # shadcn/ui components
│   ├── StatsCard.tsx     # Dashboard metric cards
│   ├── Form.tsx          # Reusable form component
│   └── Navigation.tsx    # Main navigation
├── lib/                  # Utilities
│   ├── api.ts           # Supabase API functions
│   ├── supabaseClient.ts # Supabase client setup
│   └── utils.ts         # Helper functions
└── types/               # TypeScript interfaces
    └── index.ts         # All data models
```

## 🎨 Customization

### Color Scheme
The app uses TailwindCSS with a custom dark theme. Colors are defined in `tailwind.config.js`.

### Adding New Metrics
1. Add database table migration
2. Update TypeScript interfaces in `src/types/index.ts`
3. Add API functions in `src/lib/api.ts`
4. Create new page in `src/app/`
5. Update navigation in `src/components/Navigation.tsx`

## 🔒 Security Notes

- This app uses Supabase's Row Level Security (RLS)
- All data is stored securely in your Supabase database
- No authentication implemented (single user assumption)
- Environment variables are properly configured for client-side use

## 📊 Database Schema

### Tasks
- `id`: UUID (Primary Key)
- `title`: Text (Required)
- `description`: Text
- `completed`: Boolean
- `created_at`, `updated_at`: Timestamps

### Revenue
- `id`: UUID (Primary Key)
- `source`: Text (Required)
- `amount`: Decimal (Required)
- `description`: Text
- `created_at`: Timestamp

### Content
- `id`: UUID (Primary Key)
- `title`: Text (Required)
- `platform`: Text (Required)
- `views`: Integer
- `url`: Text
- `published_at`: Timestamp
- `created_at`, `updated_at`: Timestamps

### Health
- `id`: UUID (Primary Key)
- `date`: Date (Required, Unique)
- `energy`: Integer (1-10)
- `sleep_hours`: Decimal
- `workout`: Boolean
- `notes`: Text
- `created_at`, `updated_at`: Timestamps

## 🤝 Contributing

This is a personal project, but feel free to:
- Open issues for bugs or feature requests
- Submit pull requests for improvements
- Use this as a starting point for your own dashboard

## 📄 License

MIT License - feel free to use this code for your own projects!

---

Built with ❤️ using Next.js, Supabase, and modern web technologies.
