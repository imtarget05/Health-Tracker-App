import logging
from typing import Any, Dict
from functools import wraps

from fastapi import FastAPI, UploadFile, File, HTTPException, Query, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import httpx

from predictor import FoodPredictor

# =========================
# Logging
# =========================
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# =========================
# FastAPI app
# =========================
app = FastAPI(
    title="Food Nutrition API",
    description="AI-powered food detection and nutrition analysis",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Read API key from env (required): clients must include x-api-key header
import os
AI_API_KEY = os.environ.get('AI_API_KEY')
if not AI_API_KEY:
    logger.warning('[SECURITY] AI_API_KEY not set - running with API key protection DISABLED (DANGEROUS!)')

# =========================
# Khởi tạo model
# =========================
try:
    predictor = FoodPredictor()
    logger.info("Food predictor initialized successfully")
except Exception as e:
    logger.exception("Failed to initialize predictor")
    predictor = None

# =========================
# CORS - ✅ SECURITY: Only allow specific origins (NOT "*")
# =========================
# Customize these for your deployment
ALLOWED_ORIGINS = os.environ.get('CORS_ORIGINS', 'http://localhost:5001,http://localhost:8080').split(',')

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,  # ✅ Restricted origins (not "*")
    allow_credentials=True,
    allow_methods=["POST", "OPTIONS"],  # ✅ Only allow POST for /predict, OPTIONS for preflight
    allow_headers=["*"],
)

# =========================
# ✅ SECURITY: API Key validation middleware
# =========================
async def verify_api_key(request: Request):
    """
    Verify API key from x-api-key header
    Called on protected endpoints
    """
    if not AI_API_KEY:
        # API key disabled - allow all requests
        logger.warning('[SECURITY] API_KEY check disabled')
        return None
    
    api_key = request.headers.get('x-api-key')
    if not api_key or api_key != AI_API_KEY:
        logger.warning('[SECURITY] Invalid API key attempt from %s', request.client.host if request.client else 'unknown')
        raise HTTPException(
            status_code=401,
            detail='Invalid or missing API key in x-api-key header'
        )
    
    return api_key

# =========================
# Helper: chạy phân tích ảnh
# =========================
def run_analysis(image_bytes: bytes) -> Dict[str, Any]:
    """
    Nhận bytes ảnh, gọi FoodPredictor.analyze_image(...) và trả về dict JSON.
    """
    if predictor is None:
        raise HTTPException(
            status_code=500,
            detail="Model not loaded (predictor is None). Kiểm tra lại khởi tạo FoodPredictor."
        )

    try:
        # GỌI ĐÚNG HÀM BẠN ĐÃ VIẾT TRONG predictor.py
        result: Dict[str, Any] = predictor.analyze_image(image_bytes)
        if not isinstance(result, dict):
            raise RuntimeError("Kết quả từ predictor không phải dict")
        return result
    except Exception as e:
        logger.exception("Error while analyzing image")
        raise HTTPException(
            status_code=500,
            detail=f"Lỗi khi chạy mô hình: {e}",
        )

# =========================
# Endpoint cơ bản
# =========================
@app.get("/")
async def root():
    return {
        "message": "Food Detection & Nutrition Analysis API",
        "status": "running",
        "version": "1.0.0",
    }


@app.get("/health")
async def health(api_key: str = Depends(verify_api_key)):  # ✅ Require API key
    if predictor is None:
        return {"status": "error", "detail": "Model not loaded"}
    return {"status": "ok"}

# =========================
# POST /analyze-image
# Giữ nguyên: upload ảnh thủ công → JSON
# =========================
@app.post("/analyze-image")
async def analyze_image(
    file: UploadFile = File(...),
):
    """
    Nhận ảnh (multipart/form-data, field 'file'),
    chạy model và trả kết quả JSON.
    """
    if file.content_type not in ("image/jpeg", "image/png", "image/jpg"):
        raise HTTPException(
            status_code=400,
            detail="File phải là ảnh (jpg hoặc png).",
        )

    image_bytes = await file.read()
    result = run_analysis(image_bytes)
    return JSONResponse(content=result)

# =========================
# GET /analyze-from-url
# Endpoint GET mới: gửi URL ảnh → JSON
# =========================
@app.get("/analyze-from-url")
async def analyze_from_url(
    request: Request,
    image_url: str = Query(..., description="URL của ảnh cần phân tích"),
):
    """
    Client gửi link ảnh (?image_url=...), server tải ảnh về,
    chạy model và trả kết quả JSON.
    """
    if predictor is None:
        raise HTTPException(status_code=500, detail="Model not loaded")

    # API key protection
    require_ai_key(request)

    # Tải ảnh bằng httpx
    try:
        # follow redirects and set a pragmatic User-Agent so some storage providers allow the request
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            resp = await client.get(image_url, headers={"User-Agent": "HealthTracker/1.0 (+https://example.com)"})
    except Exception as e:
        logger.exception("Không tải được ảnh từ URL")
        raise HTTPException(
            status_code=400,
            detail=f"Không tải được ảnh từ URL: {e}",
        )

    # Accept any 2xx response; otherwise return a helpful error
    if not (200 <= resp.status_code < 300):
        raise HTTPException(
            status_code=400,
            detail=f"Không tải được ảnh, status_code={resp.status_code}",
        )

    # Basic content-type check: prefer image/* but allow binary fallbacks
    content_type = resp.headers.get("content-type", "")
    if content_type and not content_type.startswith("image/"):
        # some storage returns application/octet-stream for images; in that case allow it
        if not content_type.startswith("application/octet-stream"):
            logger.warning("Downloaded resource has non-image content-type: %s", content_type)

    image_bytes = resp.content
    result = run_analysis(image_bytes)
    return JSONResponse(content=result)


# =========================
# POST /predict
# Accept raw bytes (application/octet-stream) in the request body and return
# the same analysis JSON. This keeps compatibility with backend which posts
# binary image data directly to /predict.
# =========================
@app.post("/predict")
async def predict(request: Request):
    """
    Accept raw image bytes (application/octet-stream) in the POST body and
    run the same analysis as /analyze-image.
    """
    if predictor is None:
        raise HTTPException(status_code=500, detail="Model not loaded")

    # API key protection
    require_ai_key(request)

    try:
        body = await request.body()
        if not body:
            raise HTTPException(status_code=400, detail="Empty request body")

        result = run_analysis(body)
        return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error in /predict endpoint")
        raise HTTPException(status_code=500, detail=f"Prediction failed: {e}")

# =========================
# Chạy trực tiếp
# =========================
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
