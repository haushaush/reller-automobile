## Ziel
Story-Versand soll funktionieren, ohne dass an reller-automobile.de DNS/Domain etwas geändert werden muss. Die im Workspace bereits verifizierte Domain `notify.viral-connect.de` wird als Absender genutzt, Empfänger bleibt `info@reller-automobile.de`. Resend fliegt raus.

## Schritte

1. **E-Mail-Infrastruktur aktivieren** für dieses Projekt mit der bestehenden Workspace-Domain `notify.viral-connect.de` (Queue, Tabellen, Cron — alles managed).

2. **Transactional-E-Mail-Setup scaffolden**: erzeugt die generische `send-transactional-email` Edge Function + Template-Registry.

3. **Neues Template `stories-digest.tsx`** erstellen mit Reller-Branding (Schwarz/Weiß, Lora/Instrument Sans), das eine Liste von Stories (Marke, Titel, Preis, Story-Bild, Link) und einen optionalen Hinweistext rendert. Empfänger wird im Aufruf gesetzt → `info@reller-automobile.de`.

4. **`send-stories-email` Edge Function umbauen**: statt direktem Resend-Call holt sie wie bisher Story-Daten + Fahrzeuge aus der DB und ruft dann `supabase.functions.invoke('send-transactional-email', { templateName: 'stories-digest', recipientEmail: 'info@reller-automobile.de', templateData: { stories: [...] }, idempotencyKey })` auf. Admin-Auth-Check und das `sent_to_dealer / sent_at`-Update auf den Stories bleiben erhalten.

5. **`generate-story` Edge Function**: ebenfalls auf Lovable-Mail umstellen (eine kleine Benachrichtigung pro generierter Story via `send-transactional-email` an `info@reller-automobile.de`), `RESEND_API_KEY`-Abhängigkeit entfernen.

6. **Frontend (`StoryArchive.tsx`)**: keine Änderungen am UI nötig — der vorhandene „X versenden"-Button ruft weiter `send-stories-email` auf.

7. **Deploy** der angepassten Edge Functions.

## Hinweise
- Absender im Posteingang erscheint als `…@notify.viral-connect.de` (Workspace-Domain). Das ist nicht reller-automobile.de, aber Empfang/Versand funktioniert sofort und ohne DNS-Änderungen.
- Falls später doch eine eigene Reller-Domain als Absender gewünscht ist, kann das jederzeit nachgezogen werden — der Code bleibt gleich.
