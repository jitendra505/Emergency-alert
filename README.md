# 🚨 Real-Time Emergency Alert & Incident Reporting System

A full-stack real-time emergency alert system built as a **University Minor Project**. Citizens can report emergencies with photos and GPS location; admins receive instant notifications and manage incidents through a live dashboard.

![Node.js](https://img.shields.io/badge/Node.js-v18+-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-5.x-000000?logo=express)
![MongoDB](https://img.shields.io/badge/MongoDB-7.0+-47A248?logo=mongodb&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-4.x-010101?logo=socket.io)

---

## 📑 Table of Contents

1. [Features](#-features)
2. [Tech Stack](#-tech-stack)
3. [Project Structure](#-project-structure)
4. [Prerequisites](#-prerequisites)
5. [Database Setup (Step-by-Step)](#-database-setup-step-by-step)
6. [Installation & Running](#-installation--running)
7. [Environment Variables](#-environment-variables)
8. [Database Schema](#-database-schema)
9. [API Reference](#-api-reference)
10. [Default Credentials](#-default-credentials)
11. [Architecture Overview](#-architecture-overview)
12. [Screenshots](#-screenshots)
13. [Troubleshooting](#-troubleshooting)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **Real-Time Alerts** | Admins receive instant push notifications via WebSocket when a new report is submitted |
| **Map-Based Location** | Interactive Leaflet.js map with GPS geolocation and reverse geocoding (Nominatim) |
| **Image Evidence** | Upload up to 4 photos per report, auto-compressed to WebP via Sharp |
| **Email Notifications** | Automated emails to admins (new reports) and users (status changes) via Nodemailer |
| **Live Status Tracking** | Reports flow through Pending → In Progress → Resolved/Dismissed with real-time updates |
| **Profile Management** | Users and admins can edit name, phone, and change password from dashboard |
| **Landing Page Stats** | Public homepage shows live statistics pulled from the database (auto-refreshes every 30s) |
| **Neomorphic UI** | Clean, modern neomorphic design with teal/cyan accents |
| **Security** | JWT auth, bcrypt hashing, Helmet headers, CORS, rate limiting, input validation |

---

## 🛠 Tech Stack

### Backend

| Technology | Purpose |
|-----------|---------|
| **Node.js** | JavaScript runtime |
| **Express 5.x** | Web framework |
| **MongoDB** | NoSQL database |
| **Mongoose** | MongoDB ODM (Object Data Modeling) |
| **Socket.io** | Real-time bidirectional communication |
| **JWT + bcryptjs** | Authentication & password hashing |
| **Multer + Sharp** | File upload & image compression (WebP) |
| **Nodemailer** | Email notifications (SMTP) |
| **Helmet** | HTTP security headers |
| **express-rate-limit** | Brute-force protection |
| **express-validator** | Input sanitization & validation |
| **compression** | Gzip response compression |

### Frontend

| Technology | Purpose |
|-----------|---------|
| **HTML5 / CSS3 / JS** | Vanilla frontend (no frameworks) |
| **Leaflet.js** | Interactive maps with OpenStreetMap |
| **Socket.io Client** | Real-time event handling |
| **Neomorphic CSS** | Custom design system (~1300 lines) |

---

## 📁 Project Structure

```
projectjitu/
├── README.md
├── client/                          # Frontend (served as static files)
│   ├── index.html                   # Landing page with live stats & auth modal
│   ├── user-dashboard.html          # User: report form, map, tracker, profile
│   ├── admin-dashboard.html         # Admin: live feed, filters, status mgmt, profile
│   ├── css/
│   │   └── style.css                # Full neomorphic design system (~1300 lines)
│   ├── js/
│   │   ├── api.js                   # Centralized fetch wrapper, auth helpers, toasts
│   │   ├── home.js                  # Landing page: real stats + auth modal logic
│   │   ├── auth.js                  # Legacy auth page (kept for reference)
│   │   ├── socket.js                # Socket.io client (room joining, reconnection)
│   │   ├── userDashboard.js         # User dashboard: form, map, upload, profile
│   │   └── adminDashboard.js        # Admin dashboard: reports, filters, profile
│   └── assets/                      # Static assets (images, icons)
│
└── server/                          # Backend
    ├── .env                         # Environment config (DO NOT commit to git)
    ├── .gitignore
    ├── package.json
    ├── server.js                    # Express + Socket.io bootstrap
    ├── seed.js                      # Database seeder (creates admin + test user)
    ├── config/
    │   └── db.js                    # MongoDB connection handler
    ├── middleware/
    │   └── auth.js                  # JWT protect, adminOnly, generateToken
    ├── models/
    │   ├── User.js                  # User schema (bcrypt auto-hash on save)
    │   └── Report.js                # Emergency report schema (indexed)
    ├── routes/
    │   ├── auth.js                  # POST /register, /login, GET /me, PUT /profile
    │   ├── reports.js               # CRUD + status change + image upload
    │   └── stats.js                 # GET /public (no auth required - landing page)
    ├── socket/
    │   └── index.js                 # Room-based Socket.io event handler
    ├── utils/
    │   ├── fileUpload.js            # Multer (memory) + Sharp image pipeline
    │   └── emailService.js          # Nodemailer with HTML email templates
    └── uploads/                     # Uploaded images stored here (auto-created)
```

---

## 📋 Prerequisites

Before you begin, make sure you have the following installed on your system:

| Software | Minimum Version | Download Link |
|----------|----------------|---------------|
| **Node.js** | v18.0 or higher | [nodejs.org](https://nodejs.org/) |
| **MongoDB** | v6.0 or higher | [mongodb.com/try/download](https://www.mongodb.com/try/download/community) |
| **Git** | Any recent version | [git-scm.com](https://git-scm.com/) |

**Verify your installations:**

```bash
node --version    # Should show v18.x or higher
mongod --version  # Should show v6.x or higher
git --version     # Any version is fine
```

---

## 🗄 Database Setup (Step-by-Step)

This section walks you through setting up MongoDB from scratch. Follow the steps for your operating system.

---

### Step 1: Install MongoDB

<details>
<summary><strong>🪟 Windows</strong></summary>

1. Download the **MongoDB Community Server** MSI installer from:
   👉 https://www.mongodb.com/try/download/community
2. Run the installer
3. Choose **Complete** setup type
4. ✅ Check **"Install MongoDB as a Service"** — this makes MongoDB start automatically with Windows
5. ✅ Optionally check **"Install MongoDB Compass"** — a GUI tool for viewing your data
6. Click **Install** → Wait for completion → **Finish**
7. MongoDB is now running as a Windows service on port `27017`

**Verify it's running:**
```powershell
Get-Service MongoDB
# Status should show "Running"
```

**If it's not running:**
```powershell
# Run PowerShell as Administrator
net start MongoDB
```

</details>

<details>
<summary><strong>🍎 macOS</strong></summary>

```bash
# Install via Homebrew
brew tap mongodb/brew
brew install mongodb-community@7.0

# Start as a background service
brew services start mongodb-community@7.0
```

**Verify:**
```bash
mongosh --eval "db.runCommand({ ping: 1 })"
# Should output: { ok: 1 }
```

</details>

<details>
<summary><strong>🐧 Ubuntu / Debian Linux</strong></summary>

```bash
# 1. Import MongoDB GPG key
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
  sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor

# 2. Add the repository
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] \
  https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
  sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

# 3. Install MongoDB
sudo apt-get update
sudo apt-get install -y mongodb-org

# 4. Start and enable (auto-start on boot)
sudo systemctl start mongod
sudo systemctl enable mongod
```

**Verify:**
```bash
sudo systemctl status mongod
# Should show "active (running)"
```

</details>

---

### Step 2: Understand the Connection URI

The project connects to MongoDB using a **connection string** (URI). Here's the default one used in this project:

```
mongodb://127.0.0.1:27017/emergency_alert_db
```

| Part | Meaning |
|------|---------|
| `mongodb://` | Protocol identifier |
| `127.0.0.1` | Host address (localhost — your machine) |
| `27017` | Port (MongoDB default) |
| `emergency_alert_db` | Database name |

> **Important:** You do **NOT** need to manually create the database. MongoDB creates it automatically when the first document is inserted.

---

### Step 3: Configure the Connection

Open the file **`server/.env`** and set the `MONGO_URI` variable:

**Option A — Local MongoDB (no authentication, simplest):**
```env
MONGO_URI=mongodb://127.0.0.1:27017/emergency_alert_db
```

**Option B — Local MongoDB with authentication:**
```env
MONGO_URI=mongodb://myuser:mypassword@127.0.0.1:27017/emergency_alert_db?authSource=admin
```

**Option C — MongoDB Atlas (cloud-hosted, free tier available):**
```env
MONGO_URI=mongodb+srv://myuser:mypassword@cluster0.xxxxx.mongodb.net/emergency_alert_db?retryWrites=true&w=majority
```

> See [Step 8](#step-8-optional-using-mongodb-atlas-cloud) if you want to use Atlas instead of local MongoDB.

---

### Step 4: Install Project Dependencies

```bash
cd server
npm install
```

This installs all packages listed in `package.json` including `mongoose` (the MongoDB driver/ODM).

---

### Step 5: Seed the Database

The seed script creates the default **admin** and **test user** accounts:

```bash
cd server
node seed.js
```

**Expected output:**
```
Connected to MongoDB
✅ Admin user created:
  Email: admin@emergency.com
  Password: admin123

✅ Test user created:
  Email: user@test.com
  Password: user123

🎉 Seed complete!
```

**What this does internally:**
1. Connects to MongoDB using the URI from `.env`
2. Checks if admin user exists → creates if not
3. Checks if test user exists → creates if not
4. Passwords are automatically **hashed with bcrypt** before storing (via the Mongoose pre-save hook in `User.js`)
5. Exits the process

---

### Step 6: Start the Server

```bash
cd server
npm start
```

**Expected output:**
```
✅ MongoDB Connected: 127.0.0.1
🚀 Server running on port 5000
```

Now open your browser and go to: **http://localhost:5000**

---

### Step 7: Verify the Database

You can inspect the data using **MongoDB Compass** (GUI) or **mongosh** (CLI).

<details>
<summary><strong>Using mongosh (Command Line)</strong></summary>

```bash
# Open the MongoDB shell
mongosh

# Switch to the project database
use emergency_alert_db

# List all collections
show collections
# Output: users, reports

# View all users (passwords are hashed, not visible in plain text)
db.users.find({}, { name: 1, email: 1, role: 1, phone: 1 }).pretty()

# Count documents
db.users.countDocuments()    # 2 (admin + test user)
db.reports.countDocuments()  # 0 (no reports yet)

# View indexes on reports collection
db.reports.getIndexes()
# Shows: { status: 1, createdAt: -1 }, { user: 1, createdAt: -1 }, { type: 1 }

# Exit
exit
```

</details>

<details>
<summary><strong>Using MongoDB Compass (GUI)</strong></summary>

1. Open **MongoDB Compass**
2. In the connection string field, enter: `mongodb://127.0.0.1:27017`
3. Click **Connect**
4. In the left sidebar, click **emergency_alert_db**
5. You'll see two collections: **users** and **reports**
6. Click on **users** to see the seeded admin and test user
7. Notice that passwords are stored as **bcrypt hashes** (e.g., `$2a$10$...`)

</details>

---

### Step 8 (Optional): Using MongoDB Atlas (Cloud)

If you prefer a **cloud-hosted** database instead of installing MongoDB locally:

1. Go to [cloud.mongodb.com](https://cloud.mongodb.com/) → Create a **free account**
2. Click **Build a Database** → Choose **M0 Free** tier → Select a region close to you
3. Set a **cluster name** (e.g., `EmergencyCluster`) → Click **Create Deployment**

4. **Create a Database User:**
   - Go to **Database Access** (left sidebar)
   - Click **Add New Database User**
   - Set a username and password
   - Role: **Read and write to any database**
   - Click **Add User**

5. **Allow Network Access:**
   - Go to **Network Access** (left sidebar)
   - Click **Add IP Address**
   - Click **Allow Access from Anywhere** (`0.0.0.0/0`) for development
   - Click **Confirm**

6. **Get Connection String:**
   - Go to **Database** → Click **Connect** on your cluster
   - Choose **Drivers** → Copy the connection string
   - It looks like: `mongodb+srv://username:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`

7. **Update `.env`:**
   ```env
   MONGO_URI=mongodb+srv://youruser:yourpassword@cluster0.xxxxx.mongodb.net/emergency_alert_db?retryWrites=true&w=majority
   ```
   > Replace `youruser`, `yourpassword`, and `cluster0.xxxxx` with your actual values. Add `/emergency_alert_db` before the `?` to specify the database name.

8. **Seed the cloud database:**
   ```bash
   cd server
   node seed.js
   ```

---

### Database Integration Summary

```
┌──────────────────────────────────────────────────────────────┐
│                    How Data Flows                             │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. User fills form → clicks Submit                          │
│      ↓                                                       │
│  2. Browser sends POST /api/reports (with JWT token)         │
│      ↓                                                       │
│  3. Express route receives request                           │
│      ↓                                                       │
│  4. Middleware verifies JWT → extracts user ID               │
│      ↓                                                       │
│  5. Multer processes uploaded images (memory buffer)         │
│      ↓                                                       │
│  6. Sharp compresses images → saves to /uploads as WebP      │
│      ↓                                                       │
│  7. Mongoose creates Report document:                        │
│     Report.create({ user: userId, type, severity,            │
│       title, description, location, images, status })        │
│      ↓                                                       │
│  8. MongoDB stores the document in `reports` collection      │
│      ↓                                                       │
│  9. Socket.io emits 'newReport' to admin room                │
│      ↓                                                       │
│  10. Admin dashboard receives event → refreshes list         │
│      ↓                                                       │
│  11. Nodemailer sends email notification to admin            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 🚀 Installation & Running

### Quick Start (5 steps)

```bash
# 1. Clone the repository
git clone https://github.com/your-username/projectjitu.git
cd projectjitu

# 2. Install server dependencies
cd server
npm install

# 3. Configure environment (edit .env with your MongoDB URI)
#    Default local URI works out of the box if MongoDB is running

# 4. Seed the database
node seed.js

# 5. Start the server
npm start
```

Open **http://localhost:5000** in your browser.

---

## ⚙ Environment Variables

All environment variables are stored in `server/.env`:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `5000` | Server port number |
| `MONGO_URI` | **Yes** | — | MongoDB connection string |
| `JWT_SECRET` | **Yes** | — | Secret key for signing JWT tokens |
| `JWT_EXPIRE` | No | `7d` | Token expiration (e.g., `1h`, `7d`, `30d`) |
| `EMAIL_HOST` | No | `smtp.gmail.com` | SMTP server hostname |
| `EMAIL_PORT` | No | `587` | SMTP server port |
| `EMAIL_USER` | No | — | SMTP email address |
| `EMAIL_PASS` | No | — | SMTP password or app password |
| `EMAIL_FROM` | No | — | Sender display name and email |
| `ADMIN_EMAIL` | No | — | Email to receive new report alerts |
| `NODE_ENV` | No | `development` | Environment mode |

> **Note:** Email notifications are **automatically skipped** if `EMAIL_USER` is not configured. The system works perfectly without email setup.

**Example `.env` file:**
```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/emergency_alert_db
JWT_SECRET=your_super_secret_key_change_this
JWT_EXPIRE=7d

# Email (optional - skip for development)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_gmail_app_password
EMAIL_FROM=Emergency Alert System <your_email@gmail.com>
ADMIN_EMAIL=admin@emergency.com

NODE_ENV=development
```

---

## 🗃 Database Schema

### Users Collection (`users`)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `_id` | ObjectId | Auto-generated | Unique identifier |
| `name` | String | Required, max 50 chars | Full name |
| `email` | String | Required, unique, lowercase | Email address |
| `password` | String | Required, min 6 chars, `select: false` | Bcrypt-hashed password |
| `phone` | String | Optional, default: `''` | Phone number |
| `role` | String | Enum: `user`, `admin` | User role |
| `avatar` | String | Default: `''` | Avatar URL |
| `notificationsEnabled` | Boolean | Default: `true` | Email notification preference |
| `createdAt` | Date | Auto (timestamps) | Account creation date |
| `updatedAt` | Date | Auto (timestamps) | Last modification date |

**Key behaviors:**
- Password is **automatically hashed** with bcrypt (10 salt rounds) via a Mongoose `pre('save')` hook
- Password is **never returned** in queries by default (`select: false`)
- Email is **uniquely indexed** — duplicate registrations are rejected

---

### Reports Collection (`reports`)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `_id` | ObjectId | Auto-generated | Unique identifier |
| `user` | ObjectId | Required, references `users` | Report author |
| `type` | String | Required, enum: `accident`, `fire`, `crime`, `medical`, `natural_disaster`, `other` | Emergency category |
| `severity` | String | Enum: `low`, `medium`, `high`, `critical`; default: `medium` | Urgency level |
| `title` | String | Required, max 100 chars | Brief title |
| `description` | String | Required, max 2000 chars | Detailed description |
| `location.address` | String | Required | Human-readable address |
| `location.lat` | Number | Nullable | GPS latitude |
| `location.lng` | Number | Nullable | GPS longitude |
| `images` | [String] | Max 4 items | Array of uploaded image file paths |
| `status` | String | Enum: `Pending`, `In Progress`, `Resolved`, `Dismissed`; default: `Pending` | Current status |
| `adminNotes` | String | Default: `''` | Notes from admin |
| `resolvedAt` | Date | Nullable | Timestamp when resolved |
| `createdAt` | Date | Auto (timestamps) | Submission date |
| `updatedAt` | Date | Auto (timestamps) | Last update date |

**Indexes for performance:**
| Index | Fields | Purpose |
|-------|--------|---------|
| Status + Date | `{ status: 1, createdAt: -1 }` | Fast filtering by status with newest first |
| User + Date | `{ user: 1, createdAt: -1 }` | Efficient "my reports" queries |
| Type | `{ type: 1 }` | Quick type-based filtering |

---

### Entity Relationship Diagram

```
┌──────────────────┐          1 : N          ┌──────────────────────┐
│      users       │ ───────────────────────▶ │       reports        │
│                  │                          │                      │
│  _id (PK)        │◀─── user (FK, ObjectId) │  _id (PK)            │
│  name            │                          │  title               │
│  email (unique)  │                          │  type                │
│  password (hash) │                          │  severity            │
│  phone           │                          │  description         │
│  role            │                          │  location {          │
│  avatar          │                          │    address, lat, lng │
│  createdAt       │                          │  }                   │
│  updatedAt       │                          │  images []           │
│                  │                          │  status              │
│                  │                          │  adminNotes          │
│                  │                          │  resolvedAt          │
│                  │                          │  createdAt           │
│                  │                          │  updatedAt           │
└──────────────────┘                          └──────────────────────┘
```

**Relationship:** One User can submit many Reports. Each Report belongs to exactly one User.

---

## 📡 API Reference

### Authentication Routes (`/api/auth`)

#### `POST /api/auth/register` — Create Account
```json
// Request Body
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "mypassword123",
  "phone": "+91 9876543210"     // optional
}

// Response (201)
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": { "id": "...", "name": "John Doe", "email": "john@example.com", "role": "user", "phone": "+91 9876543210" }
}
```

#### `POST /api/auth/login` — Sign In
```json
// Request Body
{ "email": "john@example.com", "password": "mypassword123" }

// Response (200)
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": { "id": "...", "name": "John Doe", "email": "john@example.com", "role": "user", "phone": "..." }
}
```

#### `GET /api/auth/me` — Get Current User
```
Header: Authorization: Bearer <token>
```
```json
// Response (200)
{
  "success": true,
  "user": { "id": "...", "name": "John Doe", "email": "john@example.com", "role": "user", "phone": "...", "createdAt": "..." }
}
```

#### `PUT /api/auth/profile` — Update Profile
```
Header: Authorization: Bearer <token>
```
```json
// Request Body (all fields optional)
{
  "name": "John Updated",
  "phone": "+91 1234567890",
  "currentPassword": "oldpassword",    // required if changing password
  "newPassword": "newpassword123"      // min 6 chars
}

// Response (200)
{
  "success": true,
  "user": { "id": "...", "name": "John Updated", "email": "john@example.com", "role": "user", "phone": "+91 1234567890" }
}
```

---

### Report Routes (`/api/reports`)

#### `POST /api/reports` — Submit Emergency Report
```
Header: Authorization: Bearer <token>
Content-Type: multipart/form-data
```
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | `accident`, `fire`, `crime`, `medical`, `natural_disaster`, `other` |
| `severity` | string | No | `low`, `medium`, `high`, `critical` (default: medium) |
| `title` | string | Yes | Max 100 characters |
| `description` | string | Yes | Max 2000 characters |
| `address` | string | Yes | Location address |
| `lat` | number | No | GPS latitude |
| `lng` | number | No | GPS longitude |
| `images` | file[] | No | Up to 4 images (JPEG, PNG, WebP; max 5MB each) |

#### `GET /api/reports/my` — Get My Reports
```
Header: Authorization: Bearer <token>
Query: ?page=1&limit=20
```

#### `GET /api/reports` — Get All Reports (Admin Only)
```
Header: Authorization: Bearer <admin-token>
Query: ?page=1&limit=20&status=Pending&type=fire&severity=high&search=keyword
```

#### `PATCH /api/reports/:id/status` — Update Status (Admin Only)
```json
// Request Body
{ "status": "In Progress", "adminNotes": "Team dispatched to location" }
```

#### `DELETE /api/reports/:id` — Delete Report (Admin Only)

---

### Statistics Routes (`/api/stats`)

#### `GET /api/stats/public` — Public Landing Page Stats (No Auth)
```json
// Response (200)
{
  "success": true,
  "stats": {
    "totalReports": 42,
    "totalUsers": 15,
    "statuses": { "Pending": 5, "In Progress": 8, "Resolved": 27, "Dismissed": 2 },
    "types": { "accident": 12, "fire": 8, "crime": 6, "medical": 10, "natural_disaster": 3, "other": 3 },
    "severities": { "low": 10, "medium": 18, "high": 9, "critical": 5 },
    "avgResolutionHours": 4.2,
    "recentResolved": [ { "type": "fire", "title": "...", "location": {...}, "severity": "high", "resolvedAt": "..." } ]
  }
}
```

---

### WebSocket Events

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `joinRoom` | Client → Server | `{ room: 'admins' }` or `{ room: 'user_<id>' }` | Join a notification room |
| `newReport` | Server → `admins` room | `{ _id, type, severity, title, ... }` | Emitted when user submits a new report |
| `statusUpdate` | Server → `user_<id>` room | `{ reportId, status, adminNotes }` | Emitted when admin changes report status |
| `adminTyping` | Client → Server | `{ reportId }` | Admin typing indicator |

---

## 🔑 Default Credentials

After running `node seed.js`, these accounts are available:

| Role | Email | Password | Dashboard |
|------|-------|----------|-----------|
| **Admin** | `admin@emergency.com` | `admin123` | `/admin-dashboard.html` |
| **User** | `user@test.com` | `user123` | `/user-dashboard.html` |

> ⚠ **Change these passwords immediately if deploying to production!**

---

## 🏗 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENT (Browser)                        │
│                                                              │
│  ┌──────────┐  ┌────────────────┐  ┌────────────────────┐  │
│  │index.html│  │ user-dashboard │  │  admin-dashboard   │  │
│  │(landing) │  │     .html      │  │      .html         │  │
│  └─────┬────┘  └───────┬────────┘  └─────────┬──────────┘  │
│        │               │                      │             │
│  ┌─────▼───────────────▼──────────────────────▼──────────┐  │
│  │              api.js  (Fetch Wrapper + Auth)            │  │
│  │              socket.js (Socket.io Client)              │  │
│  └──────────────────────┬────────────────────────────────┘  │
└─────────────────────────┼───────────────────────────────────┘
                          │ HTTP REST + WebSocket (WS)
┌─────────────────────────┼───────────────────────────────────┐
│                         ▼        SERVER (Node.js)            │
│  ┌───────────────────────────────────────────────────────┐  │
│  │               Express 5.x + Socket.io                  │  │
│  │                                                        │  │
│  │  ┌──────────┐  ┌────────┐  ┌─────────┐  ┌─────────┐  │  │
│  │  │ Helmet   │  │ CORS   │  │ Compress│  │RateLimit│  │  │
│  │  └──────────┘  └────────┘  └─────────┘  └─────────┘  │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │                     Routes                             │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │  │
│  │  │ /api/auth    │  │ /api/reports │  │ /api/stats  │  │  │
│  │  │ register     │  │ CRUD + upload│  │ public data │  │  │
│  │  │ login        │  │ status mgmt  │  │             │  │  │
│  │  │ me, profile  │  │ filters      │  │             │  │  │
│  │  └──────────────┘  └──────────────┘  └─────────────┘  │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │                    Middleware                           │  │
│  │  ┌────────────┐  ┌────────────┐  ┌─────────────────┐  │  │
│  │  │JWT Protect │  │ Admin Only │  │express-validator│  │  │
│  │  └────────────┘  └────────────┘  └─────────────────┘  │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │                    Utilities                           │  │
│  │  ┌─────────────────┐  ┌────────────────────────────┐  │  │
│  │  │ Multer + Sharp  │  │ Nodemailer (HTML emails)  │  │  │
│  │  │ (image upload)  │  │                            │  │  │
│  │  └─────────────────┘  └────────────────────────────┘  │  │
│  └────────────────────────────┬───────────────────────────┘  │
└───────────────────────────────┼──────────────────────────────┘
                                │ Mongoose ODM
┌───────────────────────────────┼──────────────────────────────┐
│                               ▼                               │
│                         MongoDB                               │
│          ┌─────────────────────────────────────┐             │
│          │       emergency_alert_db            │             │
│          │                                     │             │
│          │   ┌──────────┐    ┌────────────┐   │             │
│          │   │  users   │───▶│  reports   │   │             │
│          │   │ (2 docs) │ 1:N│ (N docs)   │   │             │
│          │   └──────────┘    └────────────┘   │             │
│          └─────────────────────────────────────┘             │
└──────────────────────────────────────────────────────────────┘
```

### Request Lifecycle

```
1. User clicks "Submit Report" button
     ↓
2. userDashboard.js → api.js sends POST /api/reports with FormData + JWT
     ↓
3. Express receives request → Helmet, CORS, Compression middleware
     ↓
4. auth.js middleware → Verifies JWT → Attaches user to request
     ↓
5. reports.js route → Multer extracts images → Sharp compresses to WebP
     ↓
6. Mongoose validates data → Creates Report document in MongoDB
     ↓
7. Socket.io emits 'newReport' event to 'admins' room
     ↓
8. Nodemailer sends email notification to admin (if configured)
     ↓
9. Response { success: true, report: {...} } sent to browser
     ↓
10. Admin dashboard receives WebSocket event → Refreshes report list
```

---

## 📸 Screenshots

After starting the server, visit **http://localhost:5000** to see:

| Page | URL | Description |
|------|-----|-------------|
| **Landing Page** | `/` | Live stats (total reports, severity bar, type breakdown), recently resolved incidents, feature showcase, login/register modal |
| **User Dashboard** | `/user-dashboard.html` | Submit reports with map & GPS, drag-and-drop image upload, track report statuses, edit profile |
| **Admin Dashboard** | `/admin-dashboard.html` | Real-time stats grid, filter & search reports, change status with notes, view location on map, notification bell with sound, edit profile |

---

## 🧩 Troubleshooting

| Problem | Solution |
|---------|----------|
| **`EADDRINUSE: address already in use :::5000`** | Port 5000 is occupied. Find & kill the process: `netstat -ano \| findstr :5000` (Windows) or `lsof -i :5000` (Mac/Linux) |
| **`MongoServerError: connect ECONNREFUSED`** | MongoDB is not running. Start it: `net start MongoDB` (Windows) / `sudo systemctl start mongod` (Linux) |
| **`Cannot find module 'xyz'`** | Dependencies missing. Run `cd server && npm install` |
| **Images not uploading** | `server/uploads/` directory is created automatically. Check disk space and file permissions |
| **Emails not sending** | Set `EMAIL_USER` and `EMAIL_PASS` in `.env`. For Gmail, create an [App Password](https://support.google.com/accounts/answer/185833) |
| **Seed says "already exists"** | Users were already created — this is normal. Use the existing credentials |
| **Login returns 401** | Check email/password. Passwords are case-sensitive. Try re-running `node seed.js` |
| **Map not loading** | Requires internet connection for OpenStreetMap tiles |
| **Socket events not working** | Make sure the server was started (not just `npm install`). Check browser console for WebSocket errors |

---

## 📝 License

This project is built for **educational purposes** as a university minor project.

---

<div align="center">

**Built with ❤️ using Node.js, Express, MongoDB, Socket.io, and Leaflet.js**

`© 2026 — University Minor Project`

</div>
