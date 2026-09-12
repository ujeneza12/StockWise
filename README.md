StockWise Inventory Management System
Status

StockWise is a modern, cloud-based inventory management application designed to help businesses track stock levels, manage products, and monitor sales in real-time. Built with performance and scalability in mind, it leverages Supabase for a robust backend and is hosted globally via Google Cloud (Firebase).

🚀 Tech Stack
Frontend: React (TypeScript) + Vite
Styling: Tailwind CSS
Backend & Database: Supabase (PostgreSQL)
Authentication: Supabase Auth
Hosting: Firebase Hosting (Google Cloud)
CI/CD: GitHub Actions

✨ Features
Real-time Dashboard: View stock levels and sales updates instantly.
Product Management: Add, edit, delete, and categorize inventory items.
Secure Authentication: User login and signup handled securely via Supabase.
Low Stock Alerts: Visual indicators for items running low.
Responsive Design: Works seamlessly on desktop and mobile devices.
🛠️ Getting Started
Follow these instructions to set up the project locally on your machine.

Prerequisites
Node.js (v18 or higher)
npm or yarn
A Supabase account
Installation
Clone the repository:

git clone [https://github.com/ujeneza12/StockWise.git]
cd stockwise
Install dependencies:

npm install
Configure Environment Variables: Create a .env file in the root directory and add your Supabase credentials:

VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
Run the application:

npm run dev
The app should now be running at http://localhost:5173.

📦 Deployment
This project is configured for Continuous Deployment using GitHub Actions and Firebase Hosting.

How it works:
Preview Channels: When a Pull Request is created, a temporary preview URL is generated to test changes.
Live Site: When code is merged into the main branch, it is automatically built and deployed to the live URL.
Manual Deployment:
If you need to deploy manually from your local machine:

npm run build
firebase deploy