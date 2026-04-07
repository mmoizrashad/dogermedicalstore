# ─────────────────────────────────────────────
# PharmaMastermind – Dockerfile for Back4App
# Flask + MySQL (external Railway DB)
# ─────────────────────────────────────────────

FROM python:3.11-slim

# System dependencies (required for mysqlclient / flask-mysqldb)
RUN apt-get update && apt-get install -y \
    gcc \
    pkg-config \
    default-libmysqlclient-dev \
    libssl-dev \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Working directory inside container
WORKDIR /app

# Copy requirements first (layer caching)
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir gunicorn

# Copy entire project
COPY . .

# Create directories that the app writes to at runtime
RUN mkdir -p logs receipts customer_receipts reports images

# Expose the port Back4App expects
EXPOSE 80

# Run with Gunicorn (production WSGI server)
# run.py defines the Flask app as 'app'
CMD ["gunicorn", "--bind", "0.0.0.0:80", "--workers", "2", "--timeout", "120", "run:app"]
