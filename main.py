import logging
from typing import Any, Dict

from fastapi import FastAPI, UploadFile, File, HTTPException, Query
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
# CORS
# =========================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # có thể siết lại khi lên production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
async def health():
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
    image_url: str = Query(..., description="URL của ảnh cần phân tích"),
):
    """
    Client gửi link ảnh (?image_url=...), server tải ảnh về,
    chạy model và trả kết quả JSON.
    """
    if predictor is None:
        raise HTTPException(status_code=500, detail="Model not loaded")

    # Tải ảnh bằng httpx
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(image_url)
    except Exception as e:
        logger.exception("Không tải được ảnh từ URL")
        raise HTTPException(
            status_code=400,
            detail=f"Không tải được ảnh từ URL: {e}",
        )

    if resp.status_code != 200:
        raise HTTPException(
            status_code=400,
            detail=f"Không tải được ảnh, status_code={resp.status_code}",
        )

    image_bytes = resp.content
    result = run_analysis(image_bytes)
    return JSONResponse(content=result)

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
