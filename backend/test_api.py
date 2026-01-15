import requests
import json

# Test the metadata endpoint
url = "http://127.0.0.1:3001/api/youtube/metadata"
data = {"videoId": "dQw4w9WgXcQ"}  # Rick Astley test video

response = requests.post(url, json=data)
print("Status:", response.status_code)
print("Response:", response.json())