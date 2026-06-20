curl -X POST http://127.0.0.1:8000/tts \
  -F "text=This is a hype preset test." \
  -F "preset=hype" \
  --output hype.wav