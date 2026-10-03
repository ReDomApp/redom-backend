# ReDom-v2.8—Video Worker

Private Redis-backed worker for the paid ReDom-v2.8—Video feature. It supports Seedance 2.5, Veo 3.1 and Gemini Omni Flash provider lanes and composes short provider outputs into a project of up to 300 seconds.

The worker does not make policy decisions. ReDom backend security enforcement runs before generation and final MP4 validation runs before the object becomes downloadable.

Required environment: REDOM_VIDEO_REDIS_URL, REDOM_VIDEO_WORKER_TOKEN, R2_BUCKET_NAME, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, GEMINI_API_KEY, SEEDANCE_BASE_URL, SEEDANCE_API_KEY.

FFmpeg is included for MP4 composition. Keep provider credentials server-side only.
