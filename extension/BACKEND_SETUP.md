# UnReal Backend Setup Guide

This guide will help you set up the Python ML backends required for the UnReal Chrome Extension.

---

## 📋 What You Need

- **Python 3.8+** - [Download here](https://www.python.org/downloads/)
- **~3 GB free disk space** - For ML models
- **~3 GB RAM** - For running the servers

---

## 🚀 Setup Steps

### Step 1: Open Terminal/Command Prompt

Navigate to the backend folder:

```bash
cd extension/backend
```

### Step 2: Install Python Packages

```bash
pip install -r requirements.txt
```

> ⏱️ This may take 5-10 minutes on first install.

### Step 3: Start the Servers

You need to run **3 servers** in **3 separate terminal windows**:

---

#### 🖼️ Terminal 1: Main Server (Image, Video, News Analysis)

```bash
cd extension/backend
python server.py
```

**Expected output:**
```
[ML Backend] Loading model: unreal-social-media-tuned
[ML Backend] Model loaded successfully
INFO:     Uvicorn running on http://0.0.0.0:8000
```

✅ Server running at: `http://localhost:8000`

---

#### 📝 Terminal 2: Text Detection Server

```bash
cd extension/backend
python text_detector.py
```

**Expected output:**
```
Loading RoBERTa model...
* Running on http://127.0.0.1:8001
```

✅ Server running at: `http://localhost:8001`

---

#### 🎵 Terminal 3: Audio Deepfake Detection (Optional)

```bash
cd extension/backend
python audio_detector.py
```

**Expected output:**
```
* Running on http://127.0.0.1:8002
```

✅ Server running at: `http://localhost:8002`

---

## ✅ Verify Everything Works

Open your browser and visit:

| URL | Expected Response |
|-----|-------------------|
| http://localhost:8000 | `{"status": "running", ...}` |
| http://localhost:8001/health | `{"status": "ok"}` |
| http://localhost:8002/health | `{"status": "ok"}` |

If you see JSON responses, the servers are working! 🎉

---

## 📁 Files Explained

```
backend/
├── server.py          # Main server - image, video, news verification
├── text_detector.py   # AI-generated text detection
├── audio_detector.py  # Audio deepfake detection
├── requirements.txt   # Python packages needed
├── model/             # Pre-trained image detection model
└── text_model/        # Pre-trained text detection model
```

---

## ⚠️ Common Issues

### "Module not found" error
```bash
pip install -r requirements.txt
```

### Port already in use
Kill existing process or change port in the Python file.

### Models downloading slowly
First run downloads models from HuggingFace (~500MB). Wait for it to complete.

### CUDA/GPU errors
The backend automatically uses CPU if GPU isn't available. No action needed.

---

## 🔌 How Extension Connects

The Chrome extension automatically connects to these local servers:
- **Port 8000** → Image & Video analysis
- **Port 8001** → Text analysis  
- **Port 8002** → Audio analysis

No configuration needed - just keep the servers running!

---

## 💡 Tips

1. **Keep all 3 terminals open** while using the extension
2. **First analysis is slow** (model warmup), subsequent ones are fast
3. **Restart servers** if you see connection errors in the extension

---

**Need help?** Check the error messages in the terminal windows.
