# Dùng Python 3.11 (hợp với stack torch + ultralytics của bạn)
FROM python:3.11-slim

# Không tạo .pyc và log buffer
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8000

WORKDIR /app

# Cài các thư viện hệ thống cần cho opencv, pillow...
RUN apt-get update && apt-get install -y \
    build-essential \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Cài dependency Python trước
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy code + model vào image
COPY . .

# Expose port trong container (Azure/AWS sẽ map ra ngoài)
EXPOSE ${PORT}

# Chạy uvicorn
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
