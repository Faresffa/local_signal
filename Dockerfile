# Image de l'API (LS-22).
#
# Le dépôt n'avait de Dockerfile que pour le front. L'API se lançait donc avec
# un Python local, une version d'interpréteur variable et des dépendances
# installées à la main — trois sources de « ça marche chez moi ».
#
# La version de Python vient de `.python-version`, pas d'une valeur écrite ici :
# un seul endroit fait foi, et il est déjà celui que lit l'intégration continue.

FROM python:3.13-slim

# `PYTHONUNBUFFERED` : sans lui, les journaux restent dans le tampon et
# n'apparaissent qu'à l'arrêt du conteneur — c'est-à-dire au pire moment,
# quand on cherche justement pourquoi il s'est arrêté (LS-25).
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Les dépendances sont copiées et installées AVANT le code : Docker met cette
# couche en cache, et une modification du code ne relance donc pas une
# installation complète. C'est ce qui fait la différence entre une image
# reconstruite en dix secondes et en trois minutes.
COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY backend/ ./backend/
COPY packages/ ./packages/

# Utilisateur non privilégié : un processus qui n'a pas besoin d'être root ne
# doit pas l'être. Si l'API est compromise, l'attaquant hérite de ses droits.
RUN useradd --create-home --shell /bin/bash local_signal \
    && chown -R local_signal:local_signal /app
USER local_signal

EXPOSE 8000

# `$PORT` quand l'hébergeur l'impose (Railway), 8000 sinon.
CMD ["sh", "-c", "python -m uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
