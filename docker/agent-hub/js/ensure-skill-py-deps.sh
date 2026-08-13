#!/bin/sh
# Install the Python deps used by helixlife skill scripts into a persistent
# target dir on the data volume (PYTHONPATH=/data/python-deps is set in
# compose). Installing into the container's site-packages would be lost on
# every container recreate; the data volume survives OTA updates.
#
# Runs in the background at container start; idempotent via a marker file.
# Bump MARKER when the package list changes.
set -u

DATA_DIR="${AIONUI_DATA_DIR:-/data}"
TARGET="$DATA_DIR/python-deps"
MARKER="$TARGET/.deps-v1"
LOG="$DATA_DIR/logs/skill-py-deps.log"

[ -f "$MARKER" ] && exit 0

mkdir -p "$TARGET" "$DATA_DIR/logs"
echo "[agent-hub] installing skill Python deps into $TARGET (one-time)..." >>"$LOG"
# Package list mirrors the static import analysis of the skill scripts
# (docs/agent-hub-builtin-skills-replacement.md §4.3). tooluniverse excluded:
# its dep `traits` has no cp313/aarch64 wheel.
# `nice -n 19` keeps this background install from competing with aioncore's
# cold-start CPU (db migration + agent probing). Same container, so cpu_shares
# doesn't help here — process niceness is the right lever.
if nice -n 19 pip3 install --target "$TARGET" --quiet \
    requests==2.34.2 numpy==2.4.6 scipy==1.17.1 pandas==2.3.3 \
    matplotlib==3.11.0 seaborn==0.13.2 python-pptx==1.0.2 python-docx==1.2.0 \
    openpyxl==3.1.5 PyPDF2 lxml==6.1.1 Pillow==12.2.0 defusedxml validators \
    biopython PyYAML flask google-genai >>"$LOG" 2>&1; then
  touch "$MARKER"
  echo "[agent-hub] skill Python deps ready" >>"$LOG"
else
  echo "[agent-hub] warn: skill deps install failed; will retry next start" >>"$LOG"
fi
