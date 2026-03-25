# ── GaukDarba scraper pipeline ────────────────────────────────────────────────
# One-shot job: runs main.py (full pipeline) and exits.
# Schedule externally via Railway Cron / Cloud Run Jobs / system cron.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all pipeline scripts
COPY main.py          .
COPY scrape.py        .
COPY title_matcher.py .
COPY detail_scraper.py .
COPY detail_matcher.py .

# Required at runtime (pass via --env or Railway Variables):
#   SUPABASE_URL, SUPABASE_SERVICE_KEY
#   OPENAI_API_KEY
#   RESEND_API_KEY, RESEND_FROM_EMAIL, APP_URL
CMD ["python", "main.py"]
