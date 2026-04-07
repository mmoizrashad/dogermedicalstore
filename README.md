# PharmaMastermind

Pharmacy Management System built with Flask + MySQL.

## Setup
1. Clone the repo
2. Create virtual environment: `python -m venv venv`
3. Install dependencies: `pip install -r requirements.txt`
4. Copy `.env.example` to `.env` and fill in your credentials
5. Run: `python run.py`

## Structure
- `app/` - Main application package
  - `routes/` - Flask blueprints
  - `services/` - Business logic (email, FAHP)
  - `models/` - Database models
  - `templates/` - HTML files organized by role
  - `static/` - CSS, JS, images, receipts, reports
- `instance/` - Secret config (not in git)
- `logs/` - Server logs
