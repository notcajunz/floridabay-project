FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY pyproject.toml ./
COPY deptbot ./deptbot
RUN pip install --no-cache-dir .

VOLUME ["/data"]
ENV DATABASE_PATH=/data/department_manager.db
CMD ["python", "-m", "deptbot"]

