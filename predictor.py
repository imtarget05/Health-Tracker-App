import os
import json
import cv2
import numpy as np
from ultralytics import YOLO
import yaml
from typing import Dict, Any
import io
from PIL import Image
import logging
import torch

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class FoodPredictor:
    def __init__(self, models_dir: str = "models"):
        self.models_dir = models_dir
        self.model = None
        self.nutrition_mapping = {}
        self.food_categories = []
        self.model_loaded = False

        # NEW: cho phép chỉnh ngưỡng conf 1 chỗ
        self.conf_threshold = 0.25  # ↓↓↓ giảm từ 0.5 xuống 0.25 để giống lúc train
        self.device = "cuda" if torch.cuda.is_available() else "cpu"

        self._validate_model_files()
        self.load_model()
    
    def _validate_model_files(self) -> None:
        """Validate that all required model files exist"""
        required_files = {
            'model': 'best.pt',
            'nutrition_mapping': 'nutrition_mapping.json', 
            'config': 'data.yaml',
            'model_info': 'model_info.json'
        }
        
        missing_files = []
        for file_type, filename in required_files.items():
            file_path = os.path.join(self.models_dir, filename)
            if not os.path.exists(file_path):
                missing_files.append(f"{filename} ({file_type})")
        
        if missing_files:
            error_msg = f"Missing model files: {', '.join(missing_files)}"
            logger.error(error_msg)
            raise FileNotFoundError(error_msg)
        
        logger.info("✅ All model files validated")
    
    def load_model(self) -> None:
        """Load YOLO model and nutrition data"""
        try:
            # Load YOLO model
            model_path = os.path.join(self.models_dir, "best.pt")
            self.model = YOLO(model_path)

            # Đưa model lên GPU nếu có
            self.model.to(self.device)
            logger.info(f"✅ YOLO model loaded on device: {self.device}")

            # Load dataset configuration (class names)
            config_path = os.path.join(self.models_dir, "data.yaml")
            with open(config_path, 'r', encoding='utf-8') as f:
                config = yaml.safe_load(f)
                self.food_categories = config.get('names', [])
            logger.info(f"✅ Loaded {len(self.food_categories)} food categories")

            # Load nutrition mapping
            nutrition_path = os.path.join(self.models_dir, "nutrition_mapping.json")
            with open(nutrition_path, 'r', encoding='utf-8') as f:
                self.nutrition_mapping = json.load(f)
            logger.info(f"✅ Nutrition mapping loaded: {len(self.nutrition_mapping)} items")
            
            self.model_loaded = True
            logger.info("🎯 Food predictor fully initialized")
            
        except Exception as e:
            logger.error(f"❌ Failed to load model: {e}")
            self.model_loaded = False
            raise
    
    def estimate_portion(self, bbox_area: float, img_area: float) -> int:
        """Estimate portion size in grams based on bounding box area"""
        if img_area == 0:
            return 150
        
        relative_size = bbox_area / img_area
        base_portion = 200
        scaling_factor = 1.8
        estimated_portion = base_portion * relative_size * scaling_factor
        
        return max(80, min(600, int(estimated_portion)))
    
    def _calculate_nutrition(self, category: str, portion_g: int) -> Dict[str, float]:
        """Calculate nutrition values for a given food category and portion"""
        if category not in self.nutrition_mapping:
            return {
                'calories': 0.0, 'protein': 0.0, 'fat': 0.0, 
                'carbs': 0.0, 'fiber': 0.0, 'sugar': 0.0
            }
        
        info = self.nutrition_mapping[category]
        nutrition = {
            'calories': round((info.get('calories_per_100g', 0) / 100) * portion_g, 1),
            'protein': round((info.get('protein_per_100g', 0) / 100) * portion_g, 1),
            'fat': round((info.get('fat_per_100g', 0) / 100) * portion_g, 1),
            'carbs': round((info.get('carbs_per_100g', 0) / 100) * portion_g, 1),
            'fiber': round((info.get('fiber_per_100g', 0) / 100) * portion_g, 1),
            'sugar': round((info.get('sugar_per_100g', 0) / 100) * portion_g, 1)
        }
        
        return nutrition
    
    def analyze_image(self, image_bytes: bytes) -> Dict[str, Any]:
        """Analyze image and return detailed nutrition information"""
        if not self.model_loaded:
            return {
                'success': False,
                'error': 'Model not loaded',
                'detections': [],
                'total_nutrition': {},
                'items_count': 0
            }
        
        try:
            # Convert bytes to numpy array
            image = Image.open(io.BytesIO(image_bytes))
            if image.mode != 'RGB':
                image = image.convert('RGB')
            
            image_array = np.array(image)
            image_array_bgr = cv2.cvtColor(image_array, cv2.COLOR_RGB2BGR)
            
            # Get image dimensions
            h, w = image_array.shape[:2]
            img_area = h * w
            
            # Run detection với conf thấp hơn (giống khi train/val)
            results = self.model(
                image_array_bgr,
                conf=self.conf_threshold,   # 0.25
                verbose=False
            )

            logger.info(f"🔍 Raw boxes from YOLO: {len(results[0].boxes)}")
            
            detections = []
            total_nutrition = {
                'calories': 0.0, 'protein': 0.0, 'fat': 0.0, 
                'carbs': 0.0, 'fiber': 0.0, 'sugar': 0.0
            }
            
            if len(results[0].boxes) == 0:
                return {
                    'success': True,
                    'detections': [],
                    'total_nutrition': total_nutrition,
                    'items_count': 0,
                    'message': 'No food items detected'
                }
            
            for box in results[0].boxes:
                class_id = int(box.cls[0])
                confidence = float(box.conf[0])
                bbox = box.xyxy[0].cpu().numpy()

                # ❌ BỎ bước lọc confidence lần 2 (trước đây <0.3 bị bỏ)
                # if confidence < 0.3:
                #     continue
                
                # Calculate bounding box area
                bbox_w = bbox[2] - bbox[0]
                bbox_h = bbox[3] - bbox[1]
                bbox_area = bbox_w * bbox_h
                
                category = self.food_categories[class_id]
                portion_g = self.estimate_portion(bbox_area, img_area)
                
                # Calculate nutrition
                nutrition = self._calculate_nutrition(category, portion_g)
                
                # Add to totals
                for key in total_nutrition:
                    total_nutrition[key] += nutrition[key]
                
                detection_info = {
                    'food': category,
                    'confidence': round(confidence, 3),
                    'portion_g': portion_g,
                    'bbox': [float(coord) for coord in bbox],
                    'nutrition': nutrition
                }
                
                detections.append(detection_info)
            
            # Round total nutrition values
            total_nutrition = {k: round(v, 1) for k, v in total_nutrition.items()}
            
            return {
                'success': True,
                'detections': detections,
                'total_nutrition': total_nutrition,
                'items_count': len(detections),
                'image_dimensions': {'width': w, 'height': h}
            }
            
        except Exception as e:
            logger.error(f"Image analysis error: {e}")
            return {
                'success': False,
                'error': f'Analysis failed: {str(e)}',
                'detections': [],
                'total_nutrition': {},
                'items_count': 0
            }
