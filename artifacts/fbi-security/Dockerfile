FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 APP_ENV=production HOST=0.0.0.0 PORT=8787
WORKDIR /srv/fbi-security
RUN useradd --create-home --uid 10001 appuser
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY static ./static
COPY sources ./sources
RUN mkdir -p /srv/fbi-security/data && chown -R appuser:appuser /srv/fbi-security
USER appuser
EXPOSE 8787
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8787", "--proxy-headers"]
