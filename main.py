from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from predictor import FoodPredictor
import uvicorn
import logging
import os

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize app
app = FastAPI(
    title="Food Nutrition API",
    description="AI-powered food detection and nutrition analysis",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Initialize predictor
try:
    predictor = FoodPredictor()
    logger.info("✅ Food predictor initialized successfully")
except Exception as e:
    logger.error(f"❌ Failed to initialize predictor: {e}")
    predictor = None

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {
        "message": "Food Detection & Nutrition Analysis API", 
        "status": "running",
        "version": "1.0.0"
    }

@app.get("/health")
async def health_check():
    if predictor and predictor.model_loaded:
        return {
            "status": "healthy", 
            "model_loaded": True,
            "categories_count": len(predictor.food_categories)
        }
    else:
        return {
            "status": "unhealthy", 
            "model_loaded": False,
            "error": "Predictor not initialized"
        }

@app.get("/categories")
async def get_categories():
    if not predictor:
        raise HTTPException(500, "Predictor not initialized")
    
    return {
        "categories": predictor.food_categories,
        "count": len(predictor.food_categories)
    }

@app.post("/analyze")
async def analyze_food(image: UploadFile = File(...)):
    # Check if predictor is ready
    if not predictor or not predictor.model_loaded:
        raise HTTPException(500, "Model not loaded. Please check health endpoint.")
    
    # Validate file type
    allowed_types = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if image.content_type not in allowed_types:
        raise HTTPException(
            400, 
            f"Unsupported file type. Allowed: {', '.join(allowed_types)}"
        )
    
    # Validate file size (max 10MB)
    max_size = 10 * 1024 * 1024  # 10MB
    try:
        contents = await image.read()
        if len(contents) > max_size:
            raise HTTPException(400, "File too large. Maximum size is 10MB.")
        
        # Reset file pointer for predictor
        await image.seek(0)
        
    except Exception as e:
        raise HTTPException(400, f"Error reading file: {str(e)}")
    
    try:
        # Analyze image
        result = predictor.analyze_image(contents)
        
        # Log analysis results
        logger.info(f"Analysis completed: {result['items_count']} items detected")
        
        return JSONResponse(content=result)
        
    except Exception as e:
        logger.error(f"Analysis error: {str(e)}")
        raise HTTPException(500, f"Analysis failed: {str(e)}")

@app.get("/model-info")
async def get_model_info():
    if not predictor:
        raise HTTPException(500, "Predictor not initialized")
    
    return {
        "model_loaded": predictor.model_loaded,
        "food_categories_count": len(predictor.food_categories),
        "nutrition_mapping_count": len(predictor.nutrition_mapping),
        "supported_categories": predictor.food_categories
    }

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )