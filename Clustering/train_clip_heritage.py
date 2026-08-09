import os
import pickle
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.optim as optim
from PIL import Image
from sentence_transformers import SentenceTransformer

# Define directories
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATASET_PATH = os.path.join(BASE_DIR, "..", "Dataset", "heritage_sites_v2.csv")
IMAGE_DIR = os.path.join(BASE_DIR, "..", "Application", "frontend", "public", "sites")
ASSETS_DIR = os.path.join(BASE_DIR, "..", "Environment", "My project", "Assets")
PICKLES_DIR = os.path.join(BASE_DIR, "Pickles")

os.makedirs(PICKLES_DIR, exist_ok=True)

# 1. Clean and align site names
def get_image_filename(name):
    # Standardize string encoding / replace special chars
    name = name.lower().strip()
    name = name.replace("ö", "o") # Schönbrunn Palace -> schonbrunn-palace
    name = name.replace("(", "").replace(")", "").replace("&", "and").replace(",", "").replace("  ", " ").replace(" ", "-")
    name = name.replace("'", "").replace("/", "-")
    while "--" in name:
        name = name.replace("--", "-")
    return name + ".jpg"

print("Loading dataset...")
df = pd.read_csv(DATASET_PATH)

# Set up specific 3D texture mappings
texture_mappings = {
    "Great Temple (Petra)": os.path.join(ASSETS_DIR, "Textures_Temple"),
    "Blue Pillar Chapel": os.path.join(ASSETS_DIR, "Textures_Chapel"),
    "Temple of the Winged Lions": os.path.join(ASSETS_DIR, "Textures_Lions"),
    "The Nabataean Theatre": os.path.join(ASSETS_DIR, "Textures_Theatre")
}

# Align each row
aligned_data = []
site_names = []

for idx, row in df.iterrows():
    name = row["Name"]
    # Handle Schönbrunn Palace encoding or any special casing
    clean_name = name.replace("Schnbrunn", "Schönbrunn").replace("Sch\u00f6nbrunn", "Schönbrunn")
    fname = get_image_filename(clean_name)
    img_path = os.path.join(IMAGE_DIR, fname)
    
    # Secondary check for Terracotta Army space/no-space mismatch
    if not os.path.exists(img_path):
        alt_fname = clean_name.lower().strip().replace(" ", "-").replace("(", "").replace(")", "") + ".jpg"
        alt_path = os.path.join(IMAGE_DIR, alt_fname)
        if os.path.exists(alt_path):
            img_path = alt_path
            fname = alt_fname

    if os.path.exists(img_path):
        textures_path = texture_mappings.get(clean_name, None)
        aligned_data.append({
            "name": clean_name,
            "row_idx": idx,
            "img_path": img_path,
            "textures_path": textures_path,
            "row": row
        })
        site_names.append(clean_name)
    else:
        print(f"Warning: Could not find image for {clean_name} at {img_path}")

print(f"Aligned {len(aligned_data)} out of {len(df)} sites.")

# 2. Extract Base Embeddings using CLIP (+ viewpoint augmentations per site)
print("Loading CLIP model (clip-ViT-B-32)...")
model = SentenceTransformer('clip-ViT-B-32')


def _viewpoint_variants(img: Image.Image):
    """Fixed crops/rotates so photo search is robust to tourist angles."""
    img = img.convert("RGB")
    w, h = img.size
    variants = [img]
    # mild zoom / crop
    for left, top, right, bottom in [
        (0.08, 0.05, 0.92, 0.95),
        (0.0, 0.0, 0.88, 0.88),
        (0.12, 0.12, 1.0, 1.0),
        (0.05, 0.15, 0.95, 1.0),
    ]:
        box = (
            int(w * left),
            int(h * top),
            int(w * right),
            int(h * bottom),
        )
        if box[2] - box[0] > 32 and box[3] - box[1] > 32:
            variants.append(img.crop(box).resize((w, h), Image.Resampling.BICUBIC))
    for angle in (-10, 10):
        variants.append(img.rotate(angle, expand=False, fillcolor=(20, 20, 20)))
    return variants


raw_text_list = []
raw_img_list = []
textures_list = [] # Store tuple of (aligned_idx, texture_embedding)

for i, item in enumerate(aligned_data):
    row = item["row"]
    # Construct descriptive metadata prompt
    desc = (
        f"A {row['Preservation']} {row['Architecture Style']} built by the {row['Civilization']} "
        f"in the {row['Era']} era, located in {row['Country']}, {row['Continent']}, "
        f"constructed from {row['Material']} with {row['Structure']}. {item['name']}."
    )
    # Encode text
    text_emb = model.encode(desc)
    raw_text_list.append(text_emb)
    
    # Encode 2D image + viewpoint variants (mean → more robust photo match)
    img = Image.open(item["img_path"])
    view_embs = [model.encode(v) for v in _viewpoint_variants(img)]
    img_emb = np.mean(np.stack(view_embs, axis=0), axis=0)
    raw_img_list.append(img_emb)
    
    # Encode 3D textures (if available)
    tex_path = item["textures_path"]
    if tex_path and os.path.exists(tex_path):
        tex_files = [os.path.join(tex_path, f) for f in os.listdir(tex_path) if f.endswith(('.jpg', '.png'))]
        # Avoid taking too many or extremely large files to save memory/cpu time, select up to 5
        tex_files = tex_files[:5]
        if tex_files:
            tex_embs = []
            for tf in tex_files:
                try:
                    tex_embs.append(model.encode(Image.open(tf)))
                except Exception as e:
                    print(f"Error loading texture {tf}: {e}")
            if tex_embs:
                avg_tex_emb = np.mean(tex_embs, axis=0)
                textures_list.append((i, avg_tex_emb))

    if (i + 1) % 10 == 0 or (i + 1) == len(aligned_data):
        print(f"  encoded site images {i + 1}/{len(aligned_data)}")

