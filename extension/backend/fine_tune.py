"""
Fine-tuning Script for Social Media AI Detection Model
Fine-tunes dima806/ai_vs_real_image_detection on social media dataset

Prerequisites:
  pip install torch torchvision transformers datasets scikit-learn accelerate

Run: python fine_tune.py
"""

import torch
from datasets import load_dataset
from transformers import (
    AutoImageProcessor, 
    AutoModelForImageClassification, 
    TrainingArguments, 
    Trainer
)
from torchvision.transforms import (
    Compose, Normalize, RandomResizedCrop, RandomHorizontalFlip, 
    ToTensor, Resize, CenterCrop, ColorJitter
)
import numpy as np
import os

# ==========================================
# Configuration
# ==========================================
MODEL_ID = "dima806/ai_vs_real_image_detection"  # Base model
OUTPUT_DIR = "./social_media_tuned_model"         # Where to save fine-tuned model
DATASET_DIR = "./dataset"                         # Dataset from prepare_dataset.py

# Training hyperparameters
EPOCHS = 3
BATCH_SIZE = 16
LEARNING_RATE = 2e-5  # Very low to preserve existing knowledge

# ==========================================
# Check CUDA availability
# ==========================================
# Note: RTX 5050 (sm_120) kernels not yet supported in PyTorch
# Forcing CPU mode to avoid CUDA errors
device = "cpu"  # Forced CPU - GPU sm_120 not supported
print(f"Using device: {device}")
print("Note: GPU training unavailable (RTX 5050 sm_120 not yet supported in PyTorch)")
print("Training will take ~2-4 hours on CPU")

# ==========================================
# Load Model & Processor
# ==========================================
print(f"\n[1] Loading base model: {MODEL_ID}")
processor = AutoImageProcessor.from_pretrained(MODEL_ID)
model = AutoModelForImageClassification.from_pretrained(
    MODEL_ID, 
    num_labels=2,
    ignore_mismatched_sizes=True
)
model = model.to(device)

# Get image normalization values
normalize = Normalize(mean=processor.image_mean, std=processor.image_std)
size = (processor.size["height"], processor.size["width"])

print(f"   Model loaded! Target size: {size}")

# ==========================================
# Data Augmentation (Simulate Social Media Noise)
# ==========================================
train_transforms = Compose([
    RandomResizedCrop(size),
    RandomHorizontalFlip(),
    ColorJitter(brightness=0.2, contrast=0.2, saturation=0.1),  # Simulate bad conditions
    ToTensor(),
    normalize,
])

val_transforms = Compose([
    Resize(size),
    CenterCrop(size),
    ToTensor(),
    normalize,
])

def preprocess_train(batch):
    """Apply training augmentations"""
    batch["pixel_values"] = [
        train_transforms(img.convert("RGB")) for img in batch["image"]
    ]
    return batch

def preprocess_val(batch):
    """Apply validation transforms (no augmentation)"""
    batch["pixel_values"] = [
        val_transforms(img.convert("RGB")) for img in batch["image"]
    ]
    return batch

def collate_fn(examples):
    """Custom collate function to properly stack tensors"""
    pixel_values = torch.stack([example["pixel_values"] for example in examples])
    labels = torch.tensor([example["label"] for example in examples])
    return {"pixel_values": pixel_values, "labels": labels}

# ==========================================
# Load Dataset
# ==========================================
print(f"\n[2] Loading dataset from: {DATASET_DIR}")

if not os.path.exists(DATASET_DIR):
    print("[ERROR] Dataset not found! Run prepare_dataset.py first:")
    print("   python prepare_dataset.py")
    exit(1)

# Load using imagefolder format (auto-detects class folders)
dataset = load_dataset("imagefolder", data_dir=DATASET_DIR)

print(f"   Train: {len(dataset['train'])} images")
print(f"   Test: {len(dataset['test'])} images")
print(f"   Labels: {dataset['train'].features['label'].names}")

# Apply transforms
train_ds = dataset["train"].with_transform(preprocess_train)
test_ds = dataset["test"].with_transform(preprocess_val)

# ==========================================
# Training Arguments
# ==========================================
training_args = TrainingArguments(
    output_dir=OUTPUT_DIR,
    remove_unused_columns=False,
    eval_strategy="epoch",
    save_strategy="epoch",
    learning_rate=LEARNING_RATE,
    per_device_train_batch_size=BATCH_SIZE,
    per_device_eval_batch_size=BATCH_SIZE,
    num_train_epochs=EPOCHS,
    warmup_ratio=0.1,
    logging_steps=10,
    save_total_limit=2,
    load_best_model_at_end=True,
    metric_for_best_model="accuracy",
    fp16=False,  # Disabled for CPU training
)

# ==========================================
# Metrics
# ==========================================
def compute_metrics(eval_pred):
    """Compute accuracy for evaluation"""
    predictions = np.argmax(eval_pred.predictions, axis=1)
    labels = eval_pred.label_ids
    accuracy = (predictions == labels).mean()
    return {"accuracy": accuracy}

# ==========================================
# Trainer
# ==========================================
print("\n[3] Setting up Trainer...")

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=train_ds,
    eval_dataset=test_ds,
    data_collator=collate_fn,
    compute_metrics=compute_metrics,
)

# ==========================================
# Train!
# ==========================================
print("\n" + "=" * 60)
print(">>> Starting Fine-Tuning...")
print("=" * 60)
print(f"   Epochs: {EPOCHS}")
print(f"   Batch Size: {BATCH_SIZE}")
print(f"   Learning Rate: {LEARNING_RATE}")
print(f"   Device: {device}")
print("=" * 60 + "\n")

trainer.train()

# ==========================================
# Evaluate
# ==========================================
print("\n[4] Evaluating model...")
results = trainer.evaluate()
print(f"   Final Accuracy: {results['eval_accuracy'] * 100:.2f}%")

# ==========================================
# Save
# ==========================================
print(f"\n[5] Saving fine-tuned model to: {OUTPUT_DIR}")
trainer.save_model(OUTPUT_DIR)
processor.save_pretrained(OUTPUT_DIR)

print("\n" + "=" * 60)
print("[SUCCESS] Fine-tuning complete!")
print("=" * 60)
print(f"\nModel saved to: {OUTPUT_DIR}/")
print("\nTo use this model, update backend/server.py:")
print('   MODEL_PATH = "./social_media_tuned_model"')
print("\nDone!")
