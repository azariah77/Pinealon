FROM python:3.10-slim

# Install ffmpeg, nodejs, and rubberband-cli for advanced audio processing
RUN apt-get update && \
    apt-get install -y ffmpeg git nodejs rubberband-cli && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Copy the requirements file and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# Also need to install gunicorn to run Flask in production
RUN pip install gunicorn

# Copy the backend code
COPY . .

# Expose port 7860 (Hugging Face Spaces requirement)
EXPOSE 7860

# Command to run the application using gunicorn
CMD ["gunicorn", "-b", "0.0.0.0:7860", "--timeout", "300", "--worker-class", "gthread", "--threads", "4", "--workers", "1", "app:app"]
