import os
import time
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import BaseModel
from google.genai.errors import ClientError
from google import genai
from google.genai import types
from groq import Groq

load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

if not GOOGLE_API_KEY:
    raise RuntimeError("Missing GOOGLE_API_KEY")
if not GROQ_API_KEY:
    raise RuntimeError("Missing GROQ_API_KEY")

MODEL_NAME1 = "gemini-2.5-flash-lite"
MODEL_NAME2 = "llama-3.3-70b-versatile"

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

gemini_client = genai.Client(api_key=GOOGLE_API_KEY)
groq_client = Groq(api_key=GROQ_API_KEY)

SYSTEM_PROMPT = """
You are PineAI, a virtual heritage assistant.
Be concise, factual, and educational.
If you are unsure, say so honestly.
Limit responses to ~200 tokens.
"""

BANNED_KEYWORDS = [
    "hack", "illegal", "abuse", "nsfw", "exploit",
    "terror", "violence", "drugs", "porn"
]

class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    reply: str

def is_bad_prompt(text: str) -> bool:
    return any(word in text.lower() for word in BANNED_KEYWORDS)

gemini_disabled_until = 0

def trim_to_last_sentence(text: str) -> str:
    if not text:
        return text

    last_period = text.rfind(".")
    if last_period == -1:
        return text  

    return text[: last_period + 1]

def gemini_enabled() -> bool:
    return time.time() > gemini_disabled_until

def generate_reply(contents: list[str]) -> str:
    global gemini_disabled_until

    if gemini_enabled():
        try:
            response = gemini_client.models.generate_content(
                model=MODEL_NAME1,
                contents=[SYSTEM_PROMPT, *contents],
                config=types.GenerateContentConfig(
                    temperature=0.4,
                    max_output_tokens=200
                )
            )
            return trim_to_last_sentence(response.text)
        except ClientError as e:
            gemini_disabled_until = time.time() + 3600
            print("Gemini failed, switching to Groq:", e)

    try:
        response = groq_client.chat.completions.create(
            model=MODEL_NAME2,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": "\n".join(contents)}
            ],
            temperature=0.4,
            max_tokens=200
        )
        return trim_to_last_sentence(
            response.choices[0].message.content
        )
    except Exception as e:
        print("Groq failed:", e)
        return "Sorry, I’m currently unable to respond."

@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    if is_bad_prompt(req.message):
        return ChatResponse(
            reply="I can help only with educational and heritage-related topics."
        )

    contents = [
        f"User: {req.message}"
    ]

    reply = generate_reply(contents)
    return ChatResponse(reply=reply)

@app.get("/")
def root():
    return {"status": "PineAI fallback API running"}

PORT = os.getenv("PORT")

if PORT is None:
    raise RuntimeError("PORT environment variable is not set")

if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=int(PORT), reload=True)
