# BetIQ Lite home-server agents. State lives in /data and bet-log backups in /backups.
FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir tzdata
COPY *.py ./
ENV BETIQ_DATA=/data BETIQ_BACKUP_DIR=/backups PYTHONUNBUFFERED=1
VOLUME /data
CMD ["python", "betiq_agent.py"]
