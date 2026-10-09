# toB device skills

The toB image excludes the toC skills92 archive. It restores the pre-v0.2.16
read-only OpenClaw source at `/opt/openclaw-ws/helixlife-skills`, mounted from
`${APP_STORAGE_DIR}/documents/data/openclaw`. No fixed skill count is assumed.

`buildBuiltinSkillsHub.cjs` links that source and the six AionCore v0.2.2
system skills into `/data/builtin-skills-hub` before startup. It refreshes links
every 60 seconds. Added/removed catalog entries require a backend restart;
content edits resolve through existing links. If the source is absent, only
system skills are available on a new device and existing links are preserved.
Real entries, unrelated links and `/data/skills` are never overwritten.

The system skills include session collaboration and scheduled tasks; they are
not part of the excluded 92-skill corpus. Python support predates skills92 and
remains available for device-owned skills.
