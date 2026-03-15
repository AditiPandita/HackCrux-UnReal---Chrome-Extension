# UnReal ML Backend

Local Python servers for AI content detection. The Chrome extension calls these backends for ML analysis.

## Services

### 1. Image Detection Backend (Port 8000)
FastAPI server for detecting AI-generated images using computer vision models.

### 2. Text Detection Backend (Port 8001)
Flask server for detecting AI-generated text using RoBERTa language model.

## Quick Start

```bash
# Navigate to backend folder
cd backend

# Install dependencies
pip install -r requirements.txt

# Run BOTH servers (in separate terminals)
# Terminal 1 - Image Detection
python server.py

# Terminal 2 - Text Detection  
python text_detector.py
```

Servers will start at:
- Image: `http://localhost:8000`
- Text: `http://localhost:8001`

## Directory Structure

```
backend/
├── server.py              # FastAPI image detection server (port 8000)
├── text_detector.py       # Flask text detection server (port 8001)
├── requirements.txt       # Python dependencies (both backends)
├── README.md              # This file
└── model/                 # Pre-trained image model (327 MB)
    ├── config.json
    ├── model.safetensors
    └── preprocessor_config.json
```

## API Endpoints

### Image Detection API (Port 8000)

**Endpoint:** `POST http://localhost:8000/analyze`

**Request:**
```json
{
  "image": "base64_encoded_image_data"
}
```

**Response:**
```json
{
  "success": true,
  "score": 75,
  "confidence": 50,
  "realScore": 25,
  "fakeScore": 75,
  "processingTime": 150,
  "modelName": "dima806/ai_vs_real_image_detection"
}
```

### Text Detection API (Port 8001)

**Endpoint:** `POST http://localhost:8001/detect`

**Request:**
```json
{
  "text": "Content to analyze for AI generation..."
}
```

**Response:**
```json
{
  "ai_score": 78.5,
  "human_score": 21.5,
  "confidence": 57,
  "model": "roberta-base-openai-detector",
  "method": "local_ml",
  "is_formal_style": true,
  "text_length": 45,
  "ml_warning": "Formal writing may resemble AI",
  "note": "Analysis complete"
}
```

## Requirements

- Python 3.8+
- ~3GB RAM for both models
- GPU optional (uses CUDA if available)

## First Run

The first run will download models from HuggingFace. The text model will be downloaded automatically when first running text_detector.py.
