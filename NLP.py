
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import joblib
import os


app = FastAPI(title="NLP Emotion Detection API")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

try:
    model = joblib.load(
        os.path.join(BASE_DIR, "sgd_model.pkl")
    )

    tfidf = joblib.load(
        os.path.join(BASE_DIR, "tfidf_vectorizer.pkl")
    )

    print("Model loaded successfully")
    print("Model type:", type(model))
    print("Vectorizer type:", type(tfidf))

except Exception as e:
    raise RuntimeError(f"Error loading model: {e}")

reverse_emotion = {
    0: "sadness",
    1: "anger",
    2: "love",
    3: "surprise",
    4: "fear",
    5: "joy"
}


class TextInput(BaseModel):
    text: str


@app.get("/")
def home():
    return {
        "message": "NLP API is running"
    }


@app.post("/predict")
def predict(data: TextInput):
    try:
     
        text = [data.text.strip()]

        if not text[0]:
            raise HTTPException(
                status_code=400,
                detail="Text cannot be empty"
            )

        text_vector = tfidf.transform(text)

   
        prediction = model.predict(text_vector)[0]

        if hasattr(prediction, "item"):
            prediction = prediction.item()

      
        try:
            emotion = reverse_emotion.get(
                int(prediction),
                str(prediction)
            )
        except (ValueError, TypeError):
            emotion = str(prediction)

  
        return {
            "text": data.text,
            "prediction": str(prediction),
            "emotion": emotion
        }

    except HTTPException:
        raise

    except Exception as e:
        print("Prediction error:", repr(e))
        raise HTTPException(
            status_code=500,
            detail=f"Prediction failed: {str(e)}"
        )