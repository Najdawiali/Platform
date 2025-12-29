# OAuth Setup Guide

## Setting up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to "APIs & Services" > "Credentials"
4. Click "Create Credentials" > "OAuth client ID"
5. Select "Web application"
6. Add authorized redirect URIs:
   - `http://localhost:8000/api/auth/google/callback`
7. Copy the Client ID and Client Secret
8. Add to your `.env` file:
   ```
   GOOGLE_CLIENT_ID=your_client_id_here
   GOOGLE_CLIENT_SECRET=your_client_secret_here
   ```

## Setting up GitHub OAuth

1. Go to [GitHub Settings](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Fill in the details:
   - Application name: DataPulse
   - Homepage URL: `http://localhost:5204`
   - Authorization callback URL: `http://localhost:8000/api/auth/github/callback`
4. Click "Register application"
5. Copy the Client ID and generate a Client Secret
6. Add to your `.env` file:
   ```
   GITHUB_CLIENT_ID=your_client_id_here
   GITHUB_CLIENT_SECRET=your_client_secret_here
   ```

## Environment Variables

Create or update your `.env` file in the `backend` directory:

```env
# Database
DATABASE_URL=sqlite:///./data_platform.db

# Security
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# File Upload
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=104857600

# CORS
CORS_ORIGINS=["http://localhost:5204", "http://localhost:3000"]

# OAuth - Google
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/google/callback

# OAuth - GitHub
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_REDIRECT_URI=http://localhost:8000/api/auth/github/callback

# Frontend URL
FRONTEND_URL=http://localhost:5204
```

## Testing OAuth

1. Start the backend: `cd backend && python -m uvicorn app.main:app --reload`
2. Start the frontend: `cd frontend && npm run dev`
3. Navigate to `http://localhost:5204/login`
4. Click "Continue with Google" or "Continue with GitHub"
5. Complete the OAuth flow
6. You should be redirected back to the dashboard

## Notes

- OAuth will only work if you configure the client IDs and secrets
- Without configuration, the buttons will show an error message
- For production, update the redirect URIs to match your production URLs
