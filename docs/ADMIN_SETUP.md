# Admin-Backend: Ersten Admin-User anlegen

Das Portal hat ein Rollensystem (`user_roles`-Tabelle). Sign-up ist deaktiviert — Admins müssen manuell angelegt werden.

## Schritt-für-Schritt

1. **User in Lovable Cloud anlegen**
   - Lovable Cloud → Users → Add User
   - E-Mail eingeben (z.B. `dennis@haushhaush.de`), Passwort setzen
   - "Auto Confirm User" aktivieren, damit kein Bestätigungs-Mail nötig ist
   - User-ID kopieren

2. **Admin-Rolle zuweisen** (SQL Editor):

   ```sql
   INSERT INTO public.user_roles (user_id, role)
   VALUES ('PASTE_USER_ID_HIER', 'admin');
   ```

3. **Login testen**
   - `/login` öffnen, mit der angelegten E-Mail + Passwort einloggen
   - Bei Erfolg Redirect zu `/admin`

## Weitere Admins anlegen

Nach Schritt 1 + 2 kann ein eingeloggter Admin auch direkt über die DB-Ansicht weitere User anlegen. Eine eigene Admin-UI dafür folgt ggf. später.
