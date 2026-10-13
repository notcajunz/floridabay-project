FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY pyproject.toml ./
COPY gangbot ./gangbot
RUN pip install --no-cache-dir .

VOLUME ["/data"]
ENV DATABASE_PATH=/data/gang_manager.db
CMD ["python", "-m", "gangbot"]

