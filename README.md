# DataPulse - Data Analytics Platform

A modern, full-stack data analytics platform that enables users to connect, visualize, and analyze data from multiple sources through an intuitive interface.

![Version](https://img.shields.io/badge/version-2.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ Features

- **Multi-Source Data Connections** - Connect to PostgreSQL, MySQL, MongoDB, Salesforce, or upload CSV/Excel/JSON files
- **Interactive Dashboards** - Create and customize dashboards with various chart types
- **SQL Editor** - Write and execute SQL queries with syntax highlighting
- **Workflow Builder** - Visual data modeling and transformation pipeline builder
- **AI Assistant** - Natural language interface to query and analyze your data
- **Google OAuth** - Secure authentication with Google Single Sign-On
- **Real-time Sync** - Automatic data synchronization from connected sources

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19, TypeScript, Vite, TailwindCSS |
| **Backend** | Python 3.9+, FastAPI, SQLAlchemy |
| **Database** | SQLite (dev), PostgreSQL (prod) |
| **Data Processing** | Pandas, Polars, DuckDB, PyArrow |

## 📋 Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.9+ (Python 3.13 recommended)
- **Git**

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/data-platform.git
cd data-platform
```

### 2. Backend Setup

```bash
# Navigate to backend
cd backend

# Create virtual environment
python -m venv venv-platform

# Activate virtual environment
# Windows:
.\venv-platform\Scripts\activate
# macOS/Linux:
source venv-platform/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file (copy from example or create new)
# Required variables:
# - SECRET_KEY=your-secret-key
# - GOOGLE_CLIENT_ID=your-google-oauth-client-id
# - GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret

# Start the backend server
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend Setup

```bash
# Open a new terminal and navigate to frontend
cd frontend

# Install dependencies
npm install

# Start the development server
npm run dev
```

### 4. Access the Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

## 📁 Project Structure

```
data-platform/
├── backend/
│   ├── app/
│   │   ├── api/           # API route handlers
│   │   ├── connectors/    # Database connectors
│   │   ├── models/        # SQLAlchemy models
│   │   ├── schemas/       # Pydantic schemas
│   │   ├── services/      # Business logic
│   │   └── utils/         # Utilities
│   ├── migrations/        # Database migrations
│   └── requirements.txt   # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── pages/         # Page components
│   │   ├── services/      # API services
│   │   └── types/         # TypeScript types
│   └── package.json       # Node dependencies
└── README.md
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the `backend/` directory:

```env
# Security
SECRET_KEY=your-super-secret-key-change-in-production

# Google OAuth (optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Database (optional - defaults to SQLite)
DATABASE_URL=sqlite:///./data_platform.db

# Auto-sync (optional)
AUTO_SYNC_ENABLED=false
```

## 📊 Supported Data Sources

| Source | Status | Notes |
|--------|--------|-------|
| CSV | ✅ | Direct file upload |
| Excel (.xlsx) | ✅ | Direct file upload |
| JSON | ✅ | Direct file upload |
| PostgreSQL | ✅ | Connection string required |
| MySQL | ✅ | Connection string required |
| MongoDB | ✅ | Connection string required |
| Salesforce | ✅ | OAuth credentials required |

## 🧪 Development

### Running Tests

```bash
# Backend tests
cd backend
pytest

# Frontend tests
cd frontend
npm test
```

### Building for Production

```bash
# Frontend build
cd frontend
npm run build

# Backend - run with production server
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [FastAPI](https://fastapi.tiangolo.com/) - Modern Python web framework
- [React](https://react.dev/) - Frontend library
- [TailwindCSS](https://tailwindcss.com/) - Utility-first CSS framework
- [DuckDB](https://duckdb.org/) - In-process SQL analytics database
