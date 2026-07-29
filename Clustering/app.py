from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
from utils import generate_similarity_response
from query import INSERT_SIMILARITY
from db import conn, get_cursor

app = FastAPI(
    title="Heritage Site Similarity API",
    description="Returns similar world heritage sites using cosine similarity + clustering",
    version="1.0.0"
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # can be modified to localhost:<port> later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RequestData(BaseModel):
    site_name: str


@app.post("/get-similarity")
def get_similarity(data: RequestData):
    result = generate_similarity_response(data.site_name)

    cursor = get_cursor()
    cursor.execute(
        INSERT_SIMILARITY,
        (
            result["site_name"],
            json.dumps(result["Top 5 Similar"]),
            json.dumps(result["Top 5 Similar (KMeans)"]),
            json.dumps(result["Top 5 Similar (AGNES)"]),
            json.dumps(result["Top 5 Similar (GMM)"])
        )
    )
    conn.commit()

    return result

@app.get("/")
def home():
    return {"message": "Heritage Similarity API Running"}
