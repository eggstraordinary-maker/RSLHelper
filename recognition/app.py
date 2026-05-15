import asyncio
import base64
import time
import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from model import SignRecognizer
from frame_sampler import FrameSampler

app = FastAPI()
recognizer = SignRecognizer("models/SignFlow-R.onnx", "models/labels.json")

@app.websocket("/recognize")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    # Увеличиваем интервал выборки кадров для снижения частоты распознавания
    sampler = FrameSampler(clip_len=32, frame_interval=3, buffer_size=96)
    try:
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=10.0)
            except asyncio.TimeoutError:
                # Если от клиента нет сообщений >10 сек, просто продолжаем
                continue
            except WebSocketDisconnect:
                print("Client disconnected")
                break

            if data == "ping":
                await websocket.send_text("pong")
                continue

            try:
                img_data = base64.b64decode(data)
                print("img_data")
                np_arr = np.frombuffer(img_data, np.uint8)
                print("np_arr")
                frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
                print("frame")
                if frame is None:
                    print("frame is None")
                    continue

                sampler.add_frame(frame)
                print("add_frame")
                clip = sampler.get_clip()
                print("get_clip")
                print(f"clip is None:{clip is None}")
                if clip is not None:
                    start = time.time()
                    gesture, confidence = recognizer.predict(clip)
                    print("predict")
                    # gesture = "тест"
                    # confidence = 0.99
                    elapsed = time.time() - start
                    print(f"time:{elapsed}")
                    print(f"Predicted: {gesture} (conf={confidence:.3f}) in {elapsed:.3f}s")
                    # Не отправляем результат слишком часто
                    # await websocket.send_json({"gesture": gesture, "confidence": confidence})
                    # await asyncio.sleep(0.2)
                    await websocket.send_json({
                        "gesture": gesture,
                        "confidence": round(confidence, 3)
                    })
                    await asyncio.sleep(0.2)  # пауза 200 мс
            except Exception as e:
                print(f"Error in frame: {e}")
                # не закрываем соединение
    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"Unhandled error: {e}")