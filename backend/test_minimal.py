"""Minimal test to isolate the 405 issue."""
from fastapi import APIRouter, FastAPI

app = FastAPI()

router = APIRouter(prefix="/upload")

@router.post("/test")
async def test_post():
    return {"message": "POST works!"}

app.include_router(router, prefix="/api/v1")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
