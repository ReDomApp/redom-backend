# Aurelink Public Login

Standalone public-facing Aurelink login experience, kept separate from `artifacts/aurelink-admin`.

Static entry point: `public/index.html`.

Authentication is not faked: email/password, password recovery, registration and OAuth actions display an explicit notice until connected to the approved Aurelink authentication API and configured provider credentials.