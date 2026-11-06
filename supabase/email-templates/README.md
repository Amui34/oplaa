# Modèles d'e-mails Supabase (Oplaa)

Source de vérité des e-mails d'authentification. À coller dans le dashboard Supabase :
Authentication → Emails → (modèle) → onglet **Source**, puis **Save changes**.

| Modèle Supabase | Fichier | Objet (Subject) |
|---|---|---|
| Confirm signup | `confirm-signup.html` | `Confirme ton adresse pour démarrer sur Oplaa` |
| Reset password | `reset-password.html` | `Oplaa — ton nouveau mot de passe` |

Expéditeur : réglé dans Authentication → Emails → SMTP Settings (Resend, domaine oplaa.pro).
Variables utilisées : `{{ .ConfirmationURL }}`. Le logo est servi par https://oplaa.pro/icon-192.png.
Les liens renvoient vers la Site URL (`https://oplaa.pro`) — voir Authentication → URL Configuration.
