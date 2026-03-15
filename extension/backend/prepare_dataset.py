"""
Dataset Preparation Script for Social Media Fine-tuning
Downloads images from HuggingFace and applies Twitter-like compression

Datasets used:
- Real: COCO + Parveshiiii/AI-vs-Real (real subset)
- AI: Flux.1 + Midjourney v6

Run: python prepare_dataset.py
"""

import os
from datasets import load_dataset
from PIL import Image
import io
import random
from tqdm import tqdm

# Configuration
REAL_COUNT = 2000     # 1000 from COCO, 1000 from AI-vs-Real (Real subset)
AI_COUNT = 2000       # 1000 from Flux, 1000 from Midjourney v6
OUTPUT_DIR = "./dataset"

# Create directory structure
for split in ["train", "test"]:
    for label in ["real", "ai"]:
        os.makedirs(f"{OUTPUT_DIR}/{split}/{label}", exist_ok=True)


def save_image_as_twitter(image, path):
    """Saves image with simulated Twitter compression (Quality 65-85)"""
    if image.mode != "RGB":
        image = image.convert("RGB")
    
    # 1. Random Resize (Twitter often downscales)
    if random.random() > 0.5:
        scale = random.uniform(0.75, 1.0)
        new_size = (int(image.width * scale), int(image.height * scale))
        image = image.resize(new_size, Image.Resampling.LANCZOS)

    # 2. JPEG Compression (Twitter uses quality 75-85)
    buffer = io.BytesIO()
    quality = random.randint(65, 85) 
    image.save(buffer, format="JPEG", quality=quality)
    
    with open(path, "wb") as f:
        f.write(buffer.getbuffer())


def process_dataset(dataset_stream, label, source_name, max_count):
    """Process images from a HuggingFace dataset stream"""
    print(f">>> Processing {source_name} ({label})...")
    count = 0
    
    for item in tqdm(dataset_stream):
        if count >= max_count:
            break
        
        try:
            # Handle different dataset column names
            img = item.get('image') or item.get('jpg') or item.get('img')
            if not img:
                continue

            # 80% Train, 20% Test
            split = "train" if count < (max_count * 0.8) else "test"
            filename = f"{source_name}_{count}.jpg"
            save_image_as_twitter(img, f"{OUTPUT_DIR}/{split}/{label}/{filename}")
            count += 1
        except Exception as e:
            print(f"  Skipped image: {e}")
            continue
    
    print(f"  [OK] Saved {count} images from {source_name}")


def main():
    print("=" * 60)
    print("Social Media Dataset Preparation")
    print("=" * 60)
    
    # ==========================================
    # 1. REAL IMAGES (COCO + Social Real)
    # ==========================================
    print("\n[1/2] Downloading REAL images...\n")
    
    # COCO (Standard messy real photos)
    try:
        ds_coco = load_dataset("detection-datasets/coco", split="train", streaming=True)
        process_dataset(ds_coco, "real", "coco", 1000)
    except Exception as e:
        print(f"Warning: COCO failed - {e}")
        # Fallback to another real dataset
        print("Trying alternative real dataset...")
        ds_alt = load_dataset("imagenet-1k", split="train", streaming=True, trust_remote_code=True)
        process_dataset(ds_alt, "real", "imagenet", 1000)
    
    # Parveshiiii AI-vs-Real (Real subset)
    try:
        ds_social = load_dataset("Parveshiiii/AI-vs-Real", split="train", streaming=True)
        # Filter only label 1 (Real)
        ds_social_real = (item for item in ds_social if item.get('label') == 1)
        process_dataset(ds_social_real, "real", "social_real", 1000)
    except Exception as e:
        print(f"Warning: AI-vs-Real failed - {e}")
    
    # ==========================================
    # 2. AI IMAGES (Flux + Midjourney)
    # ==========================================
    print("\n[2/2] Downloading AI images...\n")
    
    # Flux.1 (Modern hard-to-detect AI)
    try:
        ds_flux = load_dataset("LukasT9/Flux-1-Dev-Images-1k", split="train", streaming=True)
        process_dataset(ds_flux, "ai", "flux1", 1000)
    except Exception as e:
        print(f"Warning: Flux dataset failed - {e}")
        # Fallback
        print("Trying alternative AI dataset...")
        ds_sd = load_dataset("Chris1/stablediffusion-images", split="train", streaming=True)
        process_dataset(ds_sd, "ai", "stablediffusion", 1000)
    
    # Midjourney v6
    try:
        ds_mj = load_dataset("CortexLM/midjourney-v6", split="train", streaming=True)
        process_dataset(ds_mj, "ai", "mjv6", 1000)
    except Exception as e:
        print(f"Warning: Midjourney failed - {e}")
        # Fallback to any available MJ dataset
        try:
            ds_mj_alt = load_dataset("tarudesu/midjourney-v6-jpg", split="train", streaming=True)
            process_dataset(ds_mj_alt, "ai", "mjv6_alt", 1000)
        except:
            pass
    
    # ==========================================
    # Summary
    # ==========================================
    print("\n" + "=" * 60)
    print("[SUCCESS] Dataset preparation complete!")
    print("=" * 60)
    
    # Count files
    total = 0
    for split in ["train", "test"]:
        for label in ["real", "ai"]:
            count = len(os.listdir(f"{OUTPUT_DIR}/{split}/{label}"))
            print(f"  {split}/{label}: {count} images")
            total += count
    
    print(f"\n  Total: {total} images")
    print(f"\nDataset saved to: {OUTPUT_DIR}/")
    print("\nNext step: Run 'python fine_tune.py' to train the model")


if __name__ == "__main__":
    main()