raw_text_embs = torch.tensor(np.array(raw_text_list), dtype=torch.float32)
raw_img_embs = torch.tensor(np.array(raw_img_list), dtype=torch.float32)

print("Base embeddings extracted:")
print("- Text embeddings shape:", raw_text_embs.shape)
print("- Image embeddings shape:", raw_img_embs.shape)
print("- Sites with 3D textures matched:", len(textures_list))

# 3. PyTorch Projection Adapter & Contrastive Learning
# proj_dim=256 (down from 512) + weight_decay=1e-3 to prevent overfitting on small (49-site) dataset
class ContrastiveProjection(nn.Module):
    def __init__(self, emb_dim=512, proj_dim=256):
        super().__init__()
        self.text_proj = nn.Sequential(
            nn.Linear(emb_dim, proj_dim),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(proj_dim, proj_dim)
        )
        self.img_proj = nn.Sequential(
            nn.Linear(emb_dim, proj_dim),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(proj_dim, proj_dim)
        )
        self.tex_proj = nn.Sequential(
            nn.Linear(emb_dim, proj_dim),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(proj_dim, proj_dim)
        )

    def forward(self, text_embs, img_embs, tex_embs=None):
        t_proj = self.text_proj(text_embs)
        i_proj = self.img_proj(img_embs)
        if tex_embs is not None:
            x_proj = self.tex_proj(tex_embs)
            return t_proj, i_proj, x_proj
        return t_proj, i_proj

# Create projection model
proj_model = ContrastiveProjection(emb_dim=512, proj_dim=256)
optimizer = optim.Adam(proj_model.parameters(), lr=1e-3, weight_decay=1e-3)

# Contrastive InfoNCE Loss
def contrastive_loss(t_proj, i_proj, temperature=0.07):
    t_proj = nn.functional.normalize(t_proj, dim=-1)
    i_proj = nn.functional.normalize(i_proj, dim=-1)
    
    # Similarity matrix
    logits = torch.matmul(t_proj, i_proj.T) / temperature
    labels = torch.arange(logits.size(0), device=logits.device)
    
    loss_i2t = nn.functional.cross_entropy(logits, labels)
    loss_t2i = nn.functional.cross_entropy(logits.T, labels)
    return (loss_i2t + loss_t2i) / 2

# Train the model
# 50 epochs (reduced from 150) to prevent overfitting on small 49-site dataset
print("Training contrastive projection heads...")
proj_model.train()
epochs = 50

for epoch in range(epochs):
    optimizer.zero_grad()
    
    # 2D Image-Text Alignment Loss
    t_p, i_p = proj_model(raw_text_embs, raw_img_embs)
    loss = contrastive_loss(t_p, i_p)
    
    # 3D Texture-Text Alignment Loss (if textures available)
    if textures_list:
        tex_indices = [idx for idx, _ in textures_list]
        tex_embs_val = torch.tensor(np.array([emb for _, emb in textures_list]), dtype=torch.float32)
        
        # Get projected text for the corresponding 3D sites
        t_subset = t_p[tex_indices]
        _, _, x_p = proj_model(raw_text_embs, raw_img_embs, tex_embs_val)
        
        # Align 3D texture projection with its matching text description
        loss_tex = contrastive_loss(t_subset, x_p)
        loss = loss + 0.5 * loss_tex
        
    loss.backward()
    optimizer.step()
    
    if (epoch + 1) % 25 == 0:
        print(f"Epoch [{epoch+1}/{epochs}], Loss: {loss.item():.4f}")

# Extract refined embeddings
proj_model.eval()
with torch.no_grad():
    proj_text, proj_img = proj_model(raw_text_embs, raw_img_embs)
    
    # For 3D search, get projected 3D embeddings
    proj_tex_dict = {}
    if textures_list:
        tex_indices = [idx for idx, _ in textures_list]
        tex_embs_val = torch.tensor(np.array([emb for _, emb in textures_list]), dtype=torch.float32)
        _, _, proj_tex = proj_model(raw_text_embs, raw_img_embs, tex_embs_val)
        for idx, p_tex in zip(tex_indices, proj_tex):
            proj_tex_dict[site_names[idx]] = p_tex.numpy()

# Standardize representation: joint is mean of projected text and image representations
joint_embeddings = (proj_text + proj_img) / 2.0
joint_embeddings = nn.functional.normalize(joint_embeddings, dim=-1).numpy()
proj_text = nn.functional.normalize(proj_text, dim=-1).numpy()
proj_img = nn.functional.normalize(proj_img, dim=-1).numpy()

# Save final embeddings to pickle
output_data = {
    "site_names": site_names,
    "text_embeddings": proj_text,
    "image_embeddings": proj_img,
    "joint_embeddings": joint_embeddings,
    "texture_embeddings": proj_tex_dict,
    "raw_text_embeddings": raw_text_embs.numpy(),
    "raw_image_embeddings": raw_img_embs.numpy()
}

output_path = os.path.join(PICKLES_DIR, "clip_embeddings.pkl")
with open(output_path, "wb") as f:
    pickle.dump(output_data, f)

print(f"Successfully saved CLIP-Heritage embeddings to {output_path}!")

# Save model weights
model_path = os.path.join(PICKLES_DIR, "clip_projection.pt")
torch.save(proj_model.state_dict(), model_path)
print(f"Successfully saved CLIP projection model state dict to {model_path}!")

