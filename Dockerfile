FROM python:3.12-slim

# ---- System dependencies for Playwright Chromium ----
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    gnupg \
    curl \
    # Chromium / Playwright native deps
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    libatspi2.0-0 \
    libxshmfence1 \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---- Python dependencies ----
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ---- Playwright browser ----
RUN playwright install chromium
RUN playwright install-deps chromium

# ---- Application code ----
COPY . .

# Create runs directory
RUN mkdir -p runs

ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1
ENV RUNS_DIR=/app/runs

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
