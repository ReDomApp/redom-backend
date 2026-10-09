FROM nvidia/cuda:12.4.1-cudnn-devel-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.10 python3.10-dev python3-pip git ffmpeg build-essential fonts-dejavu-core librsvg2-bin \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3.10 /usr/bin/python \
    && ln -sf /usr/bin/pip3 /usr/bin/pip

WORKDIR /app
COPY requirements.txt .
RUN python -m pip install --upgrade pip setuptools wheel \
    && python -m pip install -r requirements.txt \
    && python -m pip install --no-deps git+https://github.com/Wan-Video/Wan2.2.git

COPY app ./app
COPY assets ./assets
RUN rsvg-convert -w 64 -h 64 assets/redom-logo.svg -o assets/redom-logo.png

ENV REDOM_VIDEO_QUEUE=redom:video:jobs
EXPOSE 8080
CMD ["python","-m","uvicorn","app.main:app","--host","0.0.0.0","--port","8080"]
