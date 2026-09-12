# StockWise — Inventory Management System

StockWise is a modern, cloud-based inventory management application that helps businesses track stock levels, manage products, and monitor sales in real time. Built with performance and scalability in mind using React, Supabase, and Firebase.

![StockWise Dashboard](https://via.placeholder.com/900x400?text=StockWise+Dashboard)

---

## ✨ Features

- **Real-time Dashboard** — Stock levels and sales updates the moment they change
- **Product Management** — Add, edit, delete, and categorize inventory items with ease
- **Low Stock Alerts** — Visual indicators flag items running low before they run out
- **Secure Authentication** — User login and signup handled securely via Supabase Auth
- **Responsive Design** — Works seamlessly on desktop and mobile

---

## 🚀 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React (TypeScript) + Vite |
| Styling | Tailwind CSS |
| Backend & Database | Supabase (PostgreSQL) |
| Authentication | Supabase Auth |
| Hosting | Firebase Hosting (Google Cloud) |
| CI/CD | GitHub Actions |

---

## 🛠️ Getting Started

### Prerequisites

- Node.js v18 or higher
- npm or yarn
- A [Supabase](https://supabase.com) account

### Installation

1. **Clone the repository**

```bash
git clone https://github.com/ujeneza12/stockwise.git
cd stockwise
```

2. **Install dependencies**

```bash
npm install
```

3. **Set up environment variables**

Create a `.env` file in the root directory and add your Supabase credentials:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

4. **Start the development server**

```bash
npm run dev
```

The app will be running at `http://localhost:5173`

---

## 📦 Deployment

This project uses **GitHub Actions** for continuous deployment to Firebase Hosting.

| Trigger | Result |
|---|---|
| Pull Request opened | Preview URL generated for testing |
| Merge to `main` | Automatically deployed to live site |

**Manual deployment:**

```bash
npm run build
firebase deploy
```

---

## 📁 Project Structure

```
stockwise/
├── src/
│   ├── components/     # Reusable UI components
│   ├── pages/          # Application pages
│   ├── lib/            # Supabase client and utilities
│   └── main.tsx        # Entry point
├── public/
├── .env                # Environment variables (not committed)
├── vite.config.ts
└── README.md
```

---

## 🔐 Environment Variables

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anonymous public key |

> Never commit your `.env` file. Make sure it is listed in `.gitignore`.

---

## 👤 Author

**Ujeneza Divine**
[github.com/ujeneza12](https://github.com/ujeneza12) · ujenezadivine@gmail.com
